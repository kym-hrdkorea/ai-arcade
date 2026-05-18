import { describe, expect, it } from "vitest";

import {
  drawDuelAIBenchmarkFixtures,
  type DrawDuelBenchmarkCategory,
  type DrawDuelBenchmarkScenario,
} from "./draw-duel-ai-benchmark-fixtures.js";
import { isBenchmarkGuessCorrect, isBenchmarkUnknown } from "./draw-duel-ai-benchmark.js";
import { drawDuelWordBank } from "./draw-duel-word-bank.js";
import { parseEnvFile } from "./env-file.js";

describe("Draw Duel AI benchmark", () => {
  it("defines scored and rule-violation fixtures backed by the server word bank", () => {
    const wordBankWords = new Set(drawDuelWordBank.map((entry) => entry.word));
    const categories = new Set<DrawDuelBenchmarkCategory>();
    const scenarios = new Set<DrawDuelBenchmarkScenario>();

    expect(drawDuelAIBenchmarkFixtures.length).toBeGreaterThan(30);

    for (const fixture of drawDuelAIBenchmarkFixtures) {
      categories.add(fixture.category);
      scenarios.add(fixture.scenario);
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
    expect(scenarios).toEqual(
      new Set([
        "adversarial-distractor",
        "adversarial-label",
        "ambiguous-shape",
        "clear-human",
        "impossible-rule-violation",
        "messy-human",
        "sparse-human",
      ]),
    );
    expect(
      drawDuelAIBenchmarkFixtures.some(
        (fixture) =>
          fixture.scenario === "impossible-rule-violation" &&
          !fixture.countsTowardAccuracy,
      ),
    ).toBe(true);
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
      DRAW_DUEL_AI_MODEL='gpt-5'
      INVALID LINE
    `);

    expect(parsed).toEqual({
      DRAW_DUEL_AI_MODEL: "gpt-5",
      DRAW_DUEL_AI_PROVIDER: "openai",
      OPENAI_API_KEY: "sk-test",
    });
  });
});
