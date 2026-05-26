import { describe, expect, it } from "vitest";

import { drawDuelGame, games, realOrAiGame } from "./index.js";

describe("game registry", () => {
  it("registers draw-duel with the expected route", () => {
    expect(games).toContain(drawDuelGame);
    expect(drawDuelGame.id).toBe("draw-duel");
    expect(drawDuelGame.route).toBe("/games/draw-duel");
    expect(drawDuelGame.maxPlayers).toBe(120);
  });

  it("registers real-or-ai with the expected route and capacity", () => {
    expect(games).toContain(realOrAiGame);
    expect(realOrAiGame.id).toBe("real-or-ai");
    expect(realOrAiGame.route).toBe("/games/real-or-ai");
    expect(realOrAiGame.maxPlayers).toBe(120);
  });

  it("registers guide slides for every game card", () => {
    for (const game of games) {
      expect(game.guide.slides.length).toBeGreaterThan(0);

      for (const slide of game.guide.slides) {
        expect(slide.title).not.toHaveLength(0);
        expect(slide.body).not.toHaveLength(0);
        expect(slide.items.length).toBeGreaterThan(0);
      }
    }
  });

  it("marks current playable games as beta", () => {
    expect(games.map((game) => [game.id, game.status])).toEqual([
      ["draw-duel", "beta"],
      ["real-or-ai", "beta"],
    ]);
  });

  it("uses normalized arcade WebP thumbnails for the playable games", () => {
    expect(games.map((game) => [game.id, game.thumbnail])).toEqual([
      ["draw-duel", "/games/draw-duel-arcade.webp"],
      ["real-or-ai", "/games/real-or-ai-arcade.webp"],
    ]);
  });

  it("keeps public guide copy aligned with current gameplay", () => {
    const guideCopy: string[] = [];

    for (const game of games) {
      for (const slide of game.guide.slides) {
        guideCopy.push(slide.title, slide.body, ...slide.items);
      }
    }

    const guideText = guideCopy.join("\n");

    expect(guideText).toContain("인간 정답자 과반수");
    expect(guideText).toContain("AI 정답 시 AI +100");
    expect(guideText).toContain("5/10/15/30/45/60초");
    expect(guideText).toContain("권장 45초");

    for (const hiddenImplementationTerm of [
      "mock 이미지 provider",
      "asset phase",
      "5/10/15초만",
    ]) {
      expect(guideText).not.toContain(hiddenImplementationTerm);
    }
  });
});
