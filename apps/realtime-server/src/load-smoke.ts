import { setTimeout as delay } from "node:timers/promises";

import type {
  ClientToServerEvents,
  DrawDuelGuessLogPayload,
  DrawDuelRoundStatePayload,
  DrawStrokePayload,
  EventAck,
  EventResponse,
  RealOrAiAnswerAckPayload,
  RealOrAiGameStartNoticePayload,
  RealOrAiRoomJoinedPayload,
  RealOrAiRoomStatePayload,
  RealOrAiRoundResultPayload,
  RealOrAiRoundStartPayload,
  RoomJoinedPayload,
  ServerToClientEvents,
} from "@ai-arcade/shared";
import { DRAW_DUEL_GAME_ID } from "@ai-arcade/shared";
import { io, type Socket } from "socket.io-client";

type LoadSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
type SmokeGame = "draw-duel" | "real-or-ai";

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
  answerSubmissions: number;
  connectionFailures: number;
  connectedClients: number;
  eventErrors: number;
  roomsCreated: number;
  roomsStarted: number;
};

const targetUrl =
  getCliValue("url") ?? process.env.LOAD_SMOKE_URL ?? "http://127.0.0.1:4000";
const smokeGame = parseSmokeGame(
  getCliValue("game") ?? process.env.LOAD_SMOKE_GAME,
);
const requestedClients = parsePositiveInteger(
  getCliValue("clients") ?? process.env.LOAD_SMOKE_CLIENTS,
  100,
);
const requestedRooms = parsePositiveInteger(
  getCliValue("rooms") ?? process.env.LOAD_SMOKE_ROOMS,
  smokeGame === "real-or-ai" ? 1 : 10,
);
const connectTimeoutMs = parsePositiveInteger(
  getCliValue("connect-timeout-ms") ?? process.env.LOAD_SMOKE_CONNECT_TIMEOUT_MS,
  5_000,
);
const ackTimeoutMs = parsePositiveInteger(
  getCliValue("ack-timeout-ms") ?? process.env.LOAD_SMOKE_ACK_TIMEOUT_MS,
  5_000,
);
const eventTimeoutMs = parsePositiveInteger(
  getCliValue("event-timeout-ms") ?? process.env.LOAD_SMOKE_EVENT_TIMEOUT_MS,
  15_000,
);
const maxRealOrAiPlayersPerRoom = 100;

function getCliValue(name: string) {
  const prefix = `--${name}=`;
  const inline = process.argv.find((argument) => argument.startsWith(prefix));

  if (inline) {
    return inline.slice(prefix.length);
  }

  const index = process.argv.indexOf(`--${name}`);
  const value = process.argv[index + 1];

  return index >= 0 && value && !value.startsWith("--") ? value : undefined;
}

function parseSmokeGame(value: string | undefined): SmokeGame {
  return value === "real-or-ai" ? "real-or-ai" : "draw-duel";
}

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

