import { randomInt, randomUUID } from "node:crypto";

import {
  DEFAULT_REAL_OR_AI_SETTINGS,
  REAL_OR_AI_GAME_ID,
  REAL_OR_AI_MAX_PLAYERS,
  REAL_OR_AI_MIN_PLAYERS,
  realOrAiAnswerSubmitPayloadSchema,
  realOrAiGameStartPayloadSchema,
  realOrAiManifestSchema,
  realOrAiNextRoundPayloadSchema,
  realOrAiRoomCreatePayloadSchema,
  realOrAiRoomJoinPayloadSchema,
  realOrAiRoomLeavePayloadSchema,
  realOrAiRoomRejoinPayloadSchema,
  realOrAiRoomResetPayloadSchema,
  realOrAiRoundSkipPayloadSchema,
  realOrAiSettingsUpdatePayloadSchema,
  type RealOrAiAnswerAckPayload,
  type RealOrAiAnswerCountPayload,
  type RealOrAiAnswerSubmitPayload,
  type RealOrAiCountdownPayload,
  type RealOrAiGameResultEntry,
  type RealOrAiGameResultPayload,
  type RealOrAiGameStartNoticePayload,
  type RealOrAiGameStartPayload,
  type RealOrAiNextRoundPayload,
  type RealOrAiPlayerState,
  type RealOrAiPrivateRoundItem,
  type RealOrAiPublicRoundItem,
  type RealOrAiRoomCreatePayload,
  type RealOrAiRoomJoinedPayload,
  type RealOrAiRoomJoinPayload,
  type RealOrAiRoomLeavePayload,
  type RealOrAiRoomRejoinPayload,
  type RealOrAiRoomResetPayload,
  type RealOrAiRoomState,
  type RealOrAiRoundEndReason,
  type RealOrAiRoundResultEntry,
  type RealOrAiRoundResultPayload,
  type RealOrAiRoundSkipPayload,
  type RealOrAiRoundStartPayload,
  type RealOrAiRoundState,
  type RealOrAiSettings,
  type RealOrAiSettingsUpdatePayload,
} from "@ai-arcade/shared";

const roomCodeAlphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const roomCodeLength = 6;
const baseCorrectPoints = 100;
const maxSpeedBonusMultiplier = 1.5;

type InternalPlayer = RealOrAiPlayerState & {
  disconnectedAt?: string;
  reconnectToken: string;
  socketId: string;
};

type InternalAnswer = {
  isCorrect: boolean;
  playerId: string;
  pointsAwarded: number;
  responseTimeMs?: number;
  selectedCandidateId?: string;
  submittedAt?: string;
};

type InternalRound = Omit<RealOrAiRoundState, "item"> & {
  answers: Map<string, InternalAnswer>;
  item: RealOrAiPublicRoundItem;
  privateItem: RealOrAiPrivateRoundItem;
  result?: RealOrAiRoundResultPayload;
};

type InternalGame = {
  currentRound?: InternalRound;
  gameResult?: RealOrAiGameResultPayload;
  nextRoundIndex: number;
  roundItems: RealOrAiPrivateRoundItem[];
  roundResults: RealOrAiRoundResultPayload[];
  totalRounds: number;
};

type InternalRoom = Omit<RealOrAiRoomState, "currentRound" | "players"> & {
  currentRound?: InternalRound;
  game?: InternalGame;
  players: InternalPlayer[];
};

export class RealOrAiRoomError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "RealOrAiRoomError";
  }
}

export type RealOrAiLeaveResult = {
  room?: RealOrAiRoomState;
  roomCode: string;
};

export type RealOrAiDisconnectResult = {
  playerId: string;
  room: RealOrAiRoomState;
  roomCode: string;
};

export type RealOrAiStartGameResult = {
  countdown: RealOrAiCountdownPayload;
  notice: RealOrAiGameStartNoticePayload;
  room: RealOrAiRoomState;
};

export type RealOrAiAnswerSubmitResult =
  | {
      ack: RealOrAiAnswerAckPayload;
      count: RealOrAiAnswerCountPayload;
      kind: "accepted";
      room: RealOrAiRoomState;
    }
  | {
      ack: RealOrAiAnswerAckPayload;
      count: RealOrAiAnswerCountPayload;
      kind: "round-result";
      result: RealOrAiRoundResultPayload;
      room: RealOrAiRoomState;
    };

