import type {
  ThreeWordMonsterImageProvider,
  ThreeWordMonsterWords,
} from "@ai-arcade/shared";

export type MonsterImageGeneratorInput = {
  nickname: string;
  playerId: string;
  roomCode: string;
  words: ThreeWordMonsterWords;
};

export type MonsterImageGeneratorOutput = {
  imageDataUrl: string;
  provider: ThreeWordMonsterImageProvider;
};

export type MonsterImageGenerator = {
  generate: (
    input: MonsterImageGeneratorInput,
  ) => Promise<MonsterImageGeneratorOutput>;
};

type OpenAIImageGenerationResponse = {
  data?: Array<{
    b64_json?: string;
  }>;
};

type OpenAIImageFetch = (
  input: string,
  init: {
    body: string;
    headers: Record<string, string>;
    method: "POST";
    signal: AbortSignal;
  },
) => Promise<Response>;

export type OpenAIMonsterImageGeneratorOptions = {
  apiKey: string;
  fetchImpl?: OpenAIImageFetch;
  model?: string;
  size?: string;
  timeoutMs?: number;
};

const defaultOpenAIImageModel = "gpt-image-2";
const defaultOpenAIImageSize = "1024x1024";
const defaultOpenAITimeoutMs = 120_000;
const openAIImagesUrl = "https://api.openai.com/v1/images/generations";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizeSize(value: string | undefined): string {
  const trimmed = value?.trim();

  if (trimmed && /^\d{3,4}x\d{3,4}$/.test(trimmed)) {
    return trimmed;
  }

  return defaultOpenAIImageSize;
}

function normalizeTimeoutMs(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return defaultOpenAITimeoutMs;
  }

  return Math.min(180_000, Math.max(5_000, Math.round(value)));
}

