import { Buffer } from "node:buffer";

import type { DrawPoint, DrawStrokePayload } from "@ai-arcade/shared";
import sharp from "sharp";

import type {
  DrawDuelImageSnapshot,
  DrawDuelStrokeSequenceFrame,
} from "./ai-guesser.js";

const snapshotWidth = 960;
const snapshotHeight = 600;
const backgroundColor = "#ffffff";
const sequenceFrameIntervalMs = 1_000;
export const drawDuelMaxStrokeSequenceFrames = 12;

export type DrawDuelRecordedStroke = {
  receivedAtMs: number;
  stroke: DrawStrokePayload;
};

export type DrawDuelStrokeSequenceCutoff = {
  offsetMs: number;
  second: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatNumber(value: number): string {
  return Number(value.toFixed(2)).toString();
}

function normalizePoint(point: DrawPoint): DrawPoint {
  return {
    x: clamp(point.x, 0, snapshotWidth),
    y: clamp(point.y, 0, snapshotHeight),
    t: Math.max(0, point.t),
  };
}

function strokeColor(stroke: DrawStrokePayload): string {
  return stroke.tool === "eraser" ? backgroundColor : stroke.color;
}

function renderStroke(stroke: DrawStrokePayload): string {
  const points = stroke.points.map((point) => normalizePoint(point));
  const width = clamp(stroke.width, 1, 48);
  const color = strokeColor(stroke);

  if (points.length === 1) {
    const point = points[0];

    if (!point) {
      return "";
    }

    return `<circle cx="${formatNumber(point.x)}" cy="${formatNumber(point.y)}" r="${formatNumber(width / 2)}" fill="${color}" />`;
  }

  const [firstPoint, ...remainingPoints] = points;

  if (!firstPoint) {
    return "";
  }

  const path = [
    `M ${formatNumber(firstPoint.x)} ${formatNumber(firstPoint.y)}`,
    ...remainingPoints.map(
      (point) => `L ${formatNumber(point.x)} ${formatNumber(point.y)}`,
    ),
  ].join(" ");

  return `<path d="${path}" fill="none" stroke="${color}" stroke-width="${formatNumber(width)}" stroke-linecap="round" stroke-linejoin="round" />`;
}

function renderSvg(strokes: DrawStrokePayload[]): string {
  const strokeMarkup = strokes.map((stroke) => renderStroke(stroke)).join("");

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${snapshotWidth}" height="${snapshotHeight}" viewBox="0 0 ${snapshotWidth} ${snapshotHeight}">`,
    `<rect width="100%" height="100%" fill="${backgroundColor}" />`,
    strokeMarkup,
    "</svg>",
  ].join("");
}

export async function renderDrawDuelSnapshot(
  strokes: DrawStrokePayload[],
): Promise<DrawDuelImageSnapshot> {
  const svg = renderSvg(strokes);
  const png = await sharp(Buffer.from(svg)).png().toBuffer();

  return {
    byteLength: png.byteLength,
    data: `data:image/png;base64,${png.toString("base64")}`,
    height: snapshotHeight,
    mimeType: "image/png",
    strokeCount: strokes.length,
    width: snapshotWidth,
  };
}

function evenlySample<T>(items: T[], maxItems: number): T[] {
  if (items.length <= maxItems) {
    return items;
  }

  if (maxItems <= 1) {
    return [items[items.length - 1] as T];
  }

  const sampled: T[] = [];
  const seen = new Set<number>();

  for (let index = 0; index < maxItems; index += 1) {
    const sourceIndex = Math.round((index * (items.length - 1)) / (maxItems - 1));

    if (!seen.has(sourceIndex)) {
      sampled.push(items[sourceIndex] as T);
      seen.add(sourceIndex);
    }
  }

  return sampled;
}

function offsetFromRoundStart(stroke: DrawDuelRecordedStroke, roundStartedAtMs: number) {
  return Math.max(0, stroke.receivedAtMs - roundStartedAtMs);
}

export function createDrawDuelStrokeSequenceCutoffs(
  strokes: DrawDuelRecordedStroke[],
  roundStartedAtMs: number,
  maxFrames = drawDuelMaxStrokeSequenceFrames,
): DrawDuelStrokeSequenceCutoff[] {
  if (strokes.length === 0 || maxFrames <= 0) {
    return [];
  }

  const maxOffsetMs = Math.max(
    0,
    ...strokes.map((stroke) => offsetFromRoundStart(stroke, roundStartedAtMs)),
  );
  const frameCount = Math.max(1, Math.ceil(maxOffsetMs / sequenceFrameIntervalMs));
  const cutoffs = Array.from({ length: frameCount }, (_, index) => {
    const second = index + 1;

    return {
      offsetMs: second * sequenceFrameIntervalMs,
      second,
    };
  });

  return evenlySample(cutoffs, maxFrames);
}

export async function renderDrawDuelStrokeSequence(
  strokes: DrawDuelRecordedStroke[],
  roundStartedAtMs: number,
  maxFrames = drawDuelMaxStrokeSequenceFrames,
): Promise<DrawDuelStrokeSequenceFrame[]> {
  const cutoffs = createDrawDuelStrokeSequenceCutoffs(
    strokes,
    roundStartedAtMs,
    maxFrames,
  );
  const frames: DrawDuelStrokeSequenceFrame[] = [];

  for (const cutoff of cutoffs) {
    const visibleStrokes = strokes
      .filter(
        (stroke) => offsetFromRoundStart(stroke, roundStartedAtMs) <= cutoff.offsetMs,
      )
      .map((stroke) => stroke.stroke);
    const image = await renderDrawDuelSnapshot(visibleStrokes);

    frames.push({
      image,
      offsetMs: cutoff.offsetMs,
      second: cutoff.second,
      strokeCount: visibleStrokes.length,
    });
  }

  return frames;
}
