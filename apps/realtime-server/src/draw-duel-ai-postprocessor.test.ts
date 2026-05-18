import { describe, expect, it } from "vitest";

import type { AIGuesserScoringContext } from "./ai-guesser.js";
import {
  postProcessAIGuesserOutput,
  sanitizeAICommentarySteps,
} from "./draw-duel-ai-postprocessor.js";
import { drawDuelWordBank } from "./draw-duel-word-bank.js";

function wordByAlias(alias: string): string {
  const entry = drawDuelWordBank.find((candidate) =>
    candidate.aliases.some((candidateAlias) => candidateAlias === alias),
  );

  if (!entry) {
    throw new Error(`Expected word-bank alias: ${alias}`);
  }

  return entry.word;
}

function scoringContextFor(alias: string): AIGuesserScoringContext {
  const correctWord = wordByAlias(alias);
  const entry = drawDuelWordBank.find((candidate) => candidate.word === correctWord);

  if (!entry) {
    throw new Error(`Expected word-bank entry: ${alias}`);
  }

  return {
    aliases: [...entry.aliases],
    candidateWords: drawDuelWordBank.map((candidate) => candidate.word),
    correctWord,
  };
}

describe("postProcessAIGuesserOutput", () => {
  it("canonicalizes accepted aliases without changing the scoring payload contract", () => {
    const context = scoringContextFor("car");
    const result = postProcessAIGuesserOutput(
      {
        candidates: [
          {
            confidence: 0.86,
            text: " automobile ",
          },
        ],
        text: " automobile ",
      },
      context,
    );

    expect(result.text).toBe(context.correctWord);
    expect(result.confidence).toBe(0.86);
    expect(result.candidates?.[0]?.text).toBe(context.correctWord);
  });

  it("suppresses broad or unknown top guesses when a specific candidate follows", () => {
    const context = scoringContextFor("cat");
    const result = postProcessAIGuesserOutput(
      {
        candidates: [
          {
            confidence: 0.72,
            text: "animal",
          },
          {
            confidence: 0.58,
            text: "kitty",
          },
        ],
        text: "animal",
      },
      context,
    );

    expect(result.text).toBe(context.correctWord);
    expect(result.confidence).toBe(0.58);
    expect(result.candidates?.map((candidate) => candidate.text)).toContain(
      context.correctWord,
    );
  });

  it("accepts common Korean particles on a candidate noun", () => {
    const context = scoringContextFor("apple");
    const result = postProcessAIGuesserOutput(
      {
        confidence: 0.77,
        text: `${context.correctWord}를`,
      },
      context,
    );

    expect(result.text).toBe(context.correctWord);
  });

  it("does not turn a wrong specific object into the correct answer", () => {
    const context = scoringContextFor("apple");
    const wrongWord = wordByAlias("pizza");
    const result = postProcessAIGuesserOutput(
      {
        candidates: [
          {
            confidence: 0.81,
            text: "pizza",
          },
          {
            confidence: 0.62,
            text: "apple",
          },
        ],
        text: "pizza",
      },
      context,
    );

    expect(result.text).toBe(wrongWord);
    expect(result.text).not.toBe(context.correctWord);
  });

  it("removes empty, too-long, and answer-revealing commentary steps", () => {
    const result = sanitizeAICommentarySteps(
      [
        "",
        "사과",
        "사과처럼 보여요",
        "가".repeat(91),
        "둥근 몸통과 짧은 선이 보여요.",
        "먹을 것처럼 보이기도 합니다.",
      ],
      ["사과"],
    );

    expect(result).toEqual([
      "둥근 몸통과 짧은 선이 보여요.",
      "먹을 것처럼 보이기도 합니다.",
    ]);
  });
});
