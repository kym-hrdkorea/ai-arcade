import { z } from "zod";

import type * as ThreeWordMonster from "./three-word-monster.js";

export const DRAW_DUEL_GAME_ID = "draw-duel";
export const ROOM_CODE_LENGTH = 6;
export const ROOM_MIN_PLAYERS = 2;
export const ROOM_MAX_PLAYERS = 10;

export type RoomStatus = "waiting" | "playing" | "ended";
export type PlayerConnectionStatus = "connected" | "disconnected";
export type DrawDuelDrawerMode = "host-only" | "rotate";

export const DRAW_DUEL_MAX_ROUNDS_MIN = 1;
export const DRAW_DUEL_MAX_ROUNDS_MAX = 10;
export const DRAW_DUEL_ROUND_DURATION_OPTIONS = [30, 45, 60, 90] as const;
export const DEFAULT_DRAW_DUEL_SETTINGS = {
  drawerMode: "host-only",
  maxRounds: 5,
  roundDurationSeconds: 45,
} satisfies DrawDuelSettings;

export type DrawDuelRoundDurationSeconds =
  (typeof DRAW_DUEL_ROUND_DURATION_OPTIONS)[number];

export type DrawDuelSettings = {
  drawerMode: DrawDuelDrawerMode;
  maxRounds: number;
  roundDurationSeconds: DrawDuelRoundDurationSeconds;
};

export type PlayerState = {
  connectionStatus: PlayerConnectionStatus;
  playerId: string;
  nickname: string;
  joinedAt: string;
};

export type RoomState = {
  roomId: string;
  roomCode: string;
  gameId: typeof DRAW_DUEL_GAME_ID;
  status: RoomStatus;
  hostPlayerId: string;
  settings: DrawDuelSettings;
  players: PlayerState[];
  minPlayers: number;
  maxPlayers: number;
  createdAt: string;
  updatedAt: string;
};

export type ErrorPayload = {
  code: string;
  message: string;
};

export type DrawTool = "pen" | "eraser";

export type DrawPoint = {
  x: number;
  y: number;
  t: number;
};

export type DrawStrokePayload = {
  roomCode: string;
  strokeId: string;
  playerId: string;
  points: DrawPoint[];
  color: string;
  width: number;
  tool: DrawTool;
  isComplete: boolean;
};

export type DrawClearPayload = {
  roomCode: string;
  playerId: string;
  clearedAt: string;
};

export type DrawStrokeHistoryPayload = {
  roomCode: string;
  strokes: DrawStrokePayload[];
};

export type DrawDuelRoundStatus = "drawing" | "ai-guessing" | "result";

export type DrawDuelRoundEndReason =
  | "time-up"
  | "all-correct"
  | "all-submitted"
  | "drawer-left"
  | "not-enough-players"
  | "operator-skip";

export type DrawDuelRoundState = {
  roundId: string;
  roundNumber: number;
  totalRounds: number;
  drawerPlayerId: string;
  status: DrawDuelRoundStatus;
  startedAt: string;
  endsAt: string;
};

export type DrawDuelGuessSource = "player" | "ai";

export type DrawDuelScoreEntry = {
  playerId: string;
  nickname: string;
  score: number;
  source: DrawDuelGuessSource;
};

export type DrawDuelScoreState = {
  roomCode: string;
  scores: DrawDuelScoreEntry[];
};

export type DrawDuelRoundStatePayload = {
  roomCode: string;
  round: DrawDuelRoundState;
  scores: DrawDuelScoreEntry[];
};

export type DrawDuelWordPayload = {
  roomCode: string;
  roundId: string;
  drawerPlayerId: string;
  word: string;
};

export type DrawDuelTimerTickPayload = {
  roomCode: string;
  roundId: string;
  remainingSeconds: number;
  endsAt: string;
};

export type DrawDuelAIThinkingPayload = {
  roomCode: string;
  roundId: string;
  stepIndex: number;
  totalSteps: number;
  text: string;
};

export type DrawGuessSubmitPayload = {
  roomCode: string;
  roundId: string;
  playerId: string;
  text: string;
};

export type DrawDuelGuessLogPayload = {
  roomCode: string;
  roundId: string;
  guessId: string;
  playerId: string;
  nickname: string;
  source: DrawDuelGuessSource;
  text: string;
  isCorrect: boolean;
  pointsAwarded: number;
  confidence?: number;
  submittedAt: string;
};

export type DrawDuelRoundWinner = "AI WIN" | "HUMAN WIN" | "DRAW";

export type DrawDuelResultSlide = "ai-answer" | "showdown" | "human-answers";

