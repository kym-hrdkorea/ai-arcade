import type {
  RealOrAiPublicImageCandidate,
  RealOrAiRoundResultEntry,
  RealOrAiRoundResultPayload,
} from "@ai-arcade/shared";

type CandidateLabel = "A" | "B";

export type ContainedImageRect = {
  height: number;
  left: number;
  top: number;
  width: number;
};

export type MagnifierGeometry = {
  backgroundPosition: string;
  backgroundSize: string;
  left: number;
  sourceXRatio: number;
  sourceYRatio: number;
  top: number;
};

export type RealOrAiCandidateViewModel = {
  candidate: RealOrAiPublicImageCandidate;
  imageAlt: string;
  label: CandidateLabel;
};

export function createCandidateViewModels(
  candidates: readonly RealOrAiPublicImageCandidate[],
): RealOrAiCandidateViewModel[] {
  return candidates.slice(0, 2).map((candidate, index) => {
    const label = index === 0 ? "A" : "B";

    return {
      candidate,
      imageAlt: `후보 ${label} 사진`,
      label,
    };
  });
}

export function formatResponseTime(responseTimeMs: number | undefined): string {
  if (typeof responseTimeMs !== "number") {
    return "미제출";
  }

  return `${(responseTimeMs / 1000).toFixed(2)}초`;
}

export function calculateContainedImageRect(
  containerWidth: number,
  containerHeight: number,
  imageWidth: number,
  imageHeight: number,
): ContainedImageRect {
  if (containerWidth <= 0 || containerHeight <= 0 || imageWidth <= 0 || imageHeight <= 0) {
    return {
      height: Math.max(0, containerHeight),
      left: 0,
      top: 0,
      width: Math.max(0, containerWidth),
    };
  }

  const containerRatio = containerWidth / containerHeight;
  const imageRatio = imageWidth / imageHeight;

  if (imageRatio > containerRatio) {
    const height = containerWidth / imageRatio;

    return {
      height,
      left: 0,
      top: (containerHeight - height) / 2,
      width: containerWidth,
    };
  }

  const width = containerHeight * imageRatio;

  return {
    height: containerHeight,
    left: (containerWidth - width) / 2,
    top: 0,
    width,
  };
}

export function getContainMagnifierGeometry({
  containerHeight,
  containerWidth,
  imageHeight,
  imageWidth,
  lensSize,
  pointerX,
  pointerY,
  zoom,
}: {
  containerHeight: number;
  containerWidth: number;
  imageHeight: number;
  imageWidth: number;
  lensSize: number;
  pointerX: number;
  pointerY: number;
  zoom: number;
}): MagnifierGeometry | null {
  const imageRect = calculateContainedImageRect(
    containerWidth,
    containerHeight,
    imageWidth,
    imageHeight,
  );

  if (
    pointerX < imageRect.left ||
    pointerX > imageRect.left + imageRect.width ||
    pointerY < imageRect.top ||
    pointerY > imageRect.top + imageRect.height
  ) {
    return null;
  }

  const sourceXRatio = (pointerX - imageRect.left) / Math.max(1, imageRect.width);
  const sourceYRatio = (pointerY - imageRect.top) / Math.max(1, imageRect.height);
  const lensRadius = lensSize / 2;
  const scaledWidth = imageRect.width * zoom;
  const scaledHeight = imageRect.height * zoom;

  return {
    backgroundPosition: `${lensRadius - (sourceXRatio * scaledWidth)}px ${
      lensRadius - (sourceYRatio * scaledHeight)
    }px`,
    backgroundSize: `${scaledWidth}px ${scaledHeight}px`,
    left: imageRect.left + (sourceXRatio * imageRect.width),
    sourceXRatio,
    sourceYRatio,
    top: imageRect.top + (sourceYRatio * imageRect.height),
  };
}

export function getCandidateLabelById(
  candidates: readonly { id: string }[],
  candidateId: string | undefined,
): CandidateLabel | "-" {
  if (!candidateId) {
    return "-";
  }

  const index = candidates.findIndex((candidate) => candidate.id === candidateId);

  if (index === 0) {
    return "A";
  }

  if (index === 1) {
    return "B";
  }

  return "-";
}

export function getRoundEntryForPlayer(
  result: RealOrAiRoundResultPayload,
  playerId: string | null,
): RealOrAiRoundResultEntry | undefined {
  if (!playerId) {
    return undefined;
  }

  return result.entries.find((entry) => entry.playerId === playerId);
}

export function getTopScorerSummary(result: RealOrAiRoundResultPayload): string {
  const topScore = Math.max(...result.topScorers.map((entry) => entry.pointsAwarded), 0);

  if (topScore <= 0 || result.topScorers.length === 0) {
    return "이번 라운드 최고 점수 없음";
  }

  return `${result.topScorers.map((entry) => entry.nickname).join(", ")} · ${topScore}점`;
}
