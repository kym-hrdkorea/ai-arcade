import { randomInt, randomUUID } from "node:crypto";

import {
  DEFAULT_DRAW_DUEL_SETTINGS,
  DRAW_DUEL_GAME_ID,
  ROOM_MAX_PLAYERS,
  ROOM_MIN_PLAYERS,
  drawClearPayloadSchema,
  drawDuelNextRoundPayloadSchema,
  drawDuelResultSlideSetPayloadSchema,
  drawDuelRoomResetPayloadSchema,
  drawDuelRoundSkipPayloadSchema,
  drawDuelSettingsUpdatePayloadSchema,
  drawGuessSubmitPayloadSchema,
  drawStrokePayloadSchema,
  gameStartPayloadSchema,
  roomCreatePayloadSchema,
  roomJoinPayloadSchema,
  roomRejoinPayloadSchema,
  type DrawClearPayload,
  type DrawDuelGameResultEntry,
  type DrawDuelGameResultPayload,
  type DrawDuelGuessLogPayload,
  type DrawDuelGuessSource,
  type DrawDuelResultSlide,
  type DrawDuelResultSlideSetPayload,
  type DrawDuelRoundEndReason,
  type DrawDuelRoundResultPayload,
  type DrawDuelRoundState,
  type DrawDuelRoundStatePayload,
  type DrawDuelRoomResetPayload,
  type DrawDuelRoundSkipPayload,
  type DrawDuelScoreEntry,
  type DrawDuelSettings,
  type DrawDuelSettingsUpdatePayload,
  type DrawDuelTeamResult,
  type DrawDuelTeamScore,
  type DrawDuelTimerTickPayload,
  type DrawDuelWordPayload,
  type DrawGuessSubmitPayload,
  type DrawStrokeHistoryPayload,
  type DrawStrokePayload,
  type GameStartPayload,
  type PlayerState,
  type RoomCreatePayload,
  type RoomJoinPayload,
  type RoomRejoinPayload,
  type RoomState,
} from "@ai-arcade/shared";

import {
  normalizeAIGuesserText,
  type AIGuesser,
  type AIGuesserOutput,
} from "./ai-guesser.js";
import { createAIGuesser } from "./ai-guesser-factory.js";
import {
  renderDrawDuelSnapshot,
  renderDrawDuelStrokeSequence,
  type DrawDuelRecordedStroke,
} from "./draw-duel-snapshot-renderer.js";
import {
  drawDuelWordBank,
  type DrawDuelWordEntry,
} from "./draw-duel-word-bank.js";

const roomCodeAlphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const roomCodeLength = 6;
const drawingHistoryLimit = 500;
const correctGuessPoints = 100;
const mockAIPlayerId = "ai:mock";
const mockAINickname = "AI Guesser";
const missingGuessText = "미제출";

type InternalPlayer = PlayerState & {
  disconnectedAt?: string;
  reconnectToken: string;
  socketId: string;
};

type DrawingState = {
  history: DrawDuelRecordedStroke[];
  sequenceStartedAtMs: number;
};

type InternalRound = DrawDuelRoundState & {
  aliases: string[];
  aiGuessMade: boolean;
  correctPlayerIds: Set<string>;
  currentResultSlide?: DrawDuelResultSlide;
  guesses: DrawDuelGuessLogPayload[];
  reason?: DrawDuelRoundEndReason;
  submittedPlayerIds: Set<string>;
  teamResult?: DrawDuelTeamResult;
  word: string;
};

type InternalGame = {
  currentRound?: InternalRound;
  playerOrder: string[];
  roundResults: DrawDuelRoundResultPayload[];
  scoreNames: Record<string, string>;
  scoreSources: Record<string, DrawDuelGuessSource>;
  scores: Record<string, number>;
  teamScores: DrawDuelTeamScore;
  totalRounds: number;
  wordBank: DrawDuelWordEntry[];
};

type InternalRoom = Omit<RoomState, "players"> & {
  drawing: DrawingState;
  game?: InternalGame;
  players: InternalPlayer[];
};

export class RoomError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "RoomError";
  }
}

export type JoinResult = {
  room: RoomState;
  currentPlayerId: string;
  reconnectToken: string;
};

export type DisconnectResult = {
  playerId: string;
  room: RoomState;
  roomCode: string;
};

export type LeaveResult = {
  roomCode: string;
  room?: RoomState;
  roundState?: DrawDuelRoundStatePayload;
  roundResult?: DrawDuelRoundResultPayload;
  gameResult?: DrawDuelGameResultPayload;
};

export type StartGameResult = {
  clear: DrawClearPayload;
  message: string;
  room: RoomState;
  roundState: DrawDuelRoundStatePayload;
  timer: DrawDuelTimerTickPayload;
  word: DrawDuelWordPayload;
};

export type RejoinResult = JoinResult & {
  snapshot: RoomSnapshot;
};

export type RoomSnapshot = {
  resultSlide?: DrawDuelResultSlideSetPayload;
  roundState?: DrawDuelRoundStatePayload;
  settings: DrawDuelSettings;
  strokeHistory: DrawStrokeHistoryPayload;
  timer?: DrawDuelTimerTickPayload;
  word?: DrawDuelWordPayload;
};

export type RoundSkipResult = {
  room: RoomState;
  roundState: DrawDuelRoundStatePayload;
};

export type RoomResetResult = {
  clear: DrawClearPayload;
  room: RoomState;
};

export type GuessResult = {
  guess: DrawDuelGuessLogPayload;
  roundState: DrawDuelRoundStatePayload;
};

export type AIGuessResult = {
  guess: DrawDuelGuessLogPayload;
  roundState: DrawDuelRoundStatePayload;
};

export type AIGuessCompletionResult = {
  aiGuess?: DrawDuelGuessLogPayload;
  roundResult: DrawDuelRoundResultPayload;
  roundState: DrawDuelRoundStatePayload;
};

export type ResultSlideSetResult = DrawDuelResultSlideSetPayload;

export type TickResult = {
  roundResult?: DrawDuelRoundResultPayload;
  roundState?: DrawDuelRoundStatePayload;
  timer?: DrawDuelTimerTickPayload;
};

