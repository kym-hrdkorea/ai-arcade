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
  guide: {
    slides: [
      {
        title: "방 만들기와 참가",
        body: "호스트가 방을 열고 참가자는 방 코드나 QR 링크로 같은 방에 들어옵니다.",
        items: ["닉네임은 팀명처럼 사용 가능", "최대 10명 참가", "호스트가 게임을 시작"],
      },
      {
        title: "세 단어 제출",
        body: "각 참가자는 자신의 괴물을 만들 단어 3개를 정확히 입력합니다.",
        items: ["단어는 12글자 이하", "세 단어를 모두 입력", "제출 후 다른 참가자를 기다림"],
      },
      {
        title: "괴물 이미지 생성",
        body: "서버가 같은 규칙과 스타일로 참가자별 괴물 이미지를 준비합니다.",
        items: ["기본은 mock 이미지 provider", "모두 같은 크기와 스타일", "준비되면 갤러리 공개"],
      },
      {
        title: "자기 것 제외 투표",
        body: "갤러리에서 자기 괴물을 제외하고 가장 마음에 드는 후보 하나에 투표합니다.",
        items: ["자기 괴물 투표 금지", "한 번만 투표 가능", "모두 투표하면 결과 공개"],
      },
      {
        title: "우승 발표",
        body: "가장 많은 표를 받은 괴물이 WINNER가 되며, 동점이면 공동 우승입니다.",
        items: ["득표 수 표시", "공동 우승 가능", "호스트가 다시 시작 가능"],
      },
    ],
  },
} as const satisfies GameModuleMeta;
