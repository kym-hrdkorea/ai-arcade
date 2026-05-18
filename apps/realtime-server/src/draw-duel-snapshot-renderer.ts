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
const normalizedInkColor = "#111827";
const minimumNormalizedStrokeWidth = 10;
export const drawDuelMaxStrokeSequenceFrames = 4;

export type DrawDuelRecordedStroke = {
  receivedAtMs: number;
  stroke: DrawStrokePayload;
};

export type DrawDuelStrokeSequenceCutoff = {
  offsetMs: number;
  second: number;
};

type RenderMode = "normalized" | "original";

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

function strokeColor(stroke: DrawStrokePayload, mode: RenderMode): string {
  if (stroke.tool === "eraser") {
    return backgroundColor;
  }

  return mode === "normalized" ? normalizedInkColor : stroke.color;
}

function strokeWidth(stroke: DrawStrokePayload, mode: RenderMode): number {
  const width = clamp(stroke.width, 1, 48);

  return mode === "normalized" ? Math.max(width, minimumNormalizedStrokeWidth) : width;
}

function renderStroke(stroke: DrawStrokePayload, mode: RenderMode): string {
  const points = stroke.points.map((point) => normalizePoint(point));
  const width = strokeWidth(stroke, mode);
  const color = strokeColor(stroke, mode);

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

function renderSvg(strokes: DrawStrokePayload[], mode: RenderMode): string {
  const strokeMarkup = strokes.map((stroke) => renderStroke(stroke, mode)).join("");

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
  const svg = renderSvg(strokes, "original");
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

export async function renderDrawDuelNormalizedSnapshot(
  strokes: DrawStrokePayload[],
): Promise<DrawDuelImageSnapshot> {
  const svg = renderSvg(strokes, "normalized");
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
  const frameCount = Math.min(maxFrames, drawDuelMaxStrokeSequenceFrames, strokes.length);

  return Array.from({ length: frameCount }, (_, index) => {
    const ratio = (index + 1) / frameCount;
    const offsetMs = Math.max(1, Math.round(maxOffsetMs * ratio));

    return {
      offsetMs,
      second: Math.max(1, Math.ceil(offsetMs / 1_000)),
    };
  });
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
