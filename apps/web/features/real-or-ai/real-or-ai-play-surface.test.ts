import { describe, expect, it } from "vitest";

import type { RealOrAiRoundResultPayload } from "@ai-arcade/shared";

import {
  calculateContainedImageRect,
  createCandidateViewModels,
  formatResponseTime,
  getCandidateLabelById,
  getClampedContainMagnifierGeometry,
  getContainMagnifierGeometry,
  getRoundEntryForPlayer,
  getTopScorerSummary,
} from "./real-or-ai-play-helpers";

const candidates = [
  {
    alt: "Neutral candidate A",
    height: 800,
    id: "candidate-a",
    src: "/example/real-or-ai/placeholder/a.webp",
    width: 1200,
  },
  {
    alt: "Neutral candidate B",
    height: 800,
    id: "candidate-b",
    src: "/example/real-or-ai/placeholder/b.webp",
    width: 1200,
  },
] as const;

function createRoundResult(): RealOrAiRoundResultPayload {
  return {
    candidates: [
      {
        ...candidates[0],
        sourceType: "ai",
      },
      {
        ...candidates[1],
        sourceType: "real",
      },
    ],
    correctCandidateId: "candidate-b",
    endedAt: "2026-05-19T00:00:00.000Z",
    entries: [
      {
        isCorrect: true,
        nickname: "민수",
        playerId: "player-1",
        pointsAwarded: 141,
        responseTimeMs: 1800,
        selectedCandidateId: "candidate-b",
      },
      {
        isCorrect: false,
        nickname: "지아",
        playerId: "player-2",
        pointsAwarded: 0,
        responseTimeMs: 2400,
        selectedCandidateId: "candidate-a",
      },
    ],
    reason: "all-submitted",
    roomCode: "ABC123",
    roundId: "00000000-0000-4000-8000-000000000001",
    roundNumber: 1,
    topScorers: [
      {
        isCorrect: true,
        nickname: "민수",
        playerId: "player-1",
        pointsAwarded: 141,
        responseTimeMs: 1800,
        selectedCandidateId: "candidate-b",
      },
    ],
    totalRounds: 3,
  };
}

describe("Real or AI play surface helpers", () => {
  it("creates neutral candidate view models without hidden answer metadata", () => {
    const viewModels = createCandidateViewModels(candidates);

    expect(viewModels).toEqual([
      expect.objectContaining({
        imageAlt: "후보 A 사진",
        label: "A",
      }),
      expect.objectContaining({
        imageAlt: "후보 B 사진",
        label: "B",
      }),
    ]);
    expect(JSON.stringify(viewModels)).not.toContain("sourceType");
    expect(JSON.stringify(viewModels)).not.toContain("correctCandidateId");
  });

  it("maps candidate ids to stable A/B labels", () => {
    expect(getCandidateLabelById(candidates, "candidate-a")).toBe("A");
    expect(getCandidateLabelById(candidates, "candidate-b")).toBe("B");
    expect(getCandidateLabelById(candidates, "missing")).toBe("-");
    expect(getCandidateLabelById(candidates, undefined)).toBe("-");
  });

  it("summarizes player and top scorer round results", () => {
    const result = createRoundResult();

    expect(getRoundEntryForPlayer(result, "player-1")).toMatchObject({
      isCorrect: true,
      pointsAwarded: 141,
    });
    expect(getRoundEntryForPlayer(result, "missing")).toBeUndefined();
    expect(getTopScorerSummary(result)).toBe("민수 · 141점");
  });

  it("formats response times for result rows", () => {
    expect(formatResponseTime(1800)).toBe("1.80초");
    expect(formatResponseTime(undefined)).toBe("미제출");
  });

  it("calculates contained image geometry for the inline magnifier", () => {
    expect(calculateContainedImageRect(400, 300, 1600, 900)).toEqual({
      height: 225,
      left: 0,
      top: 37.5,
      width: 400,
    });

    const centered = getContainMagnifierGeometry({
      containerHeight: 300,
      containerWidth: 400,
      imageHeight: 900,
      imageWidth: 1600,
      lensSize: 144,
      pointerX: 200,
      pointerY: 150,
      zoom: 2,
    });

    expect(centered).toMatchObject({
      backgroundPosition: "-328px -153px",
      backgroundSize: "800px 450px",
      left: 200,
      sourceXRatio: 0.5,
      sourceYRatio: 0.5,
      top: 150,
    });

    expect(
      getContainMagnifierGeometry({
        containerHeight: 300,
        containerWidth: 400,
        imageHeight: 900,
        imageWidth: 1600,
        lensSize: 144,
        pointerX: 200,
        pointerY: 20,
        zoom: 2,
      }),
    ).toBeNull();
  });

  it("clamps the draggable magnifier to the contained image area", () => {
    const topLetterbox = getClampedContainMagnifierGeometry({
      containerHeight: 300,
      containerWidth: 400,
      imageHeight: 900,
      imageWidth: 1600,
      lensSize: 144,
      pointerX: 200,
      pointerY: 20,
      zoom: 2,
    });

    expect(topLetterbox).toMatchObject({
      backgroundPosition: "-328px 72px",
      backgroundSize: "800px 450px",
      left: 200,
      sourceXRatio: 0.5,
      sourceYRatio: 0,
      top: 37.5,
    });

    const rightEdge = getClampedContainMagnifierGeometry({
      containerHeight: 300,
      containerWidth: 400,
      imageHeight: 900,
      imageWidth: 1600,
      lensSize: 144,
      pointerX: 500,
      pointerY: 150,
      zoom: 2,
    });

    expect(rightEdge).toMatchObject({
      left: 400,
      sourceXRatio: 1,
      sourceYRatio: 0.5,
      top: 150,
    });
  });
});
