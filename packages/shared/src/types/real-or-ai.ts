import { z } from "zod";

export const REAL_OR_AI_GAME_ID = "real-or-ai";
export const REAL_OR_AI_MIN_PLAYERS = 2;
export const REAL_OR_AI_MAX_PLAYERS = 100;
export const REAL_OR_AI_MAX_ROUNDS_HARD_LIMIT = 163;
export const REAL_OR_AI_ROUND_DURATION_OPTIONS = [5, 10, 15, 30, 45, 60] as const;
export const REAL_OR_AI_COUNTDOWN_SECONDS_OPTIONS = [3, 5, 10] as const;

export type RealOrAiRoundDurationSeconds =
  (typeof REAL_OR_AI_ROUND_DURATION_OPTIONS)[number];
export type RealOrAiCountdownSeconds =
  (typeof REAL_OR_AI_COUNTDOWN_SECONDS_OPTIONS)[number];

export type RealOrAiShuffleMode = "random";
export type RealOrAiAnswerLockMode = "first-submit";
export type RealOrAiImageSourceType = "real" | "ai";
export type RealOrAiRoomStatus =
  | "waiting"
  | "countdown"
  | "answering"
  | "round-result"
  | "final-result";
export type RealOrAiPlayerConnectionStatus = "connected" | "disconnected";
export type RealOrAiRoundEndReason = "time-up" | "all-submitted" | "operator-skip";

export type RealOrAiSettings = {
  answerLockMode: RealOrAiAnswerLockMode;
  countdownSeconds: RealOrAiCountdownSeconds;
  roundCount: number;
  roundDurationSeconds: RealOrAiRoundDurationSeconds;
  shuffleMode: RealOrAiShuffleMode;
};

export type RealOrAiPlayerState = {
  connectionStatus: RealOrAiPlayerConnectionStatus;
  joinedAt: string;
  nickname: string;
  playerId: string;
  score: number;
};

export type RealOrAiPrivateImageCandidate = {
  alt: string;
  height: number;
  id: string;
  sourceType: RealOrAiImageSourceType;
  src: string;
  width: number;
};

export type RealOrAiPublicImageCandidate = Omit<
  RealOrAiPrivateImageCandidate,
  "sourceType"
>;

export type RealOrAiPrivateRoundItem = {
  candidates: [RealOrAiPrivateImageCandidate, RealOrAiPrivateImageCandidate];
  category?: string;
  correctCandidateId: string;
  difficulty?: string;
  id: string;
  notes?: string;
  title?: string;
};

export type RealOrAiPublicRoundItem = {
  candidates: [RealOrAiPublicImageCandidate, RealOrAiPublicImageCandidate];
  category?: string;
  id: string;
  title?: string;
};

export type RealOrAiManifest = {
  items: RealOrAiPrivateRoundItem[];
  version: 1;
};

export type RealOrAiRoundState = {
  endsAt: string;
  item: RealOrAiPublicRoundItem;
  roundId: string;
  roundNumber: number;
  startedAt: string;
  status: "countdown" | "answering" | "round-result";
  totalRounds: number;
};

export type RealOrAiAnswerState = {
  isCorrect: boolean;
  playerId: string;
  pointsAwarded: number;
  responseTimeMs: number;
  selectedCandidateId?: string;
  submittedAt?: string;
};

export type RealOrAiRoomState = {
  createdAt: string;
  currentRound?: RealOrAiRoundState;
  gameId: typeof REAL_OR_AI_GAME_ID;
  hostPlayerId: string;
  maxPlayers: typeof REAL_OR_AI_MAX_PLAYERS;
  minPlayers: typeof REAL_OR_AI_MIN_PLAYERS;
  playableRoundCount: number;
  players: RealOrAiPlayerState[];
  roomCode: string;
  roomId: string;
  settings: RealOrAiSettings;
  status: RealOrAiRoomStatus;
  updatedAt: string;
};

export type RealOrAiRevealedImageCandidate = RealOrAiPublicImageCandidate & {
  sourceType: RealOrAiImageSourceType;
};

