import { describe, expect, it } from "vitest";

import type {
  DrawDuelGameResultPayload,
  DrawDuelGuessLogPayload,
  DrawDuelRoundResultPayload,
  DrawDuelTeamScore,
} from "@ai-arcade/shared";

import {
  getFinalWinner,
  getHumanAnswerRankings,
} from "./draw-duel-final-result";

const players = [
  { nickname: "민수", playerId: "player-1" },
  { nickname: "지아", playerId: "player-2" },
  { nickname: "도윤", playerId: "player-3" },
];

function createGuess(
  player: { nickname: string; playerId: string },
  isCorrect: boolean,
): DrawDuelGuessLogPayload {
  return {
    roomCode: "ABC123",
    roundId: "round-1",
    guessId: `${player.playerId}-${isCorrect ? "correct" : "wrong"}-${Math.random()}`,
    playerId: player.playerId,
    nickname: player.nickname,
    source: "player",
    text: isCorrect ? "정답" : "오답",
    isCorrect,
    pointsAwarded: isCorrect ? 100 : 0,
    submittedAt: "2026-05-15T00:00:00.000Z",
  };
}

function createAIGuess(isCorrect: boolean): DrawDuelGuessLogPayload {
  return {
    roomCode: "ABC123",
    roundId: "round-1",
    guessId: `ai-${isCorrect ? "correct" : "wrong"}`,
    playerId: "ai:mock",
    nickname: "AI Guesser",
    source: "ai",
    text: isCorrect ? "정답" : "오답",
    isCorrect,
    pointsAwarded: isCorrect ? 100 : 0,
    submittedAt: "2026-05-15T00:00:00.000Z",
  };
}

function createRound(
  roundNumber: number,
  guesses: DrawDuelGuessLogPayload[],
  cumulativeTeamScores: DrawDuelTeamScore = { ai: 0, human: 0 },
): DrawDuelRoundResultPayload {
  return {
    roomCode: "ABC123",
    roundId: `00000000-0000-4000-8000-00000000000${roundNumber}`,
    roundNumber,
    totalRounds: 2,
    correctWord: "정답",
    reason: "all-submitted",
    guesses,
    scores: [],
    teamResult: {
      aiCorrect: false,
      humanCorrectCount: guesses.filter(
        (guess) => guess.source === "player" && guess.isCorrect,
      ).length,
      humanSubmittedCount: guesses.filter((guess) => guess.source === "player").length,
      humanTargetCount: players.length,
      humanCorrectRate: 0,
      winner: "DRAW",
      roundTeamScores: { ai: 0, human: 0 },
      cumulativeTeamScores,
    },
    endedAt: "2026-05-15T00:00:00.000Z",
  };
}

function createGameResult(
  rounds: DrawDuelRoundResultPayload[],
): DrawDuelGameResultPayload {
  return {
    roomCode: "ABC123",
    results: [
      ...players.map((player, index) => ({
        ...player,
        rank: index + 1,
        score: 0,
        source: "player" as const,
      })),
      {
        nickname: "AI Guesser",
        playerId: "ai:mock",
        rank: 1,
        score: 0,
        source: "ai" as const,
      },
    ],
    rounds,
    endedAt: "2026-05-15T00:00:00.000Z",
  };
}

describe("Draw Duel final result helpers", () => {
  it("counts correct human answers across rounds and excludes AI guesses", () => {
    const gameResult = createGameResult([
      createRound(1, [
        createGuess(players[0]!, true),
        createGuess(players[1]!, false),
        createAIGuess(true),
      ]),
      createRound(2, [
        createGuess(players[0]!, true),
        createGuess(players[1]!, true),
        createGuess(players[2]!, false),
      ]),
    ]);

    expect(getHumanAnswerRankings(gameResult)).toEqual([
      expect.objectContaining({ correctCount: 2, nickname: "민수", rank: 1 }),
      expect.objectContaining({ correctCount: 1, nickname: "지아", rank: 2 }),
      expect.objectContaining({ correctCount: 0, nickname: "도윤", rank: 3 }),
    ]);
  });

  it("gives tied players the same rank", () => {
    const gameResult = createGameResult([
      createRound(1, [
        createGuess(players[0]!, true),
        createGuess(players[1]!, true),
        createGuess(players[2]!, false),
      ]),
    ]);

    const rankings = getHumanAnswerRankings(gameResult);

    expect(rankings[0]).toMatchObject({ isTied: true, rank: 1 });
    expect(rankings[1]).toMatchObject({ isTied: true, rank: 1 });
    expect(rankings[2]).toMatchObject({ correctCount: 0, rank: 3 });
  });

  it("keeps every human player visible when nobody is correct", () => {
    const gameResult = createGameResult([
      createRound(1, players.map((player) => createGuess(player, false))),
    ]);

    expect(getHumanAnswerRankings(gameResult)).toHaveLength(3);
    expect(
      getHumanAnswerRankings(gameResult).every((entry) => entry.correctCount === 0),
    ).toBe(true);
  });

  it("uses cumulative team scores for the final winner", () => {
    expect(
      getFinalWinner(createGameResult([createRound(1, [], { ai: 100, human: 200 })])),
    ).toBe("HUMAN WIN");
    expect(
      getFinalWinner(createGameResult([createRound(1, [], { ai: 100, human: 100 })])),
    ).toBe("DRAW");
    expect(
      getFinalWinner(createGameResult([createRound(1, [], { ai: 200, human: 100 })])),
    ).toBe("AI WIN");
  });
});
