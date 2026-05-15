import { Buffer } from "node:buffer";

import type { DrawStrokePayload } from "@ai-arcade/shared";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { renderDrawDuelSnapshot } from "./draw-duel-snapshot-renderer.js";

const roomCode = "ABC123";
const playerId = "00000000-0000-4000-8000-000000000001";

function createStroke(
  overrides: Partial<DrawStrokePayload> = {},
): DrawStrokePayload {
  return {
    roomCode,
    strokeId: "stroke-1",
    playerId,
    points: [
      {
        x: 120,
        y: 140,
        t: 1,
      },
      {
        x: 180,
        y: 190,
        t: 2,
      },
    ],
    color: "#22d3ee",
    width: 8,
    tool: "pen",
    isComplete: true,
    ...overrides,
  };
}

function decodeSnapshotData(data: string): Buffer {
  const encoded = data.replace(/^data:image\/png;base64,/, "");
  return Buffer.from(encoded, "base64");
}

describe("renderDrawDuelSnapshot", () => {
  it("renders stroke history as a 960x600 PNG data URL", async () => {
    const snapshot = await renderDrawDuelSnapshot([createStroke()]);
    const buffer = decodeSnapshotData(snapshot.data);
    const metadata = await sharp(buffer).metadata();

    expect(snapshot.mimeType).toBe("image/png");
    expect(snapshot.width).toBe(960);
    expect(snapshot.height).toBe(600);
    expect(snapshot.strokeCount).toBe(1);
    expect(snapshot.byteLength).toBe(buffer.byteLength);
    expect(snapshot.data).toMatch(/^data:image\/png;base64,/);
    expect(buffer.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
    expect(metadata.format).toBe("png");
    expect(metadata.width).toBe(960);
    expect(metadata.height).toBe(600);
  });

  it("handles eraser strokes, single-point strokes, and an empty canvas", async () => {
    const singlePoint = createStroke({
      strokeId: "single-point",
      points: [{ x: 220, y: 240, t: 1 }],
    });
    const eraser = createStroke({
      strokeId: "eraser",
      tool: "eraser",
      points: [
        { x: 100, y: 100, t: 1 },
        { x: 130, y: 130, t: 2 },
      ],
    });

    const drawnSnapshot = await renderDrawDuelSnapshot([singlePoint, eraser]);
    const emptySnapshot = await renderDrawDuelSnapshot([]);

    expect(drawnSnapshot.strokeCount).toBe(2);
    expect(drawnSnapshot.byteLength).toBeGreaterThan(0);
    expect(emptySnapshot.strokeCount).toBe(0);
    expect(emptySnapshot.byteLength).toBeGreaterThan(0);
  });
});

