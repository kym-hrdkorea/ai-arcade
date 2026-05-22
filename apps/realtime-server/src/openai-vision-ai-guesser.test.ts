import { describe, expect, it, vi } from "vitest";

import type { AIGuesserInput, AIGuesserScoringContext } from "./ai-guesser.js";
import { OpenAIVisionAIGuesser } from "./openai-vision-ai-guesser.js";

const finalImage = {
  byteLength: 16,
  data: "data:image/png;base64,final",
  height: 600,
  mimeType: "image/png" as const,
  strokeCount: 3,
  width: 960,
};
const normalizedFinalImage = {
  ...finalImage,
  data: "data:image/png;base64,normalized-final",
};
const croppedNormalizedFinalImage = {
  ...finalImage,
  data: "data:image/png;base64,cropped-normalized-final",
};
const input: AIGuesserInput = {
  croppedNormalizedFinalImage,
  finalImage,
  normalizedFinalImage,
  roomCode: "ABC123",
  roundId: "round-1",
  strokeSequence: [
    {
      image: {
        ...finalImage,
        data: "data:image/png;base64,seq1",
        strokeCount: 1,
      },
      offsetMs: 1_000,
      second: 1,
      strokeCount: 1,
    },
    {
      image: {
        ...finalImage,
        data: "data:image/png;base64,seq2",
        strokeCount: 2,
      },
      offsetMs: 2_000,
      second: 2,
      strokeCount: 2,
    },
  ],
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

type ParsedBody = {
  input?: {
    content?: unknown[];
  }[];
  reasoning?: {
    effort?: string;
  };
  text?: {
    format?: {
      name?: string;
      schema?: {
        properties?: Record<string, unknown>;
        required?: string[];
      };
      type?: string;
    };
  };
};

type ImagePart = {
  detail: string;
  image_url: string;
  type: "input_image";
};

function parseBody(body: string): ParsedBody {
  return JSON.parse(body) as ParsedBody;
}

function isImagePart(value: unknown): value is ImagePart {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    "image_url" in value &&
    "detail" in value &&
    value.type === "input_image"
  );
}

function candidateResponse(text: string, confidence = 0.8) {
  return JSON.stringify({
    output_text: JSON.stringify({
      candidates: [
        {
          confidence,
          text,
        },
        {
          confidence: 0.25,
          text: "dog",
        },
      ],
    }),
  });
}

describe("OpenAIVisionAIGuesser", () => {
  it("sends stroke sequence, normalized, and cropped images without scoring answers", async () => {
    const requestBodies: string[] = [];
    const guesser = new OpenAIVisionAIGuesser({
      apiKey: "test-key",
      detail: "low",
      fetchImpl: async (_url, init) => {
        requestBodies.push(init.body);
        return new Response(candidateResponse("cat", 0.82), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        });
      },
      logger: quietLogger,
      model: "gpt-5",
      reasoningEffort: "high",
    });

    const result = await guesser.guess(input, scoringContext);
    const bodyText = requestBodies[0] ?? "";
    const body = parseBody(bodyText);
    const content = body.input?.[0]?.content ?? [];
    const images = content.filter(isImagePart);

    expect(images.map((image) => image.image_url)).toEqual([
      "data:image/png;base64,seq1",
      "data:image/png;base64,seq2",
      "data:image/png;base64,normalized-final",
      "data:image/png;base64,cropped-normalized-final",
    ]);
    expect(images.every((image) => image.detail === "low")).toBe(true);
    expect(bodyText).toContain('"model":"gpt-5"');
    expect(bodyText).toContain('"store":false');
    expect(body.reasoning?.effort).toBe("high");
    expect(body.text?.format?.type).toBe("json_schema");
    expect(body.text?.format?.name).toBe("draw_duel_ai_candidates");
    expect(body.text?.format?.schema?.required).toEqual(["candidates"]);
    expect(body.text?.format?.schema?.properties).not.toHaveProperty("commentarySteps");
    expect(bodyText).not.toContain(scoringContext.correctWord);
    expect(bodyText).not.toContain(scoringContext.aliases[0] ?? "");
    expect(bodyText).not.toContain(scoringContext.candidateWords[1] ?? "");
    expect(result.text).toBe("cat");
    expect(result.confidence).toBe(0.82);
    expect(result.candidates).toHaveLength(2);
    expect(result.commentarySteps).toEqual([
      "이 그림의 큰 형태를 먼저 보고 있어요.",
      "보이는 단서를 조합해 답을 좁히고 있습니다.",
    ]);
  });

  it("normalizes the top candidate and clamps confidence", async () => {
    const requestBodies: string[] = [];
    const guesser = new OpenAIVisionAIGuesser({
      apiKey: "test-key",
      fetchImpl: async (_url, init) => {
        requestBodies.push(init.body);
        return new Response(candidateResponse(`Guess: ${"a".repeat(80)}`, 2), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        });
      },
      logger: quietLogger,
    });

    const result = await guesser.guess(input, scoringContext);
    const body = requestBodies[0] ?? "";

    expect(body).toContain('"model":"gpt-5"');
    expect(body).toContain('"detail":"low"');
    expect(result.text).toHaveLength(40);
    expect(result.confidence).toBe(1);
  });

  it("caps the total OpenAI guessing budget at 12 seconds", async () => {
    vi.useFakeTimers();

    try {
      let aborted = false;
      const guesser = new OpenAIVisionAIGuesser({
        apiKey: "test-key",
        fetchImpl: async (_url, init) =>
          new Promise<Response>((_resolve, reject) => {
            init.signal.addEventListener("abort", () => {
              aborted = true;
              const error = new Error("aborted");
              error.name = "AbortError";
              reject(error);
            });
          }),
        logger: quietLogger,
        timeoutMs: 30_000,
      });

      const result = guesser.guess(input, scoringContext).then(
        () => undefined,
        (error: unknown) => error,
      );

      await vi.advanceTimersByTimeAsync(11_499);
      expect(aborted).toBe(false);

      await vi.advanceTimersByTimeAsync(1);
      const error = await result;

      expect(error).toBeInstanceOf(Error);
      expect(error).toHaveProperty("message", "aborted");
      expect(aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects invalid candidate JSON so the room manager can use fallback", async () => {
    const guesser = new OpenAIVisionAIGuesser({
      apiKey: "test-key",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            output_text: "not-json",
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          },
        ),
      logger: quietLogger,
    });

    await expect(guesser.guess(input, scoringContext)).rejects.toThrow(
      "OpenAI response was not valid candidate JSON.",
    );
  });

  it("retries 5xx responses up to the configured retry limit", async () => {
    const statuses = [503, 200];
    const guesser = new OpenAIVisionAIGuesser({
      apiKey: "test-key",
      fetchImpl: async () => {
        const status = statuses.shift() ?? 500;

        return new Response(candidateResponse("cat"), {
          status,
          headers: {
            "Content-Type": "application/json",
          },
        });
      },
      logger: quietLogger,
      retryLimit: 1,
    });

    const result = await guesser.guess(input, scoringContext);

    expect(result.text).toBe("cat");
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
      "OpenAI Responses API failed with status 400: bad request",
    );
    expect(calls).toBe(1);
  });
});
