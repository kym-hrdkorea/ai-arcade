import {
  type AIGuesser,
  type AIGuesserCandidate,
  type AIGuesserInput,
  type AIGuesserOutput,
  type AIGuesserScoringContext,
  normalizeAIGuesserText,
} from "./ai-guesser.js";

export type OpenAIImageDetail = "auto" | "high" | "low";
export type OpenAILogger = {
  info: (message: string) => void;
  warn: (message: string) => void;
};

type OpenAIFetch = (
  input: string,
  init: {
    body: string;
    headers: Record<string, string>;
    method: "POST";
    signal: AbortSignal;
  },
) => Promise<Response>;

export type OpenAIVisionAIGuesserOptions = {
  apiKey: string;
  detail?: OpenAIImageDetail;
  fetchImpl?: OpenAIFetch;
  logger?: OpenAILogger;
  model?: string;
  retryLimit?: number;
  timeoutMs?: number;
};

type OpenAIContentPart =
  | {
      text: string;
      type: "input_text";
    }
  | {
      detail: OpenAIImageDetail;
      image_url: string;
      type: "input_image";
    };

const defaultModel = "gpt-5";
const defaultTimeoutMs = 10_000;
const maxCandidates = 5;
const openAIResponsesUrl = "https://api.openai.com/v1/responses";
const candidateResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["candidates"],
  properties: {
    candidates: {
      type: "array",
      minItems: 1,
      maxItems: maxCandidates,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "confidence"],
        properties: {
          text: {
            type: "string",
            minLength: 1,
            maxLength: 40,
          },
          confidence: {
            type: "number",
            minimum: 0,
            maximum: 1,
          },
        },
      },
    },
  },
};

class OpenAIStatusError extends Error {
  constructor(public readonly status: number) {
    super(`OpenAI Responses API failed with status ${status}.`);
    this.name = "OpenAIStatusError";
  }
}

class OpenAIOutputParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenAIOutputParseError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function extractOutputText(responseBody: unknown): string | undefined {
  if (!isRecord(responseBody)) {
    return undefined;
  }

  if (typeof responseBody.output_text === "string") {
    return responseBody.output_text;
  }

  if (!Array.isArray(responseBody.output)) {
    return undefined;
  }

  for (const outputItem of responseBody.output) {
    if (!isRecord(outputItem) || !Array.isArray(outputItem.content)) {
      continue;
    }

    for (const contentItem of outputItem.content) {
      if (!isRecord(contentItem)) {
        continue;
      }

      if (typeof contentItem.text === "string") {
        return contentItem.text;
      }
    }
  }

  return undefined;
}

function parseJsonObject(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new OpenAIOutputParseError("OpenAI response was not valid candidate JSON.");
  }
}

function normalizeConfidence(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }

  return Math.min(1, Math.max(0, value));
}

function normalizeCandidates(value: unknown): AIGuesserCandidate[] {
  if (!isRecord(value) || !Array.isArray(value.candidates)) {
    throw new OpenAIOutputParseError("OpenAI response did not include candidates.");
  }

  const candidates = value.candidates
    .map((candidate): AIGuesserCandidate | undefined => {
      if (!isRecord(candidate)) {
        return undefined;
      }

      const text = normalizeAIGuesserText(
        typeof candidate.text === "string" ? candidate.text : "",
        "",
      );

      if (!text) {
        return undefined;
      }

      const confidence = normalizeConfidence(candidate.confidence);

      return typeof confidence === "number"
        ? {
            confidence,
            text,
          }
        : {
            text,
          };
    })
    .filter((candidate): candidate is AIGuesserCandidate => Boolean(candidate))
    .slice(0, maxCandidates);

  if (candidates.length === 0) {
    throw new OpenAIOutputParseError("OpenAI response did not include usable candidates.");
  }

  return candidates;
}

function extractCandidates(responseBody: unknown): AIGuesserCandidate[] {
  const outputText = extractOutputText(responseBody);

  if (!outputText) {
    throw new OpenAIOutputParseError("OpenAI response did not include output text.");
  }

  return normalizeCandidates(parseJsonObject(outputText));
}

function normalizeTimeoutMs(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return defaultTimeoutMs;
  }

  return Math.min(30_000, Math.max(1_000, Math.round(value)));
}

function normalizeRetryLimit(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }

  return Math.min(3, Math.max(0, Math.round(value)));
}