export type RealOrAiRoundResultEntry = {
  isCorrect: boolean;
  nickname: string;
  playerId: string;
  pointsAwarded: number;
  responseTimeMs?: number;
  selectedCandidateId?: string;
};

export type RealOrAiRoundResultPayload = {
  candidates: [RealOrAiRevealedImageCandidate, RealOrAiRevealedImageCandidate];
  correctCandidateId: string;
  endedAt: string;
  entries: RealOrAiRoundResultEntry[];
  reason: RealOrAiRoundEndReason;
  roomCode: string;
  roundId: string;
  roundNumber: number;
  topScorers: RealOrAiRoundResultEntry[];
  totalRounds: number;
};

export type RealOrAiGameResultEntry = {
  averageCorrectResponseMs?: number;
  correctCount: number;
  nickname: string;
  playerId: string;
  rank: number;
  totalScore: number;
};

export type RealOrAiGameResultPayload = {
  endedAt: string;
  results: RealOrAiGameResultEntry[];
  roomCode: string;
  rounds: RealOrAiRoundResultPayload[];
};

export type RealOrAiRoomCreatePayload = {
  nickname: string;
};

export type RealOrAiRoomJoinPayload = {
  nickname: string;
  roomCode: string;
};

export type RealOrAiRoomRejoinPayload = {
  playerId: string;
  reconnectToken: string;
  roomCode: string;
};

export type RealOrAiRoomLeavePayload = {
  roomCode: string;
};

export type RealOrAiSettingsUpdatePayload = {
  roomCode: string;
  settings: RealOrAiSettings;
};

export type RealOrAiGameStartPayload = {
  roomCode: string;
};

export type RealOrAiNextRoundPayload = {
  roomCode: string;
};

export type RealOrAiRoundSkipPayload = {
  roomCode: string;
};

export type RealOrAiRoomResetPayload = {
  roomCode: string;
};

export type RealOrAiAnswerSubmitPayload = {
  playerId: string;
  roomCode: string;
  roundId: string;
  selectedCandidateId: string;
};

export type RealOrAiRoomStatePayload = {
  room: RealOrAiRoomState;
};

export type RealOrAiRoomJoinedPayload = {
  currentPlayerId: string;
  reconnectToken: string;
  room: RealOrAiRoomState;
};

export type RealOrAiSettingsUpdatedPayload = {
  roomCode: string;
  settings: RealOrAiSettings;
};

export type RealOrAiGameStartNoticePayload = {
  message: string;
  roomCode: string;
};

export type RealOrAiCountdownPayload = {
  remainingSeconds: number;
  roomCode: string;
  startsAt: string;
};

export type RealOrAiRoundStartPayload = {
  round: RealOrAiRoundState;
  roomCode: string;
};

export type RealOrAiTimerTickPayload = {
  endsAt: string;
  remainingSeconds: number;
  roomCode: string;
  roundId: string;
};

export type RealOrAiAnswerAckPayload = {
  accepted: true;
  roomCode: string;
  roundId: string;
  selectedCandidateId: string;
  submittedAt: string;
};

export type RealOrAiAnswerCountPayload = {
  playerCount: number;
  roomCode: string;
  roundId: string;
  submittedCount: number;
};

export const DEFAULT_REAL_OR_AI_SETTINGS = {
  answerLockMode: "first-submit",
  countdownSeconds: 5,
  roundCount: 10,
  roundDurationSeconds: 45,
  shuffleMode: "random",
} satisfies RealOrAiSettings;

const realOrAiRoomCodeLength = 6;

export const realOrAiSafeIdSchema = z
  .string()
  .trim()
  .min(1, "id가 필요합니다.")
  .max(80, "id는 80자 이하로 입력해 주세요.")
  .regex(/^[A-Za-z0-9_-]+$/, "id는 영문, 숫자, -, _만 사용할 수 있습니다.");

export const realOrAiNicknameSchema = z
  .string()
  .trim()
  .min(2, "닉네임은 2글자 이상이어야 합니다.")
  .max(12, "닉네임은 12글자 이하로 입력해 주세요.");

