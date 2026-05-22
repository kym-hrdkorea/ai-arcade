"use client";

import type {
  DrawDuelResultSlide,
  DrawDuelRoundResultPayload,
} from "@ai-arcade/shared";
import { ArrowLeft, Bot, SkipForward, Trophy } from "lucide-react";

type DrawDuelRoundResultProps = {
  isFinalRound: boolean;
  isHost: boolean;
  onGoNextRound: () => void;
  onSyncResultSlide: (slide: DrawDuelResultSlide) => void;
  resultSlide: DrawDuelResultSlide;
  roundResult: DrawDuelRoundResultPayload;
};

const resultSlideOrder: DrawDuelResultSlide[] = [
  "ai-answer",
  "showdown",
  "human-answers",
];

function reasonText(reason: DrawDuelRoundResultPayload["reason"]) {
  if (reason === "all-correct") {
    return "모든 정답자가 맞혔습니다.";
  }

  if (reason === "all-submitted") {
    return "모든 참가자가 답변을 제출했습니다.";
  }

  if (reason === "drawer-left") {
    return "출제자가 나가 라운드가 종료됐습니다.";
  }

  if (reason === "not-enough-players") {
    return "참가자가 부족해 게임이 종료됐습니다.";
  }

  if (reason === "operator-skip") {
    return "호스트가 라운드를 스킵했습니다.";
  }

  return "시간이 끝났습니다.";
}

function formatConfidence(confidence: number) {
  return `${Math.round(confidence * 100)}%`;
}