function createDrawDuelRoom(socket: LoadSocket, nickname: string) {
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

function joinDrawDuelRoom(socket: LoadSocket, roomCode: string, nickname: string) {
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

function startDrawDuelGame(socket: LoadSocket, roomCode: string) {
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

function waitForDrawDuelRoundState(socket: LoadSocket, roomCode: string) {
  return new Promise<DrawDuelRoundStatePayload>((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off("draw-duel:round-state", handleRoundState);
      reject(new Error(`round state timeout for ${roomCode}`));
    }, eventTimeoutMs);

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

function createRealOrAiRoom(socket: LoadSocket, nickname: string) {
  return waitForAck<RealOrAiRoomJoinedPayload>(
    (ack) =>
      socket.emit(
        "real-or-ai:room-create",
        {
          nickname,
        },
        ack,
      ),
    "real-or-ai:room-create",
  );
}

function joinRealOrAiRoom(socket: LoadSocket, roomCode: string, nickname: string) {
  return waitForAck<RealOrAiRoomJoinedPayload>(
    (ack) =>
      socket.emit(
        "real-or-ai:room-join",
        {
          nickname,
          roomCode,
        },
        ack,
      ),
    "real-or-ai:room-join",
  );
}

function updateRealOrAiSettings(socket: LoadSocket, roomCode: string) {
  return waitForAck<RealOrAiRoomStatePayload>(
    (ack) =>
      socket.emit(
        "real-or-ai:settings-update",
        {
          roomCode,
          settings: {
            answerLockMode: "first-submit",
            countdownSeconds: 3,
            roundCount: 1,
            roundDurationSeconds: 5,
            shuffleMode: "random",
          },
        },
        ack,
      ),
    "real-or-ai:settings-update",
  );
}

function startRealOrAiGame(socket: LoadSocket, roomCode: string) {
  return waitForAck<RealOrAiGameStartNoticePayload>(
    (ack) =>
      socket.emit(
        "real-or-ai:game-start",
        {
          roomCode,
        },
        ack,
      ),
    "real-or-ai:game-start",
  );
}

function submitRealOrAiAnswer(
  socket: LoadSocket,
  payload: Parameters<ClientToServerEvents["real-or-ai:answer-submit"]>[0],
) {
  return waitForAck<RealOrAiAnswerAckPayload>(
    (ack) => socket.emit("real-or-ai:answer-submit", payload, ack),
    "real-or-ai:answer-submit",
  );
}

function waitForRealOrAiRoundStart(socket: LoadSocket, roomCode: string) {
  return new Promise<RealOrAiRoundStartPayload>((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off("real-or-ai:round-start", handleRoundStart);
      reject(new Error(`real-or-ai round start timeout for ${roomCode}`));
    }, eventTimeoutMs);

    function handleRoundStart(payload: RealOrAiRoundStartPayload) {
      if (payload.roomCode !== roomCode) {
        return;
      }

      clearTimeout(timer);
      socket.off("real-or-ai:round-start", handleRoundStart);
      resolve(payload);
    }

    socket.on("real-or-ai:round-start", handleRoundStart);
  });
}

function waitForRealOrAiRoundResult(socket: LoadSocket, roomCode: string) {
  return new Promise<RealOrAiRoundResultPayload>((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off("real-or-ai:round-result", handleRoundResult);
      reject(new Error(`real-or-ai round result timeout for ${roomCode}`));
    }, eventTimeoutMs);

    function handleRoundResult(payload: RealOrAiRoundResultPayload) {
      if (payload.roomCode !== roomCode) {
        return;
      }

      clearTimeout(timer);
      socket.off("real-or-ai:round-result", handleRoundResult);
      resolve(payload);
    }

    socket.on("real-or-ai:round-result", handleRoundResult);
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

function toRealOrAiLoadPlayer(
  socket: LoadSocket,
  nickname: string,
  payload: RealOrAiRoomJoinedPayload,
): LoadPlayer {
  return {
    nickname,
    playerId: payload.currentPlayerId,
    reconnectToken: payload.reconnectToken,
    roomCode: payload.room.roomCode,
    socket,
  };
}

async function connectSockets(stats: SmokeStats, errors: string[]) {
  const sockets: LoadSocket[] = [];
  const socketResults = await Promise.all(
    Array.from({ length: requestedClients }, async (_, index) => {
      try {
        const socket = await createSocket(index + 1);
        socket.on("error", (payload) => {
          stats.eventErrors += 1;
          errors.push(`${payload.code}: ${payload.message}`);
        });
        socket.on("real-or-ai:error", (payload) => {
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

  return sockets;
}

async function runDrawDuelSmoke(sockets: LoadSocket[], stats: SmokeStats, errors: string[]) {
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
    const joined = await createDrawDuelRoom(socket, nickname);
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
    const joined = await joinDrawDuelRoom(socket, room.roomCode, nickname);
    room.players.push(toLoadPlayer(socket, nickname, joined));
  }

  for (const room of rooms) {
    if (room.players.length < 2) {
      continue;
    }

    const roundStatePromise = waitForDrawDuelRoundState(room.host.socket, room.roomCode);
    await startDrawDuelGame(room.host.socket, room.roomCode);
    const roundState = await roundStatePromise;
    stats.roomsStarted += 1;

    await submitStroke(room.host.socket, {
      color: "#22d3ee",
      isComplete: true,
      playerId: roundState.round.drawerPlayerId,
      points: [
        {
          t: 1,
          x: 80,
          y: 90,
        },
        {
          t: 2,
          x: 240,
          y: 180,
        },
      ],
      roomCode: room.roomCode,
      strokeId: `smoke-${room.roomCode}`,
      tool: "pen",
      width: 8,
    });

    const guessers = room.players
      .filter((player) => player.playerId !== roundState.round.drawerPlayerId)
      .slice(0, 3);

    await Promise.all(
      guessers.map((player, guessIndex) =>
        submitGuess(player.socket, {
          playerId: player.playerId,
          roomCode: room.roomCode,
          roundId: roundState.round.roundId,
          text: guessIndex === 0 ? "apple" : "test",
        })
          .then(() => {
            stats.answerSubmissions += 1;
          })
          .catch((error: unknown) => {
            stats.eventErrors += 1;
            errors.push(error instanceof Error ? error.message : "unknown guess error");
          }),
      ),
    );

    await delay(20);
  }
}

async function runRealOrAiSmoke(sockets: LoadSocket[], stats: SmokeStats, errors: string[]) {
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

    const nickname = `RealHost${String(roomIndex + 1).padStart(2, "0")}`;
    const joined = await createRealOrAiRoom(socket, nickname);
    const host = toRealOrAiLoadPlayer(socket, nickname, joined);
    rooms.push({
      host,
      players: [host],
      roomCode: joined.room.roomCode,
    });
    stats.roomsCreated += 1;
  }

  for (let index = 0; index < guestSockets.length; index += 1) {
    const socket = guestSockets[index];

    if (!socket) {
      continue;
    }

    const room =
      rooms.find((candidate) => candidate.players.length < maxRealOrAiPlayersPerRoom) ??
      rooms[index % rooms.length];

    if (!room || room.players.length >= maxRealOrAiPlayersPerRoom) {
      continue;
    }

    const nickname = `RealGuest${String(index + 1).padStart(3, "0")}`;
    const joined = await joinRealOrAiRoom(socket, room.roomCode, nickname);
    room.players.push(toRealOrAiLoadPlayer(socket, nickname, joined));
  }

  for (const room of rooms) {
    if (room.players.length < 2) {
      continue;
    }

    await updateRealOrAiSettings(room.host.socket, room.roomCode);
    const roundStartPromise = waitForRealOrAiRoundStart(room.host.socket, room.roomCode);
    await startRealOrAiGame(room.host.socket, room.roomCode);
    const roundStart = await roundStartPromise;
    stats.roomsStarted += 1;

    const selectedCandidateId = roundStart.round.item.candidates[0]?.id;

    if (!selectedCandidateId) {
      throw new Error(`real-or-ai missing candidate for ${room.roomCode}`);
    }

    const roundResultPromise = waitForRealOrAiRoundResult(room.host.socket, room.roomCode);
    await Promise.all(
      room.players.map((player) =>
        submitRealOrAiAnswer(player.socket, {
          playerId: player.playerId,
          roomCode: room.roomCode,
          roundId: roundStart.round.roundId,
          selectedCandidateId,
        })
          .then(() => {
            stats.answerSubmissions += 1;
          })
          .catch((error: unknown) => {
            stats.eventErrors += 1;
            errors.push(error instanceof Error ? error.message : "unknown answer error");
          }),
      ),
    );

    const result = await roundResultPromise;

    if (result.entries.length !== room.players.length) {
      stats.eventErrors += 1;
      errors.push(
        `real-or-ai ${room.roomCode} result entries ${result.entries.length}/${room.players.length}`,
      );
    }
  }
}

function printSummary(startedAt: number, stats: SmokeStats, errors: string[]) {
  const elapsedMs = Date.now() - startedAt;
  const successRate =
    requestedClients === 0 ? 0 : (stats.connectedClients / requestedClients) * 100;
  const summary = [
    `${smokeGame === "real-or-ai" ? "Real or AI" : "Draw Duel"} load smoke result`,
    `Target: ${targetUrl}`,
    `Requested clients: ${requestedClients}`,
    `Requested rooms: ${requestedRooms}`,
    `Connected clients: ${stats.connectedClients}`,
    `Connection success rate: ${successRate.toFixed(1)}%`,
    `Rooms created: ${stats.roomsCreated}`,
    `Rooms started: ${stats.roomsStarted}`,
    `Answer submissions: ${stats.answerSubmissions}`,
    `Event errors: ${stats.eventErrors}`,
    `Elapsed: ${elapsedMs}ms`,
  ];

  console.info(summary.join("\n"));

  if (errors.length > 0) {
    console.info(`First errors:\n${errors.slice(0, 8).join("\n")}`);
  }
}

async function main() {
  const startedAt = Date.now();
  const stats: SmokeStats = {
    answerSubmissions: 0,
    connectionFailures: 0,
    connectedClients: 0,
    eventErrors: 0,
    roomsCreated: 0,
    roomsStarted: 0,
  };
  const errors: string[] = [];
  const sockets = await connectSockets(stats, errors);

  try {
    if (smokeGame === "real-or-ai") {
      await runRealOrAiSmoke(sockets, stats, errors);
    } else {
      await runDrawDuelSmoke(sockets, stats, errors);
    }
  } finally {
    sockets.forEach((socket) => socket.disconnect());
  }

  printSummary(startedAt, stats, errors);

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