export const realOrAiRoomCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .length(realOrAiRoomCodeLength, "방 코드는 6자리입니다.")
  .regex(/^[A-Z0-9]+$/, "방 코드는 영문 대문자와 숫자만 사용할 수 있습니다.");

export const realOrAiRoundDurationSecondsSchema = z.union(
  REAL_OR_AI_ROUND_DURATION_OPTIONS.map((duration) => z.literal(duration)) as [
    z.ZodLiteral<5>,
    z.ZodLiteral<10>,
    z.ZodLiteral<15>,
    z.ZodLiteral<30>,
    z.ZodLiteral<45>,
    z.ZodLiteral<60>,
  ],
);

export const realOrAiCountdownSecondsSchema = z.union(
  REAL_OR_AI_COUNTDOWN_SECONDS_OPTIONS.map((seconds) => z.literal(seconds)) as [
    z.ZodLiteral<3>,
    z.ZodLiteral<5>,
    z.ZodLiteral<10>,
  ],
);

export const realOrAiSettingsSchema = z
  .object({
    answerLockMode: z.literal("first-submit"),
    countdownSeconds: realOrAiCountdownSecondsSchema,
    roundCount: z
      .number()
      .int("라운드 수는 정수여야 합니다.")
      .min(1, "라운드 수는 1 이상이어야 합니다.")
      .max(REAL_OR_AI_MAX_ROUNDS_HARD_LIMIT, "라운드 수는 163 이하여야 합니다."),
    roundDurationSeconds: realOrAiRoundDurationSecondsSchema,
    shuffleMode: z.literal("random"),
  })
  .strict();

export const realOrAiPrivateImageCandidateSchema = z
  .object({
    alt: z.string().trim().min(1, "alt가 필요합니다.").max(120),
    height: z.number().int("height는 정수여야 합니다.").min(1).max(10000),
    id: realOrAiSafeIdSchema,
    sourceType: z.enum(["real", "ai"]),
    src: z.string().trim().min(1, "src가 필요합니다.").max(240),
    width: z.number().int("width는 정수여야 합니다.").min(1).max(10000),
  })
  .strict();

export const realOrAiPublicImageCandidateSchema = z
  .object({
    alt: z.string().trim().min(1, "alt가 필요합니다.").max(120),
    height: z.number().int("height는 정수여야 합니다.").min(1).max(10000),
    id: realOrAiSafeIdSchema,
    src: z.string().trim().min(1, "src가 필요합니다.").max(240),
    width: z.number().int("width는 정수여야 합니다.").min(1).max(10000),
  })
  .strict();

export const realOrAiPrivateRoundItemSchema = z
  .object({
    candidates: z.tuple([
      realOrAiPrivateImageCandidateSchema,
      realOrAiPrivateImageCandidateSchema,
    ]),
    category: z.string().trim().min(1).max(40).optional(),
    correctCandidateId: realOrAiSafeIdSchema,
    difficulty: z.string().trim().min(1).max(40).optional(),
    id: realOrAiSafeIdSchema,
    notes: z.string().trim().min(1).max(240).optional(),
    title: z.string().trim().min(1).max(80).optional(),
  })
  .strict()
  .superRefine((item, context) => {
    const candidateIds = item.candidates.map((candidate) => candidate.id);
    const uniqueCandidateIds = new Set(candidateIds);

    if (uniqueCandidateIds.size !== candidateIds.length) {
      context.addIssue({
        code: "custom",
        message: "후보 id는 item 안에서 고유해야 합니다.",
        path: ["candidates"],
      });
    }

    const realCandidates = item.candidates.filter(
      (candidate) => candidate.sourceType === "real",
    );
    const aiCandidates = item.candidates.filter(
      (candidate) => candidate.sourceType === "ai",
    );

    if (realCandidates.length !== 1 || aiCandidates.length !== 1) {
      context.addIssue({
        code: "custom",
        message: "후보는 real 1장과 ai 1장이어야 합니다.",
        path: ["candidates"],
      });
    }

    if (realCandidates[0]?.id !== item.correctCandidateId) {
      context.addIssue({
        code: "custom",
        message: "correctCandidateId는 real 후보를 가리켜야 합니다.",
        path: ["correctCandidateId"],
      });
    }
  });