export type RealOrAiNextRoundResult =
  | {
      countdown: RealOrAiCountdownPayload;
      kind: "countdown";
      room: RealOrAiRoomState;
    }
  | {
      gameResult: RealOrAiGameResultPayload;
      kind: "game-result";
      room: RealOrAiRoomState;
    };

export type RealOrAiRoundSkipResult = {
  result: RealOrAiRoundResultPayload;
  room: RealOrAiRoomState;
};

export class RealOrAiRoomManager {
  private readonly rooms = new Map<string, InternalRoom>();
  private readonly roundItems: RealOrAiPrivateRoundItem[];

  constructor(roundItems: RealOrAiPrivateRoundItem[]) {
    const parsed = realOrAiManifestSchema.safeParse({
      items: roundItems,
      version: 1,
    });

    if (!parsed.success) {
      throw new RealOrAiRoomError(
        "INVALID_MANIFEST",
        parsed.error.issues[0]?.message ?? "Real or AI 이미지 manifest를 확인해 주세요.",
      );
    }

    this.roundItems = parsed.data.items;
  }

  getPlayableRoundCount(): number {
    return this.roundItems.length;
  }

  getRoomCount(): number {
    return this.rooms.size;
  }

  getRoomState(roomCode: string): RealOrAiRoomState {
    return this.toRoomState(this.requireRoom(roomCode));
  }

  createRoom(
    payload: RealOrAiRoomCreatePayload,
    socketId: string,
  ): RealOrAiRoomJoinedPayload {
    const parsed = realOrAiRoomCreatePayloadSchema.safeParse(payload);

    if (!parsed.success) {
      throw new RealOrAiRoomError(
        "INVALID_ROOM_CREATE",
        parsed.error.issues[0]?.message ?? "방 생성 정보를 확인해 주세요.",
      );
    }

    const now = new Date().toISOString();
    const player = this.createPlayer(parsed.data.nickname, socketId, now);
    const roomCode = this.createUniqueRoomCode();
    const room: InternalRoom = {
      createdAt: now,
      gameId: REAL_OR_AI_GAME_ID,
      hostPlayerId: player.playerId,
      maxPlayers: REAL_OR_AI_MAX_PLAYERS,
      minPlayers: REAL_OR_AI_MIN_PLAYERS,
      playableRoundCount: this.getPlayableRoundCount(),
      players: [player],
      roomCode,
      roomId: randomUUID(),
      settings: this.createInitialSettings(),
      status: "waiting",
      updatedAt: now,
    };

    this.rooms.set(roomCode, room);

    return {
      currentPlayerId: player.playerId,
      reconnectToken: player.reconnectToken,
      room: this.toRoomState(room),
    };
  }

  joinRoom(
    payload: RealOrAiRoomJoinPayload,
    socketId: string,
  ): RealOrAiRoomJoinedPayload {
    const parsed = realOrAiRoomJoinPayloadSchema.safeParse(payload);

    if (!parsed.success) {
      throw new RealOrAiRoomError(
        "INVALID_ROOM_JOIN",
        parsed.error.issues[0]?.message ?? "입장 정보를 확인해 주세요.",
      );
    }

    const room = this.requireRoom(parsed.data.roomCode);

    if (room.status !== "waiting") {
      throw new RealOrAiRoomError("ROOM_NOT_WAITING", "이미 진행 중인 방입니다.");
    }

    if (this.getConnectedPlayers(room).length >= room.maxPlayers) {
      throw new RealOrAiRoomError("ROOM_FULL", "방이 가득 찼어요.");
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
      currentPlayerId: player.playerId,
      reconnectToken: player.reconnectToken,
      room: this.toRoomState(room),
    };
  }

