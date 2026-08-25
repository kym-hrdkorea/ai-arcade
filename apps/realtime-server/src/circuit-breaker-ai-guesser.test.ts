import { describe, expect, it, vi } from "vitest";

import type {
  AIGuesser,
  AIGuesserInput,
  AIGuesserOutput,
  AIGuesserScoringContext,
} from "./ai-guesser.js";
import {
  CircuitBreakerAIGuesser,
  defaultCooldownMs,
  defaultFailureThreshold,
  normalizeCooldownMs,
  normalizeFailureThreshold,
} from "./circuit-breaker-ai-guesser.js";

const input: AIGuesserInput = {
  finalImage: {
    byteLength: 8,
    data: "data:image/png;base64,aGVsbG8=",
    height: 600,
    mimeType: "image/png",
    strokeCount: 3,
    width: 960,
  },
  roomCode: "ROOM01",
  roundId: "round-1",
  strokeSequence: [],
};

const scoringContext: AIGuesserScoringContext = {
  aliases: [],
  candidateWords: ["사과", "바나나"],
  correctWord: "사과",
};

class ScriptedGuesser implements AIGuesser {
  calls = 0;

  constructor(private readonly script: Array<"ok" | "fail">) {}

  async guess(): Promise<AIGuesserOutput> {
    const step = this.script[Math.min(this.calls, this.script.length - 1)];
    this.calls += 1;

    if (step === "fail") {
      throw new Error("provider down");
    }

    return { confidence: 0.9, text: "사과" };
  }
}

function createBreaker(
  script: Array<"ok" | "fail">,
  options: { cooldownMs?: number; failureThreshold?: number } = {},
) {
  let nowMs = 0;
  const delegate = new ScriptedGuesser(script);
  const breaker = new CircuitBreakerAIGuesser(delegate, {
    cooldownMs: options.cooldownMs ?? 60_000,
    failureThreshold: options.failureThreshold ?? 3,
    now: () => nowMs,
  });

  return {
    advance(ms: number) {
      nowMs += ms;
    },
    breaker,
    delegate,
    guess: () => breaker.guess(input, scoringContext),
  };
}

describe("CircuitBreakerAIGuesser", () => {
  it("delegates successful guesses and stays closed", async () => {
    const { delegate, guess } = createBreaker(["ok", "ok"]);

    await expect(guess()).resolves.toMatchObject({ text: "사과" });
    await expect(guess()).resolves.toMatchObject({ text: "사과" });
    expect(delegate.calls).toBe(2);
  });

  it("opens after consecutive failures and fails fast without calling the provider", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { delegate, guess } = createBreaker(["fail", "fail", "fail"]);

    await expect(guess()).rejects.toThrow("provider down");
    await expect(guess()).rejects.toThrow("provider down");
    await expect(guess()).rejects.toThrow("provider down");
    expect(delegate.calls).toBe(3);

    await expect(guess()).rejects.toThrow("circuit breaker open");
    expect(delegate.calls).toBe(3);
  });

  it("resets the consecutive failure count after a success", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { delegate, guess } = createBreaker(["fail", "fail", "ok", "fail", "fail", "ok"]);

    await expect(guess()).rejects.toThrow("provider down");
    await expect(guess()).rejects.toThrow("provider down");
    await expect(guess()).resolves.toMatchObject({ text: "사과" });
    await expect(guess()).rejects.toThrow("provider down");
    await expect(guess()).rejects.toThrow("provider down");
    await expect(guess()).resolves.toMatchObject({ text: "사과" });
    expect(delegate.calls).toBe(6);
  });

  it("probes once after the cooldown and closes on success", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
    const { advance, delegate, guess } = createBreaker(
      ["fail", "fail", "fail", "ok", "ok"],
      { cooldownMs: 60_000 },
    );

    for (let i = 0; i < 3; i += 1) {
      await expect(guess()).rejects.toThrow("provider down");
    }
    await expect(guess()).rejects.toThrow("circuit breaker open");

    advance(60_000);
    await expect(guess()).resolves.toMatchObject({ text: "사과" });
    await expect(guess()).resolves.toMatchObject({ text: "사과" });
    expect(delegate.calls).toBe(5);
  });

  it("re-opens with a fresh cooldown when the probe fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { advance, delegate, guess } = createBreaker(
      ["fail", "fail", "fail", "fail", "ok"],
      { cooldownMs: 60_000 },
    );

    for (let i = 0; i < 3; i += 1) {
      await expect(guess()).rejects.toThrow("provider down");
    }

    advance(60_000);
    await expect(guess()).rejects.toThrow("provider down");
    expect(delegate.calls).toBe(4);

    advance(59_999);
    await expect(guess()).rejects.toThrow("circuit breaker open");
    expect(delegate.calls).toBe(4);

    advance(1);
    await expect(guess()).resolves.toMatchObject({ text: "사과" });
    expect(delegate.calls).toBe(5);
  });

  it("rejects concurrent calls while a probe is in flight", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});

    let release: (() => void) | undefined;
    let calls = 0;
    const delegate: AIGuesser = {
      async guess() {
        calls += 1;

        if (calls <= 3) {
          throw new Error("provider down");
        }

        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return { text: "사과" };
      },
    };

    let nowMs = 0;
    const breaker = new CircuitBreakerAIGuesser(delegate, {
      cooldownMs: 60_000,
      failureThreshold: 3,
      now: () => nowMs,
    });

    for (let i = 0; i < 3; i += 1) {
      await expect(breaker.guess(input, scoringContext)).rejects.toThrow("provider down");
    }

    nowMs += 60_000;
    const probe = breaker.guess(input, scoringContext);
    await expect(breaker.guess(input, scoringContext)).rejects.toThrow(
      "circuit breaker probing",
    );

    release?.();
    await expect(probe).resolves.toMatchObject({ text: "사과" });
    expect(calls).toBe(4);
  });
});

describe("normalize options", () => {
  it("falls back to defaults for missing or invalid values", () => {
    expect(normalizeFailureThreshold(undefined)).toBe(defaultFailureThreshold);
    expect(normalizeFailureThreshold(Number.NaN)).toBe(defaultFailureThreshold);
    expect(normalizeCooldownMs(undefined)).toBe(defaultCooldownMs);
    expect(normalizeCooldownMs(Number.NaN)).toBe(defaultCooldownMs);
  });

  it("clamps values into safe ranges", () => {
    expect(normalizeFailureThreshold(0)).toBe(1);
    expect(normalizeFailureThreshold(999)).toBe(20);
    expect(normalizeCooldownMs(10)).toBe(1_000);
    expect(normalizeCooldownMs(9_999_999)).toBe(600_000);
  });
});
