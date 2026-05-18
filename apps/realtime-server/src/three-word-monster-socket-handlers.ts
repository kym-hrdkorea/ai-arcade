import { Server, type Socket } from "socket.io";

import type {
  ClientToServerEvents,
  ErrorPayload,
  EventAck,
  EventResponse,
  ServerToClientEvents,
  ThreeWordMonsterRoomJoinedPayload,
  ThreeWordMonsterVoteSubmittedPayload,
  ThreeWordMonsterWordsSubmitResultPayload,
} from "@ai-arcade/shared";

import {
  ThreeWordMonsterRoomError,
  ThreeWordMonsterRoomManager,
  type ThreeWordMonsterImageGenerationResult,
  type ThreeWordMonsterVoteResult,
} from "./three-word-monster-room-manager.js";

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

function socketRoomName(roomCode: string): string {
  return `three-word-monster:${roomCode}`;
}

function sendAck<T>(ack: EventAck<T> | undefined, response: EventResponse<T>) {
  ack?.(response);
}

function toErrorPayload(error: unknown): ErrorPayload {
  if (error instanceof ThreeWordMonsterRoomError) {
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

function emitRoomState(
  io: ArcadeServer,
  roomCode: string,
  result: ThreeWordMonsterImageGenerationResult | ThreeWordMonsterVoteResult | { room: ThreeWordMonsterImageGenerationResult["room"] },
) {
  io.to(socketRoomName(roomCode)).emit("three-word-monster:room-state", {
    room: result.room,
  });
}

async function beginImageGeneration(
  io: ArcadeServer,
  manager: ThreeWordMonsterRoomManager,
  roomCode: string,
) {
  try {
    const result = await manager.generateImages(roomCode);

    for (const image of result.images) {
      io.to(socketRoomName(roomCode)).emit("three-word-monster:image-ready", {
        image,
        roomCode,
      });
    }

    emitRoomState(io, roomCode, result);
    io.to(socketRoomName(roomCode)).emit("three-word-monster:voting-start", {
      images: result.images,
      roomCode,
    });
  } catch (error: unknown) {
    const errorPayload = toErrorPayload(error);
    io.to(socketRoomName(roomCode)).emit("three-word-monster:error", errorPayload);
  }
}

export function registerThreeWordMonsterHandlers(
  io: ArcadeServer,
  socket: ArcadeSocket,
  manager: ThreeWordMonsterRoomManager,
) {
  socket.on("three-word-monster:room-create", (payload, ack) => {
    try {
      const result = manager.createRoom(payload, socket.id);
      socket.join(socketRoomName(result.room.roomCode));
      sendAck<ThreeWordMonsterRoomJoinedPayload>(ack, { ok: true, data: result });
      socket.emit("three-word-monster:room-state", { room: result.room });
    } catch (error: unknown) {
      const errorPayload = toErrorPayload(error);
      sendAck(ack, { ok: false, error: errorPayload });
      socket.emit("three-word-monster:error", errorPayload);
    }
  });

  socket.on("three-word-monster:room-join", (payload, ack) => {
    try {
      const result = manager.joinRoom(payload, socket.id);
      socket.join(socketRoomName(result.room.roomCode));
      sendAck<ThreeWordMonsterRoomJoinedPayload>(ack, { ok: true, data: result });
      emitRoomState(io, result.room.roomCode, { room: result.room });
    } catch (error: unknown) {
      const errorPayload = toErrorPayload(error);
      sendAck(ack, { ok: false, error: errorPayload });
      socket.emit("three-word-monster:error", errorPayload);
    }
  });

  socket.on("three-word-monster:room-rejoin", (payload, ack) => {
    try {
      const result = manager.rejoinRoom(payload, socket.id);
      socket.join(socketRoomName(result.room.roomCode));
      sendAck<ThreeWordMonsterRoomJoinedPayload>(ack, { ok: true, data: result });
      socket.emit("three-word-monster:room-state", { room: result.room });
      socket.to(socketRoomName(result.room.roomCode)).emit("three-word-monster:room-state", {
        room: result.room,
      });
    } catch (error: unknown) {
      const errorPayload = toErrorPayload(error);
      sendAck(ack, { ok: false, error: errorPayload });
      socket.emit("three-word-monster:error", errorPayload);
    }
  });

  socket.on("three-word-monster:room-leave", (payload, ack) => {
    try {
      const result = manager.leaveRoom(payload, socket.id);
      socket.leave(socketRoomName(result.roomCode));
      sendAck(ack, { ok: true, data: { left: true } });

      if (result.room) {
        emitRoomState(io, result.roomCode, { room: result.room });
      }
    } catch (error: unknown) {
      const errorPayload = toErrorPayload(error);
      sendAck(ack, { ok: false, error: errorPayload });
      socket.emit("three-word-monster:error", errorPayload);
    }
  });

  socket.on("three-word-monster:game-start", (payload, ack) => {
    try {
      const result = manager.startGame(payload, socket.id);
      sendAck(ack, { ok: true, data: result.notice });
      io.to(socketRoomName(result.room.roomCode)).emit(
        "three-word-monster:game-start",
        result.notice,
      );
      emitRoomState(io, result.room.roomCode, { room: result.room });
    } catch (error: unknown) {
      const errorPayload = toErrorPayload(error);
      sendAck(ack, { ok: false, error: errorPayload });
      socket.emit("three-word-monster:error", errorPayload);
    }
  });

  socket.on("three-word-monster:words-submit", (payload, ack) => {
    try {
      const result = manager.submitWords(payload, socket.id);
      const response: ThreeWordMonsterWordsSubmitResultPayload = {
        readyToGenerate: result.readyToGenerate,
        room: result.room,
      };
      sendAck(ack, { ok: true, data: response });
      emitRoomState(io, result.room.roomCode, { room: result.room });

      if (result.readyToGenerate) {
        void beginImageGeneration(io, manager, result.room.roomCode);
      }
    } catch (error: unknown) {
      const errorPayload = toErrorPayload(error);
      sendAck(ack, { ok: false, error: errorPayload });
      socket.emit("three-word-monster:error", errorPayload);
    }
  });

  socket.on("three-word-monster:vote-submit", (payload, ack) => {
    try {
      const result = manager.submitVote(payload, socket.id);
      const votePayload: ThreeWordMonsterVoteSubmittedPayload = result.vote;
      sendAck(ack, { ok: true, data: votePayload });
      io.to(socketRoomName(result.room.roomCode)).emit(
        "three-word-monster:vote-submitted",
        votePayload,
      );
      emitRoomState(io, result.room.roomCode, result);

      if (result.kind === "result") {
        io.to(socketRoomName(result.room.roomCode)).emit(
          "three-word-monster:result",
          result.result,
        );
      }
    } catch (error: unknown) {
      const errorPayload = toErrorPayload(error);
      sendAck(ack, { ok: false, error: errorPayload });
      socket.emit("three-word-monster:error", errorPayload);
    }
  });

  socket.on("three-word-monster:room-reset", (payload, ack) => {
    try {
      const room = manager.resetRoom(payload, socket.id);
      sendAck(ack, { ok: true, data: { room } });
      emitRoomState(io, room.roomCode, { room });
    } catch (error: unknown) {
      const errorPayload = toErrorPayload(error);
      sendAck(ack, { ok: false, error: errorPayload });
      socket.emit("three-word-monster:error", errorPayload);
    }
  });

  socket.on("disconnect", () => {
    const room = manager.markDisconnected(socket.id);

    if (room) {
      emitRoomState(io, room.roomCode, { room });
    }
  });
}