export type DrawDuelTeamScore = {
  ai: number;
  human: number;
};

export type DrawDuelTeamResult = {
  aiCorrect: boolean;
  humanCorrectCount: number;
  humanSubmittedCount: number;
  humanTargetCount: number;
  humanCorrectRate: number;
  winner: DrawDuelRoundWinner;
  roundTeamScores: DrawDuelTeamScore;
  cumulativeTeamScores: DrawDuelTeamScore;
};

export type DrawDuelRoundResultPayload = {
  roomCode: string;
  roundId: string;
  roundNumber: number;
  totalRounds: number;
  correctWord: string;
  reason: DrawDuelRoundEndReason;
  guesses: DrawDuelGuessLogPayload[];
  scores: DrawDuelScoreEntry[];
  teamResult: DrawDuelTeamResult;
  endedAt: string;
};

export type DrawDuelNextRoundPayload = {
  roomCode: string;
};

export type DrawDuelGameResultEntry = DrawDuelScoreEntry & {
  rank: number;
};

export type DrawDuelGameResultPayload = {
  roomCode: string;
  results: DrawDuelGameResultEntry[];
  rounds: DrawDuelRoundResultPayload[];
  endedAt: string;
};

export type RoomCreatePayload = {
  gameId: typeof DRAW_DUEL_GAME_ID;
  nickname: string;
};

export type RoomJoinPayload = {
  roomCode: string;
  nickname: string;
};

export type RoomRejoinPayload = {
  roomCode: string;
  playerId: string;
  reconnectToken: string;
};

export type RoomLeavePayload = {
  roomCode: string;
};

export type RoomStatePayload = {
  room: RoomState;
};

export type RoomJoinedPayload = {
  room: RoomState;
  currentPlayerId: string;
  reconnectToken: string;
};

export type GameStartPayload = {
  roomCode: string;
};

export type DrawDuelRoundSkipPayload = {
  roomCode: string;
};

export type DrawDuelResultSlideSetPayload = {
  roomCode: string;
  roundId: string;
  slide: DrawDuelResultSlide;
};

export type DrawDuelRoomResetPayload = {
  roomCode: string;
};

export type DrawDuelSettingsUpdatePayload = {
  roomCode: string;
  settings: DrawDuelSettings;
};

export type GameStartNoticePayload = {
  roomCode: string;
  message: string;
};

export type ServerReadyPayload = {
  socketId: string;
  message: string;
};

export type EventResponse<T> =
  | {
      ok: true;
      data: T;
    }
  | {
      ok: false;
      error: ErrorPayload;
    };

export type EventAck<T> = (response: EventResponse<T>) => void;

