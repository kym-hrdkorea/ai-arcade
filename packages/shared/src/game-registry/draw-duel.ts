import type { GameModuleMeta } from "../types/game.js";

export const drawDuelGame = {
  id: "draw-duel",
  title: "Draw Duel",
  shortDescription: "한 명이 그리고, 인간 팀과 AI가 함께 맞히는 그림 대결",
  longDescription:
    "출제자는 제시어를 보고 그림을 그리고, 나머지 참가자는 정답을 입력합니다. 인간 정답자가 과반수면 인간 팀이 점수를 얻고, AI도 라운드마다 한 번 정답을 맞혀 봅니다.",
  minPlayers: 2,
  maxPlayers: 120,
  estimatedMinutes: 8,
  thumbnail: "/games/draw-duel-arcade.webp",
  route: "/games/draw-duel",
  status: "beta",
  tags: ["drawing", "realtime", "ai-vs-human"],
  requiredCapabilities: ["realtime", "drawing", "chat", "image-ai"],
  guide: {
    slides: [
      {
        title: "방 만들기와 참가",
        body: "호스트가 방을 만들면 참가자는 방 코드나 QR로 들어옵니다.",
        items: ["닉네임만 입력하면 입장", "2명 이상이면 시작 가능", "호스트가 설정과 진행을 관리"],
      },
      {
        title: "그리기와 맞히기",
        body: "출제자에게만 제시어가 보이고, 나머지는 그림을 보며 답을 입력합니다.",
        items: ["마우스와 터치로 그림 그리기", "제시어를 그림에 직접 쓰지 않기", "역할은 설정에 따라 고정 또는 교대"],
      },
      {
        title: "인간 팀 점수",
        body: "출제자를 제외한 인간 정답자 과반수가 맞히면 인간 팀이 라운드 점수를 얻습니다.",
        items: ["과반수 정답 시 인간 팀 +100", "정확히 절반은 과반수가 아님", "제출은 라운드 중 한 번만 가능"],
      },
      {
        title: "AI와 대결",
        body: "AI도 라운드마다 한 번 그림을 보고 정답을 추측합니다.",
        items: ["AI 정답 시 AI +100", "인간과 AI가 둘 다 점수를 얻을 수도 있음", "둘 다 실패하면 무승부"],
      },
      {
        title: "결과 확인",
        body: "라운드가 끝나면 정답, AI의 답, 인간 팀 결과와 누적 점수를 확인합니다.",
        items: ["라운드별 결과 공개", "최종 승패와 순위 표시", "호스트가 다음 라운드나 방 리셋 진행"],
      },
    ],
  },
} as const satisfies GameModuleMeta;
