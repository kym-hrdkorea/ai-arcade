import type {
  DrawDuelGameResultPayload,
  DrawDuelRoundWinner,
  DrawDuelTeamScore,
} from "@ai-arcade/shared";

export type HumanAnswerRanking = {
  averageResponseMs?: number;
  correctCount: number;
  isTied: boolean;
  nickname: string;
  playerId: string;
  rank: number;
  totalPoints: number;
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

type RankingAccumulator = {
  correctCount: number;
  correctResponseMsTotal: number;
  correctResponseMsCount: number;
  nickname: string;
  playerId: string;
  totalPoints: number;
};

export function getHumanAnswerRankings(
  gameResult: DrawDuelGameResultPayload,
): HumanAnswerRanking[] {
  const rankingMap = new Map<string, RankingAccumulator>();
  const emptyEntry = (playerId: string, nickname: string): RankingAccumulator => ({
    correctCount: 0,
    correctResponseMsTotal: 0,
    correctResponseMsCount: 0,
    nickname,
    playerId,
    totalPoints: 0,
  });

  for (const result of gameResult.results) {
    if (result.source === "player") {
      rankingMap.set(result.playerId, emptyEntry(result.playerId, result.nickname));
    }
  }

  for (const round of gameResult.rounds) {
    for (const guess of round.guesses) {
      if (guess.source !== "player") {
        continue;
      }

      const current =
        rankingMap.get(guess.playerId) ?? emptyEntry(guess.playerId, guess.nickname);
      const isCorrect = guess.isCorrect;
      const hasResponseTime = typeof guess.responseTimeMs === "number";

      rankingMap.set(guess.playerId, {
        ...current,
        correctCount: current.correctCount + (isCorrect ? 1 : 0),
        correctResponseMsTotal:
          current.correctResponseMsTotal +
          (isCorrect && hasResponseTime ? (guess.responseTimeMs ?? 0) : 0),
        correctResponseMsCount:
          current.correctResponseMsCount + (isCorrect && hasResponseTime ? 1 : 0),
        totalPoints: current.totalPoints + guess.pointsAwarded,
      });
    }
  }

  const sorted = [...rankingMap.values()].sort((first, second) => {
    if (second.totalPoints !== first.totalPoints) {
      return second.totalPoints - first.totalPoints;
    }

    if (second.correctCount !== first.correctCount) {
      return second.correctCount - first.correctCount;
    }

    return first.nickname.localeCompare(second.nickname, "ko-KR");
  });
  let previousPoints: number | undefined;
  let previousRank = 0;

  return sorted.map((entry, index) => {
    const samePointsPrevious = previousPoints === entry.totalPoints;
    const rank = samePointsPrevious ? previousRank : index + 1;
    const isTied = sorted.some(
      (candidate, candidateIndex) =>
        candidateIndex !== index && candidate.totalPoints === entry.totalPoints,
    );

    previousPoints = entry.totalPoints;
    previousRank = rank;

    return {
      averageResponseMs:
        entry.correctResponseMsCount > 0
          ? Math.round(entry.correctResponseMsTotal / entry.correctResponseMsCount)
          : undefined,
      correctCount: entry.correctCount,
      isTied,
      nickname: entry.nickname,
      playerId: entry.playerId,
      rank,
      totalPoints: entry.totalPoints,
    };
  });
}
