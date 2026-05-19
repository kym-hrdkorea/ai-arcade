import type { RealOrAiPrivateRoundItem } from "@ai-arcade/shared";

export const realOrAiPlaceholderRoundItems: RealOrAiPrivateRoundItem[] = [
  {
    candidates: [
      {
        alt: "Placeholder photo candidate A",
        height: 800,
        id: "placeholder-001-a",
        sourceType: "real",
        src: "/example/real-or-ai/placeholder/placeholder-001-a.webp",
        width: 1200,
      },
      {
        alt: "Placeholder photo candidate B",
        height: 800,
        id: "placeholder-001-b",
        sourceType: "ai",
        src: "/example/real-or-ai/placeholder/placeholder-001-b.webp",
        width: 1200,
      },
    ],
    category: "placeholder",
    correctCandidateId: "placeholder-001-a",
    id: "placeholder-001",
    notes: "Temporary server fixture for Phase 4 socket flow tests only.",
    title: "Placeholder pair 1",
  },
  {
    candidates: [
      {
        alt: "Placeholder photo candidate A",
        height: 900,
        id: "placeholder-002-a",
        sourceType: "ai",
        src: "/example/real-or-ai/placeholder/placeholder-002-a.webp",
        width: 1200,
      },
      {
        alt: "Placeholder photo candidate B",
        height: 900,
        id: "placeholder-002-b",
        sourceType: "real",
        src: "/example/real-or-ai/placeholder/placeholder-002-b.webp",
        width: 1200,
      },
    ],
    category: "placeholder",
    correctCandidateId: "placeholder-002-b",
    id: "placeholder-002",
    notes: "Temporary server fixture for Phase 4 socket flow tests only.",
    title: "Placeholder pair 2",
  },
];
