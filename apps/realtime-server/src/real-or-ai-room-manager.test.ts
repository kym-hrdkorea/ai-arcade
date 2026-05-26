import { describe, expect, it } from "vitest";

import type {
  RealOrAiPrivateRoundItem,
  RealOrAiSettings,
} from "@ai-arcade/shared";
import { DEFAULT_REAL_OR_AI_SETTINGS } from "@ai-arcade/shared";

import {
  RealOrAiRoomError,
  RealOrAiRoomManager,
} from "./real-or-ai-room-manager.js";

const hostSocketId = "socket-host";
const startTime = new Date("2026-01-01T00:00:00.000Z");

function createRoundItem(index: number): RealOrAiPrivateRoundItem {
  const id = String(index).padStart(3, "0");

  return {
    candidates: [
      {
        alt: `예시 후보 ${id} A`,
        height: 800,
        id: `item-${id}-a`,
        sourceType: "real",
        src: `/example/real-or-ai/placeholder/item-${id}-a.webp`,
        width: 1200,
      },
      {
        alt: `예시 후보 ${id} B`,
        height: 800,
        id: `item-${id}-b`,
        sourceType: "ai",
        src: `/example/real-or-ai/placeholder/item-${id}-b.webp`,
        width: 1200,
      },
    ],
    correctCandidateId: `item-${id}-a`,
    id: `item-${id}`,
    title: `예시 ${id}`,
  };
}

function createRoundItems(count: number): RealOrAiPrivateRoundItem[] {
  return Array.from({ length: count }, (_, index) => createRoundItem(index + 1));
}

function createManager(roundItemCount = 10) {
  return new RealOrAiRoomManager(createRoundItems(roundItemCount));
}

function createRoom(manager = createManager()) {
  return manager.createRoom(
    {
      nickname: "호스트",
    },
    hostSocketId,
  );
}

function joinPlayer(manager: RealOrAiRoomManager, roomCode: string, index: number) {
  return manager.joinRoom(
    {
      nickname: `참가자${index}`,
      roomCode,
    },
    `socket-${index}`,
  );
}

function updateSettings(
  manager: RealOrAiRoomManager,
  roomCode: string,
  settings: RealOrAiSettings,
  socketId = hostSocketId,
) {
  return manager.updateSettings(
    {
      roomCode,
      settings,
    },
    socketId,
  );
}

function startGame(manager: RealOrAiRoomManager, roomCode: string, now = startTime) {
  return manager.startGame(
    {
      roomCode,
    },
    hostSocketId,
    now,
  );
}

function startAnsweringRound(
  manager: RealOrAiRoomManager,
  roomCode: string,
  now = new Date(startTime.getTime() + 5_000),
) {
  return manager.startAnsweringRound(roomCode, now);
}

function publicStateHasHiddenAnswerMetadata(value: unknown) {
  const serialized = JSON.stringify(value);

  return (
    serialized?.includes("sourceType") === true ||
    serialized?.includes("correctCandidateId") === true
  );
}

