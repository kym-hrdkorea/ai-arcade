import { describe, expect, it } from "vitest";

import type {
  ThreeWordMonsterWords,
  ThreeWordMonsterWordsSubmitPayload,
} from "@ai-arcade/shared";

import type {
  MonsterImageGenerator,
  MonsterImageGeneratorInput,
  MonsterImageGeneratorOutput,
} from "./three-word-monster-image-generator.js";
import {
  ThreeWordMonsterRoomError,
  ThreeWordMonsterRoomManager,
} from "./three-word-monster-room-manager.js";

class FixedMonsterImageGenerator implements MonsterImageGenerator {
  constructor(private readonly provider: MonsterImageGeneratorOutput["provider"] = "mock") {}

  async generate(input: MonsterImageGeneratorInput): Promise<MonsterImageGeneratorOutput> {
    return {
      imageDataUrl: `data:image/svg+xml;base64,${Buffer.from(input.words.join("|"), "utf8").toString("base64")}`,
      provider: this.provider,
    };
  }
}

class ThrowingMonsterImageGenerator implements MonsterImageGenerator {
  async generate(): Promise<MonsterImageGeneratorOutput> {
    throw new Error("provider failed");
  }
}

function createRoom(manager = new ThreeWordMonsterRoomManager(new FixedMonsterImageGenerator())) {
  return manager.createRoom(
    {
      nickname: "호스트",
    },
    "socket-host",
  );
}

function joinPlayer(
  manager: ThreeWordMonsterRoomManager,
  roomCode: string,
  index: number,
) {
  return manager.joinRoom(
    {
      nickname: `참가자${index}`,
      roomCode,
    },
    `socket-${index}`,
  );
}

function startGame(manager: ThreeWordMonsterRoomManager, roomCode: string) {
  return manager.startGame(
    {
      roomCode,
    },
    "socket-host",
  );
}

function wordsFor(index: number): ThreeWordMonsterWords {
  return [`용${index}`, `로봇${index}`, `우산${index}`];
}

function submitWords(
  manager: ThreeWordMonsterRoomManager,
  roomCode: string,
  playerId: string,
  socketId: string,
  words: ThreeWordMonsterWords = wordsFor(1),
) {
  const payload: ThreeWordMonsterWordsSubmitPayload = {
    playerId,
    roomCode,
    words,
  };

  return manager.submitWords(payload, socketId);
}

async function createVotingRoom(playerCount = 3) {
  const manager = new ThreeWordMonsterRoomManager(new FixedMonsterImageGenerator());
  const host = createRoom(manager);
  const players = [host];

  for (let index = 1; index < playerCount; index += 1) {
    players.push(joinPlayer(manager, host.room.roomCode, index));
  }

  startGame(manager, host.room.roomCode);
  players.forEach((player, index) => {
    submitWords(
      manager,
      host.room.roomCode,
      player.currentPlayerId,
      index === 0 ? "socket-host" : `socket-${index}`,
      wordsFor(index),
    );
  });
  const generated = await manager.generateImages(host.room.roomCode);

  return {
    generated,
    host,
    manager,
    players,
    roomCode: host.room.roomCode,
  };
}

