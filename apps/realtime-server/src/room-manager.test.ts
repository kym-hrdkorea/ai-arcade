import { describe, expect, it } from "vitest";

import {
  DRAW_DUEL_GAME_ID,
  ROOM_MAX_PLAYERS,
  type DrawClearPayload,
  type DrawDuelSettings,
  type DrawGuessSubmitPayload,
  type DrawStrokePayload,
} from "@ai-arcade/shared";

import type {
  AIGuesser,
  AIGuesserInput,
  AIGuesserOutput,
  AIGuesserScoringContext,
} from "./ai-guesser.js";
import { drawDuelWordBank } from "./draw-duel-word-bank.js";
import { RoomError, RoomManager } from "./room-manager.js";

const startTime = new Date("2026-05-14T00:00:00.000Z");

function createRoom(manager = new RoomManager()) {
  return manager.createRoom(
    {
      gameId: DRAW_DUEL_GAME_ID,
      nickname: "호스트",
    },
    "socket-host",
  );
}

function joinGuest(manager: RoomManager, roomCode: string, socketId = "socket-guest") {
  return manager.joinRoom(
    {
      roomCode,
      nickname: "게스트",
    },
    socketId,
  );
}

function updateSettings(
  manager: RoomManager,
  roomCode: string,
  settings: DrawDuelSettings = {
    drawerMode: "rotate",
    maxRounds: 2,
    roundDurationSeconds: 30,
  },
  socketId = "socket-host",
) {
  return manager.updateSettings(
    {
      roomCode,
      settings,
    },
    socketId,
    startTime,
  );
}

function createStroke(
  roomCode: string,
  playerId: string,
  strokeId = "stroke-1",
): DrawStrokePayload {
  return {
    roomCode,
    strokeId,
    playerId,
    points: [
      {
        x: 120,
        y: 140,
        t: 1,
      },
      {
        x: 180,
        y: 190,
        t: 2,
      },
    ],
    color: "#22d3ee",
    width: 8,
    tool: "pen",
    isComplete: false,
  };
}

function createClear(roomCode: string, playerId: string): DrawClearPayload {
  return {
    roomCode,
    playerId,
    clearedAt: startTime.toISOString(),
  };
}

function createGuess(
  roomCode: string,
  roundId: string,
  playerId: string,
  text: string,
): DrawGuessSubmitPayload {
  return {
    roomCode,
    roundId,
    playerId,
    text,
  };
}

function wrongAnswerFor(correctWord: string) {
  return correctWord === "정답아님" ? "오답입니다" : "정답아님";
}

async function completeAIGuessing(
  manager: RoomManager,
  roomCode: string,
  now = new Date(startTime.getTime() + 31_000),
) {
  const result = await manager.completeAIGuessing(roomCode, now);

  if (!result) {
    throw new Error("Expected AI guessing completion.");
  }

  return result;
}

class FixedAIGuesser implements AIGuesser {
  readonly inputs: AIGuesserInput[] = [];
  readonly scoringContexts: AIGuesserScoringContext[] = [];

  constructor(private output: AIGuesserOutput) {}

  setOutput(output: AIGuesserOutput) {
    this.output = output;
  }

  async guess(
    input: AIGuesserInput,
    scoringContext: AIGuesserScoringContext,
  ): Promise<AIGuesserOutput> {
    this.inputs.push(input);
    this.scoringContexts.push(scoringContext);
    return this.output;
  }
}

class ThrowingAIGuesser implements AIGuesser {
  async guess(): Promise<AIGuesserOutput> {
    throw new Error("provider down");
  }
}

