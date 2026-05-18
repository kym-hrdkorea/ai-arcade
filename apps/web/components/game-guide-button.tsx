"use client";

import type { GameGuideSlide } from "@ai-arcade/shared";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";

type GameGuideButtonProps = {
  gameTitle: string;
  slides: readonly GameGuideSlide[];
};

export function GameGuideButton({ gameTitle, slides }: GameGuideButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const titleId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const openGuide = useCallback(() => {
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : triggerRef.current;
    setCurrentIndex(0);
    setIsOpen(true);
  }, []);

  const closeGuide = useCallback(() => {
    setIsOpen(false);
    window.setTimeout(() => {
      previousFocusRef.current?.focus();
    }, 0);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeGuide();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeGuide, isOpen]);

  if (slides.length === 0) {
    return null;
  }

  const currentSlide = slides[currentIndex] ?? slides[0];
  if (currentSlide === undefined) {
    return null;
  }
  const isFirstSlide = currentIndex === 0;
  const isLastSlide = currentIndex === slides.length - 1;

  return (
    <>
      <button
        aria-label={`${gameTitle} 사용설명 열기`}
        className="arcade-button arcade-button-secondary absolute right-3 top-3 z-10 h-11 min-h-11 w-11 px-0 text-xl"
        onClick={openGuide}
        ref={triggerRef}
        type="button"
      >
        ?
      </button>

      {isOpen ? (
        <div
          aria-labelledby={titleId}
          aria-modal="true"
          className="fixed inset-0 z-50 grid place-items-center bg-console-black/80 px-4 py-6 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeGuide();
            }
          }}
          role="dialog"
        >
          <div className="arcade-panel max-h-[88vh] w-full max-w-2xl overflow-y-auto p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-arcade text-xs text-electric-cyan">사용설명</p>
                <h2 className="mt-2 text-2xl font-black text-screen-white" id={titleId}>
                  {gameTitle}
                </h2>
              </div>
              <button
                aria-label={`${gameTitle} 사용설명 닫기`}
                className="arcade-button arcade-button-ghost h-11 min-h-11 w-11 px-0"
                onClick={closeGuide}
                ref={closeButtonRef}
                type="button"
              >
                <X aria-hidden="true" size={20} />
              </button>
            </div>

            <div className="mt-5 border border-line-gray bg-console-black p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="arcade-badge arcade-badge-yellow">
                  {currentIndex + 1}/{slides.length}
                </span>
                <span className="arcade-badge arcade-badge-cyan">RULE</span>
              </div>

              <h3 className="mt-4 text-2xl font-black text-screen-white">{currentSlide.title}</h3>
              <p className="mt-3 text-sm leading-6 text-muted-gray sm:text-base sm:leading-7">
                {currentSlide.body}
              </p>

              <ol className="mt-5 grid gap-3">
                {currentSlide.items.map((item, index) => (
                  <li
                    className="flex min-h-12 items-center gap-3 border border-line-gray bg-panel-gray px-3 py-2 text-sm font-bold leading-6 text-screen-white"
                    key={item}
                  >
                    <span className="arcade-badge arcade-badge-green shrink-0">{index + 1}</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <button
                className="arcade-button arcade-button-ghost"
                disabled={isFirstSlide}
                onClick={() => setCurrentIndex((index) => Math.max(0, index - 1))}
                type="button"
              >
                <ChevronLeft aria-hidden="true" size={18} />
                이전
              </button>
              {isLastSlide ? (
                <button className="arcade-button arcade-button-primary" onClick={closeGuide} type="button">
                  닫기
                </button>
              ) : (
                <button
                  className="arcade-button arcade-button-primary"
                  onClick={() => setCurrentIndex((index) => Math.min(slides.length - 1, index + 1))}
                  type="button"
                >
                  다음
                  <ChevronRight aria-hidden="true" size={18} />
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
