import type { GameModuleMeta } from "../types/game.js";

export const threeWordMonsterGame = {
  id: "three-word-monster",
  title: "Three Word Monster",
  shortDescription:
    "세 단어로 괴물을 소환하고, 자기 괴물을 제외한 최강 몬스터에 투표하는 파티 게임",
  longDescription:
    "참가자가 각자 세 단어를 제출하면 AI 이미지 생성기가 같은 규칙으로 괴물 이미지를 만들고, 모두가 갤러리에서 최강의 괴물을 뽑는 실시간 투표 게임입니다.",
  minPlayers: 2,
  maxPlayers: 10,
  estimatedMinutes: 6,
  thumbnail: "/games/three-word-monster-thumbnail.svg",
  route: "/games/three-word-monster",
  status: "draft",
  tags: ["image-ai", "realtime", "party"],
  requiredCapabilities: ["realtime", "image-ai", "host-mode"],
} as const satisfies GameModuleMeta;