  rejoinRoom(
    payload: RealOrAiRoomRejoinPayload,
    socketId: string,
  ): RealOrAiRoomJoinedPayload {
    const parsed = realOrAiRoomRejoinPayloadSchema.safeParse(payload);

    if (!parsed.success) {
      throw new RealOrAiRoomError(
        "INVALID_ROOM_REJOIN",
        parsed.error.issues[0]?.message ?? "재접속 정보를 확인해 주세요.",
      );
    }

    const room = this.requireRoom(parsed.data.roomCode);
    const player = room.players.find(
      (candidate) =>
        candidate.playerId === parsed.data.playerId &&
        candidate.reconnectToken === parsed.data.reconnectToken,
    );

    if (!player) {
      throw new RealOrAiRoomError(
        "REJOIN_FAILED",
        "재접속에 실패했습니다. 방 코드로 다시 입장해 주세요.",
      );
    }

    player.connectionStatus = "connected";
    player.disconnectedAt = undefined;
    player.socketId = socketId;
    room.updatedAt = new Date().toISOString();

    return {
      currentPlayerId: player.playerId,
      reconnectToken: player.reconnectToken,
      room: this.toRoomState(room),
    };
  }

  leaveRoom(
    payload: RealOrAiRoomLeavePayload,
    socketId: string,
  ): RealOrAiLeaveResult {
    const parsed = realOrAiRoomLeavePayloadSchema.safeParse(payload);

    if (!parsed.success) {
      throw new RealOrAiRoomError(
        "INVALID_ROOM_LEAVE",
        parsed.error.issues[0]?.message ?? "방 나가기 정보를 확인해 주세요.",
      );
    }

    const room = this.requireRoom(parsed.data.roomCode);
    const player = this.requirePlayerInRoom(room, socketId);
    room.players = room.players.filter((candidate) => candidate.playerId !== player.playerId);

    if (room.players.length === 0) {
      this.rooms.delete(room.roomCode);
      return {
        roomCode: room.roomCode,
      };
    }

    if (room.hostPlayerId === player.playerId) {
      room.hostPlayerId = this.getConnectedPlayers(room)[0]?.playerId ?? room.players[0]?.playerId ?? room.hostPlayerId;
    }

    room.updatedAt = new Date().toISOString();

    return {
      room: this.toRoomState(room),
      roomCode: room.roomCode,
    };
  }

  markDisconnected(socketId: string): RealOrAiDisconnectResult | undefined {
    for (const room of this.rooms.values()) {
      const player = room.players.find((candidate) => candidate.socketId === socketId);

      if (!player) {
        continue;
      }

      player.connectionStatus = "disconnected";
      player.disconnectedAt = new Date().toISOString();
      room.updatedAt = player.disconnectedAt;

      return {
        playerId: player.playerId,
        room: this.toRoomState(room),
        roomCode: room.roomCode,
      };
    }

    return undefined;
  }

  updateSettings(
    payload: RealOrAiSettingsUpdatePayload,
    socketId: string,
  ): RealOrAiRoomState {
    const parsed = realOrAiSettingsUpdatePayloadSchema.safeParse(payload);

    if (!parsed.success) {
      throw new RealOrAiRoomError(
        "INVALID_SETTINGS",
        parsed.error.issues[0]?.message ?? "설정을 확인해 주세요.",
      );
    }

    const room = this.requireRoom(parsed.data.roomCode);
    const player = this.requirePlayerInRoom(room, socketId);
    this.assertHost(room, player.playerId);

    if (room.status !== "waiting") {
      throw new RealOrAiRoomError(
        "ROOM_NOT_WAITING",
        "진행 중에는 설정을 바꿀 수 없어요.",
      );
    }

    this.assertRoundCountAvailable(parsed.data.settings.roundCount);
    room.settings = { ...parsed.data.settings };
    room.updatedAt = new Date().toISOString();

    return this.toRoomState(room);
  }

