import {
  type AIGuesser,
  type AIGuesserCandidate,
  type AIGuesserInput,
  type AIGuesserOutput,
  type AIGuesserScoringContext,
  normalizeAIGuesserText,
} from "./ai-guesser.js";
import { guessDrawDuelTemplate } from "./draw-duel-template-guesser.js";

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
const defaultTimeoutMs = 11_500;
const maxTimeoutMs = 11_500;
const maxCandidates = 5;
const maxCommentarySteps = 4;
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

type ParsedAIResponse = {
  candidates: AIGuesserCandidate[];
  commentarySteps: string[];
};

class OpenAIStatusError extends Error {
  constructor(
    public readonly status: number,
    providerMessage?: string,
  ) {
    super(
      providerMessage
        ? `OpenAI Responses API failed with status ${status}: ${providerMessage}`
        : `OpenAI Responses API failed with status ${status}.`,
    );
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
    const objectStart = value.indexOf("{");
    const objectEnd = value.lastIndexOf("}");

    if (objectStart >= 0 && objectEnd > objectStart) {
      try {
        return JSON.parse(value.slice(objectStart, objectEnd + 1)) as unknown;
      } catch {
        throw new OpenAIOutputParseError("OpenAI response was not valid candidate JSON.");
      }
    }

    throw new OpenAIOutputParseError("OpenAI response was not valid candidate JSON.");
  }
}

function extractProviderErrorMessage(responseBody: unknown): string | undefined {
  if (!isRecord(responseBody)) {
    return undefined;
  }

  const error = responseBody.error;

  if (typeof error === "string") {
    return error;
  }

  if (!isRecord(error)) {
    return undefined;
  }

  const message = typeof error.message === "string" ? error.message : undefined;
  const code = typeof error.code === "string" ? error.code : undefined;
  const type = typeof error.type === "string" ? error.type : undefined;

  return [type, code, message].filter(Boolean).join(": ") || undefined;
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
    return [
      "이 그림의 큰 형태를 먼저 보고 있어요.",
      "보이는 단서를 조합해 답을 좁히고 있습니다.",
    ];
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

  return Math.min(maxTimeoutMs, Math.max(1_000, Math.round(value)));
}

function normalizeRetryLimit(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }

  return Math.min(3, Math.max(0, Math.round(value)));
}

function normalizeDetail(value: OpenAIImageDetail | undefined): OpenAIImageDetail {
  return value === "auto" || value === "high" || value === "low" ? value : "low";
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

  if (error instanceof OpenAIOutputParseError) {
    return true;
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

function selectPromptSequenceFrames(input: AIGuesserInput) {
  if (input.strokeSequence.length <= 2) {
    return input.strokeSequence;
  }

  const firstFrame = input.strokeSequence[0];
  const finalFrame = input.strokeSequence[input.strokeSequence.length - 1];

  return [firstFrame, finalFrame].filter(
    (frame): frame is NonNullable<typeof frame> => Boolean(frame),
  );
}

function createPromptContent(
  input: AIGuesserInput,
  detail: OpenAIImageDetail,
  category?: string,
): OpenAIContentPart[] {
  const content: OpenAIContentPart[] = [
    {
      type: "input_text",
      text:
        "You will receive a compact time-ordered stroke sequence from a live drawing game. " +
        "The frames represent the drawing at roughly 25%, 50%, 75%, and 100% of the stroke timeline when enough strokes exist. " +
        "Infer the intended object from the accumulating shape, not from written labels, decorative text, color tricks, arrows, or late distractor marks. " +
        "The hidden answer comes from a fixed, child-safe word bank of everyday drawable objects, animals, foods, places, nature items, sports items, body parts, or symbols. " +
        (category ? `The answer's broad category is ${category}. ` : "") +
        "You are not given that word bank, so choose the closest ordinary drawable noun instead of inventing a rare or overly specific term. " +
        "Favor concrete Korean common nouns.",
    },
  ];

  for (const [index, frame] of selectPromptSequenceFrames(input).entries()) {
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
    scoringContext: AIGuesserScoringContext,
  ): Promise<AIGuesserOutput> {
    const templateOutput = await guessDrawDuelTemplate(input);

    if (templateOutput) {
      this.logger.info(
        `[ai] local template guess completed room=${input.roomCode} round=${input.roundId} frames=${input.strokeSequence.length} topCandidate="${templateOutput.text}"`,
      );
      return templateOutput;
    }

    const maxAttempts = this.retryLimit + 1;
    const overallStartedAt = Date.now();
    const deadlineAt = overallStartedAt + this.timeoutMs;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const remainingMs = deadlineAt - Date.now();

      if (remainingMs <= 0) {
        throw new Error("OpenAI guess exceeded the 12 second budget.");
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), remainingMs);

      try {
        const requestBody: Record<string, unknown> = {
          model: this.model,
          instructions:
            "You are an AI player in a real-time drawing guessing game. " +
            "Your outcome is a scored guess: the first candidate should be the most likely answer as one short Korean common noun. " +
            "Guess from quick, incomplete, messy, sparse, or mildly adversarial sketches. " +
            "The answer is expected to be a simple, everyday, child-safe drawing-game word, not a caption, sentence, rare subtype, brand, color-only description, or broad category. " +
            "Prioritize persistent geometry, repeated strokes, object silhouette, distinctive parts, and shape changes across the stroke sequence. " +
            "Ignore readable text, labels, arrows, or obvious bait marks when the shape tells a different story. " +
            "Prefer specific concrete Korean common nouns over broad categories, even when confidence is low; for example choose '고양이' rather than '동물', or '자동차' rather than '탈것'. " +
            "Use '모르겠음' only when the canvas is blank or truly impossible to interpret. " +
            "Return up to five distinct candidate guesses ordered from most likely to least likely with confidence values. " +
            "If uncertain between aliases or close concepts, include both likely common nouns in the candidate list instead of returning a generic category. " +
            "Return only the candidate JSON. Do not include commentary, explanations, markdown, or extra keys.",
          input: [
            {
              role: "user",
              content: createPromptContent(input, this.detail, scoringContext.category),
            },
          ],
          max_output_tokens: 768,
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
          let providerMessage: string | undefined;

          try {
            providerMessage = extractProviderErrorMessage((await response.json()) as unknown);
          } catch {
            providerMessage = undefined;
          }

          throw new OpenAIStatusError(response.status, providerMessage);
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
        const canRetry =
          attempt < maxAttempts && Date.now() < deadlineAt && isRetryableError(error);

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
