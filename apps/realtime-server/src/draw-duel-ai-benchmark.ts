import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type { AIGuesserScoringContext } from "./ai-guesser.js";
import { sanitizeOpenAIApiKey } from "./ai-guesser-factory.js";
import {
  drawDuelAIBenchmarkFixtures,
  type DrawDuelAIBenchmarkFixture,
  type DrawDuelBenchmarkCategory,
} from "./draw-duel-ai-benchmark-fixtures.js";
import {
  renderDrawDuelSnapshot,
  renderDrawDuelStrokeSequence,
  type DrawDuelRecordedStroke,
} from "./draw-duel-snapshot-renderer.js";
import { loadRootEnvFile } from "./env-file.js";
import {
  OpenAIVisionAIGuesser,
  type OpenAIImageDetail,
} from "./openai-vision-ai-guesser.js";

type BenchmarkFailureKind = "error" | "timeout";

type BenchmarkSampleResult = {
  category: DrawDuelBenchmarkCategory;
  candidateCorrect: boolean;
  correct: boolean;
  failureKind?: BenchmarkFailureKind;
  frameCount: number;
  genericWrong: boolean;
  latencyMs?: number;
  unknown: boolean;
  word: string;
};

type CategorySummary = {
  correct: number;
  total: number;
};

const benchmarkRoundStartedAtMs = 0;
const benchmarkSampleLimit = 30;
const emptyScoringContext: AIGuesserScoringContext = {
  aliases: [],
  candidateWords: [],
  correctWord: "",
};
const genericWrongAnswers = new Set([
  "과일",
  "동물",
  "탈것",
  "차량",
  "음식",
  "물건",
  "사물",
  "건물",
  "장소",
  "스포츠",
  "악기",
  "그림",
]);
const unknownAnswers = new Set(["모르겠음", "모름", "몰라", "unknown", "unsure"]);

function normalizeAnswer(value: string): string {
  return value.replace(/\s+/g, "").trim().toLocaleLowerCase("ko-KR");
}

export function isBenchmarkGuessCorrect(
  text: string,
  fixture: Pick<DrawDuelAIBenchmarkFixture, "aliases" | "word">,
): boolean {
  const normalizedGuess = normalizeAnswer(text);
  const acceptedAnswers = [fixture.word, ...fixture.aliases].map((answer) =>
    normalizeAnswer(answer),
  );

  return acceptedAnswers.includes(normalizedGuess);
}

export function isBenchmarkUnknown(text: string): boolean {
  return unknownAnswers.has(normalizeAnswer(text));
}

function isGenericWrongAnswer(text: string): boolean {
  return genericWrongAnswers.has(normalizeAnswer(text));
}

function parseNumber(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function parseDetail(value: string | undefined): OpenAIImageDetail {
  return value === "auto" || value === "high" || value === "low" ? value : "high";
}

function percentile(values: number[], ratio: number): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((first, second) => first - second);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1);

  return Math.round(sorted[Math.max(0, index)] ?? 0);
}

function percentage(part: number, total: number): string {
  if (total === 0) {
    return "0.0%";
  }

  return `${((part / total) * 100).toFixed(1)}%`;
}

function classifyFailure(error: unknown): BenchmarkFailureKind {
  if (error instanceof Error && /abort|timeout/i.test(`${error.name} ${error.message}`)) {
    return "timeout";
  }

  return "error";
}

function createBenchmarkRecordedStrokes(
  strokes: DrawDuelAIBenchmarkFixture["strokes"],
): DrawDuelRecordedStroke[] {
  return strokes.map((stroke, index) => ({
    receivedAtMs: (index + 1) * 1_000,
    stroke,
  }));
}

function isBenchmarkCandidateCorrect(
  output: { candidates?: { text: string }[] },
  fixture: DrawDuelAIBenchmarkFixture,
): boolean {
  return (
    output.candidates?.some((candidate) =>
      isBenchmarkGuessCorrect(candidate.text, fixture),
    ) ?? false
  );
}

async function runSample(
  guesser: OpenAIVisionAIGuesser,
  fixture: DrawDuelAIBenchmarkFixture,
  index: number,
): Promise<BenchmarkSampleResult> {
  const recordedStrokes = createBenchmarkRecordedStrokes(fixture.strokes);
  const finalImage = await renderDrawDuelSnapshot(fixture.strokes);
  const strokeSequence = await renderDrawDuelStrokeSequence(
    recordedStrokes,
    benchmarkRoundStartedAtMs,
  );
  const startedAt = Date.now();

  try {
    const output = await guesser.guess(
      {
        finalImage,
        roomCode: `B${String(index + 1).padStart(5, "0")}`,
        roundId: `benchmark-${String(index + 1).padStart(2, "0")}`,
        strokeSequence,
      },
      emptyScoringContext,
    );
    const latencyMs = Date.now() - startedAt;
    const correct = isBenchmarkGuessCorrect(output.text, fixture);
    const unknown = isBenchmarkUnknown(output.text);

    return {
      category: fixture.category,
      candidateCorrect: isBenchmarkCandidateCorrect(output, fixture),
      correct,
      frameCount: strokeSequence.length,
      genericWrong: !correct && isGenericWrongAnswer(output.text),
      latencyMs,
      unknown,
      word: fixture.word,
    };
  } catch (error: unknown) {
    return {
      category: fixture.category,
      candidateCorrect: false,
      correct: false,
      failureKind: classifyFailure(error),
      frameCount: strokeSequence.length,
      genericWrong: false,
      unknown: false,
      word: fixture.word,
    };
  }
}