export const realOrAiManifestSchema = z
  .object({
    items: z.array(realOrAiPrivateRoundItemSchema).min(1),
    version: z.literal(1),
  })
  .strict()
  .superRefine((manifest, context) => {
    const itemIds = new Set<string>();
    const candidateIds = new Set<string>();

    manifest.items.forEach((item, itemIndex) => {
      if (itemIds.has(item.id)) {
        context.addIssue({
          code: "custom",
          message: "manifest item id는 고유해야 합니다.",
          path: ["items", itemIndex, "id"],
        });
      }

      itemIds.add(item.id);

      item.candidates.forEach((candidate, candidateIndex) => {
        if (candidateIds.has(candidate.id)) {
          context.addIssue({
            code: "custom",
            message: "candidate id는 manifest 전체에서 고유해야 합니다.",
            path: ["items", itemIndex, "candidates", candidateIndex, "id"],
          });
        }

        candidateIds.add(candidate.id);
      });
    });
  });

export const realOrAiPublicRoundItemSchema = z
  .object({
    candidates: z.tuple([
      realOrAiPublicImageCandidateSchema,
      realOrAiPublicImageCandidateSchema,
    ]),
    category: z.string().trim().min(1).max(40).optional(),
    id: realOrAiSafeIdSchema,
    title: z.string().trim().min(1).max(80).optional(),
  })
  .strict();

export const realOrAiRoomStatusSchema = z.enum([
  "waiting",
  "countdown",
  "answering",
  "round-result",
  "final-result",
]);

export const realOrAiPlayerConnectionStatusSchema = z.enum([
  "connected",
  "disconnected",
]);

export const realOrAiRoundEndReasonSchema = z.enum([
  "time-up",
  "all-submitted",
  "operator-skip",
]);

export const realOrAiPlayerStateSchema = z
  .object({
    connectionStatus: realOrAiPlayerConnectionStatusSchema,
    joinedAt: z.string().datetime("joinedAt은 ISO 날짜 문자열이어야 합니다."),
    nickname: realOrAiNicknameSchema,
    playerId: z.string().uuid("playerId 형식을 확인해 주세요."),
    score: z.number().int("score는 정수여야 합니다.").min(0),
  })
  .strict();

export const realOrAiRoundStateSchema = z
  .object({
    endsAt: z.string().datetime("endsAt은 ISO 날짜 문자열이어야 합니다."),
    item: realOrAiPublicRoundItemSchema,
    roundId: z.string().uuid("roundId 형식을 확인해 주세요."),
    roundNumber: z.number().int().min(1),
    startedAt: z.string().datetime("startedAt은 ISO 날짜 문자열이어야 합니다."),
    status: z.enum(["countdown", "answering", "round-result"]),
    totalRounds: z.number().int().min(1).max(REAL_OR_AI_MAX_ROUNDS_HARD_LIMIT),
  })
  .strict();

export const realOrAiRoomStateSchema = z
  .object({
    createdAt: z.string().datetime("createdAt은 ISO 날짜 문자열이어야 합니다."),
    currentRound: realOrAiRoundStateSchema.optional(),
    gameId: z.literal(REAL_OR_AI_GAME_ID),
    hostPlayerId: z.string().uuid("hostPlayerId 형식을 확인해 주세요."),
    maxPlayers: z.literal(REAL_OR_AI_MAX_PLAYERS),
    minPlayers: z.literal(REAL_OR_AI_MIN_PLAYERS),
    playableRoundCount: z
      .number()
      .int("playableRoundCount는 정수여야 합니다.")
      .min(0)
      .max(REAL_OR_AI_MAX_ROUNDS_HARD_LIMIT),
    players: z.array(realOrAiPlayerStateSchema).max(REAL_OR_AI_MAX_PLAYERS),
    roomCode: realOrAiRoomCodeSchema,
    roomId: z.string().uuid("roomId 형식을 확인해 주세요."),
    settings: realOrAiSettingsSchema,
    status: realOrAiRoomStatusSchema,
    updatedAt: z.string().datetime("updatedAt은 ISO 날짜 문자열이어야 합니다."),
  })
  .strict();