  startGame(
    payload: RealOrAiGameStartPayload,
    socketId: string,
    now = new Date(),
  ): RealOrAiStartGameResult {
    const parsed = realOrAiGameStartPayloadSchema.safeParse(payload);

    if (!parsed.success) {
      throw new RealOrAiRoomError(
        "INVALID_GAME_START",
        parsed.error.issues[0]?.message ?? "게임 시작 정보를 확인해 주세요.",
      );
    }

    const room = this.requireRoom(parsed.data.roomCode);
    const player = this.requirePlayerInRoom(room, socketId);
    this.assertHost(room, player.playerId);

    if (room.status !== "waiting") {
      throw new RealOrAiRoomError(
        "ROOM_NOT_WAITING",
        "대기 중인 방만 시작할 수 있습니다.",
      );
    }

    if (this.getConnectedPlayers(room).length < room.minPlayers) {
      throw new RealOrAiRoomError(
        "NOT_ENOUGH_PLAYERS",
        "2명 이상 모이면 시작할 수 있습니다.",
      );
    }

    this.assertRoundCountAvailable(room.settings.roundCount);

    room.players = room.players.map((candidate) => ({
      ...candidate,
      score: 0,
    }));
    room.currentRound = undefined;
    room.status = "countdown";
    room.game = {
      currentRound: undefined,
      nextRoundIndex: 0,
      roundItems: this.pickRoundItems(room.settings.roundCount),
      roundResults: [],
      totalRounds: room.settings.roundCount,
    };
    room.updatedAt = now.toISOString();

    return {
      countdown: this.toCountdownPayload(room, now),
      notice: {
        message: "진짜 사진을 골라 주세요.",
        roomCode: room.roomCode,
      },
      room: this.toRoomState(room),
    };
  }

  startAnsweringRound(roomCode: string, now = new Date()): RealOrAiRoundStartPayload {
    const room = this.requireRoom(roomCode);
    this.requireGame(room);

    if (room.status !== "countdown") {
      throw new RealOrAiRoomError(
        "COUNTDOWN_NOT_ACTIVE",
        "라운드 카운트다운이 진행 중이 아닙니다.",
      );
    }

    const round = this.beginRound(room, now);
    room.updatedAt = now.toISOString();

    return {
      roomCode: room.roomCode,
      round: this.toPublicRound(round),
    };
  }

  submitAnswer(
    payload: RealOrAiAnswerSubmitPayload,
    socketId: string,
    now = new Date(),
  ): RealOrAiAnswerSubmitResult {
    const parsed = realOrAiAnswerSubmitPayloadSchema.safeParse(payload);

    if (!parsed.success) {
      throw new RealOrAiRoomError(
        "INVALID_ANSWER",
        parsed.error.issues[0]?.message ?? "답변 정보를 확인해 주세요.",
      );
    }

    const room = this.requireRoom(parsed.data.roomCode);
    const player = this.requirePlayerInRoom(room, socketId);
    this.assertPlayerMatchesPayload(player.playerId, parsed.data.playerId);

    const round = this.requireAnsweringRound(room);

    if (round.roundId !== parsed.data.roundId) {
      throw new RealOrAiRoomError("ROUND_MISMATCH", "현재 라운드 정보를 확인해 주세요.");
    }

    if (round.answers.has(player.playerId)) {
      throw new RealOrAiRoomError("ANSWER_ALREADY_SUBMITTED", "이미 제출했어요.");
    }

    const candidateIds = new Set(round.item.candidates.map((candidate) => candidate.id));

    if (!candidateIds.has(parsed.data.selectedCandidateId)) {
      throw new RealOrAiRoomError("CANDIDATE_NOT_FOUND", "선택한 사진을 찾을 수 없어요.");
    }

    const submittedAt = now.toISOString();
    const answer = this.createAnswer(round, player.playerId, parsed.data.selectedCandidateId, now);
    round.answers.set(player.playerId, answer);

    if (answer.pointsAwarded > 0) {
      player.score += answer.pointsAwarded;
    }

    room.updatedAt = submittedAt;

    const ack: RealOrAiAnswerAckPayload = {
      accepted: true,
      roomCode: room.roomCode,
      roundId: round.roundId,
      selectedCandidateId: parsed.data.selectedCandidateId,
      submittedAt,
    };
    const count = this.toAnswerCountPayload(room, round);

    if (!this.haveAllConnectedPlayersAnswered(room, round)) {
      return {
        ack,
        count,
        kind: "accepted",
        room: this.toRoomState(room),
      };
    }

    const result = this.completeRound(room, "all-submitted", now);

    return {
      ack,
      count,
      kind: "round-result",
      result,
      room: this.toRoomState(room),
    };
  }

  finishRound(
    roomCode: string,
    reason: RealOrAiRoundEndReason = "time-up",
    now = new Date(),
  ): RealOrAiRoundResultPayload {
    const room = this.requireRoom(roomCode);

    return this.completeRound(room, reason, now);
  }

