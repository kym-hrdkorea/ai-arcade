import { randomInt } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  realOrAiManifestSchema,
  type RealOrAiImageSourceType,
  type RealOrAiPrivateRoundItem,
} from "@ai-arcade/shared";
import sharp from "sharp";

const forbiddenPublicHints = [
  "real",
  "ai",
  "answer",
  "correct",
  "true",
  "fake",
  "original",
  "generated",
];
const maxPairNumber = 163;
const outputMaxDimension = 1600;
const webpQuality = 88;
const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const realInputDir = path.join(repoRoot, "real_images");
const aiInputDir = path.join(repoRoot, "ai_images");
const publicOutputDir = path.join(
  repoRoot,
  "apps/web/public/games/real-or-ai/images",
);
const generatedManifestPath = path.join(
  repoRoot,
  "apps/realtime-server/src/real-or-ai-round-items.generated.ts",
);

type CandidateSlot = "a" | "b";

type SourceFile = {
  extension: string;
  index: number;
  path: string;
};

type PairSource = {
  ai: SourceFile;
  index: number;
  real: SourceFile;
};

type Assignment = {
  aiSlot: CandidateSlot;
  realSlot: CandidateSlot;
};

type ConversionResult = {
  height: number;
  outputFilename: string;
  outputPath: string;
  sourceType: RealOrAiImageSourceType;
  width: number;
};

async function main() {
  assertInputDirectory(realInputDir, "real_images");
  assertInputDirectory(aiInputDir, "ai_images");
  await mkdir(publicOutputDir, { recursive: true });

  const realFiles = await collectSourceFiles(realInputDir, /^real_(\d{3})\.(jpe?g|png|webp)$/i);
  const aiFiles = await collectSourceFiles(aiInputDir, /^ai_(\d{3})\.(jpe?g|png|webp)$/i);
  const existingAssignments = await readExistingAssignments();
  const pairs = collectPlayablePairs(realFiles, aiFiles);
  const missingPairs = collectMissingPairs(realFiles, aiFiles);
  const roundItems: RealOrAiPrivateRoundItem[] = [];

  for (const pair of pairs) {
    const assignment = existingAssignments.get(pair.index) ?? createRandomAssignment();
    const converted = await convertPair(pair, assignment);
    roundItems.push(createRoundItem(pair.index, assignment, converted));
  }

  validatePublicOutput(roundItems);

  const parsed = realOrAiManifestSchema.safeParse({
    items: roundItems,
    version: 1,
  });

  if (!parsed.success) {
    throw new Error(
      parsed.error.issues[0]?.message ?? "Generated Real or AI manifest is invalid.",
    );
  }

  await writeFile(generatedManifestPath, renderGeneratedModule(parsed.data.items), "utf8");

  console.info(`[real-or-ai assets] playable pairs: ${roundItems.length}`);
  if (missingPairs.length > 0) {
    console.info(`[real-or-ai assets] missing pairs: ${missingPairs.join(", ")}`);
  }
  console.info(`[real-or-ai assets] output: ${publicOutputDir}`);
  console.info(`[real-or-ai assets] manifest: ${generatedManifestPath}`);
}

function assertInputDirectory(directoryPath: string, label: string) {
  if (!existsSync(directoryPath)) {
    throw new Error(`${label} folder was not found at ${directoryPath}`);
  }
}

async function collectSourceFiles(
  directoryPath: string,
  filenamePattern: RegExp,
): Promise<Map<number, SourceFile>> {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const files = new Map<number, SourceFile>();

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }

    const match = entry.name.match(filenamePattern);

    if (!match?.[1]) {
      continue;
    }

    const index = Number.parseInt(match[1], 10);

    if (index < 1 || index > maxPairNumber) {
      continue;
    }

    files.set(index, {
      extension: path.extname(entry.name).toLowerCase(),
      index,
      path: path.join(directoryPath, entry.name),
    });
  }

  return files;
}

function collectPlayablePairs(
  realFiles: Map<number, SourceFile>,
  aiFiles: Map<number, SourceFile>,
): PairSource[] {
  const pairs: PairSource[] = [];

  for (let index = 1; index <= maxPairNumber; index += 1) {
    const real = realFiles.get(index);
    const ai = aiFiles.get(index);

    if (real && ai) {
      pairs.push({ ai, index, real });
    }
  }

  return pairs;
}

function collectMissingPairs(
  realFiles: Map<number, SourceFile>,
  aiFiles: Map<number, SourceFile>,
): string[] {
  const missingPairs: string[] = [];

  for (let index = 1; index <= maxPairNumber; index += 1) {
    if (!realFiles.has(index) || !aiFiles.has(index)) {
      missingPairs.push(formatIndex(index));
    }
  }

  return missingPairs;
}

