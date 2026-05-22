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

  it("uses a correct accepted answer from the candidate list for scoring", () => {
    const context = scoringContextFor("apple");
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

    expect(result.text).toBe(context.correctWord);
    expect(result.confidence).toBe(0.62);
  });

  it("keeps official guesses constrained to the draw-duel word bank", () => {
    const context = scoringContextFor("apple");
    const result = postProcessAIGuesserOutput(
      {
        candidates: [
          {
            confidence: 0.74,
            text: "lollipop",
          },
          {
            confidence: 0.55,
            text: "random mascot",
          },
        ],
        text: "lollipop",
      },
      context,
    );

    expect(result.text).toBe(wordByAlias("candy"));
    expect(result.candidates?.map((candidate) => candidate.text)).toEqual([
      wordByAlias("candy"),
    ]);
  });

  it("falls back to unknown when no candidate can be mapped to the word bank", () => {
    const context = scoringContextFor("apple");
    const result = postProcessAIGuesserOutput(
      {
        candidates: [
          {
            confidence: 0.74,
            text: "mythical mascot",
          },
        ],
        text: "mythical mascot",
      },
      context,
    );

    expect(result.text).toBe("모르겠음");
    expect(result.candidates?.[0]?.text).toBe("모르겠음");
  });

  it("maps descriptive phrases that contain a known word back to that word", () => {
    const context = scoringContextFor("school");
    const result = postProcessAIGuesserOutput(
      {
        confidence: 0.7,
        text: "school building",
      },
      context,
    );

    expect(result.text).toBe(context.correctWord);
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
