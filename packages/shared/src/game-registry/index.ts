import { drawDuelGame } from "./draw-duel.js";
import { realOrAiGame } from "./real-or-ai.js";

export const games = [drawDuelGame, realOrAiGame] as const;

export { drawDuelGame };
export { realOrAiGame };