async function readExistingAssignments(): Promise<Map<number, Assignment>> {
  if (!existsSync(generatedManifestPath)) {
    return new Map();
  }

  const content = await readFile(generatedManifestPath, "utf8");
  const assignments = new Map<number, Assignment>();
  const pattern = /correctCandidateId: "item-(\d{3})-([ab])"/g;

  for (const match of content.matchAll(pattern)) {
    const rawIndex = match[1];
    const rawSlot = match[2];

    if (!rawIndex || (rawSlot !== "a" && rawSlot !== "b")) {
      continue;
    }

    const index = Number.parseInt(rawIndex, 10);
    const realSlot = rawSlot;
    assignments.set(index, {
      aiSlot: realSlot === "a" ? "b" : "a",
      realSlot,
    });
  }

  return assignments;
}

function createRandomAssignment(): Assignment {
  const realSlot: CandidateSlot = randomInt(2) === 0 ? "a" : "b";

  return {
    aiSlot: realSlot === "a" ? "b" : "a",
    realSlot,
  };
}

async function convertPair(
  pair: PairSource,
  assignment: Assignment,
): Promise<ConversionResult[]> {
  return Promise.all([
    convertSource(pair.real, pair.index, assignment.realSlot, "real"),
    convertSource(pair.ai, pair.index, assignment.aiSlot, "ai"),
  ]);
}

async function convertSource(
  source: SourceFile,
  pairIndex: number,
  slot: CandidateSlot,
  sourceType: RealOrAiImageSourceType,
): Promise<ConversionResult> {
  const outputFilename = `item-${formatIndex(pairIndex)}-${slot}.webp`;
  const outputPath = path.join(publicOutputDir, outputFilename);
  const result = await sharp(source.path)
    .rotate()
    .resize({
      fit: "inside",
      height: outputMaxDimension,
      width: outputMaxDimension,
      withoutEnlargement: true,
    })
    .webp({ quality: webpQuality })
    .toFile(outputPath);

  return {
    height: result.height,
    outputFilename,
    outputPath,
    sourceType,
    width: result.width,
  };
}

function createRoundItem(
  index: number,
  assignment: Assignment,
  converted: ConversionResult[],
): RealOrAiPrivateRoundItem {
  const formattedIndex = formatIndex(index);
  const candidates = (["a", "b"] as const).map((slot) => {
    const sourceType = assignment.realSlot === slot ? "real" : "ai";
    const output = converted.find(
      (candidate) => candidate.outputFilename === `item-${formattedIndex}-${slot}.webp`,
    );

    if (!output) {
      throw new Error(`Missing converted output for item-${formattedIndex}-${slot}.`);
    }

    return {
      alt: `후보 ${slot.toUpperCase()} 사진`,
      height: output.height,
      id: `item-${formattedIndex}-${slot}`,
      sourceType,
      src: `/games/real-or-ai/images/${output.outputFilename}`,
      width: output.width,
    };
  }) as RealOrAiPrivateRoundItem["candidates"];

  return {
    candidates,
    category: "photo-pair",
    correctCandidateId: `item-${formattedIndex}-${assignment.realSlot}`,
    id: `item-${formattedIndex}`,
    title: `사진 비교 ${formattedIndex}`,
  };
}

function validatePublicOutput(roundItems: RealOrAiPrivateRoundItem[]) {
  const publicValues = roundItems.flatMap((item) => [
    item.id,
    item.title ?? "",
    ...item.candidates.flatMap((candidate) => [
      candidate.id,
      path.basename(candidate.src),
      candidate.alt,
    ]),
  ]);

  for (const value of publicValues) {
    const lowered = value.toLowerCase();
    const forbidden = forbiddenPublicHints.find((hint) => lowered.includes(hint));

    if (forbidden) {
      throw new Error(`Public Real or AI value contains forbidden hint "${forbidden}": ${value}`);
    }
  }
}

function renderGeneratedModule(roundItems: RealOrAiPrivateRoundItem[]): string {
  return `import type { RealOrAiPrivateRoundItem } from "@ai-arcade/shared";

// Generated by \`pnpm --filter realtime-server real-or-ai:assets\`.
// Do not edit by hand. Source images live in local-only /real_images and /ai_images.
export const realOrAiRoundItems = ${renderValue(roundItems)} satisfies RealOrAiPrivateRoundItem[];
`;
}

function renderValue(value: unknown, indent = 0): string {
  const spaces = " ".repeat(indent);
  const childSpaces = " ".repeat(indent + 2);

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "[]";
    }

    return `[
${value.map((item) => `${childSpaces}${renderValue(item, indent + 2)}`).join(",\n")}
${spaces}]`;
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value);

    if (entries.length === 0) {
      return "{}";
    }

    return `{
${entries
  .map(([key, entryValue]) => `${childSpaces}${key}: ${renderValue(entryValue, indent + 2)}`)
  .join(",\n")}
${spaces}}`;
  }

  return JSON.stringify(value);
}

function formatIndex(index: number): string {
  return String(index).padStart(3, "0");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
