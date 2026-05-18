import { z } from "zod";

export const THREE_WORD_MONSTER_GAME_ID = "three-word-monster";
export const THREE_WORD_MONSTER_WORD_COUNT = 3;
export const THREE_WORD_MONSTER_MIN_PLAYERS = 2;
export const THREE_WORD_MONSTER_MAX_PLAYERS = 10;

export type ThreeWordMonsterRoomStatus =
  | "waiting"
  | "word-submission"
  | "image-generating"
  | "voting"
  | "revealing"
  | "result";

export type ThreeWordMonsterPlayerConnectionStatus =
  | "connected"
  | "disconnected";

export type ThreeWordMonsterImageProvider = "mock" | "openai";

export type ThreeWordMonsterSettings = {
  maxPlayers: typeof THREE_WORD_MONSTER_MAX_PLAYERS;
  wordCount: typeof THREE_WORD_MONSTER_WORD_COUNT;
};

export type ThreeWordMonsterPlayerState = {
  connectionStatus: ThreeWordMonsterPlayerConnectionStatus;
  joinedAt: string;
  nickname: string;
  playerId: string;
};

export type ThreeWordMonsterWords = [string, string, string];

export type ThreeWordMonsterSubmissionSummary = {
  nickname: string;
  playerId: string;
  submittedAt: string;
};

export type ThreeWordMonsterImageState = {
  generatedAt: string;
  imageDataUrl: string;
  monsterId: string;
  ownerNickname: string;
  ownerPlayerId: string;
  provider: ThreeWordMonsterImageProvider;
  words: ThreeWordMonsterWords;
};

export type ThreeWordMonsterVoteState = {
  submittedAt: string;
  targetMonsterId: string;
  voterPlayerId: string;
};

export type ThreeWordMonsterResultEntry = ThreeWordMonsterImageState & {
  isWinner: boolean;
  rank: number;
  votes: number;
};

export type ThreeWordMonsterResultPayload = {
  endedAt: string;
  entries: ThreeWordMonsterResultEntry[];
  isTie: boolean;
  roomCode: string;
  winners: ThreeWordMonsterResultEntry[];
};

export type ThreeWordMonsterRoomState = {
  createdAt: string;
  gameId: typeof THREE_WORD_MONSTER_GAME_ID;
  hostPlayerId: string;
  images: ThreeWordMonsterImageState[];
  maxPlayers: typeof THREE_WORD_MONSTER_MAX_PLAYERS;
  minPlayers: typeof THREE_WORD_MONSTER_MIN_PLAYERS;
  players: ThreeWordMonsterPlayerState[];
  result?: ThreeWordMonsterResultPayload;
  roomCode: string;
  roomId: string;
  settings: ThreeWordMonsterSettings;
  status: ThreeWordMonsterRoomStatus;
  submissions: ThreeWordMonsterSubmissionSummary[];
  updatedAt: string;
  votes: ThreeWordMonsterVoteState[];
};

export type ThreeWordMonsterRoomCreatePayload = {
  nickname: string;
};

export type ThreeWordMonsterRoomJoinPayload = {
  nickname: string;
  roomCode: string;
};

export type ThreeWordMonsterRoomRejoinPayload = {
  playerId: string;
  reconnectToken: string;
  roomCode: string;
};

export type ThreeWordMonsterRoomLeavePayload = {
  roomCode: string;
};

export type ThreeWordMonsterGameStartPayload = {
  roomCode: string;
};

export type ThreeWordMonsterWordsSubmitPayload = {
  playerId: string;
  roomCode: string;
  words: ThreeWordMonsterWords;
};

export type ThreeWordMonsterVoteSubmitPayload = {
  monsterId: string;
  playerId: string;
  roomCode: string;
};

export type ThreeWordMonsterRoomResetPayload = {
  roomCode: string;
};

export type ThreeWordMonsterRoomStatePayload = {
  room: ThreeWordMonsterRoomState;
};

export type ThreeWordMonsterRoomJoinedPayload = {
  currentPlayerId: string;
  reconnectToken: string;
  room: ThreeWordMonsterRoomState;
};

