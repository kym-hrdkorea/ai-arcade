import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Server } from "socket.io";
import { io as createClient, type Socket as ClientSocket } from "socket.io-client";

import type {
  ClientToServerEvents,
  ErrorPayload,
  EventResponse,
  RealOrAiAnswerAckPayload,
  RealOrAiCountdownPayload,
  RealOrAiGameResultPayload,
  RealOrAiGameStartNoticePayload,
  RealOrAiPrivateRoundItem,
  RealOrAiResultViewPayload,
  RealOrAiRoomJoinedPayload,
  RealOrAiRoomStatePayload,
  RealOrAiRoundResultPayload,
  RealOrAiRoundStartPayload,
  RealOrAiSettings,
  RealOrAiSettingsUpdatedPayload,
  ServerToClientEvents,
} from "@ai-arcade/shared";

import { RealOrAiRoomManager } from "./real-or-ai-room-manager.js";
import {
  createRealOrAiSocketRuntime,
  registerRealOrAiHandlers,
  type RealOrAiSocketRuntime,
} from "./real-or-ai-socket-handlers.js";

type TestClientSocket = ClientSocket<ServerToClientEvents, ClientToServerEvents>;
type TestServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  { playerId?: string; roomCode?: string }
>;

const timeoutMs = 1_000;

function createRoundItem(index: number): RealOrAiPrivateRoundItem {
  const id = String(index).padStart(3, "0");

  return {
    candidates: [
      {
        alt: `Example candidate ${id} A`,
        height: 800,
        id: `socket-item-${id}-a`,
        sourceType: "real",
        src: `/example/real-or-ai/placeholder/socket-item-${id}-a.webp`,
        width: 1200,
      },
      {
        alt: `Example candidate ${id} B`,
        height: 800,
        id: `socket-item-${id}-b`,
        sourceType: "ai",
        src: `/example/real-or-ai/placeholder/socket-item-${id}-b.webp`,
        width: 1200,
      },
    ],
    correctCandidateId: `socket-item-${id}-a`,
    id: `socket-item-${id}`,
    title: `Socket fixture ${id}`,
  };
}

function createRoundItems(count: number): RealOrAiPrivateRoundItem[] {
  return Array.from({ length: count }, (_, index) => createRoundItem(index + 1));
}

function waitFor<E extends keyof ServerToClientEvents>(
  socket: TestClientSocket,
  eventName: E,
): Promise<Parameters<ServerToClientEvents[E]>[0]> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(eventName);
      reject(new Error(`Timed out waiting for ${String(eventName)}`));
    }, timeoutMs);

    const handler = ((payload: Parameters<ServerToClientEvents[E]>[0]) => {
      clearTimeout(timer);
      resolve(payload);
    }) as ServerToClientEvents[E];

    const typedSocket = socket as unknown as {
      once: (event: E, listener: ServerToClientEvents[E]) => TestClientSocket;
    };
    typedSocket.once(eventName, handler);
  });
}