  nextRound(
    payload: RealOrAiNextRoundPayload,
    socketId: string,
    now = new Date(),
  ): RealOrAiNextRoundResult {
    const parsed = realOrAiNextRoundPayloadSchema.safeParse(payload);

    if (!parsed.success) {
      throw new RealOrAiRoomError(
        "INVALID_NEXT_ROUND",
        parsed.error.issues[0]?.message ?? "다음 라운드 정보를 확인해 주세요.",
      );
    }

    const room = this.requireRoom(parsed.data.roomCode);
    const player = this.requirePlayerInRoom(room, socketId);
    this.assertHost(room, player.playerId);
    const game = this.requireGame(room);
    const round = this.requireCurrentRound(room);

    if (round.status !== "round-result") {
      throw new RealOrAiRoomError(
        "ROUND_NOT_READY",
        "라운드 결과가 나온 뒤 진행할 수 있습니다.",
      );
    }

    if (round.roundNumber >= game.totalRounds) {
      const gameResult = this.finishGame(room, now);

      return {
        gameResult,
        kind: "game-result",
        room: this.toRoomState(room),
      };
    }

    room.currentRound = undefined;
    game.currentRound = undefined;
    room.status = "countdown";
    room.updatedAt = now.toISOString();

    return {
      countdown: this.toCountdownPayload(room, now),
      kind: "countdown",
      room: this.toRoomState(room),
    };
  }

  skipRound(
    payload: RealOrAiRoundSkipPayload,
    socketId: string,
    now = new Date(),
  ): RealOrAiRoundSkipResult {
    const parsed = realOrAiRoundSkipPayloadSchema.safeParse(payload);

    if (!parsed.success) {
      throw new RealOrAiRoomError(
        "INVALID_ROUND_SKIP",
        parsed.error.issues[0]?.message ?? "라운드 스킵 정보를 확인해 주세요.",
      );
    }

    const room = this.requireRoom(parsed.data.roomCode);
    const player = this.requirePlayerInRoom(room, socketId);
    this.assertHost(room, player.playerId);
    const result = this.completeRound(room, "operator-skip", now);

    return {
      result,
      room: this.toRoomState(room),
    };
  }

  resetRoom(
    payload: RealOrAiRoomResetPayload,
    socketId: string,
  ): RealOrAiRoomState {
    const parsed = realOrAiRoomResetPayloadSchema.safeParse(payload);

    if (!parsed.success) {
      throw new RealOrAiRoomError(
        "INVALID_ROOM_RESET",
        parsed.error.issues[0]?.message ?? "방 리셋 정보를 확인해 주세요.",
      );
    }

    const room = this.requireRoom(parsed.data.roomCode);
    const player = this.requirePlayerInRoom(room, socketId);
    this.assertHost(room, player.playerId);

    room.currentRound = undefined;
    room.game = undefined;
    room.players = room.players.map((candidate) => ({
      ...candidate,
      score: 0,
    }));
    room.status = "waiting";
    room.updatedAt = new Date().toISOString();

    return this.toRoomState(room);
  }

  private createInitialSettings(): RealOrAiSettings {
    return {
      ...DEFAULT_REAL_OR_AI_SETTINGS,
      roundCount: Math.min(
        DEFAULT_REAL_OR_AI_SETTINGS.roundCount,
        this.getPlayableRoundCount(),
      ),
    };
  }

  private createAnswer(
    round: InternalRound,
    playerId: string,
    selectedCandidateId: string,
    now: Date,
  ): InternalAnswer {
    const startedAtMs = Date.parse(round.startedAt);
    const endsAtMs = Date.parse(round.endsAt);
    const nowMs = now.getTime();
    const responseTimeMs = Math.max(0, nowMs - startedAtMs);
    const isTimedOut = nowMs > endsAtMs;
    const isCorrect = !isTimedOut && selectedCandidateId === round.privateItem.correctCandidateId;
    const pointsAwarded = isCorrect
      ? this.calculateCorrectPoints(startedAtMs, endsAtMs, nowMs)
      : 0;

    return {
      isCorrect,
      playerId,
      pointsAwarded,
      responseTimeMs,
      selectedCandidateId,
      submittedAt: now.toISOString(),
    };
  }

