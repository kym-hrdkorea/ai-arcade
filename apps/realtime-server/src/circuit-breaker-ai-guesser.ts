import type {
  AIGuesser,
  AIGuesserInput,
  AIGuesserOutput,
  AIGuesserScoringContext,
} from "./ai-guesser.js";

export const defaultFailureThreshold = 3;
export const defaultCooldownMs = 60_000;

const minFailureThreshold = 1;
const maxFailureThreshold = 20;
const minCooldownMs = 1_000;
const maxCooldownMs = 600_000;

export function normalizeFailureThreshold(value: number | undefined): number {
  if (value === undefined || Number.isNaN(value)) {
    return defaultFailureThreshold;
  }

  return Math.min(maxFailureThreshold, Math.max(minFailureThreshold, Math.round(value)));
}

export function normalizeCooldownMs(value: number | undefined): number {
  if (value === undefined || Number.isNaN(value)) {
    return defaultCooldownMs;
  }

  return Math.min(maxCooldownMs, Math.max(minCooldownMs, Math.round(value)));
}

type CircuitBreakerAIGuesserOptions = {
  cooldownMs?: number;
  failureThreshold?: number;
  now?: () => number;
};

export class CircuitBreakerAIGuesser implements AIGuesser {
  private readonly cooldownMs: number;
  private readonly failureThreshold: number;
  private readonly now: () => number;

  private consecutiveFailures = 0;
  private openedAtMs: number | null = null;
  private probeInFlight = false;

  constructor(
    private readonly delegate: AIGuesser,
    options: CircuitBreakerAIGuesserOptions = {},
  ) {
    this.cooldownMs = normalizeCooldownMs(options.cooldownMs);
    this.failureThreshold = normalizeFailureThreshold(options.failureThreshold);
    this.now = options.now ?? Date.now;
  }

  async guess(
    input: AIGuesserInput,
    scoringContext: AIGuesserScoringContext,
  ): Promise<AIGuesserOutput> {
    if (this.openedAtMs !== null) {
      const elapsedMs = this.now() - this.openedAtMs;

      if (elapsedMs < this.cooldownMs) {
        throw new Error(
          `circuit breaker open; skipping provider call for ${this.cooldownMs - elapsedMs}ms`,
        );
      }

      if (this.probeInFlight) {
        throw new Error("circuit breaker probing provider; skipping concurrent call");
      }

      return this.probe(input, scoringContext);
    }

    try {
      const output = await this.delegate.guess(input, scoringContext);
      this.consecutiveFailures = 0;
      return output;
    } catch (error: unknown) {
      this.consecutiveFailures += 1;

      if (this.consecutiveFailures >= this.failureThreshold) {
        this.openedAtMs = this.now();
        console.warn(
          `[ai] circuit breaker opened after ${this.consecutiveFailures} consecutive failures; skipping provider calls for ${this.cooldownMs}ms`,
        );
      }

      throw error;
    }
  }

  private async probe(
    input: AIGuesserInput,
    scoringContext: AIGuesserScoringContext,
  ): Promise<AIGuesserOutput> {
    this.probeInFlight = true;

    try {
      const output = await this.delegate.guess(input, scoringContext);
      this.consecutiveFailures = 0;
      this.openedAtMs = null;
      console.info("[ai] circuit breaker closed after successful probe");
      return output;
    } catch (error: unknown) {
      this.openedAtMs = this.now();
      console.warn(
        `[ai] circuit breaker probe failed; staying open for another ${this.cooldownMs}ms`,
      );
      throw error;
    } finally {
      this.probeInFlight = false;
    }
  }
}
