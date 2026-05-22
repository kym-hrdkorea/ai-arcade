"use client";

import { Send } from "lucide-react";
import type { FormEvent } from "react";

type DrawDuelAnswerPanelProps = {
  canGuess: boolean;
  guessText: string;
  hasSubmittedGuess: boolean;
  onGuessTextChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  submittedGuessText: string | null;
};

export function DrawDuelAnswerPanel({
  canGuess,
  guessText,
  hasSubmittedGuess,
  onGuessTextChange,
  onSubmit,
  submittedGuessText,
}: DrawDuelAnswerPanelProps) {
  return (
    <form
      aria-live="polite"
      className="sticky bottom-[calc(env(safe-area-inset-bottom)+0.5rem)] z-20 grid gap-2 border border-line-gray bg-console-black p-3 shadow-panel sm:static sm:gap-3 sm:p-4"
      onSubmit={onSubmit}
    >
      <h3 className="flex items-center gap-2 text-lg font-black sm:text-xl">
        <Send aria-hidden="true" className="text-health-green" size={22} />
        내 답변
      </h3>
      <label className="sr-only" htmlFor="draw-duel-guess-input">
        정답
      </label>
      <input
        autoComplete="off"
        className="arcade-input"
        disabled={!canGuess}
        enterKeyHint="send"
        id="draw-duel-guess-input"
        maxLength={40}
        onChange={(event) => onGuessTextChange(event.target.value)}
        placeholder={hasSubmittedGuess ? "제출 완료" : "정답을 입력하세요"}
        value={guessText}
      />
      <button
        className="arcade-button arcade-button-secondary"
        disabled={!canGuess || !guessText.trim()}
        type="submit"
      >
        <Send aria-hidden="true" size={18} />
        {hasSubmittedGuess ? "제출 완료" : "제출"}
      </button>
      {hasSubmittedGuess ? (
        <p className="break-words text-xs font-bold leading-5 text-health-green">
          제출 완료{submittedGuessText ? ` · 내 답: ${submittedGuessText}` : ""}
        </p>
      ) : (
        <p className="text-xs font-bold leading-5 text-muted-gray">
          그림을 보고 떠오르는 답을 입력한 뒤 바로 제출하세요.
        </p>
      )}
    </form>
  );
}
