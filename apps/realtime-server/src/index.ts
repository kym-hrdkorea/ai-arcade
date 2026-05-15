import { createServer } from "node:http";
import { Server, type Socket } from "socket.io";

import type {
  ClientToServerEvents,
  ErrorPayload,
  EventAck,
  EventResponse,
  GameStartNoticePayload,
  RoomJoinedPayload,
  ServerToClientEvents,
} from "@ai-arcade/shared";

import {
  RoomError,
  RoomManager,
  type AIGuessCompletionResult,
  type DisconnectResult,
  type LeaveResult,
  type NextRoundResult,
  type RejoinResult,
  type RoomResetResult,
  type RoundSkipResult,
  type StartGameResult,
  type TickResult,
} from "./room-manager.js";

const fallbackPort = 4000;
const fallbackHost = "0.0.0.0";
const port =
  parsePort(process.env.REALTIME_PORT) ?? parsePort(process.env.PORT) ?? fallbackPort;
const host = process.env.REALTIME_HOST?.trim() || fallbackHost;
const corsOrigin = process.env.CORS_ORIGIN ?? "http://localhost:3000";
const roomManager = new RoomManager();
const roomTimers = new Map<string, NodeJS.Timeout>();
const disconnectGraceTimers = new Map<string, NodeJS.Timeout>();
const parsedDisconnectGraceMs = Number.parseInt(process.env.DISCONNECT_GRACE_MS ?? "", 10);
const disconnectGraceMs = Number.isNaN(parsedDisconnectGraceMs)
  ? 60_000
  : parsedDisconnectGraceMs;

type InterServerEvents = Record<string, never>;

type SocketData = {
  playerId?: string;
  roomCode?: string;
};

type DrawDuelSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

function parsePort(value: string | undefined): number | undefined {
  if (!value?.trim()) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isNaN(parsed) ? undefined : parsed;
}

function toErrorPayload(error: unknown): ErrorPayload {
  if (error instanceof RoomError) {
    return {
      code: error.code,
      message: error.message,
    };
  }

  console.error(error);
  return {
    code: "INTERNAL_ERROR",
    message: "요청을 처리하지 못했습니다.",
  };
}

function sendAck<T>(ack: EventAck<T> | undefined, response: EventResponse<T>) {
  ack?.(response);
}

const httpServer = createServer((request, response) => {
  if (request.url === "/health") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(
      JSON.stringify({
        ok: true,
        service: "ai-arcade-realtime-server",
        rooms: roomManager.getRoomCount(),
      }),
    );
    return;
  }

  response.writeHead(404, { "Content-Type": "application/json" });
  response.end(
    JSON.stringify({
      ok: false,
      error: "Not found",
    }),
  );
});

const io = new Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>(httpServer, {
  cors: {
    origin: corsOrigin,
    methods: ["GET", "POST"],
  },
});

function clearRoomTimer(roomCode: string) {
  const timer = roomTimers.get(roomCode);

  if (timer) {
    clearInterval(timer);
    roomTimers.delete(roomCode);
  }
}

function clearDisconnectGraceTimer(playerId: string) {
  const timer = disconnectGraceTimers.get(playerId);

  if (timer) {
    clearTimeout(timer);
    disconnectGraceTimers.delete(playerId);
  }
}

function emitWordToDrawer(payload: StartGameResult["word"]) {
  const drawerSocketId = roomManager.getPlayerSocketId(
    payload.roomCode,
    payload.drawerPlayerId,
  );

  if (drawerSocketId) {
    io.to(drawerSocketId).emit("draw-duel:word", payload);
  }
}

function emitRejoinSnapshot(socket: DrawDuelSocket, result: RejoinResult) {
  socket.emit("draw-duel:stroke-history", result.snapshot.strokeHistory);

  if (result.snapshot.roundState) {
    socket.emit("draw-duel:round-state", result.snapshot.roundState);
  }

  if (result.snapshot.timer) {
    socket.emit("draw-duel:timer-tick", result.snapshot.timer);
  }

  if (result.snapshot.word) {
    socket.emit("draw-duel:word", result.snapshot.word);
  }

  if (result.snapshot.resultSlide) {
    socket.emit("draw-duel:result-slide-set", result.snapshot.resultSlide);
  }
}