  private calculateCorrectPoints(startedAtMs: number, endsAtMs: number, nowMs: number): number {
    const durationMs = Math.max(1, endsAtMs - startedAtMs);
    const remainingMs = Math.max(0, endsAtMs - nowMs);
    const remainingRatio = remainingMs / durationMs;
    const multiplier = 1 + ((maxSpeedBonusMultiplier - 1) * remainingRatio);

    return Math.round(baseCorrectPoints * multiplier);
  }

  private completeRound(
    room: InternalRoom,
    reason: RealOrAiRoundEndReason,
    now: Date,
  ): RealOrAiRoundResultPayload {
    const round = this.requireCurrentRound(room);
    const game = this.requireGame(room);

    if (round.result) {
      return round.result;
    }

    const connectedPlayers = this.getConnectedPlayers(room);
    const entries = connectedPlayers.map((player): RealOrAiRoundResultEntry => {
      const answer = round.answers.get(player.playerId);

      return {
        isCorrect: answer?.isCorrect ?? false,
        nickname: player.nickname,
        playerId: player.playerId,
        pointsAwarded: answer?.pointsAwarded ?? 0,
        responseTimeMs: answer?.responseTimeMs,
        selectedCandidateId: answer?.selectedCandidateId,
      };
    });
    const maxPoints = Math.max(...entries.map((entry) => entry.pointsAwarded), 0);
    const topScorers = entries.filter((entry) => entry.pointsAwarded === maxPoints);
    const result: RealOrAiRoundResultPayload = {
      candidates: this.toRevealedCandidates(round),
      correctCandidateId: round.privateItem.correctCandidateId,
      endedAt: now.toISOString(),
      entries,
      reason,
      roomCode: room.roomCode,
      roundId: round.roundId,
      roundNumber: round.roundNumber,
      topScorers,
      totalRounds: round.totalRounds,
    };

    round.result = result;
    round.status = "round-result";
    game.roundResults = [
      ...game.roundResults.filter((candidate) => candidate.roundId !== round.roundId),
      result,
    ];
    room.status = "round-result";
    room.updatedAt = result.endedAt;

    return result;
  }

  private finishGame(room: InternalRoom, now: Date): RealOrAiGameResultPayload {
    const game = this.requireGame(room);

    if (game.gameResult) {
      return game.gameResult;
    }

    const gameResult: RealOrAiGameResultPayload = {
      endedAt: now.toISOString(),
      results: this.toGameResultEntries(room, game.roundResults),
      roomCode: room.roomCode,
      rounds: [...game.roundResults],
    };

    game.gameResult = gameResult;
    room.status = "final-result";
    room.updatedAt = gameResult.endedAt;

    return gameResult;
  }

  private toGameResultEntries(
    room: InternalRoom,
    roundResults: RealOrAiRoundResultPayload[],
  ): RealOrAiGameResultEntry[] {
    const resultEntries = room.players.map((player) => {
      const correctResponses = roundResults
        .flatMap((round) => round.entries)
        .filter((entry) => entry.playerId === player.playerId && entry.isCorrect);
      const responseTimes = correctResponses.flatMap((entry) =>
        typeof entry.responseTimeMs === "number" ? [entry.responseTimeMs] : [],
      );
      const averageCorrectResponseMs =
        responseTimes.length > 0
          ? Math.round(
              responseTimes.reduce((total, value) => total + value, 0) /
                responseTimes.length,
            )
          : undefined;

      return {
        averageCorrectResponseMs,
        correctCount: correctResponses.length,
        nickname: player.nickname,
        playerId: player.playerId,
        rank: 0,
        totalScore: player.score,
      };
    });

    const sorted = resultEntries.sort((first, second) => {
      if (second.totalScore !== first.totalScore) {
        return second.totalScore - first.totalScore;
      }

      if (second.correctCount !== first.correctCount) {
        return second.correctCount - first.correctCount;
      }

      const firstAverage = first.averageCorrectResponseMs ?? Number.POSITIVE_INFINITY;
      const secondAverage = second.averageCorrectResponseMs ?? Number.POSITIVE_INFINITY;

      if (firstAverage !== secondAverage) {
        return firstAverage - secondAverage;
      }

      return first.nickname.localeCompare(second.nickname, "ko-KR");
    });

    let previous:
      | {
          averageCorrectResponseMs?: number;
          correctCount: number;
          rank: number;
          totalScore: number;
        }
      | undefined;

    return sorted.map((entry, index) => {
      const rank =
        previous &&
        previous.totalScore === entry.totalScore &&
        previous.correctCount === entry.correctCount &&
        previous.averageCorrectResponseMs === entry.averageCorrectResponseMs
          ? previous.rank
          : index + 1;
      previous = {
        averageCorrectResponseMs: entry.averageCorrectResponseMs,
        correctCount: entry.correctCount,
        rank,
        totalScore: entry.totalScore,
      };

      return {
        ...entry,
        rank,
      };
    });
  }

