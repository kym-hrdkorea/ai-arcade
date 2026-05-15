import { Buffer } from "node:buffer";

import type { DrawPoint, DrawStrokePayload } from "@ai-arcade/shared";
import sharp from "sharp";

import type { DrawDuelImageSnapshot } from "./ai-guesser.js";

const snapshotWidth = 960;
const snapshotHeight = 600;
const backgroundColor = "#ffffff";

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

