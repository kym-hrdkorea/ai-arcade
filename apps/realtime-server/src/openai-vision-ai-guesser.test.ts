import { describe, expect, it } from "vitest";

import type { AIGuesserInput, AIGuesserScoringContext } from "./ai-guesser.js";
import { OpenAIVisionAIGuesser } from "./openai-vision-ai-guesser.js";

const input: AIGuesserInput = {
  roomCode: "ABC123",
  roundId: "round-1",
  image: {
    byteLength: 16,
    data: "data:image/png;base64,iVBORw0KGgo=",
    height: 600,
    mimeType: "image/png",
    strokeCount: 3,
    width: 960,
  },
};

const scoringContext: AIGuesserScoringContext = {
  aliases: ["apple"],
  candidateWords: ["apple", "airplane", "pizza"],
  correctWord: "apple",
};
const quietLogger = {
  info: () => undefined,
  warn: () => undefined,
};

describe("OpenAIVisionAIGuesser", () => {
  it("sends only the image snapshot and never sends scoring answers", async () => {
    const requestBodies: string[] = [];
    const guesser = new OpenAIVisionAIGuesser({
      apiKey: "test-key",
      detail: "low",
      fetchImpl: async (_url, init) => {
        requestBodies.push(init.body);
        return new Response(
          JSON.stringify({
            output_text: "Guess: cat.",
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          },
        );
      },
      logger: quietLogger,
      model: "gpt-4.1",
    });

    const result = await guesser.guess(input, scoringContext);
    const body = requestBodies[0] ?? "";

    expect(body).toContain(input.image.data);
    expect(body).toContain('"detail":"low"');
    expect(body).toContain('"model":"gpt-4.1"');
    expect(body).toContain('"store":false');
    expect(body).not.toContain(scoringContext.correctWord);
    expect(body).not.toContain(scoringContext.aliases[0] ?? "");
    expect(body).not.toContain(scoringContext.candidateWords[1] ?? "");
    expect(result.text).toBe("cat");
  });

  it("normalizes output_text to a 40 character guess", async () => {
    const requestBodies: string[] = [];
    const guesser = new OpenAIVisionAIGuesser({
      apiKey: "test-key",
      fetchImpl: async (_url, init) => {
        requestBodies.push(init.body);
        return new Response(
          JSON.stringify({
            output_text: `Guess: ${"a".repeat(80)}`,
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          },
        );
      },
      logger: quietLogger,
    });

    const result = await guesser.guess(input, scoringContext);
    const body = requestBodies[0] ?? "";

    expect(body).toContain('"detail":"high"');
    expect(result.text).toHaveLength(40);
  });

  it("retries 5xx responses up to the configured retry limit", async () => {
    const statuses = [503, 200];
    const guesser = new OpenAIVisionAIGuesser({
      apiKey: "test-key",
      fetchImpl: async () => {
        const status = statuses.shift() ?? 500;

        return new Response(
          JSON.stringify({
            output_text: "고양이",
          }),
          {
            status,
            headers: {
              "Content-Type": "application/json",
            },
          },
        );
      },
      logger: quietLogger,
      retryLimit: 1,
    });

    const result = await guesser.guess(input, scoringContext);

    expect(result.text).toBe("고양이");
    expect(statuses).toHaveLength(0);
  });

  it("does not retry non-5xx OpenAI responses", async () => {
    let calls = 0;
    const guesser = new OpenAIVisionAIGuesser({
      apiKey: "test-key",
      fetchImpl: async () => {
        calls += 1;

        return new Response(
          JSON.stringify({
            error: "bad request",
          }),
          {
            status: 400,
            headers: {
              "Content-Type": "application/json",
            },
          },
        );
      },
      logger: quietLogger,
      retryLimit: 2,
    });

    await expect(guesser.guess(input, scoringContext)).rejects.toThrow(
      "OpenAI Responses API failed with status 400.",
    );
    expect(calls).toBe(1);
  });
});
