import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { realOrAiManifestSchema } from "@ai-arcade/shared";

import { RealOrAiRoomManager } from "./real-or-ai-room-manager.js";
import { realOrAiRoundItems } from "./real-or-ai-round-items.generated.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const forbiddenPublicFilenameHints =
  /real_|ai_|real|ai|answer|correct|true|fake|original|generated/i;

describe("generated Real or AI round items", () => {
  it("passes the private manifest schema and exposes the current playable count", () => {
    const parsed = realOrAiManifestSchema.safeParse({
      items: realOrAiRoundItems,
      version: 1,
    });

    expect(parsed.success).toBe(true);
    expect(new RealOrAiRoomManager(realOrAiRoundItems).getPlayableRoundCount()).toBe(160);
  });

  it("uses neutral public filenames that all exist", () => {
    for (const item of realOrAiRoundItems) {
      for (const candidate of item.candidates) {
        const filename = path.basename(candidate.src);
        const publicFilePath = path.join(
          repoRoot,
          "apps/web/public",
          candidate.src.replace(/^\//, ""),
        );

        expect(filename).toMatch(/^item-\d{3}-[ab]\.webp$/);
        expect(filename).not.toMatch(forbiddenPublicFilenameHints);
        expect(existsSync(publicFilePath)).toBe(true);
      }
    }
  });

  it("does not expose hidden answer metadata in public round state", () => {
    const manager = new RealOrAiRoomManager(realOrAiRoundItems);
    const host = manager.createRoom({ nickname: "호스트" }, "socket-host");
    manager.joinRoom(
      {
        nickname: "참가자",
        roomCode: host.room.roomCode,
      },
      "socket-guest",
    );
    manager.startGame({ roomCode: host.room.roomCode }, "socket-host");
    const round = manager.startAnsweringRound(host.room.roomCode);

    expect(JSON.stringify(round)).not.toContain("sourceType");
    expect(JSON.stringify(round)).not.toContain("correctCandidateId");
  });
});
