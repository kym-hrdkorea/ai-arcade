import { describe, expect, it } from "vitest";

import {
  drawDuelAIBenchmarkFixtures,
  type DrawDuelBenchmarkCategory,
} from "./draw-duel-ai-benchmark-fixtures.js";
import { isBenchmarkGuessCorrect, isBenchmarkUnknown } from "./draw-duel-ai-benchmark.js";
import { drawDuelWordBank } from "./draw-duel-word-bank.js";
import { parseEnvFile } from "./env-file.js";

describe("Draw Duel AI benchmark", () => {
  it("defines exactly 30 fixtures backed by the server word bank", () => {
    const wordBankWords = new Set(drawDuelWordBank.map((entry) => entry.word));
    const categories = new Set<DrawDuelBenchmarkCategory>();

    expect(drawDuelAIBenchmarkFixtures).toHaveLength(30);

    for (const fixture of drawDuelAIBenchmarkFixtures) {
      categories.add(fixture.category);
      expect(wordBankWords.has(fixture.word)).toBe(true);
      expect(fixture.aliases.length).toBeGreaterThan(0);
      expect(fixture.strokes.length).toBeGreaterThan(0);
    }

    expect(categories).toEqual(
      new Set([
        "animal",
        "body-symbol",
        "food",
        "hobby",
        "household",
        "nature",
        "place",
        "vehicle",
      ]),
    );
  });

  it("scores aliases as correct answers and recognizes unknown guesses", () => {
    const fixture = drawDuelAIBenchmarkFixtures.find(
      (candidate) => candidate.word === "자동차",
    );

    if (!fixture) {
      throw new Error("Expected 자동차 fixture.");
    }

    expect(isBenchmarkGuessCorrect(" 차 ", fixture)).toBe(true);
    expect(isBenchmarkGuessCorrect("자 동 차", fixture)).toBe(true);
    expect(isBenchmarkGuessCorrect("비행기", fixture)).toBe(false);
    expect(isBenchmarkUnknown(" 모르겠음 ")).toBe(true);
  });

  it("parses root env files without requiring dotenv", () => {
    const parsed = parseEnvFile(`
      # local rehearsal
      DRAW_DUEL_AI_PROVIDER=openai
      OPENAI_API_KEY="sk-test"
      DRAW_DUEL_AI_MODEL='gpt-4.1'
      INVALID LINE
    `);

    expect(parsed).toEqual({
      DRAW_DUEL_AI_MODEL: "gpt-4.1",
      DRAW_DUEL_AI_PROVIDER: "openai",
      OPENAI_API_KEY: "sk-test",
    });
  });
});
