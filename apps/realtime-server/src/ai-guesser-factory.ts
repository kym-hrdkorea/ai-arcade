import { FakeVisionAIGuesser, MockAIGuesser, type AIGuesser } from "./ai-guesser.js";
import { CircuitBreakerAIGuesser } from "./circuit-breaker-ai-guesser.js";
import {
  OpenAIVisionAIGuesser,
  type OpenAIImageDetail,
  type OpenAIReasoningEffort,
} from "./openai-vision-ai-guesser.js";

export type AIGuesserProvider = "fake-vision" | "mock" | "openai";

function parseTimeoutMs(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function parseRetryLimit(value: string | undefined): number | undefined {
  if (!value) {
    return 1;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function parseBreakerInt(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

export function parseDetail(value: string | undefined): OpenAIImageDetail | undefined {
  const normalized = value?.trim().toLowerCase();

  if (normalized === "auto" || normalized === "high" || normalized === "low") {
    return normalized;
  }

  return undefined;
}

export function parseReasoningEffort(
  value: string | undefined,
): OpenAIReasoningEffort | undefined {
  const normalized = value?.trim().toLowerCase();

  if (normalized === "low" || normalized === "medium" || normalized === "high") {
    return normalized;
  }

  return undefined;
}

export function sanitizeOpenAIApiKey(value: string | undefined): string | undefined {
  const trimmed = value?.trim();

  if (!trimmed) {
    return undefined;
  }

  const unquoted =
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
      ? trimmed.slice(1, -1).trim()
      : trimmed;

  return /^[\x21-\x7e]+$/.test(unquoted) ? unquoted : undefined;
}

export function createAIGuesser(provider = process.env.DRAW_DUEL_AI_PROVIDER ?? "mock"): AIGuesser {
  const normalizedProvider = provider.trim().toLowerCase();

  if (normalizedProvider === "mock") {
    return new MockAIGuesser();
  }

  if (normalizedProvider === "fake-vision") {
    return new FakeVisionAIGuesser();
  }

  if (normalizedProvider === "openai") {
    const apiKey = sanitizeOpenAIApiKey(process.env.OPENAI_API_KEY);

    if (!apiKey) {
      console.warn(
        "[ai] OPENAI_API_KEY is missing or invalid. Paste the raw sk-... value only; falling back to mock.",
      );
      return new MockAIGuesser();
    }

    return new CircuitBreakerAIGuesser(
      new OpenAIVisionAIGuesser({
        apiKey,
        detail: parseDetail(process.env.DRAW_DUEL_AI_DETAIL),
        model: process.env.DRAW_DUEL_AI_MODEL,
        reasoningEffort: parseReasoningEffort(process.env.DRAW_DUEL_AI_REASONING_EFFORT),
        retryLimit: parseRetryLimit(process.env.DRAW_DUEL_AI_RETRY_LIMIT),
        timeoutMs: parseTimeoutMs(process.env.DRAW_DUEL_AI_TIMEOUT_MS),
      }),
      {
        cooldownMs: parseBreakerInt(process.env.DRAW_DUEL_AI_BREAKER_COOLDOWN_MS),
        failureThreshold: parseBreakerInt(process.env.DRAW_DUEL_AI_BREAKER_THRESHOLD),
      },
    );
  }

  console.warn(`[ai] Unknown AI guesser provider "${provider}", falling back to mock.`);
  return new MockAIGuesser();
}
