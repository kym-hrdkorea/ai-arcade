import { randomInt, randomUUID } from "node:crypto";

import {
  DEFAULT_THREE_WORD_MONSTER_SETTINGS,
  THREE_WORD_MONSTER_GAME_ID,
  THREE_WORD_MONSTER_MAX_PLAYERS,
  THREE_WORD_MONSTER_MIN_PLAYERS,
  threeWordMonsterGameStartPayloadSchema,
  threeWordMonsterRoomCreatePayloadSchema,
  threeWordMonsterRoomJoinPayloadSchema,
  threeWordMonsterRoomLeavePayloadSchema,
  threeWordMonsterRoomRejoinPayloadSchema,
  threeWordMonsterRoomResetPayloadSchema,
  threeWordMonsterVoteSubmitPayloadSchema,
  threeWordMonsterWordsSubmitPayloadSchema,
  type ThreeWordMonsterGameStartNoticePayload,
  type ThreeWordMonsterGameStartPayload,
  type ThreeWordMonsterImageState,
  type ThreeWordMonsterPlayerState,
  type ThreeWordMonsterResultEntry,
  type ThreeWordMonsterResultPayload,
  type ThreeWordMonsterRoomCreatePayload,
  type ThreeWordMonsterRoomJoinedPayload,
  type ThreeWordMonsterRoomJoinPayload,
  type ThreeWordMonsterRoomLeavePayload,
  type ThreeWordMonsterRoomRejoinPayload,
  type ThreeWordMonsterRoomResetPayload,
  type ThreeWordMonsterRoomState,
  type ThreeWordMonsterSubmissionSummary,
  type ThreeWordMonsterVoteState,
  type ThreeWordMonsterVoteSubmitPayload,
  type ThreeWordMonsterVoteSubmittedPayload,
  type ThreeWordMonsterWords,
  type ThreeWordMonsterWordsSubmitPayload,
} from "@ai-arcade/shared";

import {
  MockMonsterImageGenerator,
  type MonsterImageGenerator,
} from "./three-word-monster-image-generator.js";

const roomCodeAlphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const roomCodeLength = 6;

type InternalPlayer = ThreeWordMonsterPlayerState & {
  disconnectedAt?: string;
  reconnectToken: string;
  socketId: string;
};

type InternalSubmission = ThreeWordMonsterSubmissionSummary & {
  words: ThreeWordMonsterWords;
};

type InternalRoom = Omit<
  ThreeWordMonsterRoomState,
  "images" | "players" | "submissions" | "votes"
> & {
  images: Map<string, ThreeWordMonsterImageState>;
  players: InternalPlayer[];
  submissions: Map<string, InternalSubmission>;
  votes: Map<string, ThreeWordMonsterVoteState>;
};

export class ThreeWordMonsterRoomError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ThreeWordMonsterRoomError";
  }
}

export type ThreeWordMonsterStartGameResult = {
  notice: ThreeWordMonsterGameStartNoticePayload;
  room: ThreeWordMonsterRoomState;
};

export type ThreeWordMonsterWordsSubmitResult = {
  readyToGenerate: boolean;
  room: ThreeWordMonsterRoomState;
};

export type ThreeWordMonsterImageGenerationResult = {
  images: ThreeWordMonsterImageState[];
  room: ThreeWordMonsterRoomState;
};

export type ThreeWordMonsterVoteResult =
  | {
      kind: "accepted";
      room: ThreeWordMonsterRoomState;
      vote: ThreeWordMonsterVoteSubmittedPayload;
    }
  | {
      kind: "result";
      result: ThreeWordMonsterResultPayload;
      room: ThreeWordMonsterRoomState;
      vote: ThreeWordMonsterVoteSubmittedPayload;
    };

export type ThreeWordMonsterLeaveResult = {
  room?: ThreeWordMonsterRoomState;
  roomCode: string;
};

export class ThreeWordMonsterRoomManager {
  private readonly fallbackGenerator = new MockMonsterImageGenerator();
  private readonly rooms = new Map<string, InternalRoom>();

  constructor(private readonly imageGenerator: MonsterImageGenerator = new MockMonsterImageGenerator()) {}

  getRoomCount(): number {
    return this.rooms.size;
  }