export type ThreeWordMonsterGameStartNoticePayload = {
  message: string;
  roomCode: string;
};

export type ThreeWordMonsterWordsSubmitResultPayload = {
  readyToGenerate: boolean;
  room: ThreeWordMonsterRoomState;
};

export type ThreeWordMonsterImageReadyPayload = {
  image: ThreeWordMonsterImageState;
  roomCode: string;
};

export type ThreeWordMonsterVotingStartPayload = {
  images: ThreeWordMonsterImageState[];
  roomCode: string;
};

export type ThreeWordMonsterVoteSubmittedPayload = {
  roomCode: string;
  totalVotes: number;
  vote: ThreeWordMonsterVoteState;
  voterCount: number;
};

const roomCodeLength = 6;

export const DEFAULT_THREE_WORD_MONSTER_SETTINGS = {
  maxPlayers: THREE_WORD_MONSTER_MAX_PLAYERS,
  wordCount: THREE_WORD_MONSTER_WORD_COUNT,
} satisfies ThreeWordMonsterSettings;

export const threeWordMonsterNicknameSchema = z
  .string()
  .trim()
  .min(2, "닉네임은 2글자 이상이어야 합니다.")
  .max(12, "닉네임은 12글자 이하로 입력해 주세요.");

export const threeWordMonsterRoomCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .length(roomCodeLength, "방 코드는 6자리입니다.")
  .regex(/^[A-Z0-9]+$/, "방 코드는 영문 대문자와 숫자만 사용할 수 있습니다.");

export const threeWordMonsterWordSchema = z
  .string()
  .trim()
  .min(1, "단어를 입력해 주세요.")
  .max(12, "단어는 12글자 이하로 입력해 주세요.")
  .regex(/^[0-9A-Za-z가-힣ㄱ-ㅎㅏ-ㅣ\s-]+$/, "단어에는 한글, 영문, 숫자만 사용할 수 있습니다.");

export const threeWordMonsterWordsSchema = z.tuple([
  threeWordMonsterWordSchema,
  threeWordMonsterWordSchema,
  threeWordMonsterWordSchema,
]);

export const threeWordMonsterRoomCreatePayloadSchema = z.object({
  nickname: threeWordMonsterNicknameSchema,
});

export const threeWordMonsterRoomJoinPayloadSchema = z.object({
  nickname: threeWordMonsterNicknameSchema,
  roomCode: threeWordMonsterRoomCodeSchema,
});

export const threeWordMonsterRoomRejoinPayloadSchema = z.object({
  playerId: z.string().uuid("playerId 형식을 확인해 주세요."),
  reconnectToken: z
    .string()
    .trim()
    .min(16, "reconnectToken이 필요합니다.")
    .max(120, "reconnectToken이 너무 깁니다.")
    .regex(/^[A-Za-z0-9_-]+$/, "reconnectToken 형식을 확인해 주세요."),
  roomCode: threeWordMonsterRoomCodeSchema,
});

export const threeWordMonsterRoomLeavePayloadSchema = z.object({
  roomCode: threeWordMonsterRoomCodeSchema,
});

export const threeWordMonsterGameStartPayloadSchema = z.object({
  roomCode: threeWordMonsterRoomCodeSchema,
});

export const threeWordMonsterWordsSubmitPayloadSchema = z.object({
  playerId: z.string().uuid("playerId 형식을 확인해 주세요."),
  roomCode: threeWordMonsterRoomCodeSchema,
  words: threeWordMonsterWordsSchema,
});

export const threeWordMonsterVoteSubmitPayloadSchema = z.object({
  monsterId: z.string().uuid("monsterId 형식을 확인해 주세요."),
  playerId: z.string().uuid("playerId 형식을 확인해 주세요."),
  roomCode: threeWordMonsterRoomCodeSchema,
});

export const threeWordMonsterRoomResetPayloadSchema = z.object({
  roomCode: threeWordMonsterRoomCodeSchema,
});
