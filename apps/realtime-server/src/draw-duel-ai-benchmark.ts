import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type { AIGuesserScoringContext } from "./ai-guesser.js";
import { sanitizeOpenAIApiKey } from "./ai-guesser-factory.js";
import { postProcessAIGuesserOutput } from "./draw-duel-ai-postprocessor.js";
import {
  drawDuelAIBenchmarkFixtures,
  type DrawDuelAIBenchmarkFixture,
  type DrawDuelBenchmarkCategory,
  type DrawDuelBenchmarkScenario,
} from "./draw-duel-ai-benchmark-fixtures.js";
import {
  renderDrawDuelCroppedNormalizedSnapshot,
  renderDrawDuelNormalizedSnapshot,
  renderDrawDuelSnapshot,
  renderDrawDuelStrokeSequence,
  type DrawDuelRecordedStroke,
} from "./draw-duel-snapshot-renderer.js";
import { drawDuelWordBank, drawDuelWordCategoryFor } from "./draw-duel-word-bank.js";
import { loadRootEnvFile } from "./env-file.js";
import {
  OpenAIVisionAIGuesser,
  type OpenAIImageDetail,
  type OpenAIReasoningEffort,
} from "./openai-vision-ai-guesser.js";

type BenchmarkFailureKind = "error" | "timeout";

type BenchmarkSampleResult = {
  category: DrawDuelBenchmarkCategory;
  candidateCorrect: boolean;
  candidates: string[];
  countsTowardAccuracy: boolean;
  correct: boolean;
  failureKind?: BenchmarkFailureKind;
  failureMessage?: string;
  frameCount: number;
  genericWrong: boolean;
  guess?: string;
  id: string;
  latencyMs?: number;
  rawCandidates: string[];
  rawGuess?: string;
  scenario: DrawDuelBenchmarkScenario;
  unknown: boolean;
  word: string;
};

type CategorySummary = {
  correct: number;
  total: number;
};