  createRoom(
    payload: ThreeWordMonsterRoomCreatePayload,
    socketId: string,
  ): ThreeWordMonsterRoomJoinedPayload {
    const parsed = threeWordMonsterRoomCreatePayloadSchema.safeParse(payload);

    if (!parsed.success) {
      throw new ThreeWordMonsterRoomError(
        "INVALID_ROOM_CREATE",
        parsed.error.issues[0]?.message ?? "방 생성 정보를 확인해 주세요.",
      );
    }

    const now = new Date().toISOString();
    const player = this.createPlayer(parsed.data.nickname, socketId, now);
    const roomCode = this.createUniqueRoomCode();
    const room: InternalRoom = {
      createdAt: now,
      gameId: THREE_WORD_MONSTER_GAME_ID,
      hostPlayerId: player.playerId,
      images: new Map(),
      maxPlayers: THREE_WORD_MONSTER_MAX_PLAYERS,
      minPlayers: THREE_WORD_MONSTER_MIN_PLAYERS,
      players: [player],
      result: undefined,
      roomCode,
      roomId: randomUUID(),
      settings: { ...DEFAULT_THREE_WORD_MONSTER_SETTINGS },
      status: "waiting",
      submissions: new Map(),
      updatedAt: now,
      votes: new Map(),
    };

    this.rooms.set(roomCode, room);

    return {
      currentPlayerId: player.playerId,
      reconnectToken: player.reconnectToken,
      room: this.toRoomState(room),
    };
  }

