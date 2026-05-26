import type { GameModuleMeta } from "../types/game.js";

export const realOrAiGame = {
  id: "real-or-ai",
  title: "Real or AI",
  shortDescription: "두 사진 중 진짜를 빠르게 찾아 점수를 쌓는 사진 판별 게임",
  longDescription:
    "실제 사진과 AI 생성 사진을 나란히 보고 제한 시간 안에 진짜 사진을 고르는 실시간 퀴즈 게임입니다.",
  minPlayers: 2,
  maxPlayers: 120,
  estimatedMinutes: 5,
  thumbnail: "/games/real-or-ai-arcade.webp",
  route: "/games/real-or-ai",
  status: "beta",
  tags: ["realtime", "photo", "quiz"],
  requiredCapabilities: ["realtime", "host-mode"],
  guide: {
    slides: [
      {
        title: "방 만들기와 설정",
        body: "호스트가 방을 열고 라운드 수와 보기 시간을 정하면 참가자는 방 코드나 QR로 입장합니다.",
        items: ["표시 기준 120명", "보기 시간은 5/10/15/30/45/60초", "권장 45초, 빠른 진행 5초"],
      },
      {
        title: "진짜 사진 고르기",
        body: "각 라운드마다 실제 사진과 AI 생성 사진이 함께 나오며, 참가자는 실제 사진이라고 생각하는 쪽을 고릅니다.",
        items: ["후보는 항상 2장", "정답은 실제 사진", "제출 후 선택 잠금"],
      },
      {
        title: "빠른 정답 보너스",
        body: "정답을 맞히면 기본 점수를 받고, 더 빨리 맞힐수록 최대 1.5배까지 점수가 올라갑니다.",
        items: ["정답만 점수 획득", "오답과 미제출은 0점", "서버 수신 시각 기준"],
      },
      {
        title: "라운드 결과",
        body: "라운드가 끝나면 어떤 사진이 진짜였는지와 이번 라운드 최고 득점자를 확인합니다.",
        items: ["정답 이미지 공개", "내 획득 점수 표시", "현재 상위 랭킹 확인"],
      },
      {
        title: "최종 랭킹",
        body: "모든 라운드가 끝나면 누적 점수와 정답 수를 바탕으로 최종 순위를 보여줍니다.",
        items: ["누적 점수 경쟁", "동점 순위 처리", "호스트가 다음 게임 준비"],
      },
    ],
  },
} as const satisfies GameModuleMeta;