export type NextRoundResult =
  | {
      clear: DrawClearPayload;
      kind: "round";
      room: RoomState;
      roundState: DrawDuelRoundStatePayload;
      timer: DrawDuelTimerTickPayload;
      word: DrawDuelWordPayload;
    }
  | {
      gameResult: DrawDuelGameResultPayload;
      kind: "game-result";
      room: RoomState;
    };

export class RoomManager {
  private readonly rooms = new Map<string, InternalRoom>();

  constructor(private readonly aiGuesser: AIGuesser = createAIGuesser()) {}

  createRoom(payload: RoomCreatePayload, socketId: string): JoinResult {
    const parsed = roomCreatePayloadSchema.safeParse(payload);

    if (!parsed.success) {
      throw new RoomError("INVALID_ROOM_CREATE", parsed.error.issues[0]?.message ?? "방 생성 정보를 확인해 주세요.");
    }

    const now = new Date().toISOString();
    const player = this.createPlayer(parsed.data.nickname, socketId, now);
    const roomCode = this.createUniqueRoomCode();
    const room: InternalRoom = {
      roomId: randomUUID(),
      roomCode,
      gameId: DRAW_DUEL_GAME_ID,
      status: "waiting",
      hostPlayerId: player.playerId,
      settings: { ...DEFAULT_DRAW_DUEL_SETTINGS },
      players: [player],
      drawing: {
        history: [],
        sequenceStartedAtMs: Date.parse(now),
      },
      minPlayers: ROOM_MIN_PLAYERS,
      maxPlayers: ROOM_MAX_PLAYERS,
      createdAt: now,
      updatedAt: now,
    };

    this.rooms.set(roomCode, room);

    return {
      room: this.toRoomState(room),
      currentPlayerId: player.playerId,
      reconnectToken: player.reconnectToken,
    };
  }

  joinRoom(payload: RoomJoinPayload, socketId: string): JoinResult {
    const parsed = roomJoinPayloadSchema.safeParse(payload);

    if (!parsed.success) {
      throw new RoomError("INVALID_ROOM_JOIN", parsed.error.issues[0]?.message ?? "방 참가 정보를 확인해 주세요.");
    }

    const room = this.rooms.get(parsed.data.roomCode);

    if (!room) {
      throw new RoomError("ROOM_NOT_FOUND", "방을 찾을 수 없습니다.");
    }

    if (room.status !== "waiting") {
      throw new RoomError("ROOM_NOT_WAITING", "이미 진행 중인 방입니다.");
    }

    if (room.players.length >= room.maxPlayers) {
      throw new RoomError("ROOM_FULL", "방이 가득 찼습니다.");
    }

    const now = new Date().toISOString();
    const nickname = this.createUniqueNickname(
      parsed.data.nickname,
      room.players.map((player) => player.nickname),
    );
    const player = this.createPlayer(nickname, socketId, now);
    room.players.push(player);
    room.updatedAt = now;

    return {
      room: this.toRoomState(room),
      currentPlayerId: player.playerId,
      reconnectToken: player.reconnectToken,
    };
  }

  rejoinRoom(payload: RoomRejoinPayload, socketId: string, now = new Date()): RejoinResult {
    const parsed = roomRejoinPayloadSchema.safeParse(payload);

    if (!parsed.success) {
      throw new RoomError("INVALID_ROOM_REJOIN", parsed.error.issues[0]?.message ?? "재접속 정보를 확인해 주세요.");
    }

    const room = this.requireRoom(parsed.data.roomCode);
    const player = room.players.find(
      (candidate) =>
        candidate.playerId === parsed.data.playerId &&
        candidate.reconnectToken === parsed.data.reconnectToken,
    );

    if (!player) {
      throw new RoomError("REJOIN_FAILED", "재접속에 실패했습니다.");
    }

    player.socketId = socketId;
    player.connectionStatus = "connected";
    player.disconnectedAt = undefined;
    room.updatedAt = now.toISOString();

    return {
      room: this.toRoomState(room),
      currentPlayerId: player.playerId,
      reconnectToken: player.reconnectToken,
      snapshot: this.createSnapshot(room, player.playerId, now),
    };
  }

  updateSettings(
    payload: DrawDuelSettingsUpdatePayload,
    socketId: string,
    now = new Date(),
  ): RoomState {
    const parsed = drawDuelSettingsUpdatePayloadSchema.safeParse(payload);

    if (!parsed.success) {
      throw new RoomError(
        "INVALID_SETTINGS",
        parsed.error.issues[0]?.message ?? "설정을 확인해 주세요.",
      );
    }

    const room = this.requireRoom(parsed.data.roomCode);
    const player = this.requirePlayerInRoom(room, socketId);

    if (room.hostPlayerId !== player.playerId) {
      throw new RoomError("HOST_ONLY", "호스트만 변경할 수 있어요.");
    }

    if (room.status !== "waiting") {
      throw new RoomError("ROOM_NOT_WAITING", "대기 중에만 변경할 수 있어요.");
    }

    room.settings = { ...parsed.data.settings };
    room.updatedAt = now.toISOString();

    return this.toRoomState(room);
  }

  leaveRoom(roomCode: string, socketId: string): LeaveResult {
    const parsed = roomJoinPayloadSchema.shape.roomCode.safeParse(roomCode);

    if (!parsed.success) {
      throw new RoomError("INVALID_ROOM_CODE", parsed.error.issues[0]?.message ?? "방 코드를 확인해 주세요.");
    }

    const room = this.rooms.get(parsed.data);

    if (!room) {
      return {
        roomCode: parsed.data,
      };
    }

    return this.removePlayer(room, socketId);
  }

  leaveBySocket(socketId: string): LeaveResult | undefined {
    for (const room of this.rooms.values()) {
      if (room.players.some((player) => player.socketId === socketId)) {
        return this.removePlayer(room, socketId);
      }
    }

    return undefined;
  }

  markDisconnected(socketId: string, now = new Date()): DisconnectResult | undefined {
    for (const room of this.rooms.values()) {
      const player = room.players.find(
        (candidate) =>
          candidate.socketId === socketId && candidate.connectionStatus === "connected",
      );

      if (!player) {
        continue;
      }

      player.connectionStatus = "disconnected";
      player.disconnectedAt = now.toISOString();
      room.updatedAt = now.toISOString();

      return {
        playerId: player.playerId,
        room: this.toRoomState(room),
        roomCode: room.roomCode,
      };
    }

    return undefined;
  }