describe("ThreeWordMonsterRoomManager", () => {
  it("limits rooms to 10 connected players", () => {
    const manager = new ThreeWordMonsterRoomManager(new FixedMonsterImageGenerator());
    const host = createRoom(manager);

    for (let index = 1; index < 10; index += 1) {
      joinPlayer(manager, host.room.roomCode, index);
    }

    expect(() => joinPlayer(manager, host.room.roomCode, 10)).toThrow(
      ThreeWordMonsterRoomError,
    );
  });

  it("validates exactly three submitted words", () => {
    const manager = new ThreeWordMonsterRoomManager(new FixedMonsterImageGenerator());
    const host = createRoom(manager);
    const guest = joinPlayer(manager, host.room.roomCode, 1);
    startGame(manager, host.room.roomCode);

    expect(() =>
      manager.submitWords(
        {
          playerId: host.currentPlayerId,
          roomCode: host.room.roomCode,
          words: ["용", "로봇"] as unknown as ThreeWordMonsterWords,
        },
        "socket-host",
      ),
    ).toThrow(ThreeWordMonsterRoomError);

    expect(
      submitWords(
        manager,
        host.room.roomCode,
        guest.currentPlayerId,
        "socket-1",
        ["용", "로봇", "우산"],
      ).readyToGenerate,
    ).toBe(false);
  });

  it("moves to voting after all players submit words and images are generated", async () => {
    const manager = new ThreeWordMonsterRoomManager(new FixedMonsterImageGenerator());
    const host = createRoom(manager);
    const guest = joinPlayer(manager, host.room.roomCode, 1);
    startGame(manager, host.room.roomCode);

    expect(
      submitWords(manager, host.room.roomCode, host.currentPlayerId, "socket-host").room
        .status,
    ).toBe("word-submission");

    const ready = submitWords(
      manager,
      host.room.roomCode,
      guest.currentPlayerId,
      "socket-1",
      wordsFor(2),
    );

    expect(ready.readyToGenerate).toBe(true);
    expect(ready.room.status).toBe("image-generating");

    const generated = await manager.generateImages(host.room.roomCode);

    expect(generated.room.status).toBe("voting");
    expect(generated.images).toHaveLength(2);
  });

  it("rejects voting for your own monster", async () => {
    const { generated, host, manager, roomCode } = await createVotingRoom(2);
    const ownMonster = generated.room.images.find(
      (image) => image.ownerPlayerId === host.currentPlayerId,
    );

    expect(ownMonster).toBeDefined();
    expect(() =>
      manager.submitVote(
        {
          monsterId: ownMonster?.monsterId ?? "",
          playerId: host.currentPlayerId,
          roomCode,
        },
        "socket-host",
      ),
    ).toThrow(ThreeWordMonsterRoomError);
  });

  it("rejects duplicate votes", async () => {
    const { generated, host, manager, players, roomCode } = await createVotingRoom(3);
    const target = generated.room.images.find(
      (image) => image.ownerPlayerId !== host.currentPlayerId,
    );

    expect(target).toBeDefined();
    manager.submitVote(
      {
        monsterId: target?.monsterId ?? "",
        playerId: host.currentPlayerId,
        roomCode,
      },
      "socket-host",
    );

    expect(() =>
      manager.submitVote(
        {
          monsterId:
            generated.room.images.find(
              (image) => image.ownerPlayerId !== players[1]?.currentPlayerId,
            )?.monsterId ?? "",
          playerId: players[1]?.currentPlayerId ?? "",
          roomCode,
        },
        "socket-1",
      ),
    ).not.toThrow();

    expect(() =>
      manager.submitVote(
        {
          monsterId: target?.monsterId ?? "",
          playerId: host.currentPlayerId,
          roomCode,
        },
        "socket-host",
      ),
    ).toThrow(ThreeWordMonsterRoomError);
  });

  it("moves to result when every eligible player has voted", async () => {
    const { generated, host, manager, players, roomCode } = await createVotingRoom(3);
    const hostTarget = generated.room.images.find(
      (image) => image.ownerPlayerId === players[1]?.currentPlayerId,
    );
    const playerOneTarget = generated.room.images.find(
      (image) => image.ownerPlayerId === host.currentPlayerId,
    );
    const playerTwoTarget = generated.room.images.find(
      (image) => image.ownerPlayerId === host.currentPlayerId,
    );

    manager.submitVote(
      {
        monsterId: hostTarget?.monsterId ?? "",
        playerId: host.currentPlayerId,
        roomCode,
      },
      "socket-host",
    );
    manager.submitVote(
      {
        monsterId: playerOneTarget?.monsterId ?? "",
        playerId: players[1]?.currentPlayerId ?? "",
        roomCode,
      },
      "socket-1",
    );
    const finalVote = manager.submitVote(
      {
        monsterId: playerTwoTarget?.monsterId ?? "",
        playerId: players[2]?.currentPlayerId ?? "",
        roomCode,
      },
      "socket-2",
    );

    expect(finalVote.kind).toBe("result");

    if (finalVote.kind === "result") {
      expect(finalVote.room.status).toBe("result");
      expect(finalVote.result.winners[0]?.ownerPlayerId).toBe(host.currentPlayerId);
      expect(finalVote.result.entries[0]?.votes).toBe(2);
    }
  });

  it("marks tied top monsters as shared winners", async () => {
    const { generated, host, manager, players, roomCode } = await createVotingRoom(3);
    const hostMonster = generated.room.images.find(
      (image) => image.ownerPlayerId === host.currentPlayerId,
    );
    const playerOneMonster = generated.room.images.find(
      (image) => image.ownerPlayerId === players[1]?.currentPlayerId,
    );
    const playerTwoMonster = generated.room.images.find(
      (image) => image.ownerPlayerId === players[2]?.currentPlayerId,
    );

    manager.submitVote(
      {
        monsterId: playerOneMonster?.monsterId ?? "",
        playerId: host.currentPlayerId,
        roomCode,
      },
      "socket-host",
    );
    manager.submitVote(
      {
        monsterId: playerTwoMonster?.monsterId ?? "",
        playerId: players[1]?.currentPlayerId ?? "",
        roomCode,
      },
      "socket-1",
    );
    const finalVote = manager.submitVote(
      {
        monsterId: hostMonster?.monsterId ?? "",
        playerId: players[2]?.currentPlayerId ?? "",
        roomCode,
      },
      "socket-2",
    );

    expect(finalVote.kind).toBe("result");

    if (finalVote.kind === "result") {
      expect(finalVote.result.isTie).toBe(true);
      expect(finalVote.result.winners).toHaveLength(3);
    }
  });

  it("falls back to mock images when the configured provider fails", async () => {
    const manager = new ThreeWordMonsterRoomManager(new ThrowingMonsterImageGenerator());
    const host = createRoom(manager);
    const guest = joinPlayer(manager, host.room.roomCode, 1);
    startGame(manager, host.room.roomCode);
    submitWords(manager, host.room.roomCode, host.currentPlayerId, "socket-host");
    submitWords(
      manager,
      host.room.roomCode,
      guest.currentPlayerId,
      "socket-1",
      wordsFor(2),
    );

    const generated = await manager.generateImages(host.room.roomCode);

    expect(generated.images).toHaveLength(2);
    expect(generated.images.every((image) => image.provider === "mock")).toBe(true);
  });
});