export type ClientToServerEvents = {
  "room:create": (
    payload: RoomCreatePayload,
    ack?: EventAck<RoomJoinedPayload>,
  ) => void;
  "room:join": (payload: RoomJoinPayload, ack?: EventAck<RoomJoinedPayload>) => void;
  "room:rejoin": (
    payload: RoomRejoinPayload,
    ack?: EventAck<RoomJoinedPayload>,
  ) => void;
  "room:leave": (payload: RoomLeavePayload, ack?: EventAck<{ left: true }>) => void;
  "game:start": (
    payload: GameStartPayload,
    ack?: EventAck<GameStartNoticePayload>,
  ) => void;
  "draw-duel:stroke": (
    payload: DrawStrokePayload,
    ack?: EventAck<{ accepted: true }>,
  ) => void;
  "draw-duel:canvas-clear": (
    payload: DrawClearPayload,
    ack?: EventAck<{ cleared: true }>,
  ) => void;
  "draw-duel:guess-submit": (
    payload: DrawGuessSubmitPayload,
    ack?: EventAck<DrawDuelGuessLogPayload>,
  ) => void;
  "draw-duel:next-round": (
    payload: DrawDuelNextRoundPayload,
    ack?: EventAck<DrawDuelRoundStatePayload | DrawDuelGameResultPayload>,
  ) => void;
  "draw-duel:round-skip": (
    payload: DrawDuelRoundSkipPayload,
    ack?: EventAck<DrawDuelRoundStatePayload>,
  ) => void;
  "draw-duel:result-slide-set": (
    payload: DrawDuelResultSlideSetPayload,
    ack?: EventAck<{ accepted: true }>,
  ) => void;
  "draw-duel:room-reset": (
    payload: DrawDuelRoomResetPayload,
    ack?: EventAck<RoomStatePayload>,
  ) => void;
  "draw-duel:settings-update": (
    payload: DrawDuelSettingsUpdatePayload,
    ack?: EventAck<RoomStatePayload>,
  ) => void;
  "three-word-monster:room-create": (
    payload: ThreeWordMonster.ThreeWordMonsterRoomCreatePayload,
    ack?: EventAck<ThreeWordMonster.ThreeWordMonsterRoomJoinedPayload>,
  ) => void;
  "three-word-monster:room-join": (
    payload: ThreeWordMonster.ThreeWordMonsterRoomJoinPayload,
    ack?: EventAck<ThreeWordMonster.ThreeWordMonsterRoomJoinedPayload>,
  ) => void;
  "three-word-monster:room-rejoin": (
    payload: ThreeWordMonster.ThreeWordMonsterRoomRejoinPayload,
    ack?: EventAck<ThreeWordMonster.ThreeWordMonsterRoomJoinedPayload>,
  ) => void;
  "three-word-monster:room-leave": (
    payload: ThreeWordMonster.ThreeWordMonsterRoomLeavePayload,
    ack?: EventAck<{ left: true }>,
  ) => void;
  "three-word-monster:game-start": (
    payload: ThreeWordMonster.ThreeWordMonsterGameStartPayload,
    ack?: EventAck<ThreeWordMonster.ThreeWordMonsterGameStartNoticePayload>,
  ) => void;
  "three-word-monster:words-submit": (
    payload: ThreeWordMonster.ThreeWordMonsterWordsSubmitPayload,
    ack?: EventAck<ThreeWordMonster.ThreeWordMonsterWordsSubmitResultPayload>,
  ) => void;
  "three-word-monster:vote-submit": (
    payload: ThreeWordMonster.ThreeWordMonsterVoteSubmitPayload,
    ack?: EventAck<ThreeWordMonster.ThreeWordMonsterVoteSubmittedPayload>,
  ) => void;
  "three-word-monster:room-reset": (
    payload: ThreeWordMonster.ThreeWordMonsterRoomResetPayload,
    ack?: EventAck<ThreeWordMonster.ThreeWordMonsterRoomStatePayload>,
  ) => void;
};

export type ServerToClientEvents = {
  "server:ready": (payload: ServerReadyPayload) => void;
  "room:state": (payload: RoomStatePayload) => void;
  "game:start": (payload: GameStartNoticePayload) => void;
  "draw-duel:stroke": (payload: DrawStrokePayload) => void;
  "draw-duel:canvas-clear": (payload: DrawClearPayload) => void;
  "draw-duel:stroke-history": (payload: DrawStrokeHistoryPayload) => void;
  "draw-duel:round-state": (payload: DrawDuelRoundStatePayload) => void;
  "draw-duel:word": (payload: DrawDuelWordPayload) => void;
  "draw-duel:timer-tick": (payload: DrawDuelTimerTickPayload) => void;
  "draw-duel:guess-log": (payload: DrawDuelGuessLogPayload) => void;
  "draw-duel:ai-thinking": (payload: DrawDuelAIThinkingPayload) => void;
  "draw-duel:ai-guess": (payload: DrawDuelGuessLogPayload) => void;
  "draw-duel:round-result": (payload: DrawDuelRoundResultPayload) => void;
  "draw-duel:result-slide-set": (payload: DrawDuelResultSlideSetPayload) => void;
  "draw-duel:game-result": (payload: DrawDuelGameResultPayload) => void;
  "three-word-monster:room-state": (
    payload: ThreeWordMonster.ThreeWordMonsterRoomStatePayload,
  ) => void;
  "three-word-monster:game-start": (
    payload: ThreeWordMonster.ThreeWordMonsterGameStartNoticePayload,
  ) => void;
  "three-word-monster:image-ready": (
    payload: ThreeWordMonster.ThreeWordMonsterImageReadyPayload,
  ) => void;
  "three-word-monster:voting-start": (
    payload: ThreeWordMonster.ThreeWordMonsterVotingStartPayload,
  ) => void;
  "three-word-monster:vote-submitted": (
    payload: ThreeWordMonster.ThreeWordMonsterVoteSubmittedPayload,
  ) => void;
  "three-word-monster:result": (
    payload: ThreeWordMonster.ThreeWordMonsterResultPayload,
  ) => void;
  "three-word-monster:error": (payload: ErrorPayload) => void;
  error: (payload: ErrorPayload) => void;
};

export const nicknameSchema = z
  .string()
  .trim()
  .min(2, "닉네임은 2글자 이상이어야 합니다.")
  .max(12, "닉네임은 12글자 이하로 입력해 주세요.");

export const roomCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .length(ROOM_CODE_LENGTH, "방 코드는 6자리입니다.")
  .regex(/^[A-Z0-9]+$/, "방 코드는 영문 대문자와 숫자만 사용할 수 있습니다.");

