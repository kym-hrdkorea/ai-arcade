import {
  type AIGuesser,
  type AIGuesserCandidate,
  type AIGuesserInput,
  type AIGuesserOutput,
  type AIGuesserScoringContext,
  normalizeAIGuesserText,
} from "./ai-guesser.js";

export type OpenAIImageDetail = "auto" | "high" | "low";
export type OpenAIReasoningEffort = "high" | "low" | "medium";
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
  reasoningEffort?: OpenAIReasoningEffort;
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
const defaultTimeoutMs = 15_000;
const maxCandidates = 5;
const maxCommentarySteps = 4;
const openAIResponsesUrl = "https://api.openai.com/v1/responses";
const candidateResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["candidates", "commentarySteps"],
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
    commentarySteps: {
      type: "array",
      minItems: 2,
      maxItems: maxCommentarySteps,
      items: {
        type: "string",
        minLength: 1,
        maxLength: 90,
      },
    },
  },
};

type ParsedAIResponse = {
  candidates: AIGuesserCandidate[];
  commentarySteps: string[];
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

function normalizeCommentarySteps(value: unknown, candidates: AIGuesserCandidate[]): string[] {
  if (!isRecord(value) || !Array.isArray(value.commentarySteps)) {
    throw new OpenAIOutputParseError("OpenAI response did not include commentary steps.");
  }

  const candidateKeys = new Set(
    candidates
      .map((candidate) =>
        candidate.text
          .replace(/\s+/g, "")
          .trim()
          .toLocaleLowerCase("ko-KR"),
      )
      .filter((text) => text.length >= 2),
  );
  const commentarySteps = value.commentarySteps
    .map((step): string | undefined => {
      if (typeof step !== "string") {
        return undefined;
      }

      const cleaned = step.replace(/\s+/g, " ").trim();
      const compact = cleaned.replace(/\s+/g, "").toLocaleLowerCase("ko-KR");

      if (
        !cleaned ||
        cleaned.length > 90 ||
        [...candidateKeys].some((candidateKey) => compact.includes(candidateKey))
      ) {
        return undefined;
      }

      return cleaned;
    })
    .filter((step): step is string => Boolean(step))
    .slice(0, maxCommentarySteps);

  return commentarySteps.length >= 2
    ? commentarySteps
    : [
        "이 그림의 큰 형태를 먼저 보고 있어요.",
        "아직 확신이 낮아서 단서를 좁혀 보고 있습니다.",
      ];
}

function extractAIResponse(responseBody: unknown): ParsedAIResponse {
  const outputText = extractOutputText(responseBody);

  if (!outputText) {
    throw new OpenAIOutputParseError("OpenAI response did not include output text.");
  }

  const parsed = parseJsonObject(outputText);
  const candidates = normalizeCandidates(parsed);

  return {
    candidates,
    commentarySteps: normalizeCommentarySteps(parsed, candidates),
  };
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

function normalizeReasoningEffort(
  value: OpenAIReasoningEffort | undefined,
): OpenAIReasoningEffort | undefined {
  return value === "high" || value === "low" || value === "medium" ? value : undefined;
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
        "Infer the intended object from the accumulating shape, not from written labels, decorative text, color tricks, arrows, or late distractor marks. " +
        "Favor concrete common nouns. Also write short public Korean observation steps that narrow the category without naming your final answer.",
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

  if (input.croppedNormalizedFinalImage) {
    content.push({
      type: "input_text",
      text:
        `Cropped normalized object view: strokes=${input.croppedNormalizedFinalImage.strokeCount}, ` +
        `size=${input.croppedNormalizedFinalImage.width}x${input.croppedNormalizedFinalImage.height}. ` +
        "Use this to inspect drawings with large empty margins while still considering the full canvas.",
    });
    content.push({
      type: "input_image",
      image_url: input.croppedNormalizedFinalImage.data,
      detail,
    });
  }

  return content;
}

export class OpenAIVisionAIGuesser implements AIGuesser {
  private readonly apiKey: string;
  private readonly detail: OpenAIImageDetail;
  private readonly fetchImpl: OpenAIFetch;
  private readonly logger: OpenAILogger;
  private readonly model: string;
  private readonly reasoningEffort: OpenAIReasoningEffort | undefined;
  private readonly retryLimit: number;
  private readonly timeoutMs: number;

  constructor(options: OpenAIVisionAIGuesserOptions) {
    this.apiKey = options.apiKey;
    this.detail = normalizeDetail(options.detail);
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.logger = options.logger ?? console;
    this.model = options.model?.trim() || defaultModel;
    this.reasoningEffort = normalizeReasoningEffort(options.reasoningEffort);
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
        const requestBody: Record<string, unknown> = {
          model: this.model,
          instructions:
            "You are an AI player in a real-time drawing guessing game. " +
            "Guess from quick, incomplete, messy, or mildly adversarial sketches. " +
            "Prioritize persistent geometry, repeated strokes, object silhouette, and shape changes across the stroke sequence. " +
            "Ignore readable text, labels, arrows, or obvious bait marks when the shape tells a different story. " +
            "Prefer specific concrete Korean common nouns over broad categories, even when confidence is low. " +
            "Use '모르겠음' only when the images are truly impossible to interpret. " +
            "Return up to five candidate guesses ordered from most likely to least likely with confidence values. " +
            "Also return 2-4 short Korean commentarySteps for players. These are public observations only: describe visible shapes, silhouette, or broad category narrowing, and do not reveal or repeat any final candidate word.",
          input: [
            {
              role: "user",
              content: createPromptContent(input, this.detail),
            },
          ],
          max_output_tokens: 2048,
          store: false,
          text: {
            format: {
              type: "json_schema",
              name: "draw_duel_ai_candidates",
              strict: true,
              schema: candidateResponseSchema,
            },
          },
        };

        if (this.reasoningEffort) {
          requestBody.reasoning = {
            effort: this.reasoningEffort,
          };
        }

        const response = await this.fetchImpl(openAIResponsesUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          signal: controller.signal,
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          throw new OpenAIStatusError(response.status);
        }

        const body = (await response.json()) as unknown;
        const parsed = extractAIResponse(body);
        const { candidates, commentarySteps } = parsed;
        const topCandidate = candidates[0];
        const text = normalizeAIGuesserText(topCandidate?.text ?? "");

        this.logger.info(
          `[ai] openai guess completed room=${input.roomCode} round=${input.roundId} latencyMs=${Date.now() - overallStartedAt} frames=${input.strokeSequence.length} bytes=${input.finalImage.byteLength} attempt=${attempt}/${maxAttempts} candidateCount=${candidates.length} topCandidate="${text}" candidates="${candidates.map((candidate) => candidate.text).join("|")}"`,
        );

        return {
          candidates,
          commentarySteps,
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
