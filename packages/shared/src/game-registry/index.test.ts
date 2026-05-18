import { describe, expect, it } from "vitest";

import { drawDuelGame, games, threeWordMonsterGame } from "./index.js";

describe("game registry", () => {
  it("registers draw-duel with the expected route", () => {
    expect(games).toContain(drawDuelGame);
    expect(drawDuelGame.id).toBe("draw-duel");
    expect(drawDuelGame.route).toBe("/games/draw-duel");
  });

  it("registers three-word-monster with the expected route", () => {
    expect(games).toContain(threeWordMonsterGame);
    expect(threeWordMonsterGame.id).toBe("three-word-monster");
    expect(threeWordMonsterGame.route).toBe("/games/three-word-monster");
    expect(threeWordMonsterGame.maxPlayers).toBe(10);
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
});