const benchmarkRoundStartedAtMs = 0;
const defaultBenchmarkMinAccuracy = 0.9;
const maxBenchmarkTimeoutMs = 11_500;
const defaultScenarioThresholds = new Map<DrawDuelBenchmarkScenario, number>([
  ["clear-human", 0.9],
  ["messy-human", 0.75],
  ["sparse-human", 0.75],
  ["adversarial-label", 0.6],
  ["adversarial-distractor", 0.6],
  ["ambiguous-shape", 0.6],
]);
const genericWrongAnswers = new Set([
  "animal",
  "drawing",
  "food",
  "object",
  "place",
  "shape",
  "sketch",
  "thing",
  "vehicle",
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

function parseOptionalNumber(value: string | undefined): number | undefined {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function parseRatio(value: string | undefined, fallback: number): number {
  const parsed = Number.parseFloat(value ?? "");

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(1, Math.max(0, parsed));
}

function parseDetail(value: string | undefined): OpenAIImageDetail {
  return value === "auto" || value === "high" || value === "low" ? value : "auto";
}

function parseReasoningEffort(
  value: string | undefined,
): OpenAIReasoningEffort | undefined {
  return value === "low" || value === "medium" || value === "high"
    ? value
    : undefined;
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

function benchmarkFailureMessage(error: unknown): string | undefined {
  if (!(error instanceof Error)) {
    return "unknown error";
  }

  return error.message.replace(/\s+/g, " ").slice(0, 220);
}

function createBenchmarkRecordedStrokes(
  strokes: DrawDuelAIBenchmarkFixture["strokes"],
): DrawDuelRecordedStroke[] {
  return strokes.map((stroke, index) => ({
    receivedAtMs: (index + 1) * 1_000,
    stroke,
  }));
}

function createBenchmarkScoringContext(
  fixture: DrawDuelAIBenchmarkFixture,
): AIGuesserScoringContext {
  return {
    aliases: [...fixture.aliases],
    category: drawDuelWordCategoryFor(fixture.word),
    candidateWords: drawDuelWordBank.map((entry) => entry.word),
    correctWord: fixture.word,
  };
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
  const normalizedFinalImage = await renderDrawDuelNormalizedSnapshot(fixture.strokes);
  const croppedNormalizedFinalImage =
    await renderDrawDuelCroppedNormalizedSnapshot(fixture.strokes);
  const strokeSequence = await renderDrawDuelStrokeSequence(
    recordedStrokes,
    benchmarkRoundStartedAtMs,
  );
  const scoringContext = createBenchmarkScoringContext(fixture);
  const startedAt = Date.now();

  try {
    const rawOutput = await guesser.guess(
      {
        croppedNormalizedFinalImage,
        finalImage,
        normalizedFinalImage,
        roomCode: `B${String(index + 1).padStart(5, "0")}`,
        roundId: `benchmark-${String(index + 1).padStart(2, "0")}`,
        strokeSequence,
      },
      scoringContext,
    );
    const output = postProcessAIGuesserOutput(rawOutput, scoringContext);
    const latencyMs = Date.now() - startedAt;
    const correct = isBenchmarkGuessCorrect(output.text, fixture);
    const unknown = isBenchmarkUnknown(output.text);

    return {
      category: fixture.category,
      candidateCorrect: isBenchmarkCandidateCorrect(output, fixture),
      candidates: output.candidates?.map((candidate) => candidate.text) ?? [],
      countsTowardAccuracy: fixture.countsTowardAccuracy,
      correct,
      frameCount: strokeSequence.length,
      genericWrong: !correct && isGenericWrongAnswer(output.text),
      guess: output.text,
      id: fixture.id,
      latencyMs,
      rawCandidates: rawOutput.candidates?.map((candidate) => candidate.text) ?? [],
      rawGuess: rawOutput.text,
      scenario: fixture.scenario,
      unknown,
      word: fixture.word,
    };
  } catch (error: unknown) {
    return {
      category: fixture.category,
      candidateCorrect: false,
      candidates: [],
      countsTowardAccuracy: fixture.countsTowardAccuracy,
      correct: false,
      failureKind: classifyFailure(error),
      failureMessage: benchmarkFailureMessage(error),
      frameCount: strokeSequence.length,
      genericWrong: false,
      id: fixture.id,
      latencyMs: Date.now() - startedAt,
      rawCandidates: [],
      scenario: fixture.scenario,
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

function summarizeScenarios(results: BenchmarkSampleResult[]): Map<string, CategorySummary> {
  const summaries = new Map<string, CategorySummary>();

  for (const result of results) {
    if (!result.countsTowardAccuracy) {
      continue;
    }

    const current = summaries.get(result.scenario) ?? {
      correct: 0,
      total: 0,
    };
    current.total += 1;

    if (result.correct) {
      current.correct += 1;
    }

    summaries.set(result.scenario, current);
  }

  return summaries;
}

function scenarioThresholdFor(scenario: string): number | undefined {
  if (scenario.startsWith("adversarial-")) {
    return 0.6;
  }

  return defaultScenarioThresholds.get(scenario as DrawDuelBenchmarkScenario);
}

function ratio(part: number, total: number): number {
  return total === 0 ? 0 : part / total;
}

function printSummary(
  results: BenchmarkSampleResult[],
  options: {
    detail: OpenAIImageDetail;
    minAccuracy: number;
    model: string;
    reasoningEffort?: OpenAIReasoningEffort;
    retryLimit: number;
    timeoutMs: number;
  },
) {
  const total = results.length;
  const scoredResults = results.filter((result) => result.countsTowardAccuracy);
  const scoredTotal = scoredResults.length;
  const excludedTotal = total - scoredTotal;
  const correct = scoredResults.filter((result) => result.correct).length;
  const candidateCorrect = scoredResults.filter(
    (result) => result.candidateCorrect,
  ).length;
  const unknown = scoredResults.filter((result) => result.unknown).length;
  const timeout = scoredResults.filter((result) => result.failureKind === "timeout").length;
  const error = scoredResults.filter((result) => result.failureKind === "error").length;
  const wrong = scoredResults.filter(
    (result) => !result.correct && !result.failureKind,
  ).length;
  const genericWrong = scoredResults.filter((result) => result.genericWrong).length;
  const latencies = results
    .map((result) => result.latencyMs)
    .filter((latency): latency is number => typeof latency === "number");
  const categories = summarizeCategories(scoredResults);
  const scenarios = summarizeScenarios(results);
  const averageFrameCount =
    total === 0
      ? 0
      : results.reduce((sum, result) => sum + result.frameCount, 0) / total;

  console.log("Draw Duel OpenAI Vision benchmark");
  console.log(`Provider: openai`);
  console.log(`Model: ${options.model}`);
  console.log(`Detail: ${options.detail}`);
  console.log(`Reasoning effort: ${options.reasoningEffort ?? "default"}`);
  console.log(`Timeout: ${options.timeoutMs}ms`);
  console.log(`Samples: ${total}`);
  console.log(`Scored samples: ${scoredTotal}`);
  console.log(`Rule-violation samples excluded from accuracy: ${excludedTotal}`);
  console.log(`Average sequence frames: ${averageFrameCount.toFixed(1)}`);
  console.log(`Max attempts per sample: ${options.retryLimit + 1}`);
  console.log(`Top-1 accuracy: ${percentage(correct, scoredTotal)} (${correct}/${scoredTotal})`);
  console.log(
    `Candidate-list contains answer: ${percentage(candidateCorrect, scoredTotal)} (${candidateCorrect}/${scoredTotal})`,
  );
  console.log(`Unknown rate: ${percentage(unknown, scoredTotal)} (${unknown}/${scoredTotal})`);
  console.log(
    `Latency ms: p50=${percentile(latencies, 0.5)} p95=${percentile(latencies, 0.95)} max=${Math.max(0, ...latencies)}`,
  );
  console.log(`Timeout/errors: timeout=${timeout} error=${error}`);

  const failureMessages = new Map<string, number>();

  for (const result of scoredResults) {
    if (!result.failureMessage) {
      continue;
    }

    failureMessages.set(
      result.failureMessage,
      (failureMessages.get(result.failureMessage) ?? 0) + 1,
    );
  }

  if (failureMessages.size > 0) {
    console.log("Failure messages:");

    for (const [message, count] of failureMessages) {
      console.log(`- ${count}x ${message}`);
    }
  }

  console.log(
    `Generic wrong rate: ${percentage(genericWrong, wrong)} (${genericWrong}/${wrong})`,
  );
  console.log("Category accuracy:");

  for (const [category, summary] of categories) {
    console.log(
      `- ${category}: ${percentage(summary.correct, summary.total)} (${summary.correct}/${summary.total})`,
    );
  }

  console.log("Scenario accuracy:");

  for (const [scenario, summary] of scenarios) {
    const threshold = scenarioThresholdFor(scenario);
    const suffix = threshold ? ` target>=${percentage(threshold, 1)}` : "";
    console.log(
      `- ${scenario}: ${percentage(summary.correct, summary.total)} (${summary.correct}/${summary.total})${suffix}`,
    );
  }

  const misses = scoredResults.filter((result) => !result.correct);

  if (misses.length > 0) {
    console.log("Missed samples:");

    for (const result of misses) {
      const failureSuffix = result.failureKind
        ? ` failure=${result.failureKind} message="${result.failureMessage ?? ""}"`
        : "";
      const candidateSuffix =
        result.candidates.length > 0 ? ` candidates="${result.candidates.join("|")}"` : "";
      const rawSuffix =
        result.rawCandidates.length > 0
          ? ` raw="${result.rawCandidates.join("|")}"`
          : result.rawGuess
            ? ` raw="${result.rawGuess}"`
            : "";

      console.log(
        `- ${result.id} word="${result.word}" guess="${result.guess ?? ""}" scenario=${result.scenario} category=${result.category}${candidateSuffix}${rawSuffix}${failureSuffix}`,
      );
    }
  }

  const failures: string[] = [];
  const p95Latency = percentile(latencies, 0.95);
  const maxLatency = Math.max(0, ...latencies);
  const timeoutErrorRate = ratio(timeout + error, scoredTotal);
  const unknownRate = ratio(unknown, scoredTotal);

  if (ratio(correct, scoredTotal) < options.minAccuracy) {
    failures.push(
      `Top-1 accuracy ${percentage(correct, scoredTotal)} is below ${percentage(options.minAccuracy, 1)}.`,
    );
  }

  for (const [scenario, summary] of scenarios) {
    const threshold = scenarioThresholdFor(scenario);

    if (threshold !== undefined && ratio(summary.correct, summary.total) < threshold) {
      failures.push(
        `${scenario} accuracy ${percentage(summary.correct, summary.total)} is below ${percentage(threshold, 1)}.`,
      );
    }
  }

  if (p95Latency > 10_000) {
    failures.push(`p95 latency ${p95Latency}ms is above 10000ms.`);
  }

  if (maxLatency > maxBenchmarkTimeoutMs) {
    failures.push(`Max latency ${maxLatency}ms is above ${maxBenchmarkTimeoutMs}ms.`);
  }

  if (timeoutErrorRate > 0.05) {
    failures.push(
      `Timeout/error rate ${percentage(timeout + error, scoredTotal)} is above 5.0%.`,
    );
  }

  if (unknownRate > 0.1) {
    failures.push(`Unknown rate ${percentage(unknown, scoredTotal)} is above 10.0%.`);
  }

  if (timeout + error > scoredTotal * 0.05) {
    console.log("Recommendation: inspect provider health before increasing timeout.");
  }

  if (wrong > 0 && genericWrong / wrong > 0.2) {
    console.log(
      "Recommendation: keep the prompt preference for specific concrete nouns enabled.",
    );
  }

  if (failures.length > 0) {
    throw new Error(`Benchmark failed:\n${failures.join("\n")}`);
  }
}

export async function runDrawDuelAIBenchmark() {
  loadRootEnvFile();

  const provider = process.env.DRAW_DUEL_AI_PROVIDER?.trim().toLowerCase() ?? "mock";

  if (provider !== "openai") {
    console.log(
      "Draw Duel AI benchmark skipped: set DRAW_DUEL_AI_PROVIDER=openai in C:\\ai-arcade\\.env to run paid OpenAI calls. No API calls were made.",
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

  const model = process.env.DRAW_DUEL_AI_MODEL?.trim() || "gpt-5";
  const detail = parseDetail(process.env.DRAW_DUEL_AI_DETAIL);
  const reasoningEffort = parseReasoningEffort(
    process.env.DRAW_DUEL_AI_REASONING_EFFORT,
  );
  const timeoutMs = Math.min(
    maxBenchmarkTimeoutMs,
    Math.max(1_000, parseNumber(process.env.DRAW_DUEL_AI_TIMEOUT_MS, maxBenchmarkTimeoutMs)),
  );
  const retryLimit = Math.min(
    3,
    Math.max(0, parseNumber(process.env.DRAW_DUEL_AI_RETRY_LIMIT, 1)),
  );
  const minAccuracy = parseRatio(
    process.env.DRAW_DUEL_AI_BENCHMARK_MIN_ACCURACY,
    defaultBenchmarkMinAccuracy,
  );
  const guesser = new OpenAIVisionAIGuesser({
    apiKey,
    detail,
    logger: {
      info: () => undefined,
      warn: () => undefined,
    },
    model,
    reasoningEffort,
    retryLimit,
    timeoutMs,
  });
  const sampleLimit = parseOptionalNumber(process.env.DRAW_DUEL_AI_BENCHMARK_SAMPLE_LIMIT);
  const fixtures =
    typeof sampleLimit === "number" && sampleLimit > 0
      ? drawDuelAIBenchmarkFixtures.slice(0, sampleLimit)
      : drawDuelAIBenchmarkFixtures;
  const results: BenchmarkSampleResult[] = [];

  for (const [index, fixture] of fixtures.entries()) {
    results.push(await runSample(guesser, fixture, index));
  }

  printSummary(results, {
    detail,
    minAccuracy,
    model,
    reasoningEffort,
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
