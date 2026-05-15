import { describe, expect, it } from "vitest";

import { drawDuelGame, games } from "./index.js";

describe("game registry", () => {
  it("registers draw-duel with the expected route", () => {
    expect(games).toContain(drawDuelGame);
    expect(drawDuelGame.id).toBe("draw-duel");
    expect(drawDuelGame.route).toBe("/games/draw-duel");
  });
});
