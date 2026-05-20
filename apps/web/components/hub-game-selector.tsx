"use client";

import type { GameModuleMeta } from "@ai-arcade/shared";
import { ChevronLeft, ChevronRight, Clock3, Gamepad2, Play, Users } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { KeyboardEvent } from "react";

import { GameGuideButton } from "@/components/game-guide-button";

type HubGameSelectorProps = {
  games: readonly GameModuleMeta[];
  onSelectedGameIdChange: (gameId: string) => void;
  selectedGameId: string;
};

const statusLabel: Record<GameModuleMeta["status"], string> = {
  draft: "설계 중",
  beta: "테스트 가능",
  stable: "안정 운영",
};

function getWrappedIndex(index: number, length: number) {
  if (length <= 0) {
    return 0;
  }

  return (index + length) % length;
}

export function HubGameSelector({
  games,
  onSelectedGameIdChange,
  selectedGameId,
}: HubGameSelectorProps) {
  const activeIndex = Math.max(
    0,
    games.findIndex((game) => game.id === selectedGameId),
  );
  const activeGame = games[activeIndex] ?? games[0];

  if (!activeGame) {
    return null;
  }

  function selectByIndex(index: number) {
    const nextGame = games[getWrappedIndex(index, games.length)];

    if (nextGame) {
      onSelectedGameIdChange(nextGame.id);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      selectByIndex(activeIndex - 1);
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      selectByIndex(activeIndex + 1);
    }
  }

  return (
    <section
      aria-label="게임 선택 콘솔"
      className="arcade-panel overflow-hidden border-coin-yellow bg-console-black/90"
      data-testid="hub-game-selector"
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <div
          className="relative aspect-[16/10] h-auto overflow-hidden border-b border-line-gray bg-arcade-navy lg:min-h-[430px] lg:border-b-0 lg:border-r"
          data-testid="hub-game-screen"
        >
          <div className="absolute left-3 top-3 z-10 flex flex-wrap gap-2">
            <span className="arcade-badge arcade-badge-cyan">게임 선택</span>
            <span className="arcade-badge arcade-badge-yellow">
              {activeIndex + 1}/{games.length}
            </span>
          </div>
          <Image
            alt={`${activeGame.title} 대표 화면`}
            className="h-full w-full object-cover"
            fill
            priority
            src={activeGame.thumbnail}
            unoptimized
          />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-console-black to-transparent" />
          <GameGuideButton gameTitle={activeGame.title} slides={activeGame.guide.slides} />
        </div>

        <div
          className="grid min-h-[250px] content-between gap-5 overflow-hidden p-4 sm:min-h-[430px] sm:p-6 lg:min-h-0"
          data-testid="hub-game-info"
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="arcade-badge arcade-badge-green">
                {statusLabel[activeGame.status]}
              </span>
              <span className="arcade-badge">
                <Gamepad2 aria-hidden="true" className="text-coin-yellow" size={16} />
                선택됨
              </span>
            </div>
            <h2
              className="mt-4 flex h-16 items-end overflow-hidden text-2xl font-black leading-tight text-coin-yellow sm:h-28 sm:text-5xl"
              data-testid="hub-game-title"
            >
              {activeGame.title}
            </h2>
            <p
              className="mt-3 hidden min-h-16 max-h-16 overflow-hidden text-sm leading-6 text-muted-gray sm:mt-4 sm:block sm:text-lg sm:leading-8"
              data-testid="hub-game-description"
            >
              {activeGame.shortDescription}
            </p>
          </div>

          <div className="grid gap-4" data-testid="hub-game-actions">
            <div className="grid grid-cols-[48px_1fr_48px] items-center gap-3">
              <button
                aria-label="이전 게임"
                className="arcade-button arcade-button-ghost h-12 min-h-12 px-0"
                onClick={() => selectByIndex(activeIndex - 1)}
                type="button"
              >
                <ChevronLeft aria-hidden="true" size={22} />
              </button>
              <div className="flex justify-center gap-2" role="tablist">
                {games.map((game, index) => {
                  const isSelected = game.id === activeGame.id;

                  return (
                    <button
                      aria-label={`${game.title} 선택`}
                      aria-selected={isSelected}
                      className={`h-3 w-9 border ${
                        isSelected
                          ? "border-coin-yellow bg-coin-yellow"
                          : "border-line-gray bg-panel-gray"
                      }`}
                      key={game.id}
                      onClick={() => selectByIndex(index)}
                      role="tab"
                      type="button"
                    />
                  );
                })}
              </div>
              <button
                aria-label="다음 게임"
                className="arcade-button arcade-button-ghost h-12 min-h-12 px-0"
                onClick={() => selectByIndex(activeIndex + 1)}
                type="button"
              >
                <ChevronRight aria-hidden="true" size={22} />
              </button>
            </div>

            <Link className="arcade-button arcade-button-primary w-full" href={activeGame.route}>
              <Play aria-hidden="true" size={18} />
              게임 시작
            </Link>

            <div className="hidden h-7 flex-wrap gap-2 overflow-hidden sm:flex">
              {activeGame.tags.map((tag) => (
                <span className="arcade-badge" key={tag}>
                  #{tag}
                </span>
              ))}
            </div>
            <dl className="hidden grid-cols-2 gap-3 text-sm text-screen-white sm:grid">
              <div className="arcade-meter min-h-16">
                <strong className="inline-flex items-center justify-center gap-2">
                  <Users aria-hidden="true" className="text-pixel-blue" size={18} />
                  {activeGame.minPlayers}-{activeGame.maxPlayers}
                </strong>
                <span>참가 인원</span>
              </div>
              <div className="arcade-meter min-h-16">
                <strong className="inline-flex items-center justify-center gap-2">
                  <Clock3 aria-hidden="true" className="text-health-green" size={18} />
                  {activeGame.estimatedMinutes}분
                </strong>
                <span>예상 시간</span>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </section>
  );
}