  joinRoom(
    payload: ThreeWordMonsterRoomJoinPayload,
    socketId: string,
  ): ThreeWordMonsterRoomJoinedPayload {
    const parsed = threeWordMonsterRoomJoinPayloadSchema.safeParse(payload);

    if (!parsed.success) {
      throw new ThreeWordMonsterRoomError(
        "INVALID_ROOM_JOIN",
        parsed.error.issues[0]?.message ?? "입장 정보를 확인해 주세요.",
      );
    }

    const room = this.requireRoom(parsed.data.roomCode);

    if (room.status !== "waiting") {
      throw new ThreeWordMonsterRoomError(
        "ROOM_NOT_WAITING",
        "이미 진행 중인 방입니다.",
      );
    }

    if (this.getConnectedPlayers(room).length >= room.maxPlayers) {
      throw new ThreeWordMonsterRoomError("ROOM_FULL", "방이 가득 찼습니다.");
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
    payload: ThreeWordMonsterRoomRejoinPayload,
    socketId: string,
  ): ThreeWordMonsterRoomJoinedPayload {
    const parsed = threeWordMonsterRoomRejoinPayloadSchema.safeParse(payload);

    if (!parsed.success) {
      throw new ThreeWordMonsterRoomError(
        "INVALID_ROOM_REJOIN",
        parsed.error.issues[0]?.message ?? "재접속 정보를 확인해 주세요.",
      );
    }

    const room = this.requireRoom(parsed.data.roomCode);
    const player = room.players.find(
      (candidate) => candidate.playerId === parsed.data.playerId,
    );

    if (!player || player.reconnectToken !== parsed.data.reconnectToken) {
      throw new ThreeWordMonsterRoomError(
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

  leaveRoom(payload: ThreeWordMonsterRoomLeavePayload, socketId: string): ThreeWordMonsterLeaveResult {
    const parsed = threeWordMonsterRoomLeavePayloadSchema.safeParse(payload);

    if (!parsed.success) {
      throw new ThreeWordMonsterRoomError(
        "INVALID_ROOM_LEAVE",
        parsed.error.issues[0]?.message ?? "방 나가기 정보를 확인해 주세요.",
      );
    }

    const room = this.requireRoom(parsed.data.roomCode);
    const player = this.requirePlayerInRoom(room, socketId);
    room.players = room.players.filter((candidate) => candidate.playerId !== player.playerId);
    room.submissions.delete(player.playerId);
    room.votes.delete(player.playerId);

    for (const [monsterId, image] of room.images) {
      if (image.ownerPlayerId === player.playerId) {
        room.images.delete(monsterId);
      }
    }

    if (room.players.length === 0) {
      this.rooms.delete(room.roomCode);
      return {
        roomCode: room.roomCode,
      };
    }

    if (room.hostPlayerId === player.playerId) {
      room.hostPlayerId = room.players[0]?.playerId ?? room.hostPlayerId;
    }

    room.updatedAt = new Date().toISOString();

    return {
      room: this.toRoomState(room),
      roomCode: room.roomCode,
    };
  }

  markDisconnected(socketId: string): ThreeWordMonsterRoomState | undefined {
    for (const room of this.rooms.values()) {
      const player = room.players.find((candidate) => candidate.socketId === socketId);

      if (!player) {
        continue;
      }

      player.connectionStatus = "disconnected";
      player.disconnectedAt = new Date().toISOString();
      room.updatedAt = player.disconnectedAt;
      return this.toRoomState(room);
    }

    return undefined;
  }

  startGame(
    payload: ThreeWordMonsterGameStartPayload,
    socketId: string,
  ): ThreeWordMonsterStartGameResult {
    const parsed = threeWordMonsterGameStartPayloadSchema.safeParse(payload);

    if (!parsed.success) {
      throw new ThreeWordMonsterRoomError(
        "INVALID_GAME_START",
        parsed.error.issues[0]?.message ?? "게임 시작 정보를 확인해 주세요.",
      );
    }

    const room = this.requireRoom(parsed.data.roomCode);
    const player = this.requirePlayerInRoom(room, socketId);
    this.assertHost(room, player.playerId);

    if (room.status !== "waiting") {
      throw new ThreeWordMonsterRoomError(
        "ROOM_NOT_WAITING",
        "대기 중인 방만 시작할 수 있습니다.",
      );
    }

    if (this.getConnectedPlayers(room).length < room.minPlayers) {
      throw new ThreeWordMonsterRoomError(
        "NOT_ENOUGH_PLAYERS",
        "2명 이상 모이면 시작할 수 있습니다.",
      );
    }

    const now = new Date().toISOString();
    room.status = "word-submission";
    room.submissions.clear();
    room.images.clear();
    room.votes.clear();
    room.result = undefined;
    room.updatedAt = now;

    return {
      notice: {
        message: "세 단어를 입력해 괴물을 소환하세요.",
        roomCode: room.roomCode,
      },
      room: this.toRoomState(room),
    };
  }

  submitWords(
    payload: ThreeWordMonsterWordsSubmitPayload,
    socketId: string,
  ): ThreeWordMonsterWordsSubmitResult {
    const parsed = threeWordMonsterWordsSubmitPayloadSchema.safeParse(payload);

    if (!parsed.success) {
      throw new ThreeWordMonsterRoomError(
        "INVALID_WORDS",
        parsed.error.issues[0]?.message ?? "단어 3개를 확인해 주세요.",
      );
    }

    const room = this.requireRoom(parsed.data.roomCode);
    const player = this.requirePlayerInRoom(room, socketId);
    this.assertPlayerMatchesPayload(player.playerId, parsed.data.playerId);

    if (room.status !== "word-submission") {
      throw new ThreeWordMonsterRoomError(
        "WORDS_CLOSED",
        "지금은 단어를 제출할 수 없습니다.",
      );
    }

    if (room.submissions.has(player.playerId)) {
      throw new ThreeWordMonsterRoomError(
        "WORDS_ALREADY_SUBMITTED",
        "이미 단어를 제출했습니다.",
      );
    }

    const submittedAt = new Date().toISOString();
    room.submissions.set(player.playerId, {
      nickname: player.nickname,
      playerId: player.playerId,
      submittedAt,
      words: parsed.data.words,
    });
    room.updatedAt = submittedAt;

    const readyToGenerate = this.getConnectedPlayers(room).every((candidate) =>
      room.submissions.has(candidate.playerId),
    );

    if (readyToGenerate) {
      room.status = "image-generating";
    }

    return {
      readyToGenerate,
      room: this.toRoomState(room),
    };
  }

  async generateImages(roomCode: string): Promise<ThreeWordMonsterImageGenerationResult> {
    const room = this.requireRoom(roomCode);

    if (room.status !== "image-generating") {
      throw new ThreeWordMonsterRoomError(
        "GENERATION_NOT_READY",
        "아직 이미지를 생성할 수 없습니다.",
      );
    }

    const generatedImages: ThreeWordMonsterImageState[] = [];

    for (const player of this.getConnectedPlayers(room)) {
      const submission = room.submissions.get(player.playerId);

      if (!submission) {
        continue;
      }

      const generatedAt = new Date().toISOString();
      const output = await this.generateImageWithFallback({
        nickname: player.nickname,
        playerId: player.playerId,
        roomCode: room.roomCode,
        words: submission.words,
      });
      const image: ThreeWordMonsterImageState = {
        generatedAt,
        imageDataUrl: output.imageDataUrl,
        monsterId: randomUUID(),
        ownerNickname: player.nickname,
        ownerPlayerId: player.playerId,
        provider: output.provider,
        words: submission.words,
      };
      room.images.set(image.monsterId, image);
      generatedImages.push(image);
    }

    room.status = "voting";
    room.updatedAt = new Date().toISOString();

    return {
      images: generatedImages,
      room: this.toRoomState(room),
    };
  }

  submitVote(
    payload: ThreeWordMonsterVoteSubmitPayload,
    socketId: string,
  ): ThreeWordMonsterVoteResult {
    const parsed = threeWordMonsterVoteSubmitPayloadSchema.safeParse(payload);

    if (!parsed.success) {
      throw new ThreeWordMonsterRoomError(
        "INVALID_VOTE",
        parsed.error.issues[0]?.message ?? "투표 정보를 확인해 주세요.",
      );
    }

    const room = this.requireRoom(parsed.data.roomCode);
    const player = this.requirePlayerInRoom(room, socketId);
    this.assertPlayerMatchesPayload(player.playerId, parsed.data.playerId);

    if (room.status !== "voting") {
      throw new ThreeWordMonsterRoomError(
        "VOTING_CLOSED",
        "지금은 투표할 수 없습니다.",
      );
    }

    const target = room.images.get(parsed.data.monsterId);

    if (!target) {
      throw new ThreeWordMonsterRoomError(
        "MONSTER_NOT_FOUND",
        "투표할 괴물을 찾을 수 없습니다.",
      );
    }

    if (target.ownerPlayerId === player.playerId) {
      throw new ThreeWordMonsterRoomError(
        "SELF_VOTE_NOT_ALLOWED",
        "자기 괴물에는 투표할 수 없습니다.",
      );
    }

    if (room.votes.has(player.playerId)) {
      throw new ThreeWordMonsterRoomError(
        "VOTE_ALREADY_SUBMITTED",
        "이미 투표했습니다.",
      );
    }

    const vote: ThreeWordMonsterVoteState = {
      submittedAt: new Date().toISOString(),
      targetMonsterId: target.monsterId,
      voterPlayerId: player.playerId,
    };
    room.votes.set(player.playerId, vote);
    room.updatedAt = vote.submittedAt;

    const votePayload = this.toVoteSubmittedPayload(room, vote);

    if (!this.haveAllEligiblePlayersVoted(room)) {
      return {
        kind: "accepted",
        room: this.toRoomState(room),
        vote: votePayload,
      };
    }

    room.status = "revealing";
    room.result = this.buildResult(room);
    room.status = "result";
    room.updatedAt = room.result.endedAt;

    return {
      kind: "result",
      result: room.result,
      room: this.toRoomState(room),
      vote: votePayload,
    };
  }

  resetRoom(
    payload: ThreeWordMonsterRoomResetPayload,
    socketId: string,
  ): ThreeWordMonsterRoomState {
    const parsed = threeWordMonsterRoomResetPayloadSchema.safeParse(payload);

    if (!parsed.success) {
      throw new ThreeWordMonsterRoomError(
        "INVALID_ROOM_RESET",
        parsed.error.issues[0]?.message ?? "방 리셋 정보를 확인해 주세요.",
      );
    }

    const room = this.requireRoom(parsed.data.roomCode);
    const player = this.requirePlayerInRoom(room, socketId);
    this.assertHost(room, player.playerId);

    room.status = "waiting";
    room.submissions.clear();
    room.images.clear();
    room.votes.clear();
    room.result = undefined;
    room.updatedAt = new Date().toISOString();

    return this.toRoomState(room);
  }

  private async generateImageWithFallback(input: {
    nickname: string;
    playerId: string;
    roomCode: string;
    words: ThreeWordMonsterWords;
  }) {
    try {
      return await this.imageGenerator.generate(input);
    } catch (error: unknown) {
      console.warn(
        `[three-word-monster] image provider failed room=${input.roomCode} player=${input.playerId}; falling back to mock.`,
        error,
      );
      return this.fallbackGenerator.generate(input);
    }
  }

  private toVoteSubmittedPayload(
    room: InternalRoom,
    vote: ThreeWordMonsterVoteState,
  ): ThreeWordMonsterVoteSubmittedPayload {
    const voterCount = this.getEligibleVoterIds(room).length;

    return {
      roomCode: room.roomCode,
      totalVotes: room.votes.size,
      vote,
      voterCount,
    };
  }

  private haveAllEligiblePlayersVoted(room: InternalRoom): boolean {
    const eligibleVoterIds = this.getEligibleVoterIds(room);

    return (
      eligibleVoterIds.length > 0 &&
      eligibleVoterIds.every((playerId) => room.votes.has(playerId))
    );
  }

  private getEligibleVoterIds(room: InternalRoom): string[] {
    return this.getConnectedPlayers(room)
      .filter((player) =>
        [...room.images.values()].some((image) => image.ownerPlayerId === player.playerId),
      )
      .map((player) => player.playerId);
  }

  private buildResult(room: InternalRoom): ThreeWordMonsterResultPayload {
    const voteCounts = new Map<string, number>();

    for (const image of room.images.values()) {
      voteCounts.set(image.monsterId, 0);
    }

    for (const vote of room.votes.values()) {
      voteCounts.set(vote.targetMonsterId, (voteCounts.get(vote.targetMonsterId) ?? 0) + 1);
    }

    const sorted = [...room.images.values()].sort((first, second) => {
      const voteDiff =
        (voteCounts.get(second.monsterId) ?? 0) - (voteCounts.get(first.monsterId) ?? 0);

      if (voteDiff !== 0) {
        return voteDiff;
      }

      return first.ownerNickname.localeCompare(second.ownerNickname, "ko-KR");
    });
    const winningVotes = voteCounts.get(sorted[0]?.monsterId ?? "") ?? 0;
    let previousVotes: number | undefined;
    let previousRank = 0;
    const entries: ThreeWordMonsterResultEntry[] = sorted.map((image, index) => {
      const votes = voteCounts.get(image.monsterId) ?? 0;
      const rank = previousVotes === votes ? previousRank : index + 1;
      previousVotes = votes;
      previousRank = rank;

      return {
        ...image,
        isWinner: votes === winningVotes,
        rank,
        votes,
      };
    });
    const winners = entries.filter((entry) => entry.isWinner);

    return {
      endedAt: new Date().toISOString(),
      entries,
      isTie: winners.length > 1,
      roomCode: room.roomCode,
      winners,
    };
  }

  private requireRoom(roomCode: string): InternalRoom {
    const room = this.rooms.get(roomCode);

    if (!room) {
      throw new ThreeWordMonsterRoomError(
        "ROOM_NOT_FOUND",
        "방을 찾을 수 없습니다.",
      );
    }

    return room;
  }

  private requirePlayerInRoom(room: InternalRoom, socketId: string): InternalPlayer {
    const player = room.players.find((candidate) => candidate.socketId === socketId);

    if (!player) {
      throw new ThreeWordMonsterRoomError(
        "PLAYER_NOT_IN_ROOM",
        "방 입장 상태를 다시 확인해 주세요.",
      );
    }

    return player;
  }

  private assertHost(room: InternalRoom, playerId: string) {
    if (room.hostPlayerId !== playerId) {
      throw new ThreeWordMonsterRoomError("HOST_ONLY", "호스트만 할 수 있습니다.");
    }
  }

  private assertPlayerMatchesPayload(socketPlayerId: string, payloadPlayerId: string) {
    if (socketPlayerId !== payloadPlayerId) {
      throw new ThreeWordMonsterRoomError(
        "PLAYER_MISMATCH",
        "플레이어 정보를 확인해 주세요.",
      );
    }
  }

  private createPlayer(nickname: string, socketId: string, joinedAt: string): InternalPlayer {
    return {
      connectionStatus: "connected",
      joinedAt,
      nickname,
      playerId: randomUUID(),
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

    throw new ThreeWordMonsterRoomError(
      "ROOM_CODE_EXHAUSTED",
      "새 방 코드를 만들 수 없습니다.",
    );
  }

  private createUniqueNickname(nickname: string, existingNicknames: string[]): string {
    const used = new Set(existingNicknames);

    if (!used.has(nickname)) {
      return nickname;
    }

    for (let index = 2; index <= THREE_WORD_MONSTER_MAX_PLAYERS + 1; index += 1) {
      const suffix = String(index);
      const base = nickname.slice(0, Math.max(1, 12 - suffix.length));
      const candidate = `${base}${suffix}`;

      if (!used.has(candidate)) {
        return candidate;
      }
    }

    throw new ThreeWordMonsterRoomError(
      "NICKNAME_EXHAUSTED",
      "사용할 수 있는 닉네임을 찾지 못했습니다.",
    );
  }

  private toRoomState(room: InternalRoom): ThreeWordMonsterRoomState {
    return {
      createdAt: room.createdAt,
      gameId: room.gameId,
      hostPlayerId: room.hostPlayerId,
      images: [...room.images.values()],
      maxPlayers: room.maxPlayers,
      minPlayers: room.minPlayers,
      players: room.players.map(
        ({ connectionStatus, joinedAt, nickname, playerId }): ThreeWordMonsterPlayerState => ({
          connectionStatus,
          joinedAt,
          nickname,
          playerId,
        }),
      ),
      result: room.result,
      roomCode: room.roomCode,
      roomId: room.roomId,
      settings: { ...room.settings },
      status: room.status,
      submissions: [...room.submissions.values()].map(
        ({ nickname, playerId, submittedAt }): ThreeWordMonsterSubmissionSummary => ({
          nickname,
          playerId,
          submittedAt,
        }),
      ),
      updatedAt: room.updatedAt,
      votes: [...room.votes.values()],
    };
  }
}