function emitRoundStart(result: StartGameResult | Extract<NextRoundResult, { kind: "round" }>) {
  io.to(result.room.roomCode).emit("room:state", { room: result.room });
  io.to(result.room.roomCode).emit("draw-duel:canvas-clear", result.clear);
  io.to(result.room.roomCode).emit("draw-duel:round-state", result.roundState);
  io.to(result.room.roomCode).emit("draw-duel:timer-tick", result.timer);
  emitWordToDrawer(result.word);
  scheduleRoomTimer(result.room.roomCode);
}

function emitAIGuessCompletion(roomCode: string, result: AIGuessCompletionResult) {
  if (result.aiGuess) {
    io.to(roomCode).emit("draw-duel:ai-guess", result.aiGuess);
  }

  io.to(roomCode).emit("draw-duel:round-result", result.roundResult);
}

async function completeAIGuessing(roomCode: string) {
  try {
    const result = await roomManager.completeAIGuessing(roomCode);

    if (result) {
      emitAIGuessCompletion(roomCode, result);
    }

    return result;
  } catch (error: unknown) {
    const errorPayload = toErrorPayload(error);
    io.to(roomCode).emit("error", errorPayload);
    return undefined;
  }
}

function emitTickResult(roomCode: string, result: TickResult) {
  if (result.timer) {
    io.to(roomCode).emit("draw-duel:timer-tick", result.timer);
  }

  if (result.roundState) {
    io.to(roomCode).emit("draw-duel:round-state", result.roundState);

    if (result.roundState.round.status === "ai-guessing") {
      clearRoomTimer(roomCode);
      void completeAIGuessing(roomCode);
      return;
    }
  }

  if (result.roundResult) {
    clearRoomTimer(roomCode);
    io.to(roomCode).emit("draw-duel:round-result", result.roundResult);
  }
}

function scheduleRoomTimer(roomCode: string) {
  clearRoomTimer(roomCode);

  const timer = setInterval(() => {
    const result = roomManager.tickRoom(roomCode);

    if (!result) {
      clearRoomTimer(roomCode);
      return;
    }

    emitTickResult(roomCode, result);
  }, 1000);

  roomTimers.set(roomCode, timer);
}

function emitLeaveEffects(result: LeaveResult) {
  if (result.room) {
    io.to(result.roomCode).emit("room:state", { room: result.room });
  }

  if (result.roundState) {
    io.to(result.roomCode).emit("draw-duel:round-state", result.roundState);
  }

  if (result.roundResult) {
    clearRoomTimer(result.roomCode);
    io.to(result.roomCode).emit("draw-duel:round-result", result.roundResult);
  }

  if (result.gameResult) {
    clearRoomTimer(result.roomCode);
    io.to(result.roomCode).emit("draw-duel:game-result", result.gameResult);
  }

  if (!result.room) {
    clearRoomTimer(result.roomCode);
  }
}

function scheduleDisconnectGrace(result: DisconnectResult) {
  clearDisconnectGraceTimer(result.playerId);
  io.to(result.roomCode).emit("room:state", { room: result.room });

  const timer = setTimeout(() => {
    disconnectGraceTimers.delete(result.playerId);
    const leaveResult = roomManager.expireDisconnectedPlayer(
      result.roomCode,
      result.playerId,
    );

    if (leaveResult) {
      emitLeaveEffects(leaveResult);
    }
  }, disconnectGraceMs);

  disconnectGraceTimers.set(result.playerId, timer);
}

function emitRoundSkipResult(result: RoundSkipResult) {
  clearRoomTimer(result.room.roomCode);
  io.to(result.room.roomCode).emit("room:state", { room: result.room });
  io.to(result.room.roomCode).emit("draw-duel:round-state", result.roundState);
}

function emitRoomResetResult(result: RoomResetResult) {
  clearRoomTimer(result.room.roomCode);
  io.to(result.room.roomCode).emit("room:state", { room: result.room });
  io.to(result.room.roomCode).emit("draw-duel:canvas-clear", result.clear);
}

