export type AIGuesserDifficulty = "easy" | "normal" | "hard";

export type DrawDuelImageSnapshot = {
  byteLength: number;
  data: string;
  height: number;
  mimeType: "image/png";
  strokeCount: number;
  width: number;
};

export type DrawDuelStrokeSequenceFrame = {
  image: DrawDuelImageSnapshot;
  offsetMs: number;
  second: number;
  strokeCount: number;
};

export type AIGuesserInput = {
  croppedNormalizedFinalImage?: DrawDuelImageSnapshot;
  finalImage: DrawDuelImageSnapshot;
  normalizedFinalImage?: DrawDuelImageSnapshot;
  roomCode: string;
  roundId: string;
  strokeSequence: DrawDuelStrokeSequenceFrame[];
};

export type AIGuesserScoringContext = {
  aliases: string[];
  candidateWords: string[];
  correctWord: string;
};

export type AIGuesserCandidate = {
  confidence?: number;
  text: string;
};

export type AIGuesserOutput = {
  candidates?: AIGuesserCandidate[];
  commentarySteps?: string[];
  confidence?: number;
  text: string;
};

export interface AIGuesser {
  guess(
    input: AIGuesserInput,
    scoringContext: AIGuesserScoringContext,
  ): Promise<AIGuesserOutput>;
}

type MockAIGuesserOptions = {
  difficulty?: AIGuesserDifficulty;
  random?: () => number;
};

const correctChanceByDifficulty: Record<AIGuesserDifficulty, number> = {
  easy: 0.2,
  normal: 0.4,
  hard: 0.65,
};

function normalizeAnswer(value: string): string {
  return value.replace(/\s+/g, "").trim().toLocaleLowerCase("ko-KR");
}

function confidenceBetween(random: () => number, min: number, max: number) {
  return Number((min + random() * (max - min)).toFixed(2));
}

export function normalizeAIGuesserText(value: string, fallback = "모르겠음"): string {
  const firstLine = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  const cleaned = (firstLine ?? "")
    .replace(/^(정답|답|추측|guess)\s*[:：]\s*/i, "")
    .replace(/^[`"'“”‘’([{<\s]+/, "")
    .replace(/[`"'“”‘’)\]}>.,!?;:，。！？；：\s]+$/, "")
    .trim()
    .slice(0, 40)
    .trim();

  return cleaned || fallback;
}

export class MockAIGuesser implements AIGuesser {
  private readonly difficulty: AIGuesserDifficulty;
  private readonly random: () => number;

  constructor(options: MockAIGuesserOptions = {}) {
    this.difficulty = options.difficulty ?? "normal";
    this.random = options.random ?? Math.random;
  }

  async guess(
    _input: AIGuesserInput,
    scoringContext: AIGuesserScoringContext,
  ): Promise<AIGuesserOutput> {
    const correctChance = correctChanceByDifficulty[this.difficulty];
    const shouldGuessCorrectly = this.random() < correctChance;

    if (shouldGuessCorrectly) {
      return {
        commentarySteps: [
          "큰 실루엣과 반복된 선을 먼저 보고 있어요.",
          "한 가지 사물로 좁혀지는 단서가 보여요.",
        ],
        confidence: confidenceBetween(this.random, 0.72, 0.94),
        text: scoringContext.correctWord,
      };
    }

    const acceptedAnswers = new Set(
      [scoringContext.correctWord, ...scoringContext.aliases].map((answer) =>
        normalizeAnswer(answer),
      ),
    );
    const wrongCandidates = scoringContext.candidateWords.filter(
      (candidate) => !acceptedAnswers.has(normalizeAnswer(candidate)),
    );
    const fallback =
      wrongCandidates[0] ??
      scoringContext.candidateWords[0] ??
      scoringContext.correctWord;
    const index = Math.floor(this.random() * wrongCandidates.length);

    return {
      commentarySteps: [
        "전체 형태가 아직 조금 애매해 보여요.",
        "가장 강하게 남는 선을 기준으로 추측해 볼게요.",
      ],
      confidence: confidenceBetween(this.random, 0.28, 0.62),
      text: wrongCandidates[index] ?? fallback,
    };
  }
}

export class FakeVisionAIGuesser implements AIGuesser {
  async guess(input: AIGuesserInput): Promise<AIGuesserOutput> {
    if (input.finalImage.strokeCount === 0) {
      return {
        commentarySteps: [
          "아직 그림 단서가 거의 없어요.",
          "확신이 낮아서 조심스럽게 보고 있어요.",
        ],
        confidence: 0.1,
        text: "모르겠음",
      };
    }

    return {
      commentarySteps: [
        "선이 모여 있는 중심 부분을 먼저 보고 있어요.",
        "아직 범주는 넓지만 사물처럼 보입니다.",
      ],
      confidence: 0.25,
      text: "그림",
    };
  }
}
