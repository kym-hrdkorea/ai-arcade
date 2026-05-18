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

type StrokeBounds = {
  bottom: number;
  left: number;
  right: number;
  top: number;
};

function findVisibleStrokeBounds(strokes: DrawStrokePayload[]): StrokeBounds | undefined {
  let bottom = Number.NEGATIVE_INFINITY;
  let left = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;

  for (const stroke of strokes) {
    if (stroke.tool === "eraser") {
      continue;
    }

    const strokeRadius = strokeWidth(stroke, "normalized") / 2;

    for (const point of stroke.points) {
      const normalizedPoint = normalizePoint(point);

      bottom = Math.max(bottom, normalizedPoint.y + strokeRadius);
      left = Math.min(left, normalizedPoint.x - strokeRadius);
      right = Math.max(right, normalizedPoint.x + strokeRadius);
      top = Math.min(top, normalizedPoint.y - strokeRadius);
    }
  }

  if (
    !Number.isFinite(bottom) ||
    !Number.isFinite(left) ||
    !Number.isFinite(right) ||
    !Number.isFinite(top)
  ) {
    return undefined;
  }

  return {
    bottom: clamp(bottom, 0, snapshotHeight),
    left: clamp(left, 0, snapshotWidth),
    right: clamp(right, 0, snapshotWidth),
    top: clamp(top, 0, snapshotHeight),
  };
}

function expandBounds(bounds: StrokeBounds): StrokeBounds {
  const minimumContentSize = 48;
  const padding = 64;
  const centerX = (bounds.left + bounds.right) / 2;
  const centerY = (bounds.top + bounds.bottom) / 2;
  const contentWidth = Math.max(bounds.right - bounds.left, minimumContentSize);
  const contentHeight = Math.max(bounds.bottom - bounds.top, minimumContentSize);

  return {
    bottom: clamp(centerY + contentHeight / 2 + padding, 0, snapshotHeight),
    left: clamp(centerX - contentWidth / 2 - padding, 0, snapshotWidth),
    right: clamp(centerX + contentWidth / 2 + padding, 0, snapshotWidth),
    top: clamp(centerY - contentHeight / 2 - padding, 0, snapshotHeight),
  };
}

function renderCroppedNormalizedSvg(strokes: DrawStrokePayload[], bounds: StrokeBounds): string {
  const targetMargin = 48;
  const width = Math.max(1, bounds.right - bounds.left);
  const height = Math.max(1, bounds.bottom - bounds.top);
  const scale = Math.min(
    (snapshotWidth - targetMargin * 2) / width,
    (snapshotHeight - targetMargin * 2) / height,
  );
  const translateX = (snapshotWidth - width * scale) / 2;
  const translateY = (snapshotHeight - height * scale) / 2;
  const strokeMarkup = strokes.map((stroke) => renderStroke(stroke, "normalized")).join("");

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${snapshotWidth}" height="${snapshotHeight}" viewBox="0 0 ${snapshotWidth} ${snapshotHeight}">`,
    `<rect width="100%" height="100%" fill="${backgroundColor}" />`,
    `<g transform="translate(${formatNumber(translateX)} ${formatNumber(translateY)}) scale(${formatNumber(scale)}) translate(${formatNumber(-bounds.left)} ${formatNumber(-bounds.top)})">`,
    strokeMarkup,
    "</g>",
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

export async function renderDrawDuelCroppedNormalizedSnapshot(
  strokes: DrawStrokePayload[],
): Promise<DrawDuelImageSnapshot | undefined> {
  const visibleBounds = findVisibleStrokeBounds(strokes);

  if (!visibleBounds) {
    return undefined;
  }

  const svg = renderCroppedNormalizedSvg(strokes, expandBounds(visibleBounds));
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
  let previousVisibleStrokeCount: number | undefined;

  for (const cutoff of cutoffs) {
    const visibleStrokes = strokes
      .filter(
        (stroke) => offsetFromRoundStart(stroke, roundStartedAtMs) <= cutoff.offsetMs,
      )
      .map((stroke) => stroke.stroke);
    const isFinalCutoff = cutoff === cutoffs[cutoffs.length - 1];

    if (
      previousVisibleStrokeCount === visibleStrokes.length &&
      !isFinalCutoff
    ) {
      continue;
    }

    const image = await renderDrawDuelSnapshot(visibleStrokes);
    const frame: DrawDuelStrokeSequenceFrame = {
      image,
      offsetMs: cutoff.offsetMs,
      second: cutoff.second,
      strokeCount: visibleStrokes.length,
    };

    if (
      isFinalCutoff &&
      frames.at(-1)?.strokeCount === frame.strokeCount
    ) {
      frames[frames.length - 1] = frame;
    } else {
      frames.push(frame);
    }

    previousVisibleStrokeCount = visibleStrokes.length;
  }

  return frames;
}
