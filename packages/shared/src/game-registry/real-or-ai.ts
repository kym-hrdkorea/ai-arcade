import type { GameModuleMeta } from "../types/game.js";

export const realOrAiGame = {
  id: "real-or-ai",
  title: "Real or AI",
  shortDescription: "두 사진 중 실제 사진을 골라 점수를 쌓는 사진 판별 게임",
  longDescription:
    "각 라운드에서 실제 사진과 AI 생성 사진이 섞여 나옵니다. 참가자는 실제 사진이라고 생각하는 쪽을 고르고, 정답을 빠르게 제출할수록 더 높은 점수를 얻습니다.",
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
        body: "호스트가 방을 만들고 라운드 수, 보기 시간, 카운트다운을 정합니다.",
        items: ["방 코드나 QR로 참가", "표시 기준 120명", "보기 시간은 5/10/15/30/45/60초"],
      },
      {
        title: "진짜 사진 고르기",
        body: "각 라운드마다 실제 사진 1장과 AI 생성 사진 1장이 순서를 섞어 공개됩니다.",
        items: ["결과 전까지 정답 라벨 숨김", "필요하면 사진 확대", "제출 후 선택 잠금"],
      },
      {
        title: "빠른 정답 보너스",
        body: "정답을 맞히면 기본 점수를 받고, 더 빨리 맞힐수록 최대 1.5배까지 올라갑니다.",
        items: ["정답만 점수 획득", "오답과 미제출은 0점", "권장 45초, 빠른 진행 5초"],
      },
      {
        title: "라운드 결과",
        body: "라운드가 끝나면 어떤 사진이 실제 사진인지와 이번 라운드 점수를 확인합니다.",
        items: ["실제/AI 라벨 공개", "내 획득 점수 표시", "호스트가 점수 화면 확인 후 다음 진행"],
      },
      {
        title: "최종 랭킹",
        body: "모든 라운드가 끝나면 누적 점수와 정답 수를 바탕으로 최종 순위를 보여줍니다.",
        items: ["누적 점수 경쟁", "동점이면 정답 수와 평균 응답 시간 반영", "호스트가 다음 게임 준비"],
      },
    ],
  },
} as const satisfies GameModuleMeta;