function normalizeDetail(value: OpenAIImageDetail | undefined): OpenAIImageDetail {
  return value === "auto" || value === "high" || value === "low" ? value : "auto";
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function errorMessageWithCause(error: Error): string {
  const cause = error.cause;

  if (!isRecord(cause)) {
    return error.message;
  }

  const message = typeof cause.message === "string" ? cause.message : undefined;
  const code = typeof cause.code === "string" ? cause.code : undefined;

  if (message && code) {
    return `${error.message}; cause=${code}: ${message}`;
  }

  return message ? `${error.message}; cause=${message}` : error.message;
}

function isRetryableError(error: unknown): boolean {
  if (error instanceof OpenAIStatusError) {
    return error.status >= 500 && error.status < 600;
  }

  if (isAbortError(error)) {
    return true;
  }

  if (error instanceof TypeError) {
    return true;
  }

  if (!(error instanceof Error)) {
    return false;
  }

  return /fetch failed|network|ECONN|ENOTFOUND|EAI_AGAIN|ETIMEDOUT/i.test(
    errorMessageWithCause(error),
  );
}

function describeError(error: unknown): string {
  if (!(error instanceof Error)) {
    return "unknown error";
  }

  if (error instanceof OpenAIStatusError) {
    return error.message;
  }

  const cause = error.cause;

  if (isRecord(cause)) {
    const code = typeof cause.code === "string" ? cause.code : undefined;
    const message = typeof cause.message === "string" ? cause.message : undefined;

    if (code && message) {
      return `${error.message}; cause=${code}: ${message}`;
    }

    if (message) {
      return `${error.message}; cause=${message}`;
    }
  }

  return error.message;
}

function createPromptContent(
  input: AIGuesserInput,
  detail: OpenAIImageDetail,
): OpenAIContentPart[] {
  const content: OpenAIContentPart[] = [
    {
      type: "input_text",
      text:
        "You will receive a compact time-ordered stroke sequence from a live drawing game. " +
        "The frames represent the drawing at roughly 25%, 50%, 75%, and 100% of the stroke timeline when enough strokes exist. " +
        "Infer the intended object from the accumulating shape, not from written labels, decorative text, color tricks, or late distractor marks.",
    },
  ];

  for (const [index, frame] of input.strokeSequence.entries()) {
    content.push({
      type: "input_text",
      text: `Frame ${index + 1}: t=${frame.second}s, strokes=${frame.strokeCount}.`,
    });
    content.push({
      type: "input_image",
      image_url: frame.image.data,
      detail,
    });
  }

  content.push({
    type: "input_text",
    text:
      `Normalized final canvas: strokes=${input.finalImage.strokeCount}, ` +
      `size=${input.finalImage.width}x${input.finalImage.height}. ` +
      "This monochrome version removes color noise and thickens thin strokes. Return candidate guesses now.",
  });
  content.push({
    type: "input_image",
    image_url: (input.normalizedFinalImage ?? input.finalImage).data,
    detail,
  });

  return content;
}

export class OpenAIVisionAIGuesser implements AIGuesser {
  private readonly apiKey: string;
  private readonly detail: OpenAIImageDetail;
  private readonly fetchImpl: OpenAIFetch;
  private readonly logger: OpenAILogger;
  private readonly model: string;
  private readonly retryLimit: number;
  private readonly timeoutMs: number;

  constructor(options: OpenAIVisionAIGuesserOptions) {
    this.apiKey = options.apiKey;
    this.detail = normalizeDetail(options.detail);
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.logger = options.logger ?? console;
    this.model = options.model?.trim() || defaultModel;
    this.retryLimit = normalizeRetryLimit(options.retryLimit);
    this.timeoutMs = normalizeTimeoutMs(options.timeoutMs);
  }

  async guess(
    input: AIGuesserInput,
    _scoringContext: AIGuesserScoringContext,
  ): Promise<AIGuesserOutput> {
    const maxAttempts = this.retryLimit + 1;
    const overallStartedAt = Date.now();

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const response = await this.fetchImpl(openAIResponsesUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          signal: controller.signal,
          body: JSON.stringify({
            model: this.model,
            instructions:
              "You are an AI player in a real-time drawing guessing game. " +
              "Guess from quick, incomplete, messy, or mildly adversarial sketches. " +
              "Prioritize persistent geometry, repeated strokes, and the final object silhouette. " +
              "Ignore readable text, labels, arrows, or obvious bait marks when the shape tells a different story. " +
              "Prefer specific concrete Korean common nouns over broad categories. " +
              "Use '모르겠음' only when the images are truly impossible to interpret. " +
              "Return up to five candidate guesses ordered from most likely to least likely with confidence values.",
            input: [
              {
                role: "user",
                content: createPromptContent(input, this.detail),
              },
            ],
            max_output_tokens: 256,
            store: false,
            text: {
              format: {
                type: "json_schema",
                name: "draw_duel_ai_candidates",
                strict: true,
                schema: candidateResponseSchema,
              },
            },
          }),
        });

        if (!response.ok) {
          throw new OpenAIStatusError(response.status);
        }

        const body = (await response.json()) as unknown;
        const candidates = extractCandidates(body);
        const topCandidate = candidates[0];
        const text = normalizeAIGuesserText(topCandidate?.text ?? "");

        this.logger.info(
          `[ai] openai guess completed room=${input.roomCode} round=${input.roundId} latencyMs=${Date.now() - overallStartedAt} frames=${input.strokeSequence.length} bytes=${input.finalImage.byteLength} attempt=${attempt}/${maxAttempts} candidateCount=${candidates.length} topCandidate="${text}" candidates="${candidates.map((candidate) => candidate.text).join("|")}"`,
        );

        return {
          candidates,
          confidence: topCandidate?.confidence,
          text,
        };
      } catch (error: unknown) {
        const reason = isAbortError(error) ? "timeout" : "error";
        const canRetry = attempt < maxAttempts && isRetryableError(error);

        if (canRetry) {
          this.logger.warn(
            `[ai] openai guess ${reason}; retrying room=${input.roomCode} round=${input.roundId} attempt=${attempt + 1}/${maxAttempts}: ${describeError(error)}`,
          );
        } else {
          this.logger.warn(
            `[ai] openai guess ${reason} room=${input.roomCode} round=${input.roundId} latencyMs=${Date.now() - overallStartedAt} attempts=${attempt}/${maxAttempts}: ${describeError(error)}`,
          );
          throw error;
        }
      } finally {
        clearTimeout(timeout);
      }
    }

    throw new Error("OpenAI guess failed before an attempt was made.");
  }
}