export const realOrAiRevealedImageCandidateSchema = z
  .object({
    alt: z.string().trim().min(1, "alt가 필요합니다.").max(120),
    height: z.number().int("height는 정수여야 합니다.").min(1).max(10000),
    id: realOrAiSafeIdSchema,
    sourceType: z.enum(["real", "ai"]),
    src: z.string().trim().min(1, "src가 필요합니다.").max(240),
    width: z.number().int("width는 정수여야 합니다.").min(1).max(10000),
  })
  .strict();

export const realOrAiRoundResultEntrySchema = z
  .object({
    isCorrect: z.boolean(),
    nickname: realOrAiNicknameSchema,
    playerId: z.string().uuid("playerId 형식을 확인해 주세요."),
    pointsAwarded: z.number().int("pointsAwarded는 정수여야 합니다.").min(0),
    responseTimeMs: z.number().int().min(0).optional(),
    selectedCandidateId: realOrAiSafeIdSchema.optional(),
  })
  .strict();

export const realOrAiRoundResultPayloadSchema = z
  .object({
    candidates: z.tuple([
      realOrAiRevealedImageCandidateSchema,
      realOrAiRevealedImageCandidateSchema,
    ]),
    correctCandidateId: realOrAiSafeIdSchema,
    endedAt: z.string().datetime("endedAt은 ISO 날짜 문자열이어야 합니다."),
    entries: z.array(realOrAiRoundResultEntrySchema).max(REAL_OR_AI_MAX_PLAYERS),
    reason: realOrAiRoundEndReasonSchema,
    roomCode: realOrAiRoomCodeSchema,
    roundId: z.string().uuid("roundId 형식을 확인해 주세요."),
    roundNumber: z.number().int().min(1),
    topScorers: z.array(realOrAiRoundResultEntrySchema).max(REAL_OR_AI_MAX_PLAYERS),
    totalRounds: z.number().int().min(1).max(REAL_OR_AI_MAX_ROUNDS_HARD_LIMIT),
  })
  .strict();

export const realOrAiGameResultEntrySchema = z
  .object({
    averageCorrectResponseMs: z.number().int().min(0).optional(),
    correctCount: z.number().int().min(0),
    nickname: realOrAiNicknameSchema,
    playerId: z.string().uuid("playerId 형식을 확인해 주세요."),
    rank: z.number().int().min(1),
    totalScore: z.number().int().min(0),
  })
  .strict();

export const realOrAiGameResultPayloadSchema = z
  .object({
    endedAt: z.string().datetime("endedAt은 ISO 날짜 문자열이어야 합니다."),
    results: z.array(realOrAiGameResultEntrySchema).max(REAL_OR_AI_MAX_PLAYERS),
    roomCode: realOrAiRoomCodeSchema,
    rounds: z.array(realOrAiRoundResultPayloadSchema).max(REAL_OR_AI_MAX_ROUNDS_HARD_LIMIT),
  })
  .strict();

export const realOrAiRoomCreatePayloadSchema = z
  .object({
    nickname: realOrAiNicknameSchema,
  })
  .strict();

export const realOrAiRoomJoinPayloadSchema = z
  .object({
    nickname: realOrAiNicknameSchema,
    roomCode: realOrAiRoomCodeSchema,
  })
  .strict();

export const realOrAiRoomRejoinPayloadSchema = z
  .object({
    playerId: z.string().uuid("playerId 형식을 확인해 주세요."),
    reconnectToken: z
      .string()
      .trim()
      .min(16, "reconnectToken이 필요합니다.")
      .max(120, "reconnectToken이 너무 깁니다.")
      .regex(/^[A-Za-z0-9_-]+$/, "reconnectToken 형식을 확인해 주세요."),
    roomCode: realOrAiRoomCodeSchema,
  })
  .strict();