function summarizeCategories(results: BenchmarkSampleResult[]): Map<string, CategorySummary> {
  const summaries = new Map<string, CategorySummary>();

  for (const result of results) {
    const current = summaries.get(result.category) ?? {
      correct: 0,
      total: 0,
    };
    current.total += 1;

    if (result.correct) {
      current.correct += 1;
    }

    summaries.set(result.category, current);
  }

  return summaries;
}

function printSummary(
  results: BenchmarkSampleResult[],
  options: {
    detail: OpenAIImageDetail;
    model: string;
    retryLimit: number;
    timeoutMs: number;
  },
) {
  const total = results.length;
  const correct = results.filter((result) => result.correct).length;
  const candidateCorrect = results.filter((result) => result.candidateCorrect).length;
  const unknown = results.filter((result) => result.unknown).length;
  const timeout = results.filter((result) => result.failureKind === "timeout").length;
  const error = results.filter((result) => result.failureKind === "error").length;
  const wrong = results.filter((result) => !result.correct && !result.failureKind).length;
  const genericWrong = results.filter((result) => result.genericWrong).length;
  const latencies = results
    .map((result) => result.latencyMs)
    .filter((latency): latency is number => typeof latency === "number");
  const categories = summarizeCategories(results);
  const averageFrameCount =
    total === 0
      ? 0
      : results.reduce((sum, result) => sum + result.frameCount, 0) / total;

  console.log("Draw Duel OpenAI Vision benchmark");
  console.log(`Provider: openai`);
  console.log(`Model: ${options.model}`);
  console.log(`Detail: ${options.detail}`);
  console.log(`Timeout: ${options.timeoutMs}ms`);
  console.log(`Samples: ${total}`);
  console.log(`Average sequence frames: ${averageFrameCount.toFixed(1)}`);
  console.log(`Max attempts per sample: ${options.retryLimit + 1}`);
  console.log(`Accuracy: ${percentage(correct, total)} (${correct}/${total})`);
  console.log(
    `Candidate-list contains answer: ${percentage(candidateCorrect, total)} (${candidateCorrect}/${total})`,
  );
  console.log(`Unknown rate: ${percentage(unknown, total)} (${unknown}/${total})`);
  console.log(
    `Latency ms: p50=${percentile(latencies, 0.5)} p95=${percentile(latencies, 0.95)} max=${Math.max(0, ...latencies)}`,
  );
  console.log(`Timeout/errors: timeout=${timeout} error=${error}`);
  console.log(
    `Generic wrong rate: ${percentage(genericWrong, wrong)} (${genericWrong}/${wrong})`,
  );
  console.log("Category accuracy:");

  for (const [category, summary] of categories) {
    console.log(
      `- ${category}: ${percentage(summary.correct, summary.total)} (${summary.correct}/${summary.total})`,
    );
  }

  if (timeout + error > total * 0.1) {
    console.log("Recommendation: consider DRAW_DUEL_AI_TIMEOUT_MS=12000.");
  }

  if (wrong > 0 && genericWrong / wrong > 0.2) {
    console.log(
      "Recommendation: keep the prompt preference for specific concrete nouns enabled.",
    );
  }
}

export async function runDrawDuelAIBenchmark() {
  loadRootEnvFile();

  const provider = process.env.DRAW_DUEL_AI_PROVIDER?.trim().toLowerCase() ?? "mock";

  if (provider !== "openai") {
    console.log(
      "Draw Duel AI benchmark skipped: set DRAW_DUEL_AI_PROVIDER=openai in C:\\ai-arcade\\.env to run 30 paid OpenAI calls. No API calls were made.",
    );
    return;
  }

  const apiKey = sanitizeOpenAIApiKey(process.env.OPENAI_API_KEY);

  if (!apiKey) {
    console.log(
      "Draw Duel AI benchmark skipped: OPENAI_API_KEY is missing in C:\\ai-arcade\\.env. No API calls were made.",
    );
    return;
  }

  const model = process.env.DRAW_DUEL_AI_MODEL?.trim() || "gpt-4.1";
  const detail = parseDetail(process.env.DRAW_DUEL_AI_DETAIL);
  const timeoutMs = parseNumber(process.env.DRAW_DUEL_AI_TIMEOUT_MS, 8_000);
  const retryLimit = Math.min(
    3,
    Math.max(0, parseNumber(process.env.DRAW_DUEL_AI_RETRY_LIMIT, 0)),
  );
  const guesser = new OpenAIVisionAIGuesser({
    apiKey,
    detail,
    logger: {
      info: () => undefined,
      warn: () => undefined,
    },
    model,
    retryLimit,
    timeoutMs,
  });
  const fixtures = drawDuelAIBenchmarkFixtures.slice(0, benchmarkSampleLimit);
  const results: BenchmarkSampleResult[] = [];

  for (const [index, fixture] of fixtures.entries()) {
    results.push(await runSample(guesser, fixture, index));
  }

  printSummary(results, {
    detail,
    model,
    retryLimit,
    timeoutMs,
  });
}

const entryPoint = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : undefined;

if (entryPoint === import.meta.url) {
  runDrawDuelAIBenchmark().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "unknown error";
    console.error(`Draw Duel AI benchmark failed: ${message}`);
    process.exitCode = 1;
  });
}