function connectClient(url: string): Promise<TestClientSocket> {
  return new Promise((resolve, reject) => {
    const socket: TestClientSocket = createClient(url, {
      forceNew: true,
      transports: ["websocket"],
    });
    const timer = setTimeout(() => {
      socket.disconnect();
      reject(new Error("Timed out connecting socket"));
    }, timeoutMs);

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

function emitRoomCreate(socket: TestClientSocket, nickname = "host") {
  return new Promise<EventResponse<RealOrAiRoomJoinedPayload>>((resolve) => {
    socket.emit("real-or-ai:room-create", { nickname }, resolve);
  });
}

function emitRoomJoin(socket: TestClientSocket, roomCode: string, nickname = "guest") {
  return new Promise<EventResponse<RealOrAiRoomJoinedPayload>>((resolve) => {
    socket.emit("real-or-ai:room-join", { nickname, roomCode }, resolve);
  });
}

function emitRoomRejoin(
  socket: TestClientSocket,
  payload: Parameters<ClientToServerEvents["real-or-ai:room-rejoin"]>[0],
) {
  return new Promise<EventResponse<RealOrAiRoomJoinedPayload>>((resolve) => {
    socket.emit("real-or-ai:room-rejoin", payload, resolve);
  });
}

function emitSettingsUpdate(
  socket: TestClientSocket,
  roomCode: string,
  settings: RealOrAiSettings,
) {
  return new Promise<EventResponse<RealOrAiRoomStatePayload>>((resolve) => {
    socket.emit("real-or-ai:settings-update", { roomCode, settings }, resolve);
  });
}

function emitGameStart(socket: TestClientSocket, roomCode: string) {
  return new Promise<EventResponse<RealOrAiGameStartNoticePayload>>((resolve) => {
    socket.emit("real-or-ai:game-start", { roomCode }, resolve);
  });
}

function emitAnswerSubmit(
  socket: TestClientSocket,
  payload: Parameters<ClientToServerEvents["real-or-ai:answer-submit"]>[0],
) {
  return new Promise<EventResponse<RealOrAiAnswerAckPayload>>((resolve) => {
    socket.emit("real-or-ai:answer-submit", payload, resolve);
  });
}

function emitRoundSkip(socket: TestClientSocket, roomCode: string) {
  return new Promise<EventResponse<RealOrAiRoundResultPayload>>((resolve) => {
    socket.emit("real-or-ai:round-skip", { roomCode }, resolve);
  });
}

function emitNextRound(socket: TestClientSocket, roomCode: string) {
  return new Promise<EventResponse<RealOrAiCountdownPayload | RealOrAiGameResultPayload>>(
    (resolve) => {
      socket.emit("real-or-ai:next-round", { roomCode }, resolve);
    },
  );
}

function emitResultViewSet(
  socket: TestClientSocket,
  payload: Parameters<ClientToServerEvents["real-or-ai:result-view-set"]>[0],
) {
  return new Promise<EventResponse<RealOrAiResultViewPayload>>((resolve) => {
    socket.emit("real-or-ai:result-view-set", payload, resolve);
  });
}

function emitRoomReset(socket: TestClientSocket, roomCode: string) {
  return new Promise<EventResponse<RealOrAiRoomStatePayload>>((resolve) => {
    socket.emit("real-or-ai:room-reset", { roomCode }, resolve);
  });
}

function expectOk<T>(response: EventResponse<T>): T {
  expect(response.ok).toBe(true);

  if (!response.ok) {
    throw new Error(response.error.message);
  }

  return response.data;
}

async function createJoinedRoom(host: TestClientSocket, guest: TestClientSocket) {
  const created = expectOk(await emitRoomCreate(host));
  const joined = expectOk(await emitRoomJoin(guest, created.room.roomCode));

  return {
    guest: joined,
    host: created,
    roomCode: created.room.roomCode,
  };
}

describe("real-or-ai socket handlers", () => {
  let httpServer: HttpServer;
  let ioServer: TestServer;
  let manager: RealOrAiRoomManager;
  let runtime: RealOrAiSocketRuntime;
  let serverUrl: string;
  let clients: TestClientSocket[];

  beforeEach(async () => {
    clients = [];
    httpServer = createServer();
    ioServer = new Server(httpServer, {
      cors: {
        origin: "*",
      },
    });
    manager = new RealOrAiRoomManager(createRoundItems(2));
    runtime = createRealOrAiSocketRuntime({ secondMs: 5 });
    ioServer.on("connection", (socket) => {
      registerRealOrAiHandlers(ioServer, socket, manager, runtime);
    });

    await new Promise<void>((resolve) => {
      httpServer.listen(0, "127.0.0.1", resolve);
    });
    const address = httpServer.address() as AddressInfo;
    serverUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    runtime.clearAllTimers();
    clients.forEach((socket) => socket.disconnect());
    ioServer.removeAllListeners();
    await new Promise<void>((resolve) => {
      ioServer.close(() => resolve());
    });
    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });
  });

  async function connectTrackedClient() {
    const socket = await connectClient(serverUrl);
    clients.push(socket);

    return socket;
  }

  it("handles room lifecycle, host settings, and permission errors", async () => {
    const host = await connectTrackedClient();
    const guest = await connectTrackedClient();
    const hostStatePromise = waitFor(
      host,
      "real-or-ai:room-state",
    );
    const created = expectOk(await emitRoomCreate(host));
    const hostState = await hostStatePromise;

    expect(hostState.room.roomCode).toBe(created.room.roomCode);

    const joined = expectOk(await emitRoomJoin(guest, created.room.roomCode));
    expect(joined.room.players).toHaveLength(2);

    const settings: RealOrAiSettings = {
      answerLockMode: "first-submit",
      countdownSeconds: 3,
      roundCount: 1,
      roundDurationSeconds: 5,
      shuffleMode: "random",
    };
    const guestErrorPromise = waitFor(guest, "real-or-ai:error");
    const guestUpdate = await emitSettingsUpdate(guest, created.room.roomCode, settings);

    expect(guestUpdate.ok).toBe(false);
    expect((await guestErrorPromise).code).toBe("HOST_ONLY");

    const settingsUpdatedPromise = waitFor(
      host,
      "real-or-ai:settings-updated",
    );
    const hostUpdate = expectOk(
      await emitSettingsUpdate(host, created.room.roomCode, settings),
    );

    expect(hostUpdate.room.settings).toEqual(settings);
    expect((await settingsUpdatedPromise).settings).toEqual(settings);
  });

  it("runs countdown, starts a public round, and separates answer ack from counts", async () => {
    const host = await connectTrackedClient();
    const guest = await connectTrackedClient();
    const { guest: guestJoin, host: hostJoin, roomCode } = await createJoinedRoom(
      host,
      guest,
    );
    await emitSettingsUpdate(host, roomCode, {
      answerLockMode: "first-submit",
      countdownSeconds: 3,
      roundCount: 1,
      roundDurationSeconds: 5,
      shuffleMode: "random",
    });

    const countdownPromise = waitFor(
      host,
      "real-or-ai:countdown",
    );
    const roundStartPromise = waitFor(
      host,
      "real-or-ai:round-start",
    );
    const firstTickPromise = waitFor(host, "real-or-ai:timer-tick");
    const started = expectOk(await emitGameStart(host, roomCode));

    expect(started.roomCode).toBe(roomCode);
    expect((await countdownPromise).remainingSeconds).toBe(3);

    const roundStart = await roundStartPromise;
    const firstTick = await firstTickPromise;
    const serializedRound = JSON.stringify(roundStart);

    expect(firstTick).toMatchObject({
      remainingSeconds: 5,
      roomCode,
    });
    expect(serializedRound.includes("sourceType")).toBe(false);
    expect(serializedRound.includes("correctCandidateId")).toBe(false);

    const hostAckEventPromise = waitFor(
      host,
      "real-or-ai:answer-ack",
    );
    const firstCountPromise = waitFor(guest, "real-or-ai:answer-count");
    const selectedCandidateId = roundStart.round.item.candidates[0]?.id ?? "";
    const hostAnswer = expectOk(
      await emitAnswerSubmit(host, {
        playerId: hostJoin.currentPlayerId,
        roomCode,
        roundId: roundStart.round.roundId,
        selectedCandidateId,
      }),
    );

    expect((await hostAckEventPromise).roundId).toBe(roundStart.round.roundId);
    expect(hostAnswer.selectedCandidateId).toBe(selectedCandidateId);
    expect(await firstCountPromise).toMatchObject({
      submittedCount: 1,
    });

    const roundResultPromise = waitFor(
      guest,
      "real-or-ai:round-result",
    );
    const secondCountPromise = waitFor(host, "real-or-ai:answer-count");
    expectOk(
      await emitAnswerSubmit(guest, {
        playerId: guestJoin.currentPlayerId,
        roomCode,
        roundId: roundStart.round.roundId,
        selectedCandidateId,
      }),
    );

    expect(await secondCountPromise).toMatchObject({
      submittedCount: 2,
    });
    const roundResult = await roundResultPromise;

    expect(roundResult.reason).toBe("all-submitted");
    expect(roundResult.correctCandidateId).toMatch(/^socket-item-/);
    expect(roundResult.candidates.map((candidate) => candidate.sourceType).sort()).toEqual([
      "ai",
      "real",
    ]);
  });

  it("broadcasts time-up results from the answering timer", async () => {
    const host = await connectTrackedClient();
    const guest = await connectTrackedClient();
    const { roomCode } = await createJoinedRoom(host, guest);
    await emitSettingsUpdate(host, roomCode, {
      answerLockMode: "first-submit",
      countdownSeconds: 3,
      roundCount: 1,
      roundDurationSeconds: 5,
      shuffleMode: "random",
    });

    const roundResultPromise = waitFor(
      host,
      "real-or-ai:round-result",
    );
    expectOk(await emitGameStart(host, roomCode));

    const result = await roundResultPromise;

    expect(result.reason).toBe("time-up");
    expect(result.entries.every((entry) => entry.pointsAwarded === 0)).toBe(true);
  });

  it("syncs result score view only after host validation", async () => {
    const host = await connectTrackedClient();
    const guest = await connectTrackedClient();
    const { host: hostJoin, roomCode } = await createJoinedRoom(host, guest);
    await emitSettingsUpdate(host, roomCode, {
      answerLockMode: "first-submit",
      countdownSeconds: 3,
      roundCount: 2,
      roundDurationSeconds: 5,
      shuffleMode: "random",
    });

    const roundStartPromise = waitFor(
      host,
      "real-or-ai:round-start",
    );
    expectOk(await emitGameStart(host, roomCode));
    await roundStartPromise;
    const skipped = expectOk(await emitRoundSkip(host, roomCode));

    const nextBeforeScoreErrorPromise = waitFor(host, "real-or-ai:error");
    const nextBeforeScore = await emitNextRound(host, roomCode);
    expect(nextBeforeScore.ok).toBe(false);
    expect((await nextBeforeScoreErrorPromise).code).toBe("RESULT_SCORE_NOT_OPEN");

    const guestErrorPromise = waitFor(guest, "real-or-ai:error");
    const guestTransition = await emitResultViewSet(guest, {
      roomCode,
      roundId: skipped.roundId,
      view: "score",
    });
    expect(guestTransition.ok).toBe(false);
    expect((await guestErrorPromise).code).toBe("HOST_ONLY");

    const wrongRoundErrorPromise = waitFor(host, "real-or-ai:error");
    const wrongRoundTransition = await emitResultViewSet(host, {
      roomCode,
      roundId: "11111111-1111-4111-8111-111111111111",
      view: "score",
    });
    expect(wrongRoundTransition.ok).toBe(false);
    expect((await wrongRoundErrorPromise).code).toBe("ROUND_MISMATCH");

    const guestViewPromise = waitFor(guest, "real-or-ai:result-view");
    const hostTransition = expectOk(await emitResultViewSet(host, {
      roomCode,
      roundId: skipped.roundId,
      view: "score",
    }));

    expect(hostTransition).toEqual({
      roomCode,
      roundId: skipped.roundId,
      view: "score",
    });
    expect(await guestViewPromise).toEqual(hostTransition);

    host.disconnect();
    const rejoinedHost = await connectTrackedClient();
    const rejoinedStatePromise = waitFor(rejoinedHost, "real-or-ai:room-state");
    const rejoined = expectOk(await emitRoomRejoin(rejoinedHost, {
      playerId: hostJoin.currentPlayerId,
      reconnectToken: hostJoin.reconnectToken,
      roomCode,
    }));

    expect(rejoined.room.currentRound?.resultView).toBe("score");
    expect(rejoined.room.roundResult?.roundId).toBe(skipped.roundId);
    expect((await rejoinedStatePromise).room.currentRound?.resultView).toBe("score");

    const nextAfterScore = expectOk(await emitNextRound(rejoinedHost, roomCode));
    expect("remainingSeconds" in nextAfterScore).toBe(true);
  });

  it("skips a round, returns final results, and clears timers on reset", async () => {
    const host = await connectTrackedClient();
    const guest = await connectTrackedClient();
    const { roomCode } = await createJoinedRoom(host, guest);
    await emitSettingsUpdate(host, roomCode, {
      answerLockMode: "first-submit",
      countdownSeconds: 3,
      roundCount: 1,
      roundDurationSeconds: 5,
      shuffleMode: "random",
    });

    const roundStartPromise = waitFor(
      host,
      "real-or-ai:round-start",
    );
    expectOk(await emitGameStart(host, roomCode));
    await roundStartPromise;

    const skipped = expectOk(await emitRoundSkip(host, roomCode));
    expect(skipped.reason).toBe("operator-skip");
    expectOk(await emitResultViewSet(host, {
      roomCode,
      roundId: skipped.roundId,
      view: "score",
    }));

    const gameResultPromise = waitFor(
      guest,
      "real-or-ai:game-result",
    );
    const finalAck = expectOk(await emitNextRound(host, roomCode));

    expect("results" in finalAck).toBe(true);
    expect((await gameResultPromise).results).toHaveLength(2);

    const reset = expectOk(await emitRoomReset(host, roomCode));

    expect(reset.room.status).toBe("waiting");
    expect(reset.room.settings.countdownSeconds).toBe(3);
  });
});