  expireDisconnectedPlayer(roomCode: string, playerId: string): LeaveResult | undefined {
    const room = this.rooms.get(roomCode);

    if (!room) {
      return undefined;
    }

    const player = room.players.find((candidate) => candidate.playerId === playerId);

    if (!player || player.connectionStatus !== "disconnected") {
      return undefined;
    }

    return this.removePlayerByPlayerId(room, playerId);
  }

  startGame(payload: GameStartPayload, socketId: string, now = new Date()): StartGameResult {
    const parsed = gameStartPayloadSchema.safeParse(payload);

    if (!parsed.success) {
      throw new RoomError("INVALID_GAME_START", parsed.error.issues[0]?.message ?? "시작 정보를 확인해 주세요.");
    }

    const room = this.requireRoom(parsed.data.roomCode);
    const player = this.requirePlayerInRoom(room, socketId);

    if (room.hostPlayerId !== player.playerId) {
      throw new RoomError("HOST_ONLY", "호스트만 게임을 시작할 수 있습니다.");
    }

    if (room.status !== "waiting") {
      throw new RoomError("ROOM_NOT_WAITING", "대기 중인 방만 시작할 수 있습니다.");
    }

    if (this.getConnectedPlayers(room).length < room.minPlayers) {
      throw new RoomError("NOT_ENOUGH_PLAYERS", "2명 이상 모이면 시작할 수 있습니다.");
    }

    room.status = "playing";
    room.game = this.createGame(room);
    const round = this.beginRound(room, 0, now);
    room.updatedAt = now.toISOString();

    return {
      clear: this.createClearPayload(room, round.drawerPlayerId, now),
      message: "1라운드가 시작됐습니다.",
      room: this.toRoomState(room),
      roundState: this.toRoundStatePayload(room),
      timer: this.toTimerTick(room, now),
      word: this.toWordPayload(room),
    };
  }

  submitStroke(
    payload: DrawStrokePayload,
    socketId: string,
    now = new Date(),
  ): DrawStrokePayload {
    const parsed = drawStrokePayloadSchema.safeParse(payload);

    if (!parsed.success) {
      throw new RoomError(
        "INVALID_DRAW_STROKE",
        parsed.error.issues[0]?.message ?? "드로잉 좌표를 확인해 주세요.",
      );
    }

    const room = this.requireRoom(parsed.data.roomCode);
    const player = this.requirePlayerInRoom(room, socketId);
    this.assertPlayerMatchesPayload(player.playerId, parsed.data.playerId);
    this.assertDrawingPlayer(room, player.playerId);

    const stroke: DrawStrokePayload = {
      ...parsed.data,
      playerId: player.playerId,
      roomCode: room.roomCode,
    };

    room.drawing.history.push({
      receivedAtMs: now.getTime(),
      stroke,
    });

    if (room.drawing.history.length > drawingHistoryLimit) {
      room.drawing.history.splice(0, room.drawing.history.length - drawingHistoryLimit);
    }

    room.updatedAt = now.toISOString();

    return stroke;
  }

  clearCanvas(
    payload: DrawClearPayload,
    socketId: string,
    now = new Date(),
  ): DrawClearPayload {
    const parsed = drawClearPayloadSchema.safeParse(payload);

    if (!parsed.success) {
      throw new RoomError(
        "INVALID_DRAW_CLEAR",
        parsed.error.issues[0]?.message ?? "캔버스 초기화 정보를 확인해 주세요.",
      );
    }

    const room = this.requireRoom(parsed.data.roomCode);
    const player = this.requirePlayerInRoom(room, socketId);
    this.assertPlayerMatchesPayload(player.playerId, parsed.data.playerId);
    this.assertDrawingPlayer(room, player.playerId);

    room.drawing.history = [];
    room.drawing.sequenceStartedAtMs = now.getTime();
    room.updatedAt = now.toISOString();

    return {
      ...parsed.data,
      playerId: player.playerId,
      roomCode: room.roomCode,
    };
  }

  async submitGuess(
    payload: DrawGuessSubmitPayload,
    socketId: string,
    now = new Date(),
  ): Promise<GuessResult> {
    const parsed = drawGuessSubmitPayloadSchema.safeParse(payload);

    if (!parsed.success) {
      throw new RoomError(
        "INVALID_GUESS_SUBMIT",
        parsed.error.issues[0]?.message ?? "정답 입력을 확인해 주세요.",
      );
    }

    const room = this.requireRoom(parsed.data.roomCode);
    const game = this.requireGame(room);
    const round = this.requireDrawingRound(game);
    const player = this.requirePlayerInRoom(room, socketId);

    this.assertPlayerMatchesPayload(player.playerId, parsed.data.playerId);

    if (round.roundId !== parsed.data.roundId) {
      throw new RoomError("ROUND_MISMATCH", "현재 라운드 정보를 확인해 주세요.");
    }

    if (round.drawerPlayerId === player.playerId) {
      throw new RoomError("DRAWER_CANNOT_GUESS", "출제자는 정답을 입력할 수 없습니다.");
    }

    if (round.submittedPlayerIds.has(player.playerId)) {
      throw new RoomError("ALREADY_SUBMITTED", "이번 라운드에는 한 번만 제출할 수 있어요.");
    }

    const isCorrect = this.isCorrectGuess(parsed.data.text, round);
    const pointsAwarded = isCorrect ? correctGuessPoints : 0;

    if (isCorrect) {
      round.correctPlayerIds.add(player.playerId);
    }

    const guess: DrawDuelGuessLogPayload = {
      roomCode: room.roomCode,
      roundId: round.roundId,
      guessId: randomUUID(),
      playerId: player.playerId,
      nickname: player.nickname,
      source: "player",
      text: parsed.data.text.trim(),
      isCorrect,
      pointsAwarded,
      submittedAt: now.toISOString(),
    };

    round.submittedPlayerIds.add(player.playerId);
    round.guesses.push(guess);
    room.updatedAt = now.toISOString();

    const result: GuessResult = {
      guess,
      roundState: this.toRoundStatePayload(room),
    };

    if (this.allGuessersSubmitted(room, round)) {
      const reason = this.allGuessersCorrect(room, round) ? "all-correct" : "all-submitted";
      this.startAIGuessing(room, reason, now);
      result.roundState = this.toRoundStatePayload(room);
    }

    return result;
  }

