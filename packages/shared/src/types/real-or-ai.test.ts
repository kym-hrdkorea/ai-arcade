import { describe, expect, it } from "vitest";

import {
  DEFAULT_REAL_OR_AI_SETTINGS,
  realOrAiAnswerSubmitPayloadSchema,
  realOrAiGameStartPayloadSchema,
  realOrAiManifestSchema,
  realOrAiNextRoundPayloadSchema,
  realOrAiPrivateRoundItemSchema,
  realOrAiPublicRoundItemSchema,
  realOrAiRoomCreatePayloadSchema,
  realOrAiRoomJoinPayloadSchema,
  realOrAiRoomRejoinPayloadSchema,
  realOrAiRoomResetPayloadSchema,
  realOrAiRoundSkipPayloadSchema,
  realOrAiSettingsSchema,
  realOrAiSettingsUpdatePayloadSchema,
  realOrAiTimerTickPayloadSchema,
} from "./real-or-ai.js";

const playerId = "11111111-1111-4111-8111-111111111111";
const roundId = "22222222-2222-4222-8222-222222222222";

const realCandidate = {
  alt: "예시 후보 A",
  height: 800,
  id: "item-001-a",
  sourceType: "real",
  src: "/example/real-or-ai/placeholder/item-001-a.webp",
  width: 1200,
} as const;

const aiCandidate = {
  alt: "예시 후보 B",
  height: 800,
  id: "item-001-b",
  sourceType: "ai",
  src: "/example/real-or-ai/placeholder/item-001-b.webp",
  width: 1200,
} as const;

const privateRoundItem = {
  candidates: [realCandidate, aiCandidate],
  category: "placeholder",
  correctCandidateId: realCandidate.id,
  difficulty: "medium",
  id: "item-001",
  notes: "EXAMPLE ONLY",
  title: "예시 주제",
} as const;

const publicRoundItem = {
  candidates: [
    {
      alt: realCandidate.alt,
      height: realCandidate.height,
      id: realCandidate.id,
      src: realCandidate.src,
      width: realCandidate.width,
    },
    {
      alt: aiCandidate.alt,
      height: aiCandidate.height,
      id: aiCandidate.id,
      src: aiCandidate.src,
      width: aiCandidate.width,
    },
  ],
  category: "placeholder",
  id: privateRoundItem.id,
  title: privateRoundItem.title,
} as const;