io.on("connection", (socket) => {
  socket.emit("server:ready", {
    socketId: socket.id,
    message: "AI Arcade realtime server is ready.",
  });

  socket.on("room:create", (payload, ack) => {
    try {
      const result = roomManager.createRoom(payload, socket.id);
      socket.data.playerId = result.currentPlayerId;
      socket.data.roomCode = result.room.roomCode;
      socket.join(result.room.roomCode);
      sendAck<RoomJoinedPayload>(ack, {
        ok: true,
        data: {
          room: result.room,
          currentPlayerId: result.currentPlayerId,
          reconnectToken: result.reconnectToken,
        },
      });
      io.to(result.room.roomCode).emit("room:state", { room: result.room });
      socket.emit(
        "draw-duel:stroke-history",
        roomManager.getStrokeHistory(result.room.roomCode),
      );
    } catch (error: unknown) {
      const errorPayload = toErrorPayload(error);
      sendAck(ack, { ok: false, error: errorPayload });
      socket.emit("error", errorPayload);
    }
  });

  socket.on("room:join", (payload, ack) => {
    try {
      const result = roomManager.joinRoom(payload, socket.id);
      socket.data.playerId = result.currentPlayerId;
      socket.data.roomCode = result.room.roomCode;
      socket.join(result.room.roomCode);
      sendAck<RoomJoinedPayload>(ack, { ok: true, data: result });
      io.to(result.room.roomCode).emit("room:state", { room: result.room });
      socket.emit(
        "draw-duel:stroke-history",
        roomManager.getStrokeHistory(result.room.roomCode),
      );
    } catch (error: unknown) {
      const errorPayload = toErrorPayload(error);
      sendAck(ack, { ok: false, error: errorPayload });
      socket.emit("error", errorPayload);
    }
  });

  socket.on("room:rejoin", (payload, ack) => {
    try {
      const result = roomManager.rejoinRoom(payload, socket.id);
      clearDisconnectGraceTimer(result.currentPlayerId);
      socket.data.playerId = result.currentPlayerId;
      socket.data.roomCode = result.room.roomCode;
      socket.join(result.room.roomCode);
      sendAck<RoomJoinedPayload>(ack, { ok: true, data: result });
      io.to(result.room.roomCode).emit("room:state", { room: result.room });
      emitRejoinSnapshot(socket, result);
    } catch (error: unknown) {
      const errorPayload = toErrorPayload(error);
      sendAck(ack, { ok: false, error: errorPayload });
      socket.emit("error", errorPayload);
    }
  });

  socket.on("room:leave", (payload, ack) => {
    try {
      const leavingPlayerId = socket.data.playerId;
      const result = roomManager.leaveRoom(payload.roomCode, socket.id);
      socket.leave(result.roomCode);
      if (leavingPlayerId) {
        clearDisconnectGraceTimer(leavingPlayerId);
      }
      socket.data.playerId = undefined;
      socket.data.roomCode = undefined;
      sendAck(ack, { ok: true, data: { left: true } });
      emitLeaveEffects(result);
    } catch (error: unknown) {
      const errorPayload = toErrorPayload(error);
      sendAck(ack, { ok: false, error: errorPayload });
      socket.emit("error", errorPayload);
    }
  });

  socket.on("game:start", (payload, ack) => {
    try {
      const result = roomManager.startGame(payload, socket.id);
      const notice: GameStartNoticePayload = {
        roomCode: result.room.roomCode,
        message: result.message,
      };
      sendAck<GameStartNoticePayload>(ack, { ok: true, data: notice });
      io.to(result.room.roomCode).emit("game:start", notice);
      emitRoundStart(result);
    } catch (error: unknown) {
      const errorPayload = toErrorPayload(error);
      sendAck(ack, { ok: false, error: errorPayload });
      socket.emit("error", errorPayload);
    }
  });

  socket.on("draw-duel:settings-update", (payload, ack) => {
    try {
      const room = roomManager.updateSettings(payload, socket.id);
      sendAck(ack, { ok: true, data: { room } });
      io.to(room.roomCode).emit("room:state", { room });
    } catch (error: unknown) {
      const errorPayload = toErrorPayload(error);
      sendAck(ack, { ok: false, error: errorPayload });
      socket.emit("error", errorPayload);
    }
  });

  socket.on("draw-duel:stroke", (payload, ack) => {
    try {
      const stroke = roomManager.submitStroke(payload, socket.id);
      sendAck<{ accepted: true }>(ack, { ok: true, data: { accepted: true } });
      socket.to(stroke.roomCode).emit("draw-duel:stroke", stroke);
    } catch (error: unknown) {
      const errorPayload = toErrorPayload(error);
      sendAck(ack, { ok: false, error: errorPayload });
      socket.emit("error", errorPayload);
    }
  });

  socket.on("draw-duel:canvas-clear", (payload, ack) => {
    try {
      const clear = roomManager.clearCanvas(payload, socket.id);
      sendAck<{ cleared: true }>(ack, { ok: true, data: { cleared: true } });
      io.to(clear.roomCode).emit("draw-duel:canvas-clear", clear);
    } catch (error: unknown) {
      const errorPayload = toErrorPayload(error);
      sendAck(ack, { ok: false, error: errorPayload });
      socket.emit("error", errorPayload);
    }
  });

  socket.on("draw-duel:guess-submit", async (payload, ack) => {
    try {
      const result = await roomManager.submitGuess(payload, socket.id);
      sendAck(ack, { ok: true, data: result.guess });
      io.to(result.guess.roomCode).emit("draw-duel:guess-log", result.guess);

      io.to(result.guess.roomCode).emit("draw-duel:round-state", result.roundState);

      if (result.roundState.round.status === "ai-guessing") {
        clearRoomTimer(result.guess.roomCode);
        void completeAIGuessing(result.guess.roomCode);
      }
    } catch (error: unknown) {
      const errorPayload = toErrorPayload(error);
      sendAck(ack, { ok: false, error: errorPayload });
      socket.emit("error", errorPayload);
    }
  });

  socket.on("draw-duel:next-round", (payload, ack) => {
    try {
      const result = roomManager.nextRound(payload, socket.id);

      if (result.kind === "game-result") {
        sendAck(ack, { ok: true, data: result.gameResult });
        clearRoomTimer(result.room.roomCode);
        io.to(result.room.roomCode).emit("room:state", { room: result.room });
        io.to(result.room.roomCode).emit("draw-duel:game-result", result.gameResult);
        return;
      }

      sendAck(ack, { ok: true, data: result.roundState });
      emitRoundStart(result);
    } catch (error: unknown) {
      const errorPayload = toErrorPayload(error);
      sendAck(ack, { ok: false, error: errorPayload });
      socket.emit("error", errorPayload);
    }
  });

  socket.on("draw-duel:round-skip", async (payload, ack) => {
    try {
      const result = roomManager.skipRound(payload, socket.id);
      emitRoundSkipResult(result);
      const completion = await completeAIGuessing(result.room.roomCode);

      if (!completion) {
        throw new RoomError("AI_GUESS_FAILED", "AI 추측 결과를 만들지 못했습니다.");
      }

      sendAck(ack, { ok: true, data: completion.roundResult });
    } catch (error: unknown) {
      const errorPayload = toErrorPayload(error);
      sendAck(ack, { ok: false, error: errorPayload });
      socket.emit("error", errorPayload);
    }
  });

  socket.on("draw-duel:result-slide-set", (payload, ack) => {
    try {
      const result = roomManager.setResultSlide(payload, socket.id);
      sendAck<{ accepted: true }>(ack, { ok: true, data: { accepted: true } });
      io.to(result.roomCode).emit("draw-duel:result-slide-set", result);
    } catch (error: unknown) {
      const errorPayload = toErrorPayload(error);
      sendAck(ack, { ok: false, error: errorPayload });
      socket.emit("error", errorPayload);
    }
  });

  socket.on("draw-duel:room-reset", (payload, ack) => {
    try {
      const result = roomManager.resetRoom(payload, socket.id);
      sendAck(ack, { ok: true, data: { room: result.room } });
      emitRoomResetResult(result);
    } catch (error: unknown) {
      const errorPayload = toErrorPayload(error);
      sendAck(ack, { ok: false, error: errorPayload });
      socket.emit("error", errorPayload);
    }
  });

  socket.on("disconnect", (reason) => {
    const result = roomManager.markDisconnected(socket.id);

    if (result) {
      scheduleDisconnectGrace(result);
    }

    console.info(`[socket] ${socket.id} disconnected: ${reason}`);
  });
});

httpServer.listen(port, host, () => {
  const displayHost = host === fallbackHost ? "localhost" : host;
  console.info(`[server] realtime server listening on http://${displayHost}:${port}`);
});
