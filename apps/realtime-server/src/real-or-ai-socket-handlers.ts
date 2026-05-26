import { Server, type Socket } from "socket.io";

import type {
  ClientToServerEvents,
  ErrorPayload,
  EventAck,
  EventResponse,
  RealOrAiAnswerAckPayload,
  RealOrAiAnswerCountPayload,
  RealOrAiCountdownPayload,
  RealOrAiGameResultPayload,
  RealOrAiGameStartNoticePayload,
  RealOrAiRoomJoinedPayload,
  RealOrAiRoomState,
  RealOrAiRoomStatePayload,
  RealOrAiResultViewPayload,
  RealOrAiRoundResultPayload,
  RealOrAiRoundStartPayload,
  ServerToClientEvents,
} from "@ai-arcade/shared";

import {
  RealOrAiRoomError,
  RealOrAiRoomManager,
} from "./real-or-ai-room-manager.js";

type InterServerEvents = Record<string, never>;

type SocketData = {
  playerId?: string;
  roomCode?: string;
};

type ArcadeServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

type ArcadeSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

type RuntimeOptions = {
  answerCountFlushMs?: number;
  secondMs?: number;
};

type TimerHandle = ReturnType<typeof setInterval>;

export function realOrAiSocketRoomName(roomCode: string): string {
  return `real-or-ai:${roomCode}`;
}

function sendAck<T>(ack: EventAck<T> | undefined, response: EventResponse<T>) {
  ack?.(response);
}

