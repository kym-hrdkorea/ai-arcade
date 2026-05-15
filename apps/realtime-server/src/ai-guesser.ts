export type AIGuesserDifficulty = "easy" | "normal" | "hard";

export type DrawDuelImageSnapshot = {
  byteLength: number;
  data: string;
  height: number;
  mimeType: "image/png";
  strokeCount: number;
  width: number;
};

export type AIGuesserInput = {
  image: DrawDuelImageSnapshot;
  roomCode: string;
  roundId: string;
};

export type AIGuesserScoringContext = {
  aliases: string[];
  candidateWords: string[];
  correctWord: string;
};

export type AIGuesserOutput = {
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
      confidence: confidenceBetween(this.random, 0.28, 0.62),
      text: wrongCandidates[index] ?? fallback,
    };
  }
}

export class FakeVisionAIGuesser implements AIGuesser {
  async guess(input: AIGuesserInput): Promise<AIGuesserOutput> {
    if (input.image.strokeCount === 0) {
      return {
        confidence: 0.1,
        text: "모르겠음",
      };
    }

    return {
      confidence: 0.25,
      text: "그림",
    };
  }
}