  nextRound(payload: { roomCode: string }, socketId: string, now = new Date()): NextRoundResult {
    const parsed = drawDuelNextRoundPayloadSchema.safeParse(payload);

    if (!parsed.success) {
      throw new RoomError(
        "INVALID_NEXT_ROUND",
        parsed.error.issues[0]?.message ?? "다음 라운드 정보를 확인해 주세요.",
      );
    }

    const room = this.requireRoom(parsed.data.roomCode);
    const game = this.requireGame(room);
    const player = this.requirePlayerInRoom(room, socketId);

    if (room.hostPlayerId !== player.playerId) {
      throw new RoomError("HOST_ONLY", "호스트만 다음 라운드를 진행할 수 있습니다.");
    }

    const round = game.currentRound;

    if (!round || round.status !== "result") {
      throw new RoomError("ROUND_NOT_READY", "라운드 결과가 나온 뒤 진행할 수 있습니다.");
    }

    if (round.roundNumber >= game.totalRounds) {
      const gameResult = this.finishGame(room, now);

      return {
        kind: "game-result",
        gameResult,
        room: this.toRoomState(room),
      };
    }

    const nextRound = this.beginRound(room, round.roundNumber, now);
    room.updatedAt = now.toISOString();

    return {
      kind: "round",
      clear: this.createClearPayload(room, nextRound.drawerPlayerId, now),
      room: this.toRoomState(room),
      roundState: this.toRoundStatePayload(room),
      timer: this.toTimerTick(room, now),
      word: this.toWordPayload(room),
    };
  }

  skipRound(payload: DrawDuelRoundSkipPayload, socketId: string, now = new Date()): RoundSkipResult {
    const parsed = drawDuelRoundSkipPayloadSchema.safeParse(payload);

    if (!parsed.success) {
      throw new RoomError(
        "INVALID_ROUND_SKIP",
        parsed.error.issues[0]?.message ?? "라운드 스킵 정보를 확인해 주세요.",
      );
    }

    const room = this.requireRoom(parsed.data.roomCode);
    const game = this.requireGame(room);
    const player = this.requirePlayerInRoom(room, socketId);

    if (room.hostPlayerId !== player.playerId) {
      throw new RoomError("HOST_ONLY", "호스트만 라운드를 스킵할 수 있습니다.");
    }

    this.requireDrawingRound(game);
    this.startAIGuessing(room, "operator-skip", now);

    return {
      room: this.toRoomState(room),
      roundState: this.toRoundStatePayload(room),
    };
  }

  setResultSlide(
    payload: DrawDuelResultSlideSetPayload,
    socketId: string,
    now = new Date(),
  ): ResultSlideSetResult {
    const parsed = drawDuelResultSlideSetPayloadSchema.safeParse(payload);

    if (!parsed.success) {
      throw new RoomError(
        "INVALID_RESULT_SLIDE",
        parsed.error.issues[0]?.message ?? "결과 슬라이드 정보를 확인해 주세요.",
      );
    }

    const room = this.requireRoom(parsed.data.roomCode);
    const game = this.requireGame(room);
    const round = game.currentRound;
    const player = this.requirePlayerInRoom(room, socketId);

    if (room.hostPlayerId !== player.playerId) {
      throw new RoomError("HOST_ONLY", "호스트만 결과 화면을 넘길 수 있어요.");
    }

    if (!round || round.status !== "result") {
      throw new RoomError("ROUND_NOT_READY", "라운드 결과가 나온 뒤 넘길 수 있어요.");
    }

    if (round.roundId !== parsed.data.roundId) {
      throw new RoomError("ROUND_MISMATCH", "현재 라운드 정보를 확인해 주세요.");
    }

    round.currentResultSlide = parsed.data.slide;
    room.updatedAt = now.toISOString();

    return {
      roomCode: room.roomCode,
      roundId: round.roundId,
      slide: round.currentResultSlide,
    };
  }

  resetRoom(payload: DrawDuelRoomResetPayload, socketId: string, now = new Date()): RoomResetResult {
    const parsed = drawDuelRoomResetPayloadSchema.safeParse(payload);

    if (!parsed.success) {
      throw new RoomError(
        "INVALID_ROOM_RESET",
        parsed.error.issues[0]?.message ?? "방 리셋 정보를 확인해 주세요.",
      );
    }

    const room = this.requireRoom(parsed.data.roomCode);
    const player = this.requirePlayerInRoom(room, socketId);

    if (room.hostPlayerId !== player.playerId) {
      throw new RoomError("HOST_ONLY", "호스트만 방을 리셋할 수 있습니다.");
    }

    room.status = "waiting";
    room.game = undefined;
    room.drawing.history = [];
    room.drawing.sequenceStartedAtMs = now.getTime();
    room.updatedAt = now.toISOString();

    return {
      clear: this.createClearPayload(room, player.playerId, now),
      room: this.toRoomState(room),
    };
  }

  tickRoom(roomCode: string, now = new Date()): TickResult | undefined {
    const room = this.rooms.get(roomCode);

    if (!room || room.status !== "playing" || !room.game?.currentRound) {
      return undefined;
    }

    const round = room.game.currentRound;

    if (round.status !== "drawing") {
      return undefined;
    }

    if (this.getRemainingSeconds(round, now) <= 0) {
      this.recordMissingHumanGuesses(room, round, now);
      this.startAIGuessing(room, "time-up", now);

      return {
        roundState: this.toRoundStatePayload(room),
        timer: this.toTimerTick(room, now),
      };
    }

    return {
      timer: this.toTimerTick(room, now),
    };
  }

  async runAIGuess(roomCode: string, now = new Date()): Promise<AIGuessResult | undefined> {
    const room = this.rooms.get(roomCode);

    if (!room || room.status !== "playing" || !room.game?.currentRound) {
      return undefined;
    }

    const round = room.game.currentRound;

    if (round.status !== "ai-guessing") {
      return undefined;
    }

    const guess = await this.runAIGuessForRound(room, round, now);

    if (!guess) {
      return undefined;
    }

    return {
      guess,
      roundState: this.toRoundStatePayload(room),
    };
  }

