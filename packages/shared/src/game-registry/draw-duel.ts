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
  status: "beta",
  tags: ["drawing", "realtime", "ai-vs-human"],
  requiredCapabilities: ["realtime", "drawing", "chat", "image-ai"],
  guide: {
    slides: [
      {
        title: "방 만들기와 참가",
        body: "호스트가 방을 만들면 참가자는 방 코드나 QR 링크로 들어옵니다.",
        items: ["닉네임만 입력하면 입장", "2명 이상이면 시작 가능", "호스트가 설정과 시작을 관리"],
      },
      {
        title: "그리는 사람과 맞히는 사람",
        body: "출제자에게만 제시어가 보이고, 나머지는 그림을 보며 정답을 입력합니다.",
        items: ["마우스와 터치로 그림 그리기", "제시어는 그림 안에 직접 쓰지 않기", "역할은 설정에 따라 고정 또는 교대"],
      },
      {
        title: "정답 입력",
        body: "정답자는 떠오르는 답을 입력하고, 맞히면 라운드 점수를 얻습니다.",
        items: ["라운드 중 제출 가능", "정답자는 빠르게 입력", "호스트는 필요하면 라운드 스킵"],
      },
      {
        title: "AI 추측",
        body: "AI도 라운드당 한 번 그림을 보고 답을 추측합니다.",
        items: ["결과 전까지 답은 숨김", "사람과 AI 점수를 함께 비교", "누군가 맞히면 출제자도 점수 획득"],
      },
      {
        title: "결과 확인",
        body: "모든 라운드가 끝나면 인간과 AI의 최종 결과와 참가자 순위를 확인합니다.",
        items: ["라운드별 결과 확인", "최종 승패 표시", "방 리셋 후 다시 진행 가능"],
      },
    ],
  },
} as const satisfies GameModuleMeta;