export const gameIdSchema = z.literal(DRAW_DUEL_GAME_ID);

export const roomCreatePayloadSchema = z.object({
  gameId: gameIdSchema,
  nickname: nicknameSchema,
});

export const roomJoinPayloadSchema = z.object({
  roomCode: roomCodeSchema,
  nickname: nicknameSchema,
});

export const roomRejoinPayloadSchema = z.object({
  roomCode: roomCodeSchema,
  playerId: z.string().uuid("playerId format is invalid."),
  reconnectToken: z
    .string()
    .trim()
    .min(16, "reconnectToken is required.")
    .max(120, "reconnectToken is too long.")
    .regex(/^[A-Za-z0-9_-]+$/, "reconnectToken format is invalid."),
});

export const roomLeavePayloadSchema = z.object({
  roomCode: roomCodeSchema,
});

export const gameStartPayloadSchema = z.object({
  roomCode: roomCodeSchema,
});

export const drawDuelDrawerModeSchema = z.enum(["host-only", "rotate"]);

export const drawDuelRoundDurationSecondsSchema = z.union(
  DRAW_DUEL_ROUND_DURATION_OPTIONS.map((duration) => z.literal(duration)) as [
    z.ZodLiteral<30>,
    z.ZodLiteral<45>,
    z.ZodLiteral<60>,
    z.ZodLiteral<90>,
  ],
);

export const drawDuelSettingsSchema = z.object({
  drawerMode: drawDuelDrawerModeSchema,
  maxRounds: z
    .number()
    .int("라운드 수는 정수여야 합니다.")
    .min(DRAW_DUEL_MAX_ROUNDS_MIN, "라운드 수는 1 이상이어야 합니다.")
    .max(DRAW_DUEL_MAX_ROUNDS_MAX, "라운드 수는 10 이하여야 합니다."),
  roundDurationSeconds: drawDuelRoundDurationSecondsSchema,
});

export const drawDuelSettingsUpdatePayloadSchema = z.object({
  roomCode: roomCodeSchema,
  settings: drawDuelSettingsSchema,
});

export const drawToolSchema = z.enum(["pen", "eraser"]);

export const drawPointSchema = z.object({
  x: z.number().finite().min(0).max(960),
  y: z.number().finite().min(0).max(600),
  t: z.number().finite().min(0),
});

export const drawStrokePayloadSchema = z.object({
  roomCode: roomCodeSchema,
  strokeId: z
    .string()
    .trim()
    .min(1, "strokeId가 필요합니다.")
    .max(80, "strokeId는 80자 이하로 입력해 주세요.")
    .regex(/^[A-Za-z0-9_-]+$/, "strokeId는 영문, 숫자, -, _만 사용할 수 있습니다."),
  playerId: z.string().uuid("playerId 형식을 확인해 주세요."),
  points: z.array(drawPointSchema).min(1, "최소 1개 이상의 좌표가 필요합니다.").max(128),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9A-Fa-f]{6}$/, "색상은 #RRGGBB 형식이어야 합니다."),
  width: z.number().finite().min(1).max(48),
  tool: drawToolSchema,
  isComplete: z.boolean(),
});

export const drawClearPayloadSchema = z.object({
  roomCode: roomCodeSchema,
  playerId: z.string().uuid("playerId 형식을 확인해 주세요."),
  clearedAt: z.string().datetime("clearedAt은 ISO 날짜 문자열이어야 합니다."),
});

export const drawGuessSubmitPayloadSchema = z.object({
  roomCode: roomCodeSchema,
  roundId: z.string().uuid("roundId 형식을 확인해 주세요."),
  playerId: z.string().uuid("playerId 형식을 확인해 주세요."),
  text: z.string().trim().min(1, "정답을 입력해 주세요.").max(40, "정답은 40자 이하로 입력해 주세요."),
});

export const drawDuelNextRoundPayloadSchema = z.object({
  roomCode: roomCodeSchema,
});

export const drawDuelRoundSkipPayloadSchema = z.object({
  roomCode: roomCodeSchema,
});

export const drawDuelResultSlideSchema = z.enum([
  "ai-answer",
  "showdown",
  "human-answers",
]);

export const drawDuelResultSlideSetPayloadSchema = z.object({
  roomCode: roomCodeSchema,
  roundId: z.string().uuid("roundId 형식을 확인해 주세요."),
  slide: drawDuelResultSlideSchema,
});

export const drawDuelRoomResetPayloadSchema = z.object({
  roomCode: roomCodeSchema,
});