describe("RoomManager", () => {
  it("uses a 200-word Draw Duel word bank with unique concrete nouns", () => {
    const words = drawDuelWordBank.map((entry) => entry.word);

    expect(drawDuelWordBank).toHaveLength(200);
    expect(new Set(words).size).toBe(200);
    expect(drawDuelWordBank.every((entry) => entry.aliases.length > 0)).toBe(true);
  });

  it("creates a room with a host and a six-character code", () => {
    const result = createRoom();

    expect(result.room.roomCode).toMatch(/^[A-Z0-9]{6}$/);
    expect(result.room.hostPlayerId).toBe(result.currentPlayerId);
    expect(result.room.settings).toEqual({
      drawerMode: "host-only",
      maxRounds: 5,
      roundDurationSeconds: 45,
    });
    expect(result.room.players).toHaveLength(1);
  });

  it("adds players to an existing room and makes duplicate nicknames unique", () => {
    const manager = new RoomManager();
    const created = createRoom(manager);
    const joined = manager.joinRoom(
      {
        roomCode: created.room.roomCode,
        nickname: "호스트",
      },
      "socket-guest",
    );

    expect(joined.room.players).toHaveLength(2);
    expect(joined.room.players[1]?.nickname).toBe("호스트2");
  });

  it("rejects players over the room maximum", () => {
    const manager = new RoomManager();
    const created = createRoom(manager);

    for (let index = 2; index <= ROOM_MAX_PLAYERS; index += 1) {
      manager.joinRoom(
        {
          roomCode: created.room.roomCode,
          nickname: `참가${index}`,
        },
        `socket-${index}`,
      );
    }

    expect(() =>
      manager.joinRoom(
        {
          roomCode: created.room.roomCode,
          nickname: "초과",
        },
        "socket-overflow",
      ),
    ).toThrow(RoomError);
  });

  it("transfers host to the earliest remaining player when host leaves", () => {
    const manager = new RoomManager();
    const created = createRoom(manager);
    const firstGuest = joinGuest(manager, created.room.roomCode);

    const afterLeave = manager.leaveRoom(created.room.roomCode, "socket-host");

    expect(afterLeave.room?.hostPlayerId).toBe(firstGuest.currentPlayerId);
  });

  it("deletes a room after the last player leaves", () => {
    const manager = new RoomManager();
    const created = createRoom(manager);
    const afterLeave = manager.leaveRoom(created.room.roomCode, "socket-host");

    expect(afterLeave.room).toBeUndefined();
    expect(manager.getRoomCount()).toBe(0);
  });

  it("allows only the host to start and keeps the two-player minimum", () => {
    const manager = new RoomManager();
    const created = createRoom(manager);

    expect(() =>
      manager.startGame(
        {
          roomCode: created.room.roomCode,
        },
        "socket-host",
        startTime,
      ),
    ).toThrow(RoomError);

    joinGuest(manager, created.room.roomCode);

    expect(() =>
      manager.startGame(
        {
          roomCode: created.room.roomCode,
        },
        "socket-guest",
        startTime,
      ),
    ).toThrow(RoomError);

    expect(
      manager.startGame(
        {
          roomCode: created.room.roomCode,
        },
        "socket-host",
        startTime,
      ).message,
    ).toContain("1라운드");
  });

  it("allows only the host to update settings while waiting", () => {
    const manager = new RoomManager();
    const created = createRoom(manager);
    joinGuest(manager, created.room.roomCode);

    expect(() =>
      updateSettings(
        manager,
        created.room.roomCode,
        {
          drawerMode: "rotate",
          maxRounds: 3,
          roundDurationSeconds: 60,
        },
        "socket-guest",
      ),
    ).toThrow(RoomError);

    const updated = updateSettings(manager, created.room.roomCode, {
      drawerMode: "rotate",
      maxRounds: 3,
      roundDurationSeconds: 60,
    });

    expect(updated.settings).toEqual({
      drawerMode: "rotate",
      maxRounds: 3,
      roundDurationSeconds: 60,
    });

    manager.startGame(
      {
        roomCode: created.room.roomCode,
      },
      "socket-host",
      startTime,
    );

    expect(() =>
      updateSettings(manager, created.room.roomCode, {
        drawerMode: "host-only",
        maxRounds: 5,
        roundDurationSeconds: 45,
      }),
    ).toThrow(RoomError);
  });

  it("starts round one without exposing the answer in public round state", () => {
    const manager = new RoomManager();
    const created = createRoom(manager);
    joinGuest(manager, created.room.roomCode);

    const started = manager.startGame(
      {
        roomCode: created.room.roomCode,
      },
      "socket-host",
      startTime,
    );

    expect(started.room.status).toBe("playing");
    expect(started.roundState.round.roundNumber).toBe(1);
    expect(started.roundState.round.drawerPlayerId).toBe(created.currentPlayerId);
    expect(JSON.stringify(started.roundState)).not.toContain(started.word.word);
    expect(started.word.drawerPlayerId).toBe(created.currentPlayerId);
    expect(started.timer.remainingSeconds).toBe(45);
    expect(started.clear.roomCode).toBe(created.room.roomCode);
  });

  it("does not run AI guessing when a round starts", () => {
    const aiGuesser = new FixedAIGuesser({ confidence: 0.2, text: "정답아님" });
    const manager = new RoomManager(aiGuesser);
    const created = createRoom(manager);
    joinGuest(manager, created.room.roomCode);

    manager.startGame(
      {
        roomCode: created.room.roomCode,
      },
      "socket-host",
      startTime,
    );

    expect(aiGuesser.inputs).toHaveLength(0);
  });

  it("applies max round and timer settings to new games", () => {
    const manager = new RoomManager();
    const created = createRoom(manager);
    joinGuest(manager, created.room.roomCode);
    updateSettings(manager, created.room.roomCode, {
      drawerMode: "host-only",
      maxRounds: 4,
      roundDurationSeconds: 90,
    });

    const started = manager.startGame(
      {
        roomCode: created.room.roomCode,
      },
      "socket-host",
      startTime,
    );

    expect(started.roundState.round.totalRounds).toBe(4);
    expect(started.timer.remainingSeconds).toBe(90);
    expect(Date.parse(started.roundState.round.endsAt) - startTime.getTime()).toBe(90_000);
  });

  it("stores waiting-room host strokes in drawing history", () => {
    const manager = new RoomManager();
    const created = createRoom(manager);
    const stroke = createStroke(created.room.roomCode, created.currentPlayerId);

    const accepted = manager.submitStroke(stroke, "socket-host");
    const history = manager.getStrokeHistory(created.room.roomCode);

    expect(accepted).toEqual(stroke);
    expect(history.strokes).toEqual([stroke]);
  });

  it("allows only the current drawer to draw during a game", () => {
    const manager = new RoomManager();
    const created = createRoom(manager);
    const guest = joinGuest(manager, created.room.roomCode);
    const started = manager.startGame(
      {
        roomCode: created.room.roomCode,
      },
      "socket-host",
      startTime,
    );

    expect(() =>
      manager.submitStroke(
        createStroke(created.room.roomCode, guest.currentPlayerId),
        "socket-guest",
      ),
    ).toThrow(RoomError);

    expect(
      manager.submitStroke(
        createStroke(created.room.roomCode, started.roundState.round.drawerPlayerId),
        "socket-host",
      ).playerId,
    ).toBe(started.roundState.round.drawerPlayerId);
  });

  it("clears drawing history when the active drawer clears the canvas", () => {
    const manager = new RoomManager();
    const created = createRoom(manager);

    manager.submitStroke(
      createStroke(created.room.roomCode, created.currentPlayerId),
      "socket-host",
    );
    const clear = manager.clearCanvas(
      createClear(created.room.roomCode, created.currentPlayerId),
      "socket-host",
    );

    expect(clear.roomCode).toBe(created.room.roomCode);
    expect(manager.getStrokeHistory(created.room.roomCode).strokes).toHaveLength(0);
  });

  it("limits drawing history to the latest 500 stroke events", () => {
    const manager = new RoomManager();
    const created = createRoom(manager);

    for (let index = 0; index < 505; index += 1) {
      manager.submitStroke(
        createStroke(created.room.roomCode, created.currentPlayerId, `stroke-${index}`),
        "socket-host",
      );
    }

    const history = manager.getStrokeHistory(created.room.roomCode).strokes;

    expect(history).toHaveLength(500);
    expect(history[0]?.strokeId).toBe("stroke-5");
    expect(history[499]?.strokeId).toBe("stroke-504");
  });

  it("rejects drawer guesses and closes after every guesser submits", async () => {
    const manager = new RoomManager(new FixedAIGuesser({ confidence: 0.2, text: "정답아님" }));
    const created = createRoom(manager);
    const guest = joinGuest(manager, created.room.roomCode);
    const started = manager.startGame(
      {
        roomCode: created.room.roomCode,
      },
      "socket-host",
      startTime,
    );

    await expect(
      manager.submitGuess(
        createGuess(
          created.room.roomCode,
          started.roundState.round.roundId,
          created.currentPlayerId,
          started.word.word,
        ),
        "socket-host",
        startTime,
      ),
    ).rejects.toThrow(RoomError);

    const wrong = await manager.submitGuess(
      createGuess(
        created.room.roomCode,
        started.roundState.round.roundId,
        guest.currentPlayerId,
        wrongAnswerFor(started.word.word),
      ),
      "socket-guest",
      new Date(startTime.getTime() + 10_000),
    );

    expect(wrong.guess.isCorrect).toBe(false);
    expect(wrong.roundState.scores.every((score) => score.score === 0)).toBe(true);
    expect(wrong.roundState.round.status).toBe("ai-guessing");

    const completed = await completeAIGuessing(manager, created.room.roomCode);

    expect(completed.roundResult.reason).toBe("all-submitted");
    expect(completed.roundResult.teamResult.winner).toBe("DRAW");
    expect(completed.roundResult.teamResult.humanCorrectCount).toBe(0);
  });

  it("rejects duplicate human guesses before everyone has submitted", async () => {
    const manager = new RoomManager();
    const created = createRoom(manager);
    const firstGuest = joinGuest(manager, created.room.roomCode, "socket-guest-1");
    joinGuest(manager, created.room.roomCode, "socket-guest-2");
    const started = manager.startGame(
      {
        roomCode: created.room.roomCode,
      },
      "socket-host",
      startTime,
    );

    await manager.submitGuess(
      createGuess(
        created.room.roomCode,
        started.roundState.round.roundId,
        firstGuest.currentPlayerId,
        wrongAnswerFor(started.word.word),
      ),
      "socket-guest-1",
      new Date(startTime.getTime() + 5_000),
    );

    await expect(
      manager.submitGuess(
        createGuess(
          created.room.roomCode,
          started.roundState.round.roundId,
          firstGuest.currentPlayerId,
          started.word.word,
        ),
        "socket-guest-1",
        new Date(startTime.getTime() + 6_000),
      ),
    ).rejects.toMatchObject({
      code: "ALREADY_SUBMITTED",
    });
  });

  it("scores a correct human-majority round after AI guessing", async () => {
    const manager = new RoomManager(new FixedAIGuesser({ confidence: 0.35, text: "정답아님" }));
    const created = createRoom(manager);
    const guest = joinGuest(manager, created.room.roomCode);
    const started = manager.startGame(
      {
        roomCode: created.room.roomCode,
      },
      "socket-host",
      startTime,
    );

    const correct = await manager.submitGuess(
      createGuess(
        created.room.roomCode,
        started.roundState.round.roundId,
        guest.currentPlayerId,
        `${started.word.word.slice(0, 1)} ${started.word.word.slice(1)}`,
      ),
      "socket-guest",
      new Date(startTime.getTime() + 10_000),
    );

    const hostScore = correct.roundState.scores.find(
      (score) => score.playerId === created.currentPlayerId,
    );
    const guestScore = correct.roundState.scores.find(
      (score) => score.playerId === guest.currentPlayerId,
    );

    expect(correct.guess.isCorrect).toBe(true);
    expect(correct.guess.pointsAwarded).toBe(100);
    expect(hostScore?.score).toBe(0);
    expect(guestScore?.score).toBe(0);
    expect(correct.roundState.round.status).toBe("ai-guessing");

    const completed = await completeAIGuessing(manager, created.room.roomCode);

    expect(completed.roundResult.reason).toBe("all-correct");
    expect(completed.roundResult.correctWord).toBe(started.word.word);
    expect(completed.roundResult.teamResult).toMatchObject({
      aiCorrect: false,
      humanCorrectCount: 1,
      humanSubmittedCount: 1,
      humanTargetCount: 1,
      humanCorrectRate: 1,
      winner: "HUMAN WIN",
      roundTeamScores: {
        ai: 0,
        human: 100,
      },
      cumulativeTeamScores: {
        ai: 0,
        human: 100,
      },
    });
  });

  it("records a wrong AI guess once without exposing a correctWord field or changing scores", async () => {
    const aiGuesser = new FixedAIGuesser({ confidence: 0.35, text: "정답아님" });
    const manager = new RoomManager(aiGuesser);
    const created = createRoom(manager);
    joinGuest(manager, created.room.roomCode);
    const started = manager.startGame(
      {
        roomCode: created.room.roomCode,
      },
      "socket-host",
      startTime,
    );
    const tick = manager.tickRoom(
      created.room.roomCode,
      new Date(startTime.getTime() + 46_000),
    );

    const aiGuess = await manager.runAIGuess(
      created.room.roomCode,
      new Date(startTime.getTime() + 47_000),
    );
    const duplicate = await manager.runAIGuess(
      created.room.roomCode,
      new Date(startTime.getTime() + 48_000),
    );
    const aiScore = aiGuess?.roundState.scores.find((score) => score.source === "ai");

    expect(tick?.roundState?.round.status).toBe("ai-guessing");
    expect(aiGuesser.inputs).toHaveLength(1);
    expect(aiGuesser.inputs[0]?.finalImage.mimeType).toBe("image/png");
    expect(aiGuesser.inputs[0]?.normalizedFinalImage?.mimeType).toBe("image/png");
    expect(aiGuesser.inputs[0]?.finalImage.strokeCount).toBe(0);
    expect(aiGuesser.inputs[0]?.normalizedFinalImage?.strokeCount).toBe(0);
    expect(aiGuesser.inputs[0]?.strokeSequence).toHaveLength(0);
    expect(JSON.stringify(aiGuesser.inputs[0])).not.toContain(started.word.word);
    expect(aiGuesser.scoringContexts[0]?.correctWord).toBe(started.word.word);
    expect(aiGuesser.scoringContexts[0]?.candidateWords).toHaveLength(200);
    expect(aiGuess?.guess.source).toBe("ai");
    expect(aiGuess?.guess.nickname).toBe("AI Guesser");
    expect(aiGuess?.guess.isCorrect).toBe(false);
    expect(aiGuess?.guess.confidence).toBe(0.35);
    expect(Object.hasOwn(aiGuess?.guess ?? {}, "correctWord")).toBe(false);
    expect(aiScore?.score).toBe(0);
    expect(duplicate).toBeUndefined();
  });

  it("passes one-second stroke sequence frames to AI and discards strokes before clear", async () => {
    const aiGuesser = new FixedAIGuesser({ confidence: 0.35, text: "?뺣떟?꾨떂" });
    const manager = new RoomManager(aiGuesser);
    const created = createRoom(manager);
    joinGuest(manager, created.room.roomCode);
    manager.startGame(
      {
        roomCode: created.room.roomCode,
      },
      "socket-host",
      startTime,
    );

    manager.submitStroke(
      createStroke(created.room.roomCode, created.currentPlayerId, "before-clear"),
      "socket-host",
      new Date(startTime.getTime() + 500),
    );
    manager.clearCanvas(
      createClear(created.room.roomCode, created.currentPlayerId),
      "socket-host",
      new Date(startTime.getTime() + 1_000),
    );
    manager.submitStroke(
      createStroke(created.room.roomCode, created.currentPlayerId, "after-clear-1"),
      "socket-host",
      new Date(startTime.getTime() + 1_500),
    );
    manager.submitStroke(
      createStroke(created.room.roomCode, created.currentPlayerId, "after-clear-2"),
      "socket-host",
      new Date(startTime.getTime() + 2_400),
    );
    manager.tickRoom(created.room.roomCode, new Date(startTime.getTime() + 46_000));

    await completeAIGuessing(manager, created.room.roomCode);
    const aiInput = aiGuesser.inputs[0];

    expect(aiInput?.finalImage.strokeCount).toBe(2);
    expect(aiInput?.normalizedFinalImage?.strokeCount).toBe(2);
    expect(aiInput?.strokeSequence.map((frame) => frame.second)).toEqual([1, 2]);
    expect(aiInput?.strokeSequence.map((frame) => frame.strokeCount)).toEqual([1, 2]);
    expect(manager.getStrokeHistory(created.room.roomCode).strokes).toHaveLength(2);
  });

  it("uses only the top AI candidate as the official scored guess", async () => {
    const aiGuesser = new FixedAIGuesser({
      confidence: 0.7,
      text: "placeholder",
    });
    const manager = new RoomManager(aiGuesser);
    const created = createRoom(manager);
    joinGuest(manager, created.room.roomCode);
    const started = manager.startGame(
      {
        roomCode: created.room.roomCode,
      },
      "socket-host",
      startTime,
    );
    const wrongGuess = wrongAnswerFor(started.word.word);

    aiGuesser.setOutput({
      candidates: [
        {
          confidence: 0.7,
          text: wrongGuess,
        },
        {
          confidence: 0.2,
          text: started.word.word,
        },
      ],
      confidence: 0.7,
      text: wrongGuess,
    });
    manager.tickRoom(created.room.roomCode, new Date(startTime.getTime() + 46_000));

    const completed = await completeAIGuessing(manager, created.room.roomCode);
    const aiGuess = completed.aiGuess;

    expect(aiGuess?.text).toBe(wrongGuess);
    expect(aiGuess?.confidence).toBe(0.7);
    expect(aiGuess?.isCorrect).toBe(false);
  });

  it("falls back to a no-score AI guess and still creates a result when the provider fails", async () => {
    const manager = new RoomManager(new ThrowingAIGuesser());
    const created = createRoom(manager);
    joinGuest(manager, created.room.roomCode);
    manager.startGame(
      {
        roomCode: created.room.roomCode,
      },
      "socket-host",
      startTime,
    );
    const tick = manager.tickRoom(
      created.room.roomCode,
      new Date(startTime.getTime() + 46_000),
    );
    const completed = await completeAIGuessing(manager, created.room.roomCode);
    const aiScore = completed.roundResult.scores.find((score) => score.source === "ai");
    const aiGuess = completed.aiGuess;

    expect(tick?.roundState?.round.status).toBe("ai-guessing");
    expect(aiGuess?.text).toBe("모르겠음");
    expect(aiGuess?.isCorrect).toBe(false);
    expect(aiGuess?.pointsAwarded).toBe(0);
    expect(completed.roundState.round.status).toBe("result");
    expect(completed.roundResult.reason).toBe("time-up");
    expect(aiScore?.score).toBe(0);
  });

  it("awards AI team +100 when AI is correct after guesses close", async () => {
    const aiGuesser = new FixedAIGuesser({ confidence: 0.91, text: "" });
    const manager = new RoomManager(aiGuesser);
    const created = createRoom(manager);
    joinGuest(manager, created.room.roomCode);
    const started = manager.startGame(
      {
        roomCode: created.room.roomCode,
      },
      "socket-host",
      startTime,
    );
    aiGuesser.setOutput({ confidence: 0.91, text: started.word.word });

    manager.tickRoom(
      created.room.roomCode,
      new Date(startTime.getTime() + 46_000),
    );
    const completed = await completeAIGuessing(manager, created.room.roomCode);
    const drawerScore = completed.roundResult.scores.find(
      (score) => score.playerId === created.currentPlayerId,
    );
    const aiScore = completed.roundResult.scores.find((score) => score.source === "ai");

    expect(completed.aiGuess?.isCorrect).toBe(true);
    expect(completed.aiGuess?.pointsAwarded).toBe(100);
    expect(aiScore?.score).toBe(100);
    expect(drawerScore?.score).toBe(0);
    expect(completed.roundResult.reason).toBe("time-up");
    expect(completed.roundResult.teamResult).toMatchObject({
      aiCorrect: true,
      humanCorrectCount: 0,
      humanTargetCount: 1,
      winner: "AI WIN",
      roundTeamScores: {
        ai: 100,
        human: 0,
      },
      cumulativeTeamScores: {
        ai: 100,
        human: 0,
      },
    });
  });

  it("goes through AI guessing before a fast all-correct round result", async () => {
    const manager = new RoomManager(new FixedAIGuesser({ confidence: 0.4, text: "정답아님" }));
    const created = createRoom(manager);
    const guest = joinGuest(manager, created.room.roomCode);
    const started = manager.startGame(
      {
        roomCode: created.room.roomCode,
      },
      "socket-host",
      startTime,
    );

    const correct = await manager.submitGuess(
      createGuess(
        created.room.roomCode,
        started.roundState.round.roundId,
        guest.currentPlayerId,
        started.word.word,
      ),
      "socket-guest",
      new Date(startTime.getTime() + 3_000),
    );
    const completed = await completeAIGuessing(manager, created.room.roomCode);

    expect(correct.roundState.round.status).toBe("ai-guessing");
    expect(completed.aiGuess?.source).toBe("ai");
    expect(completed.roundResult.guesses.some((guess) => guess.source === "ai")).toBe(true);
    expect(completed.roundResult.reason).toBe("all-correct");
  });

  it("marks the round as DRAW when both AI and human teams score", async () => {
    const aiGuesser = new FixedAIGuesser({ confidence: 0.8, text: "" });
    const manager = new RoomManager(aiGuesser);
    const created = createRoom(manager);
    const firstGuest = joinGuest(manager, created.room.roomCode, "socket-guest-1");
    const secondGuest = joinGuest(manager, created.room.roomCode, "socket-guest-2");
    const started = manager.startGame(
      {
        roomCode: created.room.roomCode,
      },
      "socket-host",
      startTime,
    );
    aiGuesser.setOutput({ confidence: 0.8, text: started.word.word });

    await manager.submitGuess(
      createGuess(
        created.room.roomCode,
        started.roundState.round.roundId,
        firstGuest.currentPlayerId,
        started.word.word,
      ),
      "socket-guest-1",
      startTime,
    );
    const second = await manager.submitGuess(
      createGuess(
        created.room.roomCode,
        started.roundState.round.roundId,
        secondGuest.currentPlayerId,
        started.word.word,
      ),
      "socket-guest-2",
      startTime,
    );

    expect(second.roundState.round.status).toBe("ai-guessing");

    const completed = await completeAIGuessing(manager, created.room.roomCode);

    expect(completed.roundResult.teamResult).toMatchObject({
      aiCorrect: true,
      humanCorrectCount: 2,
      humanTargetCount: 2,
      winner: "DRAW",
      roundTeamScores: {
        ai: 100,
        human: 100,
      },
      cumulativeTeamScores: {
        ai: 100,
        human: 100,
      },
    });
  });

  it("moves timed-out active rounds into AI guessing before result", async () => {
    const manager = new RoomManager(new FixedAIGuesser({ confidence: 0.2, text: "정답아님" }));
    const created = createRoom(manager);
    joinGuest(manager, created.room.roomCode);
    manager.startGame(
      {
        roomCode: created.room.roomCode,
      },
      "socket-host",
      startTime,
    );

    const tick = manager.tickRoom(
      created.room.roomCode,
      new Date(startTime.getTime() + 46_000),
    );

    expect(tick?.timer?.remainingSeconds).toBe(0);
    expect(tick?.roundState?.round.status).toBe("ai-guessing");

    const completed = await completeAIGuessing(manager, created.room.roomCode);

    expect(completed.roundResult.reason).toBe("time-up");
    expect(completed.roundState.round.status).toBe("result");
  });

  it("keeps wrong or missing human guesses at zero points on time-up", async () => {
    const manager = new RoomManager(new FixedAIGuesser({ confidence: 0.2, text: "정답아님" }));
    const created = createRoom(manager);
    const wrongGuest = joinGuest(manager, created.room.roomCode, "socket-guest-1");
    const silentGuest = joinGuest(manager, created.room.roomCode, "socket-guest-2");
    const started = manager.startGame(
      {
        roomCode: created.room.roomCode,
      },
      "socket-host",
      startTime,
    );

    await manager.submitGuess(
      createGuess(
        created.room.roomCode,
        started.roundState.round.roundId,
        wrongGuest.currentPlayerId,
        wrongAnswerFor(started.word.word),
      ),
      "socket-guest-1",
      new Date(startTime.getTime() + 5_000),
    );
    manager.tickRoom(created.room.roomCode, new Date(startTime.getTime() + 46_000));

    const completed = await completeAIGuessing(manager, created.room.roomCode);
    const wrongScore = completed.roundResult.scores.find(
      (score) => score.playerId === wrongGuest.currentPlayerId,
    );
    const silentScore = completed.roundResult.scores.find(
      (score) => score.playerId === silentGuest.currentPlayerId,
    );

    expect(wrongScore?.score).toBe(0);
    expect(silentScore?.score).toBe(0);
    expect(completed.roundResult.guesses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          playerId: silentGuest.currentPlayerId,
          text: "미제출",
          isCorrect: false,
        }),
      ]),
    );
    expect(completed.roundResult.teamResult).toMatchObject({
      humanCorrectCount: 0,
      humanSubmittedCount: 2,
      humanTargetCount: 2,
      humanCorrectRate: 0,
    });
  });

  it("lets only the host advance rounds and rotates the drawer", async () => {
    const manager = new RoomManager(new FixedAIGuesser({ confidence: 0.2, text: "정답아님" }));
    const created = createRoom(manager);
    const guest = joinGuest(manager, created.room.roomCode);
    updateSettings(manager, created.room.roomCode, {
      drawerMode: "rotate",
      maxRounds: 2,
      roundDurationSeconds: 45,
    });
    const started = manager.startGame(
      {
        roomCode: created.room.roomCode,
      },
      "socket-host",
      startTime,
    );

    await manager.submitGuess(
      createGuess(
        created.room.roomCode,
        started.roundState.round.roundId,
        guest.currentPlayerId,
        started.word.word,
      ),
      "socket-guest",
      startTime,
    );

    expect(() =>
      manager.nextRound(
        {
          roomCode: created.room.roomCode,
        },
        "socket-guest",
        startTime,
      ),
    ).toThrow(RoomError);

    await completeAIGuessing(manager, created.room.roomCode);

    const next = manager.nextRound(
      {
        roomCode: created.room.roomCode,
      },
      "socket-host",
      new Date(startTime.getTime() + 11_000),
    );

    expect(next.kind).toBe("round");

    if (next.kind === "round") {
      expect(next.roundState.round.roundNumber).toBe(2);
      expect(next.roundState.round.drawerPlayerId).toBe(guest.currentPlayerId);
    }
  });

  it("keeps the host as drawer for every host-only round", async () => {
    const manager = new RoomManager(new FixedAIGuesser({ confidence: 0.2, text: "정답아님" }));
    const created = createRoom(manager);
    joinGuest(manager, created.room.roomCode, "socket-guest-1");
    joinGuest(manager, created.room.roomCode, "socket-guest-2");
    updateSettings(manager, created.room.roomCode, {
      drawerMode: "host-only",
      maxRounds: 3,
      roundDurationSeconds: 45,
    });

    const first = manager.startGame(
      {
        roomCode: created.room.roomCode,
      },
      "socket-host",
      startTime,
    );

    manager.skipRound(
      {
        roomCode: created.room.roomCode,
      },
      "socket-host",
      startTime,
    );
    await completeAIGuessing(manager, created.room.roomCode);
    const second = manager.nextRound(
      {
        roomCode: created.room.roomCode,
      },
      "socket-host",
      startTime,
    );

    if (second.kind !== "round") {
      throw new Error("Expected second round");
    }

    manager.skipRound(
      {
        roomCode: created.room.roomCode,
      },
      "socket-host",
      startTime,
    );
    await completeAIGuessing(manager, created.room.roomCode);
    const third = manager.nextRound(
      {
        roomCode: created.room.roomCode,
      },
      "socket-host",
      startTime,
    );

    if (third.kind !== "round") {
      throw new Error("Expected third round");
    }

    expect(first.roundState.round.drawerPlayerId).toBe(created.currentPlayerId);
    expect(second.roundState.round.drawerPlayerId).toBe(created.currentPlayerId);
    expect(third.roundState.round.drawerPlayerId).toBe(created.currentPlayerId);
  });

  it("uses shuffled round words without repeats inside one game", async () => {
    const manager = new RoomManager(new FixedAIGuesser({ confidence: 0.2, text: "정답아님" }));
    const created = createRoom(manager);
    joinGuest(manager, created.room.roomCode);
    updateSettings(manager, created.room.roomCode, {
      drawerMode: "host-only",
      maxRounds: 10,
      roundDurationSeconds: 45,
    });

    const seenWords: string[] = [];
    const first = manager.startGame(
      {
        roomCode: created.room.roomCode,
      },
      "socket-host",
      startTime,
    );
    seenWords.push(first.word.word);

    for (let index = 1; index < 10; index += 1) {
      manager.skipRound(
        {
          roomCode: created.room.roomCode,
        },
        "socket-host",
        startTime,
      );
      await completeAIGuessing(manager, created.room.roomCode);

      const next = manager.nextRound(
        {
          roomCode: created.room.roomCode,
        },
        "socket-host",
        startTime,
      );

      if (next.kind !== "round") {
        throw new Error("Expected another round.");
      }

      seenWords.push(next.word.word);
    }

    expect(new Set(seenWords).size).toBe(seenWords.length);
  });

  it("creates final game results after the last round result", async () => {
    const manager = new RoomManager(new FixedAIGuesser({ confidence: 0.2, text: "정답아님" }));
    const created = createRoom(manager);
    const guest = joinGuest(manager, created.room.roomCode);
    updateSettings(manager, created.room.roomCode, {
      drawerMode: "rotate",
      maxRounds: 2,
      roundDurationSeconds: 45,
    });
    const started = manager.startGame(
      {
        roomCode: created.room.roomCode,
      },
      "socket-host",
      startTime,
    );

    await manager.submitGuess(
      createGuess(
        created.room.roomCode,
        started.roundState.round.roundId,
        guest.currentPlayerId,
        started.word.word,
      ),
      "socket-guest",
      startTime,
    );
    await completeAIGuessing(manager, created.room.roomCode);

    const second = manager.nextRound(
      {
        roomCode: created.room.roomCode,
      },
      "socket-host",
      startTime,
    );

    if (second.kind !== "round") {
      throw new Error("Expected second round");
    }

    await manager.submitGuess(
      createGuess(
        created.room.roomCode,
        second.roundState.round.roundId,
        created.currentPlayerId,
        second.word.word,
      ),
      "socket-host",
      startTime,
    );
    await completeAIGuessing(manager, created.room.roomCode);

    const final = manager.nextRound(
      {
        roomCode: created.room.roomCode,
      },
      "socket-host",
      startTime,
    );

    expect(final.kind).toBe("game-result");

    if (final.kind === "game-result") {
      expect(final.room.status).toBe("ended");
      expect(final.gameResult.rounds).toHaveLength(2);
      expect(final.gameResult.results.some((result) => result.source === "ai")).toBe(true);
      expect(final.gameResult.results[0]?.score).toBeGreaterThan(0);
    }
  });

  it("ends a game when players drop below the two-player minimum", () => {
    const manager = new RoomManager();
    const created = createRoom(manager);
    joinGuest(manager, created.room.roomCode);
    manager.startGame(
      {
        roomCode: created.room.roomCode,
      },
      "socket-host",
      startTime,
    );

    const leave = manager.leaveRoom(created.room.roomCode, "socket-guest");

    expect(leave.roundResult?.reason).toBe("not-enough-players");
    expect(leave.gameResult?.results.some((result) => result.source === "ai")).toBe(true);
    expect(leave.room?.status).toBe("ended");
  });

  it("ends the current round if the drawer leaves while enough players remain", () => {
    const manager = new RoomManager();
    const created = createRoom(manager);
    joinGuest(manager, created.room.roomCode, "socket-guest-1");
    joinGuest(manager, created.room.roomCode, "socket-guest-2");
    manager.startGame(
      {
        roomCode: created.room.roomCode,
      },
      "socket-host",
      startTime,
    );

    const leave = manager.leaveRoom(created.room.roomCode, "socket-host");

    expect(leave.roundResult?.reason).toBe("drawer-left");
    expect(leave.roundState?.round.status).toBe("result");
    expect(leave.gameResult).toBeUndefined();
    expect(leave.room?.players).toHaveLength(2);
  });

  it("lets only the host skip an active drawing round through AI guessing", async () => {
    const manager = new RoomManager(new FixedAIGuesser({ confidence: 0.2, text: "정답아님" }));
    const created = createRoom(manager);
    const guest = joinGuest(manager, created.room.roomCode);
    const started = manager.startGame(
      {
        roomCode: created.room.roomCode,
      },
      "socket-host",
      startTime,
    );

    expect(() =>
      manager.skipRound(
        {
          roomCode: created.room.roomCode,
        },
        "socket-guest",
        startTime,
      ),
    ).toThrow(RoomError);

    const skipped = manager.skipRound(
      {
        roomCode: created.room.roomCode,
      },
      "socket-host",
      new Date(startTime.getTime() + 5_000),
    );

    expect(guest.currentPlayerId).toBeTruthy();
    expect(skipped.roundState.round.status).toBe("ai-guessing");
    expect(JSON.stringify(skipped.roundState)).not.toContain(started.word.word);

    const completed = await completeAIGuessing(manager, created.room.roomCode);

    expect(completed.roundResult.reason).toBe("operator-skip");
    expect(completed.roundState.round.status).toBe("result");
  });

  it("lets only the host synchronize result slides after a round result", async () => {
    const manager = new RoomManager(new FixedAIGuesser({ confidence: 0.2, text: "정답아님" }));
    const created = createRoom(manager);
    const guest = joinGuest(manager, created.room.roomCode);
    const started = manager.startGame(
      {
        roomCode: created.room.roomCode,
      },
      "socket-host",
      startTime,
    );

    expect(() =>
      manager.setResultSlide(
        {
          roomCode: created.room.roomCode,
          roundId: started.roundState.round.roundId,
          slide: "showdown",
        },
        "socket-host",
        startTime,
      ),
    ).toThrow(RoomError);

    await manager.submitGuess(
      createGuess(
        created.room.roomCode,
        started.roundState.round.roundId,
        guest.currentPlayerId,
        started.word.word,
      ),
      "socket-guest",
      startTime,
    );
    const completed = await completeAIGuessing(manager, created.room.roomCode);

    expect(() =>
      manager.setResultSlide(
        {
          roomCode: created.room.roomCode,
          roundId: completed.roundResult.roundId,
          slide: "showdown",
        },
        "socket-guest",
        startTime,
      ),
    ).toThrow(RoomError);

    const slide = manager.setResultSlide(
      {
        roomCode: created.room.roomCode,
        roundId: completed.roundResult.roundId,
        slide: "showdown",
      },
      "socket-host",
      startTime,
    );
    const snapshot = manager.getRoomSnapshot(
      created.room.roomCode,
      guest.currentPlayerId,
      startTime,
    );

    expect(slide).toEqual({
      roomCode: created.room.roomCode,
      roundId: completed.roundResult.roundId,
      slide: "showdown",
    });
    expect(snapshot.resultSlide).toEqual(slide);
  });

  it("lets only the host reset a room while keeping the room code", () => {
    const manager = new RoomManager();
    const created = createRoom(manager);
    joinGuest(manager, created.room.roomCode);
    updateSettings(manager, created.room.roomCode, {
      drawerMode: "rotate",
      maxRounds: 7,
      roundDurationSeconds: 60,
    });
    manager.startGame(
      {
        roomCode: created.room.roomCode,
      },
      "socket-host",
      startTime,
    );
    manager.submitStroke(createStroke(created.room.roomCode, created.currentPlayerId), "socket-host");

    expect(() =>
      manager.resetRoom(
        {
          roomCode: created.room.roomCode,
        },
        "socket-guest",
        startTime,
      ),
    ).toThrow(RoomError);

    const reset = manager.resetRoom(
      {
        roomCode: created.room.roomCode,
      },
      "socket-host",
      new Date(startTime.getTime() + 7_000),
    );

    expect(reset.room.roomCode).toBe(created.room.roomCode);
    expect(reset.room.settings).toEqual({
      drawerMode: "rotate",
      maxRounds: 7,
      roundDurationSeconds: 60,
    });
    expect(reset.room.status).toBe("waiting");
    expect(manager.getStrokeHistory(created.room.roomCode).strokes).toHaveLength(0);
    expect(() =>
      manager.nextRound(
        {
          roomCode: created.room.roomCode,
        },
        "socket-host",
        startTime,
      ),
    ).toThrow(RoomError);
  });

  it("ignores stale AI completion requests after the room has moved to another round", async () => {
    const manager = new RoomManager(new FixedAIGuesser({ confidence: 0.2, text: "정답아님" }));
    const created = createRoom(manager);
    const guest = joinGuest(manager, created.room.roomCode);
    const first = manager.startGame(
      {
        roomCode: created.room.roomCode,
      },
      "socket-host",
      startTime,
    );

    await manager.submitGuess(
      createGuess(
        created.room.roomCode,
        first.roundState.round.roundId,
        guest.currentPlayerId,
        wrongAnswerFor(first.word.word),
      ),
      "socket-guest",
      startTime,
    );

    manager.resetRoom(
      {
        roomCode: created.room.roomCode,
      },
      "socket-host",
      new Date(startTime.getTime() + 1_000),
    );

    const second = manager.startGame(
      {
        roomCode: created.room.roomCode,
      },
      "socket-host",
      new Date(startTime.getTime() + 2_000),
    );

    await manager.submitGuess(
      createGuess(
        created.room.roomCode,
        second.roundState.round.roundId,
        guest.currentPlayerId,
        wrongAnswerFor(second.word.word),
      ),
      "socket-guest",
      new Date(startTime.getTime() + 3_000),
    );

    const stale = await manager.completeAIGuessing(
      created.room.roomCode,
      new Date(startTime.getTime() + 8_000),
      first.roundState.round.roundId,
    );
    const snapshot = manager.getRoomSnapshot(
      created.room.roomCode,
      created.currentPlayerId,
      new Date(startTime.getTime() + 8_000),
    );

    expect(stale).toBeUndefined();
    expect(snapshot.roundState?.round.roundId).toBe(second.roundState.round.roundId);
    expect(snapshot.roundState?.round.status).toBe("ai-guessing");
  });

  it("marks disconnected players during grace and rejoins with the same player id", () => {
    const manager = new RoomManager();
    const created = createRoom(manager);
    joinGuest(manager, created.room.roomCode);
    const started = manager.startGame(
      {
        roomCode: created.room.roomCode,
      },
      "socket-host",
      startTime,
    );
    manager.submitStroke(createStroke(created.room.roomCode, created.currentPlayerId), "socket-host");

    const disconnected = manager.markDisconnected("socket-host", startTime);

    expect(disconnected?.room.players).toHaveLength(2);
    expect(
      disconnected?.room.players.find((player) => player.playerId === created.currentPlayerId)
        ?.connectionStatus,
    ).toBe("disconnected");

    const rejoined = manager.rejoinRoom(
      {
        roomCode: created.room.roomCode,
        playerId: created.currentPlayerId,
        reconnectToken: created.reconnectToken,
      },
      "socket-host-new",
      new Date(startTime.getTime() + 10_000),
    );

    expect(rejoined.currentPlayerId).toBe(created.currentPlayerId);
    expect(rejoined.room.players[0]?.connectionStatus).toBe("connected");
    expect(rejoined.snapshot.settings).toEqual(created.room.settings);
    expect(rejoined.snapshot.strokeHistory.strokes).toHaveLength(1);
    expect(rejoined.snapshot.roundState?.round.roundId).toBe(started.roundState.round.roundId);
    expect(rejoined.snapshot.word?.word).toBe(started.word.word);
    expect(JSON.stringify(rejoined.room)).not.toContain(started.word.word);
    expect(JSON.stringify(rejoined.snapshot.roundState)).not.toContain(started.word.word);
  });

  it("rejects invalid reconnect tokens and does not reveal the drawer word to guessers", () => {
    const manager = new RoomManager();
    const created = createRoom(manager);
    const guest = joinGuest(manager, created.room.roomCode);
    const started = manager.startGame(
      {
        roomCode: created.room.roomCode,
      },
      "socket-host",
      startTime,
    );

    manager.markDisconnected("socket-guest", startTime);

    expect(() =>
      manager.rejoinRoom(
        {
          roomCode: created.room.roomCode,
          playerId: guest.currentPlayerId,
          reconnectToken: "wrong-token-value",
        },
        "socket-guest-new",
        startTime,
      ),
    ).toThrow(RoomError);

    const rejoined = manager.rejoinRoom(
      {
        roomCode: created.room.roomCode,
        playerId: guest.currentPlayerId,
        reconnectToken: guest.reconnectToken,
      },
      "socket-guest-new",
      new Date(startTime.getTime() + 12_000),
    );

    expect(rejoined.snapshot.word).toBeUndefined();
    expect(JSON.stringify(rejoined.snapshot.roundState)).not.toContain(started.word.word);
  });

  it("restores an ai-guessing snapshot without revealing the drawer word", async () => {
    const manager = new RoomManager(new FixedAIGuesser({ confidence: 0.2, text: "정답아님" }));
    const created = createRoom(manager);
    const guest = joinGuest(manager, created.room.roomCode);
    const started = manager.startGame(
      {
        roomCode: created.room.roomCode,
      },
      "socket-host",
      startTime,
    );

    await manager.submitGuess(
      createGuess(
        created.room.roomCode,
        started.roundState.round.roundId,
        guest.currentPlayerId,
        started.word.word,
      ),
      "socket-guest",
      startTime,
    );
    manager.markDisconnected("socket-host", startTime);

    const rejoined = manager.rejoinRoom(
      {
        roomCode: created.room.roomCode,
        playerId: created.currentPlayerId,
        reconnectToken: created.reconnectToken,
      },
      "socket-host-new",
      new Date(startTime.getTime() + 2_000),
    );

    expect(rejoined.snapshot.roundState?.round.status).toBe("ai-guessing");
    expect(rejoined.snapshot.word).toBeUndefined();
    expect(JSON.stringify(rejoined.snapshot)).not.toContain(started.word.word);
  });

  it("applies the existing leave behavior when disconnect grace expires", () => {
    const manager = new RoomManager();
    const created = createRoom(manager);
    const firstGuest = joinGuest(manager, created.room.roomCode, "socket-guest-1");
    joinGuest(manager, created.room.roomCode, "socket-guest-2");
    manager.startGame(
      {
        roomCode: created.room.roomCode,
      },
      "socket-host",
      startTime,
    );

    manager.markDisconnected("socket-host", startTime);
    const expired = manager.expireDisconnectedPlayer(
      created.room.roomCode,
      created.currentPlayerId,
    );

    expect(expired?.room?.hostPlayerId).toBe(firstGuest.currentPlayerId);
    expect(expired?.roundResult?.reason).toBe("drawer-left");
    expect(expired?.room?.players).toHaveLength(2);

    const next = manager.nextRound(
      {
        roomCode: created.room.roomCode,
      },
      "socket-guest-1",
      startTime,
    );

    expect(next.kind).toBe("round");

    if (next.kind === "round") {
      expect(next.roundState.round.drawerPlayerId).toBe(firstGuest.currentPlayerId);
    }
  });
});
