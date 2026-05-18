import { drawDuelGame } from "./draw-duel.js";
import { threeWordMonsterGame } from "./three-word-monster.js";

export const games = [drawDuelGame, threeWordMonsterGame] as const;

export { drawDuelGame };
export { threeWordMonsterGame };