  private beginRound(room: InternalRoom, now: Date): InternalRound {
    const game = this.requireGame(room);
    const roundIndex = game.nextRoundIndex;
    const privateItem = game.roundItems[roundIndex];

    if (!privateItem) {
      throw new RealOrAiRoomError("ROUND_NOT_FOUND", "시작할 라운드를 찾을 수 없습니다.");
    }

    const round: InternalRound = {
      answers: new Map(),
      endsAt: new Date(now.getTime() + (room.settings.roundDurationSeconds * 1000)).toISOString(),
      item: this.toPublicRoundItem(privateItem),
      privateItem,
      roundId: randomUUID(),
      roundNumber: roundIndex + 1,
      startedAt: now.toISOString(),
      status: "answering",
      totalRounds: game.totalRounds,
    };

    game.currentRound = round;
    game.nextRoundIndex += 1;
    room.currentRound = round;
    room.status = "answering";

    return round;
  }

  private toPublicRoundItem(item: RealOrAiPrivateRoundItem): RealOrAiPublicRoundItem {
    return {
      category: item.category,
      id: item.id,
      title: item.title,
      candidates: this.shuffleArray(item.candidates).map(
        ({ alt, height, id, src, width }) => ({
          alt,
          height,
          id,
          src,
          width,
        }),
      ) as RealOrAiPublicRoundItem["candidates"],
    };
  }

  private toRevealedCandidates(
    round: InternalRound,
  ): RealOrAiRoundResultPayload["candidates"] {
    return round.item.candidates.map((candidate) => {
      const privateCandidate = round.privateItem.candidates.find(
        (target) => target.id === candidate.id,
      );

      if (!privateCandidate) {
        throw new RealOrAiRoomError("CANDIDATE_NOT_FOUND", "사진 후보를 찾을 수 없습니다.");
      }

      return {
        ...candidate,
        sourceType: privateCandidate.sourceType,
      };
    }) as RealOrAiRoundResultPayload["candidates"];
  }

  private toAnswerCountPayload(
    room: InternalRoom,
    round: InternalRound,
  ): RealOrAiAnswerCountPayload {
    return {
      playerCount: this.getConnectedPlayers(room).length,
      roomCode: room.roomCode,
      roundId: round.roundId,
      submittedCount: round.answers.size,
    };
  }

  private toCountdownPayload(room: InternalRoom, now: Date): RealOrAiCountdownPayload {
    return {
      remainingSeconds: room.settings.countdownSeconds,
      roomCode: room.roomCode,
      startsAt: new Date(now.getTime() + (room.settings.countdownSeconds * 1000)).toISOString(),
    };
  }

  private pickRoundItems(roundCount: number): RealOrAiPrivateRoundItem[] {
    return this.shuffleArray(this.roundItems).slice(0, roundCount);
  }

  private shuffleArray<T>(items: readonly T[]): T[] {
    const shuffled = [...items];

    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const targetIndex = randomInt(index + 1);
      const current = shuffled[index];
      const target = shuffled[targetIndex];

      if (current === undefined || target === undefined) {
        continue;
      }

      shuffled[index] = target;
      shuffled[targetIndex] = current;
    }