  async completeAIGuessing(
    roomCode: string,
    now = new Date(),
    expectedRoundId?: string,
  ): Promise<AIGuessCompletionResult | undefined> {
    const room = this.rooms.get(roomCode);

    if (!room || room.status !== "playing" || !room.game?.currentRound) {
      return undefined;
    }

    const round = room.game.currentRound;

    if (round.status !== "ai-guessing") {
      return undefined;
    }

    if (expectedRoundId && round.roundId !== expectedRoundId) {
      return undefined;
    }

    const aiGuess = await this.runAIGuessForRound(room, round, now);
    const roundResult = this.finishRound(room, round.reason ?? "time-up", now);

    return {
      aiGuess,
      roundResult,
      roundState: this.toRoundStatePayload(room),
    };
  }

  getStrokeHistory(roomCode: string): DrawStrokeHistoryPayload {
    const parsed = roomJoinPayloadSchema.shape.roomCode.safeParse(roomCode);

    if (!parsed.success) {
      throw new RoomError(
        "INVALID_ROOM_CODE",
        parsed.error.issues[0]?.message ?? "방 코드를 확인해 주세요.",
      );
    }

    const room = this.requireRoom(parsed.data);

    return {
      roomCode: room.roomCode,
      strokes: this.toPublicStrokeHistory(room),
    };
  }

  getRoomSnapshot(roomCode: string, playerId: string, now = new Date()): RoomSnapshot {
    const parsed = roomJoinPayloadSchema.shape.roomCode.safeParse(roomCode);

    if (!parsed.success) {
      throw new RoomError(
        "INVALID_ROOM_CODE",
        parsed.error.issues[0]?.message ?? "방 코드를 확인해 주세요.",
      );
    }

    const room = this.requireRoom(parsed.data);

    return this.createSnapshot(room, playerId, now);
  }

  getPlayerSocketId(roomCode: string, playerId: string): string | undefined {
    return this.rooms
      .get(roomCode)
      ?.players.find(
        (player) =>
          player.playerId === playerId && player.connectionStatus === "connected",
      )?.socketId;
  }

  getRoom(roomCode: string): RoomState | undefined {
    const room = this.rooms.get(roomCode);
    return room ? this.toRoomState(room) : undefined;
  }

  getRoomCount(): number {
    return this.rooms.size;
  }

  private createGame(room: InternalRoom): InternalGame {
    const connectedPlayers = this.getConnectedPlayers(room);
    const playerOrder = connectedPlayers.map((player) => player.playerId);
    const scores: Record<string, number> = {};
    const scoreNames: Record<string, string> = {};
    const scoreSources: Record<string, DrawDuelGuessSource> = {};

    for (const player of connectedPlayers) {
      scores[player.playerId] = 0;
      scoreNames[player.playerId] = player.nickname;
      scoreSources[player.playerId] = "player";
    }

    scores[mockAIPlayerId] = 0;
    scoreNames[mockAIPlayerId] = mockAINickname;
    scoreSources[mockAIPlayerId] = "ai";

    return {
      playerOrder,
      roundResults: [],
      scoreNames,
      scoreSources,
      scores,
      teamScores: {
        ai: 0,
        human: 0,
      },
      totalRounds: room.settings.maxRounds,
      wordBank: this.createShuffledWordBank(),
    };
  }

  private createShuffledWordBank(): DrawDuelWordEntry[] {
    const shuffled = drawDuelWordBank.map((entry) => ({
      word: entry.word,
      aliases: [...entry.aliases],
    }));

    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swapIndex = randomInt(index + 1);
      const current = shuffled[index];
      const swap = shuffled[swapIndex];

      if (current && swap) {
        shuffled[index] = swap;
        shuffled[swapIndex] = current;
      }
    }