export function DrawDuelRoundResult({
  isFinalRound,
  isHost,
  onGoNextRound,
  onSyncResultSlide,
  resultSlide,
  roundResult,
}: DrawDuelRoundResultProps) {
  const teamResult = roundResult.teamResult;
  const slideIndex = resultSlideOrder.indexOf(resultSlide);
  const safeSlideIndex = slideIndex === -1 ? 0 : slideIndex;
  const previousSlide = resultSlideOrder[safeSlideIndex - 1];
  const nextSlide = resultSlideOrder[safeSlideIndex + 1];
  const humanRate = `${Math.round(teamResult.humanCorrectRate * 100)}%`;
  const resultAIGuess = roundResult.guesses.find((guess) => guess.source === "ai") ?? null;
  const resultHumanGuesses = roundResult.guesses.filter((guess) => guess.source === "player");
  const winnerClass =
    teamResult.winner === "AI WIN"
      ? "text-pixel-blue"
      : teamResult.winner === "HUMAN WIN"
        ? "text-health-green"
        : "text-coin-yellow";

  return (
    <div className="grid min-h-[560px] gap-5 border-2 border-coin-yellow bg-console-black p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-arcade text-xs text-electric-cyan">
            Round {roundResult.roundNumber}/{roundResult.totalRounds}
          </p>
          <h3 className="mt-2 text-2xl font-black text-screen-white sm:text-3xl">
            {reasonText(roundResult.reason)}
          </h3>
        </div>
        <span className="arcade-badge arcade-badge-yellow">{safeSlideIndex + 1}/3</span>
      </div>

      {resultSlide === "ai-answer" ? (
        <div className="grid flex-1 place-items-center gap-5 text-center">
          <Bot aria-hidden="true" className="text-electric-cyan" size={64} />
          <div>
            <p className="text-lg font-black text-muted-gray">AI의 답</p>
            <p className="mt-3 break-words text-5xl font-black text-screen-white sm:text-7xl">
              {resultAIGuess?.text ?? "모르겠음"}
            </p>
            {resultAIGuess?.confidence !== undefined ? (
              <p className="mt-3 text-sm font-bold text-muted-gray">
                신뢰도 {formatConfidence(resultAIGuess.confidence)}
              </p>
            ) : null}
          </div>
          <div className="grid gap-2 text-lg font-black">
            <p className={teamResult.aiCorrect ? "text-health-green" : "text-joystick-red"}>
              {teamResult.aiCorrect ? "AI 정답" : "AI 오답"}
            </p>
            <p className="text-muted-gray">
              정답 <span className="text-coin-yellow">{roundResult.correctWord}</span>
            </p>
          </div>
        </div>
      ) : null}

      {resultSlide === "showdown" ? (
        <div className="grid flex-1 place-items-center gap-6 text-center">
          <div>
            <p className="font-arcade text-sm text-electric-cyan">승부 결과</p>
            <p className={`mt-4 text-5xl font-black sm:text-7xl ${winnerClass}`}>
              {teamResult.winner}
            </p>
          </div>
          <div className="grid w-full max-w-2xl gap-3 sm:grid-cols-2">
            <div className="border border-pixel-blue bg-panel-gray p-4">
              <p className="text-sm font-black text-muted-gray">AI 조건</p>
              <p className="mt-2 text-2xl font-black text-screen-white">
                {teamResult.aiCorrect ? "+100" : "+0"}
              </p>
              <p className="mt-1 text-sm text-muted-gray">
                {teamResult.aiCorrect ? "정답을 맞혔습니다." : "정답을 맞히지 못했습니다."}
              </p>
            </div>
            <div className="border border-health-green bg-panel-gray p-4">
              <p className="text-sm font-black text-muted-gray">HUMAN 조건</p>
              <p className="mt-2 text-2xl font-black text-screen-white">
                {teamResult.roundTeamScores.human > 0 ? "+100" : "+0"}
              </p>
              <p className="mt-1 text-sm text-muted-gray">
                사람 정답률 {humanRate} ({teamResult.humanCorrectCount}/
                {teamResult.humanTargetCount})
              </p>
            </div>
          </div>
          <div className="grid w-full max-w-2xl gap-3 border border-line-gray bg-panel-gray p-4 sm:grid-cols-2">
            <div className="arcade-meter">
              <span>AI 누적</span>
              <strong>{teamResult.cumulativeTeamScores.ai}</strong>
            </div>
            <div className="arcade-meter">
              <span>HUMAN 누적</span>
              <strong>{teamResult.cumulativeTeamScores.human}</strong>
            </div>
          </div>
        </div>
      ) : null}

      {resultSlide === "human-answers" ? (
        <div className="grid content-start gap-5">
          <div>
            <p className="font-arcade text-xs text-electric-cyan">참가자 답변</p>
            <h3 className="mt-2 text-3xl font-black text-screen-white">참가자 답변</h3>
            <p className="mt-2 text-sm font-bold text-muted-gray">
              정답률 {humanRate} · {teamResult.humanCorrectCount}/
              {teamResult.humanTargetCount}명 정답
            </p>
          </div>
          {resultHumanGuesses.length > 0 ? (
            <ul className="grid gap-3">
              {resultHumanGuesses.map((guess) => (
                <li
                  className="flex min-h-14 flex-wrap items-center justify-between gap-3 border border-line-gray bg-panel-gray px-4 py-3"
                  key={guess.guessId}
                >
                  <span className="font-black text-screen-white">{guess.nickname}</span>
                  <span className="break-words text-lg font-black text-coin-yellow">
                    {guess.text}
                  </span>
                  <span
                    className={
                      guess.isCorrect
                        ? "arcade-badge arcade-badge-green"
                        : "arcade-badge arcade-badge-red"
                    }
                  >
                    {guess.isCorrect ? "정답" : "오답"}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="border border-line-gray bg-panel-gray p-4 text-sm font-bold text-muted-gray">
              제출된 답변이 없습니다.
            </p>
          )}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-gray pt-4">
        {isHost ? (
          <>
            <button
              className="arcade-button arcade-button-ghost"
              disabled={!previousSlide}
              onClick={() => previousSlide && onSyncResultSlide(previousSlide)}
              type="button"
            >
              <ArrowLeft aria-hidden="true" size={18} />
              이전
            </button>
            {nextSlide ? (
              <button
                className="arcade-button arcade-button-primary"
                onClick={() => onSyncResultSlide(nextSlide)}
                type="button"
              >
                다음
                <SkipForward aria-hidden="true" size={18} />
              </button>
            ) : (
              <button className="arcade-button arcade-button-primary" onClick={onGoNextRound} type="button">
                {isFinalRound ? (
                  <Trophy aria-hidden="true" size={18} />
                ) : (
                  <SkipForward aria-hidden="true" size={18} />
                )}
                {isFinalRound ? "최종 결과 보기" : "다음 라운드"}
              </button>
            )}
          </>
        ) : (
          <p className="text-sm font-bold text-muted-gray">
            호스트가 결과 화면을 넘기고 있습니다.
          </p>
        )}
      </div>
    </div>
  );
}