    return shuffled;
  }

  private assertRoundCountAvailable(roundCount: number) {
    if (roundCount > this.getPlayableRoundCount()) {
      throw new RealOrAiRoomError(
        "NOT_ENOUGH_ROUND_ITEMS",
        "라운드 이미지가 부족해요.",
      );
    }
  }

  private requireRoom(roomCode: string): InternalRoom {
    const room = this.rooms.get(roomCode);

    if (!room) {
      throw new RealOrAiRoomError("ROOM_NOT_FOUND", "방을 찾을 수 없습니다.");
    }

    return room;
  }

  private requirePlayerInRoom(room: InternalRoom, socketId: string): InternalPlayer {
    const player = room.players.find((candidate) => candidate.socketId === socketId);

    if (!player) {
      throw new RealOrAiRoomError(
        "PLAYER_NOT_IN_ROOM",
        "방 입장 상태를 다시 확인해 주세요.",
      );
    }

    return player;
  }

  private requireGame(room: InternalRoom): InternalGame {
    if (!room.game) {
      throw new RealOrAiRoomError("GAME_NOT_STARTED", "게임이 아직 시작되지 않았습니다.");
    }

    return room.game;
  }

  private requireCurrentRound(room: InternalRoom): InternalRound {
    const round = room.game?.currentRound;

    if (!round) {
      throw new RealOrAiRoomError("ROUND_NOT_FOUND", "진행 중인 라운드가 없습니다.");
    }

    return round;
  }

  private requireAnsweringRound(room: InternalRoom): InternalRound {
    const round = this.requireCurrentRound(room);

    if (room.status !== "answering" || round.status !== "answering") {
      throw new RealOrAiRoomError("ANSWER_CLOSED", "지금은 답을 제출할 수 없습니다.");
    }

    return round;
  }

  private assertHost(room: InternalRoom, playerId: string) {
    if (room.hostPlayerId !== playerId) {
      throw new RealOrAiRoomError("HOST_ONLY", "호스트만 할 수 있어요.");
    }
  }

  private assertPlayerMatchesPayload(socketPlayerId: string, payloadPlayerId: string) {
    if (socketPlayerId !== payloadPlayerId) {
      throw new RealOrAiRoomError(
        "PLAYER_MISMATCH",
        "플레이어 정보를 확인해 주세요.",
      );
    }
  }

  private haveAllConnectedPlayersAnswered(
    room: InternalRoom,
    round: InternalRound,
  ): boolean {
    const connectedPlayers = this.getConnectedPlayers(room);

    return (
      connectedPlayers.length > 0 &&
      connectedPlayers.every((player) => round.answers.has(player.playerId))
    );
  }

  private createPlayer(nickname: string, socketId: string, joinedAt: string): InternalPlayer {
    return {
      connectionStatus: "connected",
      joinedAt,
      nickname,
      playerId: randomUUID(),
      reconnectToken: randomUUID(),
      score: 0,
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

    throw new RealOrAiRoomError(
      "ROOM_CODE_EXHAUSTED",
      "새 방 코드를 만들 수 없습니다.",
    );
  }

  private createUniqueNickname(nickname: string, existingNicknames: string[]): string {
    const used = new Set(existingNicknames);

    if (!used.has(nickname)) {
      return nickname;
    }

    for (let index = 2; index <= REAL_OR_AI_MAX_PLAYERS + 1; index += 1) {
      const suffix = String(index);
      const base = nickname.slice(0, Math.max(1, 12 - suffix.length));
      const candidate = `${base}${suffix}`;

      if (!used.has(candidate)) {
        return candidate;
      }
    }

    throw new RealOrAiRoomError(
      "NICKNAME_EXHAUSTED",
      "사용할 수 있는 닉네임을 찾지 못했습니다.",
    );
  }

  private toPublicRound(round: InternalRound): RealOrAiRoundState {
    return {
      endsAt: round.endsAt,
      item: round.item,
      roundId: round.roundId,
      roundNumber: round.roundNumber,
      startedAt: round.startedAt,
      status: round.status,
      totalRounds: round.totalRounds,
    };
  }

  private toRoomState(room: InternalRoom): RealOrAiRoomState {
    return {
      createdAt: room.createdAt,
      currentRound: room.currentRound ? this.toPublicRound(room.currentRound) : undefined,
      gameId: room.gameId,
      hostPlayerId: room.hostPlayerId,
      maxPlayers: room.maxPlayers,
      minPlayers: room.minPlayers,
      playableRoundCount: room.playableRoundCount,
      players: room.players.map(
        ({ connectionStatus, joinedAt, nickname, playerId, score }): RealOrAiPlayerState => ({
          connectionStatus,
          joinedAt,
          nickname,
          playerId,
          score,
        }),
      ),
      roomCode: room.roomCode,
      roomId: room.roomId,
      settings: { ...room.settings },
      status: room.status,
      updatedAt: room.updatedAt,
    };
  }
}