    return shuffled;
  }

  private beginRound(room: InternalRoom, roundIndex: number, now: Date): InternalRound {
    const game = this.requireGame(room);
    const activePlayerIds = new Set(
      this.getConnectedPlayers(room).map((player) => player.playerId),
    );
    const activeOrder = game.playerOrder.filter((playerId) => activePlayerIds.has(playerId));

    if (activeOrder.length === 0) {
      throw new RoomError("NO_PLAYERS", "라운드를 시작할 참가자가 없습니다.");
    }

    const drawerPlayerId =
      room.settings.drawerMode === "host-only"
        ? room.hostPlayerId
        : activeOrder[roundIndex % activeOrder.length];
    const word = game.wordBank[roundIndex % game.wordBank.length] ?? game.wordBank[0];

    if (!word) {
      throw new RoomError("WORD_BANK_EMPTY", "라운드 단어를 고를 수 없습니다.");
    }

    if (!drawerPlayerId || !room.players.some((player) => player.playerId === drawerPlayerId)) {
      throw new RoomError("NO_DRAWER", "출제자를 정할 수 없습니다.");
    }
    const startedAt = now.toISOString();
    const endsAt = new Date(
      now.getTime() + room.settings.roundDurationSeconds * 1000,
    ).toISOString();
    const round: InternalRound = {
      roundId: randomUUID(),
      roundNumber: roundIndex + 1,
      totalRounds: game.totalRounds,
      drawerPlayerId,
      status: "drawing",
      startedAt,
      endsAt,
      aliases: [...word.aliases],
      aiGuessMade: false,
      correctPlayerIds: new Set<string>(),
      guesses: [],
      submittedPlayerIds: new Set<string>(),
      word: word.word,
    };

    room.drawing.history = [];
    room.drawing.sequenceStartedAtMs = now.getTime();
    game.currentRound = round;

    return round;
  }

  private removePlayer(room: InternalRoom, socketId: string): LeaveResult {
    const player = room.players.find((candidate) => candidate.socketId === socketId);

    if (!player) {
      return {
        roomCode: room.roomCode,
        room: this.toRoomState(room),
      };
    }

    return this.removePlayerByPlayerId(room, player.playerId);
  }

  private removePlayerByPlayerId(room: InternalRoom, playerId: string): LeaveResult {
    const playerIndex = room.players.findIndex((player) => player.playerId === playerId);

    if (playerIndex === -1) {
      return {
        roomCode: room.roomCode,
        room: this.toRoomState(room),
      };
    }

    const [removedPlayer] = room.players.splice(playerIndex, 1);
    const now = new Date();
    let roundResult: DrawDuelRoundResultPayload | undefined;
    let roundState: DrawDuelRoundStatePayload | undefined;
    let gameResult: DrawDuelGameResultPayload | undefined;

    if (room.players.length === 0) {
      this.rooms.delete(room.roomCode);
      return {
        roomCode: room.roomCode,
      };
    }

    if (removedPlayer?.playerId === room.hostPlayerId) {
      room.hostPlayerId =
        this.getConnectedPlayers(room)[0]?.playerId ??
        room.players[0]?.playerId ??
        room.hostPlayerId;
    }

    if (removedPlayer && room.game) {
      room.game.playerOrder = room.game.playerOrder.filter(
        (playerId) => playerId !== removedPlayer.playerId,
      );

      if (room.status === "playing" && room.players.length < room.minPlayers) {
        if (room.game.currentRound?.status === "drawing") {
          roundResult = this.finishRound(room, "not-enough-players", now);
          roundState = this.toRoundStatePayload(room);
        }

        gameResult = this.finishGame(room, now);
      } else if (
        room.status === "playing" &&
        room.game.currentRound?.status === "drawing" &&
        room.game.currentRound.drawerPlayerId === removedPlayer.playerId
      ) {
        roundResult = this.finishRound(room, "drawer-left", now);
        roundState = this.toRoundStatePayload(room);
      }
    }

    room.updatedAt = now.toISOString();

    return {
      roomCode: room.roomCode,
      room: this.toRoomState(room),
      roundState,
      roundResult,
      gameResult,
    };
  }

  private async runAIGuessForRound(
    room: InternalRoom,
    round: InternalRound,
    now: Date,
  ): Promise<DrawDuelGuessLogPayload | undefined> {
    if (round.status !== "ai-guessing" || round.aiGuessMade) {
      return undefined;
    }

    const game = this.requireGame(room);
    round.aiGuessMade = true;

    let aiOutput: AIGuesserOutput = {
      text: "모르겠음",
    };

    try {
      const publicStrokes = this.toPublicStrokeHistory(room);
      const finalImage = await renderDrawDuelSnapshot(publicStrokes);
      const strokeSequence = await renderDrawDuelStrokeSequence(
        room.drawing.history,
        room.drawing.sequenceStartedAtMs,
      );
      aiOutput = await this.aiGuesser.guess(
        {
          finalImage,
          roomCode: room.roomCode,
          roundId: round.roundId,
          strokeSequence,
        },
        {
          aliases: [...round.aliases],
          candidateWords: game.wordBank.map((entry) => entry.word),
          correctWord: round.word,
        },
      );
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : "unknown error";
      console.warn(
        `[ai] guess failed room=${room.roomCode} round=${round.roundId}: ${reason}`,
      );
    }
    const text = normalizeAIGuesserText(aiOutput.text);
    const isCorrect = this.isCorrectGuess(text, round);
    const confidence =
      typeof aiOutput.confidence === "number" && Number.isFinite(aiOutput.confidence)
        ? Math.min(1, Math.max(0, aiOutput.confidence))
        : undefined;
    const pointsAwarded = isCorrect ? correctGuessPoints : 0;

    if (isCorrect) {
      round.correctPlayerIds.add(mockAIPlayerId);
    }

    const guess: DrawDuelGuessLogPayload = {
      roomCode: room.roomCode,
      roundId: round.roundId,
      guessId: randomUUID(),
      playerId: mockAIPlayerId,
      nickname: mockAINickname,
      source: "ai",
      text,
      isCorrect,
      pointsAwarded,
      confidence,
      submittedAt: now.toISOString(),
    };

    round.guesses.push(guess);
    room.updatedAt = now.toISOString();

    return guess;
  }

  private startAIGuessing(
    room: InternalRoom,
    reason: DrawDuelRoundEndReason,
    now: Date,
  ) {
    const round = this.requireGame(room).currentRound;

    if (!round) {
      throw new RoomError("ROUND_NOT_FOUND", "진행 중인 라운드가 없습니다.");
    }

    if (round.status === "result") {
      return;
    }

    if (round.status !== "drawing" && round.status !== "ai-guessing") {
      throw new RoomError("ROUND_NOT_DRAWING", "현재 종료할 수 있는 라운드가 없습니다.");
    }

    round.status = "ai-guessing";
    round.reason = reason;
    room.updatedAt = now.toISOString();
  }

  private scoreRoundTeams(room: InternalRoom, round: InternalRound): DrawDuelTeamResult {
    if (round.teamResult) {
      return round.teamResult;
    }

    const game = this.requireGame(room);
    const humanTargetIds = this.getRoundGuesserIds(room, round);
    const humanTargetIdSet = new Set(humanTargetIds);
    const humanGuesses = round.guesses.filter(
      (guess) => guess.source === "player" && humanTargetIdSet.has(guess.playerId),
    );
    const submittedHumanIds = new Set(humanGuesses.map((guess) => guess.playerId));
    const humanCorrectCount = humanGuesses.filter((guess) => guess.isCorrect).length;
    const humanTargetCount = humanTargetIds.length;
    const humanRoundScore =
      humanTargetCount > 0 && humanCorrectCount > humanTargetCount / 2 ? 100 : 0;
    const aiCorrect = round.guesses.some(
      (guess) => guess.source === "ai" && guess.isCorrect,
    );
    const aiRoundScore = aiCorrect ? 100 : 0;
    const winner =
      aiRoundScore === humanRoundScore
        ? "DRAW"
        : aiRoundScore > humanRoundScore
          ? "AI WIN"
          : "HUMAN WIN";

    game.teamScores = {
      ai: game.teamScores.ai + aiRoundScore,
      human: game.teamScores.human + humanRoundScore,
    };
    game.scores[mockAIPlayerId] = game.teamScores.ai;

    for (const playerId of game.playerOrder) {
      game.scores[playerId] = game.teamScores.human;
    }

    round.teamResult = {
      aiCorrect,
      humanCorrectCount,
      humanSubmittedCount: submittedHumanIds.size,
      humanTargetCount,
      humanCorrectRate: humanTargetCount === 0 ? 0 : humanCorrectCount / humanTargetCount,
      winner,
      roundTeamScores: {
        ai: aiRoundScore,
        human: humanRoundScore,
      },
      cumulativeTeamScores: {
        ...game.teamScores,
      },
    };

    return round.teamResult;
  }

  private finishRound(
    room: InternalRoom,
    reason: DrawDuelRoundEndReason,
    now: Date,
  ): DrawDuelRoundResultPayload {
    const game = this.requireGame(room);
    const round = game.currentRound;

    if (!round) {
      throw new RoomError("ROUND_NOT_FOUND", "진행 중인 라운드가 없습니다.");
    }

    if (round.status === "result") {
      const existing = game.roundResults.find((result) => result.roundId === round.roundId);

      if (existing) {
        return existing;
      }
    }

    round.status = "result";
    round.reason = reason;
    round.currentResultSlide = "ai-answer";
    const teamResult = this.scoreRoundTeams(room, round);
    room.updatedAt = now.toISOString();

    const result: DrawDuelRoundResultPayload = {
      roomCode: room.roomCode,
      roundId: round.roundId,
      roundNumber: round.roundNumber,
      totalRounds: round.totalRounds,
      correctWord: round.word,
      reason,
      guesses: [...round.guesses],
      scores: this.toScoreEntries(room),
      teamResult,
      endedAt: now.toISOString(),
    };

    game.roundResults = [
      ...game.roundResults.filter((candidate) => candidate.roundId !== round.roundId),
      result,
    ];

    return result;
  }

  private finishGame(room: InternalRoom, now: Date): DrawDuelGameResultPayload {
    const game = this.requireGame(room);

    room.status = "ended";
    room.updatedAt = now.toISOString();

    return {
      roomCode: room.roomCode,
      results: this.toGameResultEntries(room),
      rounds: [...game.roundResults],
      endedAt: now.toISOString(),
    };
  }

  private recordMissingHumanGuesses(
    room: InternalRoom,
    round: InternalRound,
    now: Date,
  ) {
    for (const playerId of this.getRoundGuesserIds(room, round)) {
      if (round.submittedPlayerIds.has(playerId)) {
        continue;
      }

      const player = room.players.find((candidate) => candidate.playerId === playerId);

      if (!player) {
        continue;
      }

      round.submittedPlayerIds.add(playerId);
      round.guesses.push({
        roomCode: room.roomCode,
        roundId: round.roundId,
        guessId: randomUUID(),
        playerId,
        nickname: player.nickname,
        source: "player",
        text: missingGuessText,
        isCorrect: false,
        pointsAwarded: 0,
        submittedAt: now.toISOString(),
      });
    }
  }

  private getRoundGuesserIds(room: InternalRoom, round: InternalRound): string[] {
    return this.getConnectedPlayers(room)
      .map((player) => player.playerId)
      .filter((playerId) => playerId !== round.drawerPlayerId);
  }

  private allGuessersSubmitted(room: InternalRoom, round: InternalRound): boolean {
    const guesserIds = this.getRoundGuesserIds(room, round);

    return (
      guesserIds.length > 0 &&
      guesserIds.every((playerId) => round.submittedPlayerIds.has(playerId))
    );
  }

  private allGuessersCorrect(room: InternalRoom, round: InternalRound): boolean {
    const guesserIds = this.getRoundGuesserIds(room, round);

    return (
      guesserIds.length > 0 &&
      guesserIds.every((playerId) => round.correctPlayerIds.has(playerId))
    );
  }

  private isCorrectGuess(input: string, round: InternalRound): boolean {
    const normalizedInput = this.normalizeAnswer(input);
    const acceptedAnswers = [round.word, ...round.aliases].map((answer) =>
      this.normalizeAnswer(answer),
    );

    return acceptedAnswers.includes(normalizedInput);
  }

  private normalizeAnswer(value: string): string {
    return value.replace(/\s+/g, "").trim().toLocaleLowerCase("ko-KR");
  }

  private getRemainingSeconds(round: InternalRound, now: Date): number {
    return Math.max(0, Math.ceil((Date.parse(round.endsAt) - now.getTime()) / 1000));
  }

  private createClearPayload(
    room: InternalRoom,
    playerId: string,
    now: Date,
  ): DrawClearPayload {
    return {
      roomCode: room.roomCode,
      playerId,
      clearedAt: now.toISOString(),
    };
  }

  private toRoundStatePayload(room: InternalRoom): DrawDuelRoundStatePayload {
    const round = this.requireGame(room).currentRound;

    if (!round) {
      throw new RoomError("ROUND_NOT_FOUND", "진행 중인 라운드가 없습니다.");
    }

    return {
      roomCode: room.roomCode,
      round: this.toPublicRound(round),
      scores: this.toScoreEntries(room),
    };
  }

  private toPublicRound(round: InternalRound): DrawDuelRoundState {
    return {
      roundId: round.roundId,
      roundNumber: round.roundNumber,
      totalRounds: round.totalRounds,
      drawerPlayerId: round.drawerPlayerId,
      status: round.status,
      startedAt: round.startedAt,
      endsAt: round.endsAt,
    };
  }

  private toTimerTick(room: InternalRoom, now: Date): DrawDuelTimerTickPayload {
    const round = this.requireGame(room).currentRound;

    if (!round) {
      throw new RoomError("ROUND_NOT_FOUND", "진행 중인 라운드가 없습니다.");
    }

    return {
      roomCode: room.roomCode,
      roundId: round.roundId,
      remainingSeconds: this.getRemainingSeconds(round, now),
      endsAt: round.endsAt,
    };
  }

  private toWordPayload(room: InternalRoom): DrawDuelWordPayload {
    const round = this.requireGame(room).currentRound;

    if (!round) {
      throw new RoomError("ROUND_NOT_FOUND", "진행 중인 라운드가 없습니다.");
    }

    return {
      roomCode: room.roomCode,
      roundId: round.roundId,
      drawerPlayerId: round.drawerPlayerId,
      word: round.word,
    };
  }

  private createSnapshot(room: InternalRoom, playerId: string, now: Date): RoomSnapshot {
    const snapshot: RoomSnapshot = {
      settings: { ...room.settings },
      strokeHistory: {
        roomCode: room.roomCode,
        strokes: this.toPublicStrokeHistory(room),
      },
    };

    if (room.status === "playing" && room.game?.currentRound) {
      snapshot.roundState = this.toRoundStatePayload(room);
      snapshot.timer = this.toTimerTick(room, now);

      if (
        room.game.currentRound.status === "drawing" &&
        room.game.currentRound.drawerPlayerId === playerId
      ) {
        snapshot.word = this.toWordPayload(room);
      }

      if (room.game.currentRound.status === "result") {
        snapshot.resultSlide = {
          roomCode: room.roomCode,
          roundId: room.game.currentRound.roundId,
          slide: room.game.currentRound.currentResultSlide ?? "ai-answer",
        };
      }
    }

    return snapshot;
  }

  private toPublicStrokeHistory(room: InternalRoom): DrawStrokePayload[] {
    return room.drawing.history.map((entry) => entry.stroke);
  }

  private toScoreEntries(room: InternalRoom): DrawDuelScoreEntry[] {
    const game = this.requireGame(room);
    const scorePlayerIds = [...game.playerOrder, mockAIPlayerId];

    return scorePlayerIds.map((playerId) => ({
      playerId,
      nickname: game.scoreNames[playerId] ?? "참가자",
      score: game.scores[playerId] ?? 0,
      source: game.scoreSources[playerId] ?? "player",
    }));
  }

  private toGameResultEntries(room: InternalRoom): DrawDuelGameResultEntry[] {
    const ordered = [...this.toScoreEntries(room)].sort((first, second) => {
      if (second.score !== first.score) {
        return second.score - first.score;
      }

      return first.nickname.localeCompare(second.nickname, "ko-KR");
    });

    let previousScore: number | undefined;
    let previousRank = 0;

    return ordered.map((entry, index) => {
      const rank = previousScore === entry.score ? previousRank : index + 1;
      previousScore = entry.score;
      previousRank = rank;

      return {
        ...entry,
        rank,
      };
    });
  }

  private requireRoom(roomCode: string): InternalRoom {
    const room = this.rooms.get(roomCode);

    if (!room) {
      throw new RoomError("ROOM_NOT_FOUND", "방을 찾을 수 없습니다.");
    }

    return room;
  }

  private requireGame(room: InternalRoom): InternalGame {
    if (!room.game) {
      throw new RoomError("GAME_NOT_STARTED", "게임이 아직 시작되지 않았습니다.");
    }

    return room.game;
  }

  private requireDrawingRound(game: InternalGame): InternalRound {
    const round = game.currentRound;

    if (!round || round.status !== "drawing") {
      throw new RoomError("ROUND_NOT_DRAWING", "현재 정답을 입력할 수 있는 라운드가 아닙니다.");
    }

    return round;
  }

  private requirePlayerInRoom(room: InternalRoom, socketId: string): InternalPlayer {
    const player = room.players.find((candidate) => candidate.socketId === socketId);

    if (!player) {
      throw new RoomError("PLAYER_NOT_IN_ROOM", "방에 참가한 뒤 이용해 주세요.");
    }

    return player;
  }

  private assertPlayerMatchesPayload(socketPlayerId: string, payloadPlayerId: string) {
    if (socketPlayerId !== payloadPlayerId) {
      throw new RoomError("PLAYER_MISMATCH", "플레이어 정보를 확인해 주세요.");
    }
  }

  private assertDrawingPlayer(room: InternalRoom, playerId: string) {
    if (room.status === "waiting") {
      if (room.hostPlayerId !== playerId) {
        throw new RoomError("HOST_ONLY_DRAWING", "호스트만 그림을 그릴 수 있습니다.");
      }

      return;
    }

    if (room.status !== "playing") {
      throw new RoomError("GAME_NOT_DRAWING", "지금은 그림을 그릴 수 없습니다.");
    }

    const round = this.requireGame(room).currentRound;

    if (!round || round.status !== "drawing" || round.drawerPlayerId !== playerId) {
      throw new RoomError("DRAWER_ONLY", "현재 출제자만 그림을 그릴 수 있습니다.");
    }
  }

  private createPlayer(nickname: string, socketId: string, joinedAt: string): InternalPlayer {
    return {
      connectionStatus: "connected",
      playerId: randomUUID(),
      nickname,
      joinedAt,
      reconnectToken: randomUUID(),
      socketId,
    };
  }

  private getConnectedPlayers(room: InternalRoom): InternalPlayer[] {
    return room.players.filter((player) => player.connectionStatus === "connected");
  }

  private createUniqueRoomCode(): string {
    for (let attempt = 0; attempt < 25; attempt += 1) {
      const code = Array.from({ length: roomCodeLength }, () =>
        roomCodeAlphabet.charAt(randomInt(roomCodeAlphabet.length)),
      ).join("");

      if (!this.rooms.has(code)) {
        return code;
      }
    }

    throw new RoomError("ROOM_CODE_EXHAUSTED", "새 방 코드를 만들 수 없습니다.");
  }

  private createUniqueNickname(nickname: string, existingNicknames: string[]): string {
    const used = new Set(existingNicknames);

    if (!used.has(nickname)) {
      return nickname;
    }

    for (let index = 2; index <= ROOM_MAX_PLAYERS + 1; index += 1) {
      const suffix = String(index);
      const base = nickname.slice(0, Math.max(1, 12 - suffix.length));
      const candidate = `${base}${suffix}`;

      if (!used.has(candidate)) {
        return candidate;
      }
    }

    throw new RoomError("NICKNAME_EXHAUSTED", "사용할 수 있는 닉네임을 찾지 못했습니다.");
  }

  private toRoomState(room: InternalRoom): RoomState {
    return {
      roomId: room.roomId,
      roomCode: room.roomCode,
      gameId: room.gameId,
      status: room.status,
      hostPlayerId: room.hostPlayerId,
      settings: { ...room.settings },
      minPlayers: room.minPlayers,
      maxPlayers: room.maxPlayers,
      createdAt: room.createdAt,
      updatedAt: room.updatedAt,
      players: room.players.map(({ connectionStatus, playerId, nickname, joinedAt }) => ({
        connectionStatus,
        playerId,
        nickname,
        joinedAt,
      })),
    };
  }
}
