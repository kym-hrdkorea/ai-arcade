import type {
  DrawDuelGameResultPayload,
  DrawDuelRoundWinner,
  DrawDuelTeamScore,
} from "@ai-arcade/shared";

export type HumanAnswerRanking = {
  correctCount: number;
  isTied: boolean;
  nickname: string;
  playerId: string;
  rank: number;
};

export function getFinalTeamScores(
  gameResult: DrawDuelGameResultPayload,
): DrawDuelTeamScore {
  const lastRound = gameResult.rounds[gameResult.rounds.length - 1];

  return (
    lastRound?.teamResult.cumulativeTeamScores ?? {
      ai: 0,
      human: 0,
    }
  );
}

export function getFinalWinner(
  gameResult: DrawDuelGameResultPayload,
): DrawDuelRoundWinner {
  const teamScores = getFinalTeamScores(gameResult);

  if (teamScores.ai === teamScores.human) {
    return "DRAW";
  }

  return teamScores.ai > teamScores.human ? "AI WIN" : "HUMAN WIN";
}

export function getHumanAnswerRankings(
  gameResult: DrawDuelGameResultPayload,
): HumanAnswerRanking[] {
  const rankingMap = new Map<string, Omit<HumanAnswerRanking, "isTied" | "rank">>();

  for (const result of gameResult.results) {
    if (result.source === "player") {
      rankingMap.set(result.playerId, {
        correctCount: 0,
        nickname: result.nickname,
        playerId: result.playerId,
      });
    }
  }

  for (const round of gameResult.rounds) {
    for (const guess of round.guesses) {
      if (guess.source !== "player") {
        continue;
      }

      const current = rankingMap.get(guess.playerId) ?? {
        correctCount: 0,
        nickname: guess.nickname,
        playerId: guess.playerId,
      };

      rankingMap.set(guess.playerId, {
        ...current,
        correctCount: current.correctCount + (guess.isCorrect ? 1 : 0),
      });
    }
  }

  const sorted = [...rankingMap.values()].sort((first, second) => {
    if (second.correctCount !== first.correctCount) {
      return second.correctCount - first.correctCount;
    }

    return first.nickname.localeCompare(second.nickname, "ko-KR");
  });
  let previousCorrectCount: number | undefined;
  let previousRank = 0;

  return sorted.map((entry, index) => {
    const sameScorePrevious = previousCorrectCount === entry.correctCount;
    const rank = sameScorePrevious ? previousRank : index + 1;
    const isTied = sorted.some(
      (candidate, candidateIndex) =>
        candidateIndex !== index && candidate.correctCount === entry.correctCount,
    );

    previousCorrectCount = entry.correctCount;
    previousRank = rank;

    return {
      ...entry,
      isTied,
      rank,
    };
  });
}
