import { describe, expect, it } from "vitest";

import {
  DEFAULT_REAL_OR_AI_SETTINGS,
  REAL_OR_AI_GAME_ID,
  REAL_OR_AI_MAX_PLAYERS,
  REAL_OR_AI_MIN_PLAYERS,
  realOrAiAnswerSubmitPayloadSchema,
  realOrAiGameStartPayloadSchema,
  realOrAiManifestSchema,
  realOrAiNextRoundPayloadSchema,
  realOrAiPrivateRoundItemSchema,
  realOrAiPublicRoundItemSchema,
  realOrAiResultViewPayloadSchema,
  realOrAiResultViewSchema,
  realOrAiResultViewSetPayloadSchema,
  realOrAiRoomCreatePayloadSchema,
  realOrAiRoomJoinPayloadSchema,
  realOrAiRoomRejoinPayloadSchema,
  realOrAiRoomResetPayloadSchema,
  realOrAiRoomStateSchema,
  realOrAiRoundStateSchema,
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

  it("validates result view transition payloads", () => {
    expect(realOrAiResultViewSchema.safeParse("answer").success).toBe(true);
    expect(realOrAiResultViewSchema.safeParse("score").success).toBe(true);
    expect(realOrAiResultViewSetPayloadSchema.safeParse({
      roomCode: "ABC123",
      roundId,
      view: "score",
    }).success).toBe(true);
    expect(realOrAiResultViewPayloadSchema.safeParse({
      roomCode: "ABC123",
      roundId,
      view: "score",
    }).success).toBe(true);
    expect(realOrAiResultViewSetPayloadSchema.safeParse({
      roomCode: "ABC123",
      roundId,
      view: "answer",
    }).success).toBe(false);
    expect(realOrAiResultViewSetPayloadSchema.safeParse({
      roomCode: "ABC123",
      roundId: "bad-round",
      view: "score",
    }).success).toBe(false);
  });

  it("validates room snapshots with result view and public results", () => {
    const roundState = {
      endsAt: "2026-05-19T00:01:00.000Z",
      item: publicRoundItem,
      resultView: "score",
      roundId,
      roundNumber: 1,
      startedAt: "2026-05-19T00:00:00.000Z",
      status: "round-result",
      totalRounds: 1,
    } as const;
    const roundResult = {
      candidates: [
        { ...publicRoundItem.candidates[0], sourceType: "real" },
        { ...publicRoundItem.candidates[1], sourceType: "ai" },
      ],
      correctCandidateId: realCandidate.id,
      endedAt: "2026-05-19T00:01:00.000Z",
      entries: [],
      reason: "time-up",
      roomCode: "ABC123",
      roundId,
      roundNumber: 1,
      topScorers: [],
      totalRounds: 1,
    } as const;
    const gameResult = {
      endedAt: "2026-05-19T00:02:00.000Z",
      results: [
        {
          correctCount: 0,
          nickname: "플레이어",
          playerId,
          rank: 1,
          totalScore: 0,
        },
      ],
      roomCode: "ABC123",
      rounds: [roundResult],
    };
    const roomState = {
      createdAt: "2026-05-19T00:00:00.000Z",
      currentRound: roundState,
      gameId: REAL_OR_AI_GAME_ID,
      hostPlayerId: playerId,
      maxPlayers: REAL_OR_AI_MAX_PLAYERS,
      minPlayers: REAL_OR_AI_MIN_PLAYERS,
      playableRoundCount: 1,
      players: [
        {
          connectionStatus: "connected",
          joinedAt: "2026-05-19T00:00:00.000Z",
          nickname: "플레이어",
          playerId,
          score: 0,
        },
      ],
      roundResult,
      roomCode: "ABC123",
      roomId: "33333333-3333-4333-8333-333333333333",
      settings: DEFAULT_REAL_OR_AI_SETTINGS,
      status: "round-result",
      updatedAt: "2026-05-19T00:01:00.000Z",
    } as const;

    expect(realOrAiRoundStateSchema.safeParse(roundState).success).toBe(true);
    expect(realOrAiRoomStateSchema.safeParse(roomState).success).toBe(true);
    expect(
      realOrAiRoomStateSchema.safeParse({
        ...roomState,
        currentRound: undefined,
        gameResult,
        roundResult: undefined,
        status: "final-result",
      }).success,
    ).toBe(true);
  });
});
