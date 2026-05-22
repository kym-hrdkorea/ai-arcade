import { describe, expect, it } from "vitest";

import {
  DEFAULT_DRAW_DUEL_SETTINGS,
  drawDuelSettingsSchema,
} from "./realtime.js";

describe("Draw Duel realtime settings", () => {
  it("accepts screen join code visibility modes", () => {
    expect(
      drawDuelSettingsSchema.safeParse({
        ...DEFAULT_DRAW_DUEL_SETTINGS,
        screenJoinCodeVisibility: "waiting-only",
      }).success,
    ).toBe(true);
    expect(
      drawDuelSettingsSchema.safeParse({
        ...DEFAULT_DRAW_DUEL_SETTINGS,
        screenJoinCodeVisibility: "always",
      }).success,
    ).toBe(true);
  });

  it("rejects unknown screen join code visibility modes", () => {
    expect(
      drawDuelSettingsSchema.safeParse({
        ...DEFAULT_DRAW_DUEL_SETTINGS,
        screenJoinCodeVisibility: "never",
      }).success,
    ).toBe(false);
  });
});
