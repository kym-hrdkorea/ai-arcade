import { setTimeout as delay } from "node:timers/promises";

import type {
  DrawDuelGuessLogPayload,
  DrawDuelRoundStatePayload,
  DrawStrokePayload,
  EventAck,
  EventResponse,
  RoomJoinedPayload,
  ServerToClientEvents,
  ClientToServerEvents,
} from "@ai-arcade/shared";
import { DRAW_DUEL_GAME_ID } from "@ai-arcade/shared";
import { io, type Socket } from "socket.io-client";

type LoadSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

type LoadPlayer = {
  nickname: string;
  playerId: string;
  reconnectToken: string;
  roomCode: string;
  socket: LoadSocket;
};

type LoadRoom = {
  host: LoadPlayer;
  players: LoadPlayer[];
  roomCode: string;
};

type SmokeStats = {
  connectionFailures: number;
  connectedClients: number;
  eventErrors: number;
  roomsCreated: number;
  roomsStarted: number;
};

const targetUrl = process.env.LOAD_SMOKE_URL ?? "http://localhost:4000";
const requestedClients = parsePositiveInteger(process.env.LOAD_SMOKE_CLIENTS, 100);
const requestedRooms = parsePositiveInteger(process.env.LOAD_SMOKE_ROOMS, 10);
const connectTimeoutMs = parsePositiveInteger(process.env.LOAD_SMOKE_CONNECT_TIMEOUT_MS, 5_000);
const ackTimeoutMs = parsePositiveInteger(process.env.LOAD_SMOKE_ACK_TIMEOUT_MS, 5_000);

function parsePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function createSocket(index: number) {
  return new Promise<LoadSocket>((resolve, reject) => {
    const socket: LoadSocket = io(targetUrl, {
      reconnection: false,
      timeout: connectTimeoutMs,
      transports: ["websocket"],
    });
    const timer = setTimeout(() => {
      socket.disconnect();
      reject(new Error(`client ${index} connect timeout`));
    }, connectTimeoutMs);

    socket.once("connect", () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.once("connect_error", (error) => {
      clearTimeout(timer);
      socket.disconnect();
      reject(error);
    });
  });
}

function waitForAck<T>(emit: (ack: EventAck<T>) => void, label: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} ack timeout`));
    }, ackTimeoutMs);

    emit((response: EventResponse<T>) => {
      clearTimeout(timer);

      if (!response.ok) {
        reject(new Error(`${label} failed: ${response.error.code}`));
        return;
      }

      resolve(response.data);
    });
  });
}

function createRoom(socket: LoadSocket, nickname: string) {
  return waitForAck<RoomJoinedPayload>(
    (ack) =>
      socket.emit(
        "room:create",
        {
          gameId: DRAW_DUEL_GAME_ID,
          nickname,
        },
        ack,
      ),
    "room:create",
  );
}

function joinRoom(socket: LoadSocket, roomCode: string, nickname: string) {
  return waitForAck<RoomJoinedPayload>(
    (ack) =>
      socket.emit(
        "room:join",
        {
          roomCode,
          nickname,
        },
        ack,
      ),
    "room:join",
  );
}

function startGame(socket: LoadSocket, roomCode: string) {
  return waitForAck(
    (ack) =>
      socket.emit(
        "game:start",
        {
          roomCode,
        },
        ack,
      ),
    "game:start",
  );
}

function submitStroke(socket: LoadSocket, payload: DrawStrokePayload) {
  return waitForAck(
    (ack) => socket.emit("draw-duel:stroke", payload, ack),
    "draw-duel:stroke",
  );
}

function submitGuess(
  socket: LoadSocket,
  payload: {
    playerId: string;
    roomCode: string;
    roundId: string;
    text: string;
  },
) {
  return waitForAck<DrawDuelGuessLogPayload>(
    (ack) => socket.emit("draw-duel:guess-submit", payload, ack),
    "draw-duel:guess-submit",
  );
}

function waitForRoundState(socket: LoadSocket, roomCode: string) {
  return new Promise<DrawDuelRoundStatePayload>((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off("draw-duel:round-state", handleRoundState);
      reject(new Error(`round state timeout for ${roomCode}`));
    }, ackTimeoutMs);

    function handleRoundState(payload: DrawDuelRoundStatePayload) {
      if (payload.roomCode !== roomCode) {
        return;
      }

      clearTimeout(timer);
      socket.off("draw-duel:round-state", handleRoundState);
      resolve(payload);
    }

    socket.on("draw-duel:round-state", handleRoundState);
  });
}

function toLoadPlayer(socket: LoadSocket, nickname: string, payload: RoomJoinedPayload): LoadPlayer {
  return {
    nickname,
    playerId: payload.currentPlayerId,
    reconnectToken: payload.reconnectToken,
    roomCode: payload.room.roomCode,
    socket,
  };
}

async function main() {
  const startedAt = Date.now();
  const stats: SmokeStats = {
    connectionFailures: 0,
    connectedClients: 0,
    eventErrors: 0,
    roomsCreated: 0,
    roomsStarted: 0,
  };
  const errors: string[] = [];
  const sockets: LoadSocket[] = [];

  const socketResults = await Promise.all(
    Array.from({ length: requestedClients }, async (_, index) => {
      try {
        const socket = await createSocket(index + 1);
        socket.on("error", (payload) => {
          stats.eventErrors += 1;
          errors.push(`${payload.code}: ${payload.message}`);
        });
        return socket;
      } catch (error) {
        stats.connectionFailures += 1;
        errors.push(error instanceof Error ? error.message : "unknown connection error");
        return null;
      }
    }),
  );

  for (const socket of socketResults) {
    if (socket) {
      sockets.push(socket);
    }
  }

  stats.connectedClients = sockets.length;

  if (sockets.length < requestedRooms) {
    throw new Error("not enough connected clients to create requested rooms");
  }

  const rooms: LoadRoom[] = [];
  const hostSockets = sockets.slice(0, requestedRooms);
  const guestSockets = sockets.slice(requestedRooms);

  for (let roomIndex = 0; roomIndex < hostSockets.length; roomIndex += 1) {
    const socket = hostSockets[roomIndex];

    if (!socket) {
      continue;
    }

    const nickname = `Host${String(roomIndex + 1).padStart(2, "0")}`;
    const joined = await createRoom(socket, nickname);
    const host = toLoadPlayer(socket, nickname, joined);
    rooms.push({
      host,
      players: [host],
      roomCode: joined.room.roomCode,
    });
    stats.roomsCreated += 1;
  }

  for (let index = 0; index < guestSockets.length; index += 1) {
    const socket = guestSockets[index];
    const room = rooms[index % rooms.length];

    if (!socket || !room || room.players.length >= 10) {
      continue;
    }

    const nickname = `Guest${String(index + 1).padStart(3, "0")}`;
    const joined = await joinRoom(socket, room.roomCode, nickname);
    room.players.push(toLoadPlayer(socket, nickname, joined));
  }

  for (const room of rooms) {
    if (room.players.length < 2) {
      continue;
    }

    const roundStatePromise = waitForRoundState(room.host.socket, room.roomCode);
    await startGame(room.host.socket, room.roomCode);
    const roundState = await roundStatePromise;
    stats.roomsStarted += 1;

    await submitStroke(room.host.socket, {
      roomCode: room.roomCode,
      strokeId: `smoke-${room.roomCode}`,
      playerId: roundState.round.drawerPlayerId,
      points: [
        {
          x: 80,
          y: 90,
          t: 1,
        },
        {
          x: 240,
          y: 180,
          t: 2,
        },
      ],
      color: "#22d3ee",
      width: 8,
      tool: "pen",
      isComplete: true,
    });

    const guessers = room.players
      .filter((player) => player.playerId !== roundState.round.drawerPlayerId)
      .slice(0, 3);

    await Promise.all(
      guessers.map((player, guessIndex) =>
        submitGuess(player.socket, {
          roomCode: room.roomCode,
          roundId: roundState.round.roundId,
          playerId: player.playerId,
          text: guessIndex === 0 ? "사과" : "테스트",
        }).catch((error: unknown) => {
          stats.eventErrors += 1;
          errors.push(error instanceof Error ? error.message : "unknown guess error");
        }),
      ),
    );

    await delay(20);
  }

  sockets.forEach((socket) => socket.disconnect());

  const elapsedMs = Date.now() - startedAt;
  const successRate = requestedClients === 0 ? 0 : (stats.connectedClients / requestedClients) * 100;
  const summary = [
    "Draw Duel load smoke result",
    `Target: ${targetUrl}`,
    `Requested clients: ${requestedClients}`,
    `Connected clients: ${stats.connectedClients}`,
    `Connection success rate: ${successRate.toFixed(1)}%`,
    `Rooms created: ${stats.roomsCreated}`,
    `Rooms started: ${stats.roomsStarted}`,
    `Event errors: ${stats.eventErrors}`,
    `Elapsed: ${elapsedMs}ms`,
  ];

  console.info(summary.join("\n"));

  if (errors.length > 0) {
    console.info(`First errors:\n${errors.slice(0, 8).join("\n")}`);
  }

  if (
    stats.connectionFailures > 0 ||
    stats.eventErrors > 0 ||
    stats.roomsCreated !== requestedRooms
  ) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