export const realOrAiRoomLeavePayloadSchema = z
  .object({
    roomCode: realOrAiRoomCodeSchema,
  })
  .strict();

export const realOrAiSettingsUpdatePayloadSchema = z
  .object({
    roomCode: realOrAiRoomCodeSchema,
    settings: realOrAiSettingsSchema,
  })
  .strict();

export const realOrAiGameStartPayloadSchema = z
  .object({
    roomCode: realOrAiRoomCodeSchema,
  })
  .strict();

export const realOrAiNextRoundPayloadSchema = z
  .object({
    roomCode: realOrAiRoomCodeSchema,
  })
  .strict();

export const realOrAiRoundSkipPayloadSchema = z
  .object({
    roomCode: realOrAiRoomCodeSchema,
  })
  .strict();

export const realOrAiRoomResetPayloadSchema = z
  .object({
    roomCode: realOrAiRoomCodeSchema,
  })
  .strict();

export const realOrAiAnswerSubmitPayloadSchema = z
  .object({
    playerId: z.string().uuid("playerId 형식을 확인해 주세요."),
    roomCode: realOrAiRoomCodeSchema,
    roundId: z.string().uuid("roundId 형식을 확인해 주세요."),
    selectedCandidateId: realOrAiSafeIdSchema,
  })
  .strict();

export const realOrAiRoomStatePayloadSchema = z
  .object({
    room: realOrAiRoomStateSchema,
  })
  .strict();

export const realOrAiRoomJoinedPayloadSchema = z
  .object({
    currentPlayerId: z.string().uuid("currentPlayerId 형식을 확인해 주세요."),
    reconnectToken: z
      .string()
      .trim()
      .min(16, "reconnectToken이 필요합니다.")
      .max(120, "reconnectToken이 너무 깁니다.")
      .regex(/^[A-Za-z0-9_-]+$/, "reconnectToken 형식을 확인해 주세요."),
    room: realOrAiRoomStateSchema,
  })
  .strict();

export const realOrAiSettingsUpdatedPayloadSchema = z
  .object({
    roomCode: realOrAiRoomCodeSchema,
    settings: realOrAiSettingsSchema,
  })
  .strict();

export const realOrAiGameStartNoticePayloadSchema = z
  .object({
    message: z.string().trim().min(1).max(120),
    roomCode: realOrAiRoomCodeSchema,
  })
  .strict();

export const realOrAiCountdownPayloadSchema = z
  .object({
    remainingSeconds: z.number().int().min(0).max(10),
    roomCode: realOrAiRoomCodeSchema,
    startsAt: z.string().datetime("startsAt은 ISO 날짜 문자열이어야 합니다."),
  })
  .strict();

export const realOrAiRoundStartPayloadSchema = z
  .object({
    roomCode: realOrAiRoomCodeSchema,
    round: realOrAiRoundStateSchema,
  })
  .strict();

export const realOrAiTimerTickPayloadSchema = z
  .object({
    endsAt: z.string().datetime("endsAt은 ISO 날짜 문자열이어야 합니다."),
    remainingSeconds: z.number().int().min(0).max(60),
    roomCode: realOrAiRoomCodeSchema,
    roundId: z.string().uuid("roundId 형식을 확인해 주세요."),
  })
  .strict();

export const realOrAiAnswerAckPayloadSchema = z
  .object({
    accepted: z.literal(true),
    roomCode: realOrAiRoomCodeSchema,
    roundId: z.string().uuid("roundId 형식을 확인해 주세요."),
    selectedCandidateId: realOrAiSafeIdSchema,
    submittedAt: z.string().datetime("submittedAt은 ISO 날짜 문자열이어야 합니다."),
  })
  .strict();

export const realOrAiAnswerCountPayloadSchema = z
  .object({
    playerCount: z.number().int().min(0).max(REAL_OR_AI_MAX_PLAYERS),
    roomCode: realOrAiRoomCodeSchema,
    roundId: z.string().uuid("roundId 형식을 확인해 주세요."),
    submittedCount: z.number().int().min(0).max(REAL_OR_AI_MAX_PLAYERS),
  })
  .strict();
