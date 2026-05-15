import type { GameModuleMeta } from "../types/game.js";

export const drawDuelGame = {
  id: "draw-duel",
  title: "Draw Duel",
  shortDescription: "사람이 그리고, 사람과 AI가 동시에 맞히는 그림 대결",
  longDescription:
    "제한 시간 안에 그린 그림을 인간 참가자와 AI가 함께 추측하며 점수를 겨루는 실시간 파티 게임입니다.",
  minPlayers: 2,
  maxPlayers: 10,
  estimatedMinutes: 8,
  thumbnail: "/games/draw-duel-thumbnail.svg",
  route: "/games/draw-duel",
  status: "draft",
  tags: ["drawing", "realtime", "ai-vs-human"],
  requiredCapabilities: ["realtime", "drawing", "chat", "image-ai"],
} as const satisfies GameModuleMeta;