describe("RealOrAiRoomManager", () => {
  it("validates constructor manifest input", () => {
    expect(() => new RealOrAiRoomManager([])).toThrow(RealOrAiRoomError);
    expect(() => new RealOrAiRoomManager(createRoundItems(1))).not.toThrow();
  });

  it("creates a room with default settings and playable round count", () => {
    const manager = createManager(12);
    const created = createRoom(manager);

    expect(created.room.gameId).toBe("real-or-ai");
    expect(created.room.playableRoundCount).toBe(12);
    expect(created.room.settings).toEqual(DEFAULT_REAL_OR_AI_SETTINGS);
    expect(created.room.maxPlayers).toBe(120);
  });

  it("allows players over the displayed room capacity", () => {
    const manager = createManager();
    const host = createRoom(manager);
    let latest = host.room;

    for (let index = 1; index <= latest.maxPlayers + 5; index += 1) {
      latest = joinPlayer(manager, host.room.roomCode, index).room;
    }

    expect(latest.maxPlayers).toBe(120);
    expect(latest.players).toHaveLength(latest.maxPlayers + 6);
  });

  it("allows only the host to update settings while waiting", () => {
    const manager = createManager();
    const host = createRoom(manager);
    joinPlayer(manager, host.room.roomCode, 1);

    const settings: RealOrAiSettings = {
      answerLockMode: "first-submit",
      countdownSeconds: 5,
      roundCount: 5,
      roundDurationSeconds: 5,
      shuffleMode: "random",
    };

    expect(() =>
      updateSettings(manager, host.room.roomCode, settings, "socket-1"),
    ).toThrow(RealOrAiRoomError);
    expect(updateSettings(manager, host.room.roomCode, settings).settings).toEqual(
      settings,
    );
  });

  it("accepts long host round duration settings while waiting", () => {
    const manager = createManager();
    const host = createRoom(manager);

    for (const roundDurationSeconds of [30, 45, 60] as const) {
      const settings: RealOrAiSettings = {
        answerLockMode: "first-submit",
        countdownSeconds: 5,
        roundCount: 5,
        roundDurationSeconds,
        shuffleMode: "random",
      };

      expect(updateSettings(manager, host.room.roomCode, settings).settings).toEqual(
        settings,
      );
    }
  });

  it("rejects settings updates after game start", () => {
    const manager = createManager();
    const host = createRoom(manager);
    joinPlayer(manager, host.room.roomCode, 1);
    startGame(manager, host.room.roomCode);

    expect(() =>
      updateSettings(manager, host.room.roomCode, DEFAULT_REAL_OR_AI_SETTINGS),
    ).toThrow(RealOrAiRoomError);
  });

  it("rejects round counts above playable round count", () => {
    const manager = createManager(2);
    const host = createRoom(manager);

    expect(() =>
      updateSettings(manager, host.room.roomCode, {
        answerLockMode: "first-submit",
        countdownSeconds: 5,
        roundCount: 3,
        roundDurationSeconds: 10,
        shuffleMode: "random",
      }),
    ).toThrow(RealOrAiRoomError);
  });

  it("starts only when at least two connected players are present", () => {
    const manager = createManager();
    const host = createRoom(manager);

    expect(() => startGame(manager, host.room.roomCode)).toThrow(RealOrAiRoomError);

    joinPlayer(manager, host.room.roomCode, 1);
    const started = startGame(manager, host.room.roomCode);

    expect(started.room.status).toBe("countdown");
    expect(started.room.currentRound).toBeUndefined();
    expect(started.countdown.remainingSeconds).toBe(5);
    expect(
      startAnsweringRound(manager, host.room.roomCode).round.roundNumber,
    ).toBe(1);
  });

  it("uses a 60 second setting when calculating round end time", () => {
    const manager = createManager(1);
    const host = createRoom(manager);
    joinPlayer(manager, host.room.roomCode, 1);
    updateSettings(manager, host.room.roomCode, {
      answerLockMode: "first-submit",
      countdownSeconds: 5,
      roundCount: 1,
      roundDurationSeconds: 60,
      shuffleMode: "random",
    });
    startGame(manager, host.room.roomCode);

    const roundStartTime = new Date(startTime.getTime() + 5_000);
    const started = startAnsweringRound(manager, host.room.roomCode, roundStartTime);

    expect(started.round.endsAt).toBe(
      new Date(roundStartTime.getTime() + 60_000).toISOString(),
    );
  });

  it("keeps public round state free of answer metadata", () => {
    const manager = createManager(1);
    const host = createRoom(manager);
    joinPlayer(manager, host.room.roomCode, 1);
    const started = startGame(manager, host.room.roomCode);
    const round = startAnsweringRound(manager, host.room.roomCode);

    expect(started.room.currentRound).toBeUndefined();
    expect(publicStateHasHiddenAnswerMetadata(round)).toBe(false);
    expect(publicStateHasHiddenAnswerMetadata(started.room.currentRound)).toBe(false);
  });

  it("rejects answers while the room is still in countdown", () => {
    const manager = createManager(1);
    const host = createRoom(manager);
    joinPlayer(manager, host.room.roomCode, 1);
    startGame(manager, host.room.roomCode);

    expect(() =>
      manager.submitAnswer(
        {
          playerId: host.currentPlayerId,
          roomCode: host.room.roomCode,
          roundId: "11111111-1111-4111-8111-111111111111",
          selectedCandidateId: "item-001-a",
        },
        hostSocketId,
      ),
    ).toThrow(RealOrAiRoomError);
  });

  it("accepts only one answer per player per round", () => {
    const manager = createManager(1);
    const host = createRoom(manager);
    joinPlayer(manager, host.room.roomCode, 1);
    startGame(manager, host.room.roomCode);
    const started = startAnsweringRound(manager, host.room.roomCode);
    const selectedCandidateId = started.round.item.candidates[0]?.id ?? "";

    manager.submitAnswer(
      {
        playerId: host.currentPlayerId,
        roomCode: host.room.roomCode,
        roundId: started.round.roundId,
        selectedCandidateId,
      },
      hostSocketId,
      new Date(startTime.getTime() + 6_000),
    );

    expect(() =>
      manager.submitAnswer(
        {
          playerId: host.currentPlayerId,
          roomCode: host.room.roomCode,
          roundId: started.round.roundId,
          selectedCandidateId,
        },
        hostSocketId,
        new Date(startTime.getTime() + 7_000),
      ),
    ).toThrow(RealOrAiRoomError);
  });

  it("awards speed-adjusted points for correct answers", () => {
    const manager = createManager(1);
    const host = createRoom(manager);
    joinPlayer(manager, host.room.roomCode, 1);
    startGame(manager, host.room.roomCode);
    const started = startAnsweringRound(manager, host.room.roomCode);
    const result = manager.submitAnswer(
      {
        playerId: host.currentPlayerId,
        roomCode: host.room.roomCode,
        roundId: started.round.roundId,
        selectedCandidateId: createRoundItem(1).correctCandidateId,
      },
      hostSocketId,
      new Date(startTime.getTime() + 7_000),
    );
    const hostScore = result.room.players.find(
      (player) => player.playerId === host.currentPlayerId,
    )?.score;

    expect(hostScore).toBeGreaterThanOrEqual(100);
    expect(hostScore).toBeLessThanOrEqual(150);
  });

  it("awards zero points for wrong and timeout answers", () => {
    const wrongManager = createManager(1);
    const wrongHost = createRoom(wrongManager);
    const wrongGuest = joinPlayer(wrongManager, wrongHost.room.roomCode, 1);
    startGame(wrongManager, wrongHost.room.roomCode);
    const wrongStarted = startAnsweringRound(wrongManager, wrongHost.room.roomCode);

    wrongManager.submitAnswer(
      {
        playerId: wrongHost.currentPlayerId,
        roomCode: wrongHost.room.roomCode,
        roundId: wrongStarted.round.roundId,
        selectedCandidateId: "item-001-b",
      },
      hostSocketId,
      new Date(startTime.getTime() + 6_000),
    );
    const wrongResult = wrongManager.submitAnswer(
      {
        playerId: wrongGuest.currentPlayerId,
        roomCode: wrongHost.room.roomCode,
        roundId: wrongStarted.round.roundId,
        selectedCandidateId: "item-001-b",
      },
      "socket-1",
      new Date(startTime.getTime() + 7_000),
    );

    expect(wrongResult.kind).toBe("round-result");
    if (wrongResult.kind === "round-result") {
      expect(wrongResult.result.entries.every((entry) => entry.pointsAwarded === 0)).toBe(
        true,
      );
    }

    const timeoutManager = createManager(1);
    const timeoutHost = createRoom(timeoutManager);
    const timeoutGuest = joinPlayer(timeoutManager, timeoutHost.room.roomCode, 1);
    startGame(timeoutManager, timeoutHost.room.roomCode);
    const timeoutStarted = startAnsweringRound(timeoutManager, timeoutHost.room.roomCode);
    const lateTime = new Date(startTime.getTime() + 51_000);

    timeoutManager.submitAnswer(
      {
        playerId: timeoutHost.currentPlayerId,
        roomCode: timeoutHost.room.roomCode,
        roundId: timeoutStarted.round.roundId,
        selectedCandidateId: "item-001-a",
      },
      hostSocketId,
      lateTime,
    );
    const timeoutResult = timeoutManager.submitAnswer(
      {
        playerId: timeoutGuest.currentPlayerId,
        roomCode: timeoutHost.room.roomCode,
        roundId: timeoutStarted.round.roundId,
        selectedCandidateId: "item-001-a",
      },
      "socket-1",
      lateTime,
    );

    expect(timeoutResult.kind).toBe("round-result");
    if (timeoutResult.kind === "round-result") {
      expect(
        timeoutResult.result.entries.every(
          (entry) => !entry.isCorrect && entry.pointsAwarded === 0,
        ),
      ).toBe(true);
    }
  });

  it("reveals source types and the correct candidate in round results", () => {
    const manager = createManager(1);
    const host = createRoom(manager);
    joinPlayer(manager, host.room.roomCode, 1);
    startGame(manager, host.room.roomCode);
    const started = startAnsweringRound(manager, host.room.roomCode);
    const result = manager.finishRound(host.room.roomCode, "time-up");

    expect(result.roundId).toBe(started.round.roundId);
    expect(result.correctCandidateId).toBe("item-001-a");
    expect(result.candidates.map((candidate) => candidate.sourceType).sort()).toEqual([
      "ai",
      "real",
    ]);
  });

  it("advances rounds until the final result", () => {
    const manager = createManager(2);
    const host = createRoom(manager);
    joinPlayer(manager, host.room.roomCode, 1);
    updateSettings(manager, host.room.roomCode, {
      answerLockMode: "first-submit",
      countdownSeconds: 5,
      roundCount: 2,
      roundDurationSeconds: 10,
      shuffleMode: "random",
    });
    startGame(manager, host.room.roomCode);
    startAnsweringRound(manager, host.room.roomCode);
    const firstResult = manager.finishRound(host.room.roomCode, "time-up");
    manager.setResultView(
      {
        roomCode: host.room.roomCode,
        roundId: firstResult.roundId,
        view: "score",
      },
      hostSocketId,
    );

    const nextRound = manager.nextRound(
      {
        roomCode: host.room.roomCode,
      },
      hostSocketId,
      new Date(startTime.getTime() + 12_000),
    );

    expect(nextRound.kind).toBe("countdown");
    if (nextRound.kind === "countdown") {
      expect(nextRound.room.status).toBe("countdown");
      expect(nextRound.room.currentRound).toBeUndefined();
    }

    const secondRound = startAnsweringRound(manager, host.room.roomCode);
    expect(secondRound.round.roundNumber).toBe(2);
    const secondResult = manager.finishRound(host.room.roomCode, "time-up");
    manager.setResultView(
      {
        roomCode: host.room.roomCode,
        roundId: secondResult.roundId,
        view: "score",
      },
      hostSocketId,
    );
    const finalResult = manager.nextRound(
      {
        roomCode: host.room.roomCode,
      },
      hostSocketId,
      new Date(startTime.getTime() + 24_000),
    );

    expect(finalResult.kind).toBe("game-result");
    if (finalResult.kind === "game-result") {
      expect(finalResult.room.status).toBe("final-result");
      expect(finalResult.gameResult.results).toHaveLength(2);
    }
  });

  it("requires the host score view before advancing round results", () => {
    const manager = createManager(1);
    const host = createRoom(manager);
    joinPlayer(manager, host.room.roomCode, 1);
    startGame(manager, host.room.roomCode);
    startAnsweringRound(manager, host.room.roomCode);

    expect(() =>
      manager.setResultView(
        {
          roomCode: host.room.roomCode,
          roundId: "11111111-1111-4111-8111-111111111111",
          view: "score",
        },
        hostSocketId,
      ),
    ).toThrow(RealOrAiRoomError);

    const result = manager.finishRound(host.room.roomCode, "time-up");

    expect(() =>
      manager.nextRound(
        {
          roomCode: host.room.roomCode,
        },
        hostSocketId,
      ),
    ).toThrow(RealOrAiRoomError);

    expect(() =>
      manager.setResultView(
        {
          roomCode: host.room.roomCode,
          roundId: result.roundId,
          view: "score",
        },
        "socket-1",
      ),
    ).toThrow(RealOrAiRoomError);

    const view = manager.setResultView(
      {
        roomCode: host.room.roomCode,
        roundId: result.roundId,
        view: "score",
      },
      hostSocketId,
    );

    expect(view.payload).toEqual({
      roomCode: host.room.roomCode,
      roundId: result.roundId,
      view: "score",
    });

    manager.markDisconnected(hostSocketId);
    const rejoined = manager.rejoinRoom(
      {
        playerId: host.currentPlayerId,
        reconnectToken: host.reconnectToken,
        roomCode: host.room.roomCode,
      },
      "socket-host-rejoin",
    );

    expect(rejoined.room.status).toBe("round-result");
    expect(rejoined.room.currentRound?.resultView).toBe("score");
    expect(rejoined.room.roundResult?.roundId).toBe(result.roundId);
    expect(
      manager.nextRound(
        {
          roomCode: host.room.roomCode,
        },
        "socket-host-rejoin",
      ).kind,
    ).toBe("game-result");
  });

  it("resets room progress while preserving room code and settings", () => {
    const manager = createManager(2);
    const host = createRoom(manager);
    joinPlayer(manager, host.room.roomCode, 1);
    const settings: RealOrAiSettings = {
      answerLockMode: "first-submit",
      countdownSeconds: 5,
      roundCount: 2,
      roundDurationSeconds: 5,
      shuffleMode: "random",
    };
    updateSettings(manager, host.room.roomCode, settings);
    startGame(manager, host.room.roomCode);
    const started = startAnsweringRound(manager, host.room.roomCode);
    const correctCandidateId =
      started.round.item.candidates.find((candidate) => candidate.id.endsWith("-a"))
        ?.id ?? "";
    manager.submitAnswer(
      {
        playerId: host.currentPlayerId,
        roomCode: host.room.roomCode,
        roundId: started.round.roundId,
        selectedCandidateId: correctCandidateId,
      },
      hostSocketId,
      new Date(startTime.getTime() + 1_000),
    );

    const reset = manager.resetRoom(
      {
        roomCode: host.room.roomCode,
      },
      hostSocketId,
    );

    expect(reset.roomCode).toBe(host.room.roomCode);
    expect(reset.settings).toEqual(settings);
    expect(reset.status).toBe("waiting");
    expect(reset.currentRound).toBeUndefined();
    expect(reset.players.every((player) => player.score === 0)).toBe(true);
  });

  it("rejoins with public state that does not expose hidden answer metadata", () => {
    const manager = createManager(1);
    const host = createRoom(manager);
    joinPlayer(manager, host.room.roomCode, 1);
    startGame(manager, host.room.roomCode);
    startAnsweringRound(manager, host.room.roomCode);
    manager.markDisconnected(hostSocketId);
    const rejoined = manager.rejoinRoom(
      {
        playerId: host.currentPlayerId,
        reconnectToken: host.reconnectToken,
        roomCode: host.room.roomCode,
      },
      "socket-host-rejoin",
    );

    expect(rejoined.room.status).toBe("answering");
    expect(publicStateHasHiddenAnswerMetadata(rejoined.room)).toBe(false);
  });
});