function parseTimeoutMs(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function sanitizeOpenAIApiKey(value: string | undefined): string | undefined {
  const trimmed = value?.trim();

  if (!trimmed) {
    return undefined;
  }

  const unquoted =
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
      ? trimmed.slice(1, -1).trim()
      : trimmed;

  return /^[\x21-\x7e]+$/.test(unquoted) ? unquoted : undefined;
}

function extractImageBase64(body: OpenAIImageGenerationResponse): string {
  const imageBase64 = body.data?.[0]?.b64_json;

  if (!imageBase64) {
    throw new Error("OpenAI image response did not include b64_json.");
  }

  return imageBase64;
}

export function createMonsterPrompt(words: ThreeWordMonsterWords): string {
  const [word1, word2, word3] = words;

  return `You are the image director for a Korean arcade party game called "3 Worded Monster".
Create one original monster character based on exactly these three keywords:

1. "${word1}"
2. "${word2}"
3. "${word3}"

Core art direction:
- Make the monster spooky and powerful, but also cute, playful, and collectible like an arcade mascot toy.
- The result must be family-safe: thrilling, not disturbing.
- Use a consistent polished arcade fantasy concept-art style for every player.
- Centered full-body monster, clean simple background, strong readable silhouette, high detail.

Keyword focus rules:
- All three keywords must be clearly visible in the monster design.
- Do not treat the keywords as separate objects floating around the monster.
- Fuse the three concepts into one coherent creature.
- Give each keyword a distinct visual role, such as silhouette/body shape, horns/limbs, skin texture, armor, color pattern, tail, wings, held prop, magical power, or base/environment.
- Avoid generic monsters if a keyword can be shown through a specific feature.
- If a keyword is abstract, translate it into a clear visual motif.

Composition rules:
- One monster only.
- No readable text anywhere in the image.
- No logos, UI, captions, labels, watermarks, or speech bubbles.
- Same composition and image size for all players.

Safety rules:
- No sexual content, nudity, fetish elements, or suggestive anatomy.
- No graphic gore, exposed organs, realistic injury, or disturbing violence.
- Do not depict real public figures or copyrighted characters.
- Keep the monster visually impressive, competitive, and suitable for a party game.`;
}

export class MockMonsterImageGenerator implements MonsterImageGenerator {
  async generate(input: MonsterImageGeneratorInput): Promise<MonsterImageGeneratorOutput> {
    const [word1, word2, word3] = input.words.map(escapeXml);
    const nickname = escapeXml(input.nickname);
    const hueSeed = [...input.playerId].reduce(
      (total, character) => total + character.charCodeAt(0),
      0,
    );
    const hue = hueSeed % 360;
    const accentHue = (hue + 120) % 360;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024" role="img" aria-label="Mock monster for ${nickname}">
  <rect width="1024" height="1024" fill="#0b1020"/>
  <rect x="56" y="56" width="912" height="912" rx="24" fill="#1e293b" stroke="hsl(${hue} 88% 62%)" stroke-width="18"/>
  <circle cx="512" cy="402" r="224" fill="hsl(${hue} 80% 52%)" stroke="#f8fafc" stroke-width="18"/>
  <path d="M318 326 214 180l174 56M706 326 810 180l-174 56" fill="hsl(${accentHue} 78% 54%)" stroke="#f8fafc" stroke-width="16" stroke-linejoin="round"/>
  <path d="M318 594c58 106 330 106 388 0 34 38 52 84 52 138 0 112-110 196-246 196s-246-84-246-196c0-54 18-100 52-138z" fill="hsl(${accentHue} 72% 48%)" stroke="#0b1020" stroke-width="18"/>
  <circle cx="430" cy="390" r="42" fill="#f8fafc" stroke="#0b1020" stroke-width="16"/>
  <circle cx="594" cy="390" r="42" fill="#f8fafc" stroke="#0b1020" stroke-width="16"/>
  <circle cx="444" cy="404" r="14" fill="#0b1020"/>
  <circle cx="580" cy="404" r="14" fill="#0b1020"/>
  <path d="M414 522c62 48 134 48 196 0" fill="none" stroke="#0b1020" stroke-width="24" stroke-linecap="round"/>
  <rect x="168" y="760" width="688" height="142" rx="14" fill="#0b1020" stroke="#334155" stroke-width="8"/>
  <text x="512" y="816" text-anchor="middle" font-family="Courier New, monospace" font-size="34" font-weight="900" fill="#facc15">${word1} + ${word2}</text>
  <text x="512" y="866" text-anchor="middle" font-family="Courier New, monospace" font-size="34" font-weight="900" fill="#38bdf8">+ ${word3}</text>
</svg>`;

    return {
      imageDataUrl: `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`,
      provider: "mock",
    };
  }
}

export class OpenAIMonsterImageGenerator implements MonsterImageGenerator {
  private readonly apiKey: string;
  private readonly fetchImpl: OpenAIImageFetch;
  private readonly model: string;
  private readonly size: string;
  private readonly timeoutMs: number;

  constructor(options: OpenAIMonsterImageGeneratorOptions) {
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.model = options.model?.trim() || defaultOpenAIImageModel;
    this.size = normalizeSize(options.size);
    this.timeoutMs = normalizeTimeoutMs(options.timeoutMs);
  }

  async generate(input: MonsterImageGeneratorInput): Promise<MonsterImageGeneratorOutput> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(openAIImagesUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: this.model,
          prompt: createMonsterPrompt(input.words),
          size: this.size,
          n: 1,
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI Images API failed with status ${response.status}.`);
      }

      const body = (await response.json()) as OpenAIImageGenerationResponse;

      return {
        imageDataUrl: `data:image/png;base64,${extractImageBase64(body)}`,
        provider: "openai",
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function createMonsterImageGenerator(
  provider = process.env.THREE_WORD_MONSTER_IMAGE_PROVIDER ?? "mock",
): MonsterImageGenerator {
  const normalizedProvider = provider.trim().toLowerCase();

  if (normalizedProvider === "mock") {
    return new MockMonsterImageGenerator();
  }

  if (normalizedProvider === "openai") {
    const apiKey = sanitizeOpenAIApiKey(process.env.OPENAI_API_KEY);

    if (!apiKey) {
      console.warn(
        "[three-word-monster] OPENAI_API_KEY is missing or invalid. Falling back to mock image provider.",
      );
      return new MockMonsterImageGenerator();
    }

    return new OpenAIMonsterImageGenerator({
      apiKey,
      model: process.env.THREE_WORD_MONSTER_IMAGE_MODEL,
      size: process.env.THREE_WORD_MONSTER_IMAGE_SIZE,
      timeoutMs: parseTimeoutMs(process.env.THREE_WORD_MONSTER_IMAGE_TIMEOUT_MS),
    });
  }

  console.warn(
    `[three-word-monster] Unknown image provider "${provider}", falling back to mock.`,
  );
  return new MockMonsterImageGenerator();
}