function toErrorPayload(error: unknown): ErrorPayload {
  if (error instanceof RealOrAiRoomError) {
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

function emitError(io: ArcadeServer, roomCode: string, error: unknown) {
  io.to(realOrAiSocketRoomName(roomCode)).emit("real-or-ai:error", toErrorPayload(error));
}

function emitRoomState(io: ArcadeServer, room: RealOrAiRoomState) {
  io.to(realOrAiSocketRoomName(room.roomCode)).emit("real-or-ai:room-state", {
    room,
  });
}

function toInitialRemainingSeconds(round: RealOrAiRoundStartPayload): number {
  const durationMs = Math.max(
    0,
    Date.parse(round.round.endsAt) - Date.parse(round.round.startedAt),
  );

  return Math.ceil(durationMs / 1000);
}

export function createRealOrAiSocketRuntime(options: RuntimeOptions = {}) {
  const answerCountFlushMs = options.answerCountFlushMs ?? 25;
  const secondMs = options.secondMs ?? 1000;
  const answerCountTimers = new Map<string, TimerHandle>();
  const countdownTimers = new Map<string, TimerHandle>();
  const answeringTimers = new Map<string, TimerHandle>();

  const pendingAnswerCounts = new Map<string, RealOrAiAnswerCountPayload>();

  function clearAnswerCountTimer(roomCode: string) {
    const timer = answerCountTimers.get(roomCode);

    if (timer) {
      clearTimeout(timer);
      answerCountTimers.delete(roomCode);
    }
  }

  function clearCountdownTimer(roomCode: string) {
    const timer = countdownTimers.get(roomCode);

    if (timer) {
      clearInterval(timer);
      countdownTimers.delete(roomCode);
    }
  }

  function clearAnsweringTimer(roomCode: string) {
    const timer = answeringTimers.get(roomCode);

    if (timer) {
      clearInterval(timer);
      answeringTimers.delete(roomCode);
    }
  }

  function clearRoomTimers(roomCode: string) {
    clearAnswerCountTimer(roomCode);
    clearCountdownTimer(roomCode);
    clearAnsweringTimer(roomCode);
  }

  function clearAllTimers() {
    for (const roomCode of answerCountTimers.keys()) {
      clearAnswerCountTimer(roomCode);
    }

    for (const roomCode of countdownTimers.keys()) {
      clearCountdownTimer(roomCode);
    }

    for (const roomCode of answeringTimers.keys()) {
      clearAnsweringTimer(roomCode);
    }
  }

  function flushAnswerCount(io: ArcadeServer, roomCode: string) {
    clearAnswerCountTimer(roomCode);
    const count = pendingAnswerCounts.get(roomCode);

    if (!count) {
      return;
    }

    pendingAnswerCounts.delete(roomCode);
    io.to(realOrAiSocketRoomName(roomCode)).emit("real-or-ai:answer-count", count);
  }

  function scheduleAnswerCount(io: ArcadeServer, count: RealOrAiAnswerCountPayload) {
    pendingAnswerCounts.set(count.roomCode, count);

    if (answerCountTimers.has(count.roomCode)) {
      return;
    }

    const timer = setTimeout(() => {
      flushAnswerCount(io, count.roomCode);
    }, answerCountFlushMs);
    answerCountTimers.set(count.roomCode, timer);
  }

  function scheduleAnswering(
    io: ArcadeServer,
    manager: RealOrAiRoomManager,
    round: RealOrAiRoundStartPayload,
  ) {
    clearAnsweringTimer(round.roomCode);

    let remainingSeconds = toInitialRemainingSeconds(round);
    io.to(realOrAiSocketRoomName(round.roomCode)).emit("real-or-ai:timer-tick", {
      endsAt: round.round.endsAt,
      remainingSeconds,
      roomCode: round.roomCode,
      roundId: round.round.roundId,
    });

    const timer = setInterval(() => {
      remainingSeconds = Math.max(0, remainingSeconds - 1);
      io.to(realOrAiSocketRoomName(round.roomCode)).emit("real-or-ai:timer-tick", {
        endsAt: round.round.endsAt,
        remainingSeconds,
        roomCode: round.roomCode,
        roundId: round.round.roundId,
      });

      if (remainingSeconds > 0) {
        return;
      }

      clearAnsweringTimer(round.roomCode);

      try {
        const result = manager.finishRound(
          round.roomCode,
          "time-up",
          new Date(round.round.endsAt),
        );
        emitRoomState(io, manager.getRoomState(round.roomCode));
        io.to(realOrAiSocketRoomName(round.roomCode)).emit("real-or-ai:round-result", result);
      } catch (error: unknown) {
        emitError(io, round.roomCode, error);
      }
    }, secondMs);

    answeringTimers.set(round.roomCode, timer);
  }

  function scheduleCountdown(
    io: ArcadeServer,
    manager: RealOrAiRoomManager,
    countdown: RealOrAiCountdownPayload,
  ) {
    clearRoomTimers(countdown.roomCode);
    io.to(realOrAiSocketRoomName(countdown.roomCode)).emit(
      "real-or-ai:countdown",
      countdown,
    );

    let remainingSeconds = countdown.remainingSeconds;
    const timer = setInterval(() => {
      remainingSeconds = Math.max(0, remainingSeconds - 1);

      if (remainingSeconds > 0) {
        io.to(realOrAiSocketRoomName(countdown.roomCode)).emit(
          "real-or-ai:countdown",
          {
            ...countdown,
            remainingSeconds,
          },
        );
        return;
      }

      clearCountdownTimer(countdown.roomCode);

      try {
        const round = manager.startAnsweringRound(countdown.roomCode, new Date());
        emitRoomState(io, manager.getRoomState(countdown.roomCode));
        io.to(realOrAiSocketRoomName(countdown.roomCode)).emit(
          "real-or-ai:round-start",
          round,
        );
        scheduleAnswering(io, manager, round);
      } catch (error: unknown) {
        emitError(io, countdown.roomCode, error);
      }
    }, secondMs);

    countdownTimers.set(countdown.roomCode, timer);
  }

  return {
    clearAllTimers,
    clearRoomTimers,
    flushAnswerCount,
    scheduleCountdown,
    scheduleAnswerCount,
  };
}

export type RealOrAiSocketRuntime = ReturnType<typeof createRealOrAiSocketRuntime>;

export function registerRealOrAiHandlers(
  io: ArcadeServer,
  socket: ArcadeSocket,
  manager: RealOrAiRoomManager,
  runtime: RealOrAiSocketRuntime,
) {
  socket.on("real-or-ai:room-create", (payload, ack) => {
    try {
      const result = manager.createRoom(payload, socket.id);
      socket.data.playerId = result.currentPlayerId;
      socket.data.roomCode = result.room.roomCode;
      socket.join(realOrAiSocketRoomName(result.room.roomCode));
      sendAck<RealOrAiRoomJoinedPayload>(ack, { ok: true, data: result });
      emitRoomState(io, result.room);
    } catch (error: unknown) {
      const errorPayload = toErrorPayload(error);
      sendAck(ack, { ok: false, error: errorPayload });
      socket.emit("real-or-ai:error", errorPayload);
    }
  });

  socket.on("real-or-ai:room-join", (payload, ack) => {
    try {
      const result = manager.joinRoom(payload, socket.id);
      socket.data.playerId = result.currentPlayerId;
      socket.data.roomCode = result.room.roomCode;
      socket.join(realOrAiSocketRoomName(result.room.roomCode));
      sendAck<RealOrAiRoomJoinedPayload>(ack, { ok: true, data: result });
      emitRoomState(io, result.room);
    } catch (error: unknown) {
      const errorPayload = toErrorPayload(error);
      sendAck(ack, { ok: false, error: errorPayload });
      socket.emit("real-or-ai:error", errorPayload);
    }
  });

  socket.on("real-or-ai:room-rejoin", (payload, ack) => {
    try {
      const result = manager.rejoinRoom(payload, socket.id);
      socket.data.playerId = result.currentPlayerId;
      socket.data.roomCode = result.room.roomCode;
      socket.join(realOrAiSocketRoomName(result.room.roomCode));
      sendAck<RealOrAiRoomJoinedPayload>(ack, { ok: true, data: result });
      emitRoomState(io, result.room);
    } catch (error: unknown) {
      const errorPayload = toErrorPayload(error);
      sendAck(ack, { ok: false, error: errorPayload });
      socket.emit("real-or-ai:error", errorPayload);
    }
  });

  socket.on("real-or-ai:room-leave", (payload, ack) => {
    try {
      const result = manager.leaveRoom(payload, socket.id);
      socket.leave(realOrAiSocketRoomName(result.roomCode));
      socket.data.playerId = undefined;
      socket.data.roomCode = undefined;
      sendAck(ack, { ok: true, data: { left: true } });

      if (result.room) {
        emitRoomState(io, result.room);
      } else {
        runtime.clearRoomTimers(result.roomCode);
      }
    } catch (error: unknown) {
      const errorPayload = toErrorPayload(error);
      sendAck(ack, { ok: false, error: errorPayload });
      socket.emit("real-or-ai:error", errorPayload);
    }
  });

  socket.on("real-or-ai:settings-update", (payload, ack) => {
    try {
      const room = manager.updateSettings(payload, socket.id);
      sendAck<RealOrAiRoomStatePayload>(ack, { ok: true, data: { room } });
      io.to(realOrAiSocketRoomName(room.roomCode)).emit(
        "real-or-ai:settings-updated",
        {
          roomCode: room.roomCode,
          settings: room.settings,
        },
      );
      emitRoomState(io, room);
    } catch (error: unknown) {
      const errorPayload = toErrorPayload(error);
      sendAck(ack, { ok: false, error: errorPayload });
      socket.emit("real-or-ai:error", errorPayload);
    }
  });

  socket.on("real-or-ai:game-start", (payload, ack) => {
    try {
      const result = manager.startGame(payload, socket.id);
      sendAck<RealOrAiGameStartNoticePayload>(ack, {
        ok: true,
        data: result.notice,
      });
      emitRoomState(io, result.room);
      runtime.scheduleCountdown(io, manager, result.countdown);
    } catch (error: unknown) {
      const errorPayload = toErrorPayload(error);
      sendAck(ack, { ok: false, error: errorPayload });
      socket.emit("real-or-ai:error", errorPayload);
    }
  });

  socket.on("real-or-ai:answer-submit", (payload, ack) => {
    try {
      const result = manager.submitAnswer(payload, socket.id);
      sendAck<RealOrAiAnswerAckPayload>(ack, { ok: true, data: result.ack });
      socket.emit("real-or-ai:answer-ack", result.ack);
      runtime.scheduleAnswerCount(io, result.count);

      if (result.kind === "round-result") {
        runtime.clearRoomTimers(result.room.roomCode);
        runtime.flushAnswerCount(io, result.room.roomCode);
        emitRoomState(io, result.room);
        io.to(realOrAiSocketRoomName(result.room.roomCode)).emit(
          "real-or-ai:round-result",
          result.result,
        );
      }
    } catch (error: unknown) {
      const errorPayload = toErrorPayload(error);
      sendAck(ack, { ok: false, error: errorPayload });
      socket.emit("real-or-ai:error", errorPayload);
    }
  });

  socket.on("real-or-ai:next-round", (payload, ack) => {
    try {
      const result = manager.nextRound(payload, socket.id);

      if (result.kind === "game-result") {
        runtime.clearRoomTimers(result.room.roomCode);
        sendAck<RealOrAiGameResultPayload>(ack, { ok: true, data: result.gameResult });
        emitRoomState(io, result.room);
        io.to(realOrAiSocketRoomName(result.room.roomCode)).emit(
          "real-or-ai:game-result",
          result.gameResult,
        );
        return;
      }

      sendAck<RealOrAiCountdownPayload>(ack, { ok: true, data: result.countdown });
      emitRoomState(io, result.room);
      runtime.scheduleCountdown(io, manager, result.countdown);
    } catch (error: unknown) {
      const errorPayload = toErrorPayload(error);
      sendAck(ack, { ok: false, error: errorPayload });
      socket.emit("real-or-ai:error", errorPayload);
    }
  });

  socket.on("real-or-ai:result-view-set", (payload, ack) => {
    try {
      const result = manager.setResultView(payload, socket.id);
      sendAck<RealOrAiResultViewPayload>(ack, { ok: true, data: result.payload });
      io.to(realOrAiSocketRoomName(result.room.roomCode)).emit(
        "real-or-ai:result-view",
        result.payload,
      );
    } catch (error: unknown) {
      const errorPayload = toErrorPayload(error);
      sendAck(ack, { ok: false, error: errorPayload });
      socket.emit("real-or-ai:error", errorPayload);
    }
  });

  socket.on("real-or-ai:round-skip", (payload, ack) => {
    try {
      const result = manager.skipRound(payload, socket.id);
      runtime.clearRoomTimers(result.room.roomCode);
      sendAck<RealOrAiRoundResultPayload>(ack, { ok: true, data: result.result });
      emitRoomState(io, result.room);
      io.to(realOrAiSocketRoomName(result.room.roomCode)).emit(
        "real-or-ai:round-result",
        result.result,
      );
    } catch (error: unknown) {
      const errorPayload = toErrorPayload(error);
      sendAck(ack, { ok: false, error: errorPayload });
      socket.emit("real-or-ai:error", errorPayload);
    }
  });

  socket.on("real-or-ai:room-reset", (payload, ack) => {
    try {
      const room = manager.resetRoom(payload, socket.id);
      runtime.clearRoomTimers(room.roomCode);
      sendAck<RealOrAiRoomStatePayload>(ack, { ok: true, data: { room } });
      emitRoomState(io, room);
    } catch (error: unknown) {
      const errorPayload = toErrorPayload(error);
      sendAck(ack, { ok: false, error: errorPayload });
      socket.emit("real-or-ai:error", errorPayload);
    }
  });

  socket.on("disconnect", () => {
    const result = manager.markDisconnected(socket.id);

    if (result) {
      emitRoomState(io, result.room);
    }
  });
}