describe("Real or AI shared schemas", () => {
  it("accepts default settings", () => {
    expect(realOrAiSettingsSchema.parse(DEFAULT_REAL_OR_AI_SETTINGS)).toEqual(
      DEFAULT_REAL_OR_AI_SETTINGS,
    );
    expect(DEFAULT_REAL_OR_AI_SETTINGS.roundDurationSeconds).toBe(45);
  });

  it("accepts only supported round durations", () => {
    for (const roundDurationSeconds of [5, 10, 15, 30, 45, 60]) {
      expect(
        realOrAiSettingsSchema.safeParse({
          ...DEFAULT_REAL_OR_AI_SETTINGS,
          roundDurationSeconds,
        }).success,
      ).toBe(true);
    }

    for (const roundDurationSeconds of [0, 20, 61]) {
      expect(
        realOrAiSettingsSchema.safeParse({
          ...DEFAULT_REAL_OR_AI_SETTINGS,
          roundDurationSeconds,
        }).success,
      ).toBe(false);
    }
  });

  it("accepts only supported countdown durations", () => {
    expect(DEFAULT_REAL_OR_AI_SETTINGS.countdownSeconds).toBe(5);

    for (const countdownSeconds of [3, 5, 10]) {
      expect(
        realOrAiSettingsSchema.safeParse({
          ...DEFAULT_REAL_OR_AI_SETTINGS,
          countdownSeconds,
        }).success,
      ).toBe(true);
    }

    for (const countdownSeconds of [0, 2, 11]) {
      expect(
        realOrAiSettingsSchema.safeParse({
          ...DEFAULT_REAL_OR_AI_SETTINGS,
          countdownSeconds,
        }).success,
      ).toBe(false);
    }
  });

  it("rejects round counts outside the hard limit", () => {
    expect(
      realOrAiSettingsSchema.safeParse({
        ...DEFAULT_REAL_OR_AI_SETTINGS,
        roundCount: 0,
      }).success,
    ).toBe(false);
    expect(
      realOrAiSettingsSchema.safeParse({
        ...DEFAULT_REAL_OR_AI_SETTINGS,
        roundCount: 164,
      }).success,
    ).toBe(false);
  });

  it("accepts a valid private manifest round item", () => {
    expect(realOrAiPrivateRoundItemSchema.parse(privateRoundItem)).toEqual(
      privateRoundItem,
    );
    expect(
      realOrAiManifestSchema.parse({
        items: [privateRoundItem],
        version: 1,
      }),
    ).toEqual({
      items: [privateRoundItem],
      version: 1,
    });
  });

  it("rejects private items without exactly two candidates", () => {
    expect(
      realOrAiPrivateRoundItemSchema.safeParse({
        ...privateRoundItem,
        candidates: [realCandidate],
      }).success,
    ).toBe(false);
    expect(
      realOrAiPrivateRoundItemSchema.safeParse({
        ...privateRoundItem,
        candidates: [realCandidate, aiCandidate, { ...aiCandidate, id: "item-001-c" }],
      }).success,
    ).toBe(false);
  });

  it("rejects private items without one real and one ai candidate", () => {
    expect(
      realOrAiPrivateRoundItemSchema.safeParse({
        ...privateRoundItem,
        candidates: [realCandidate, { ...realCandidate, id: "item-001-c" }],
      }).success,
    ).toBe(false);
    expect(
      realOrAiPrivateRoundItemSchema.safeParse({
        ...privateRoundItem,
        candidates: [aiCandidate, { ...aiCandidate, id: "item-001-c" }],
      }).success,
    ).toBe(false);
  });

  it("rejects private items when the correct candidate points to ai", () => {
    expect(
      realOrAiPrivateRoundItemSchema.safeParse({
        ...privateRoundItem,
        correctCandidateId: aiCandidate.id,
      }).success,
    ).toBe(false);
  });

  it("accepts public round item data without answer metadata", () => {
    expect(realOrAiPublicRoundItemSchema.parse(publicRoundItem)).toEqual(
      publicRoundItem,
    );
  });

  it("rejects public round item data that leaks source or answer metadata", () => {
    expect(
      realOrAiPublicRoundItemSchema.safeParse({
        ...publicRoundItem,
        candidates: [
          { ...publicRoundItem.candidates[0], sourceType: "real" },
          publicRoundItem.candidates[1],
        ],
      }).success,
    ).toBe(false);
    expect(
      realOrAiPublicRoundItemSchema.safeParse({
        ...publicRoundItem,
        correctCandidateId: realCandidate.id,
      }).success,
    ).toBe(false);
  });

  it("validates room lifecycle payloads", () => {
    expect(
      realOrAiRoomCreatePayloadSchema.safeParse({
        nickname: "host",
      }).success,
    ).toBe(true);
    expect(
      realOrAiRoomJoinPayloadSchema.safeParse({
        nickname: "guest",
        roomCode: "abc123",
      }).success,
    ).toBe(true);
    expect(
      realOrAiRoomRejoinPayloadSchema.safeParse({
        playerId,
        reconnectToken: "valid_token_123456",
        roomCode: "ABC123",
      }).success,
    ).toBe(true);
  });

  it("validates host operation and answer payloads", () => {
    expect(
      realOrAiSettingsUpdatePayloadSchema.safeParse({
        roomCode: "ABC123",
        settings: DEFAULT_REAL_OR_AI_SETTINGS,
      }).success,
    ).toBe(true);
    expect(
      realOrAiGameStartPayloadSchema.safeParse({
        roomCode: "ABC123",
      }).success,
    ).toBe(true);
    expect(
      realOrAiAnswerSubmitPayloadSchema.safeParse({
        playerId,
        roomCode: "ABC123",
        roundId,
        selectedCandidateId: "item-001-a",
      }).success,
    ).toBe(true);
    expect(
      realOrAiAnswerSubmitPayloadSchema.safeParse({
        playerId,
        roomCode: "ABC123",
        roundId,
        selectedCandidateId: "not a safe id",
      }).success,
    ).toBe(false);
  });

  it("allows long round timer ticks up to 60 seconds", () => {
    expect(
      realOrAiTimerTickPayloadSchema.safeParse({
        endsAt: "2026-05-19T00:01:00.000Z",
        remainingSeconds: 60,
        roomCode: "ABC123",
        roundId,
      }).success,
    ).toBe(true);

    expect(
      realOrAiTimerTickPayloadSchema.safeParse({
        endsAt: "2026-05-19T00:01:00.000Z",
        remainingSeconds: 61,
        roomCode: "ABC123",
        roundId,
      }).success,
    ).toBe(false);
  });

  it("validates next round, round skip, and reset payloads", () => {
    for (const schema of [
      realOrAiNextRoundPayloadSchema,
      realOrAiRoundSkipPayloadSchema,
      realOrAiRoomResetPayloadSchema,
    ]) {
      expect(schema.safeParse({ roomCode: "ABC123" }).success).toBe(true);
      expect(schema.safeParse({ roomCode: "TOO-LONG" }).success).toBe(false);
    }
  });
});
