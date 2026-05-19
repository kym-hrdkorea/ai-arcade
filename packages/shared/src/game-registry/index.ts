import { drawDuelGame } from "./draw-duel.js";
import { realOrAiGame } from "./real-or-ai.js";
import { threeWordMonsterGame } from "./three-word-monster.js";

export const games = [drawDuelGame, threeWordMonsterGame, realOrAiGame] as const;

export { drawDuelGame };
export { realOrAiGame };
export { threeWordMonsterGame };
