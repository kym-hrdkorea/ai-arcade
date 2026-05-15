import { games } from "@ai-arcade/shared";

import { GameCard } from "@/components/game-card";
import { HubActions } from "@/components/hub-actions";

export default function HomePage() {
  return (
    <main className="min-h-screen overflow-hidden bg-console-black text-screen-white">
      <div className="screen-grid min-h-screen">
        <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-5 py-6 sm:px-8 lg:px-10">
          <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line-gray/80 pb-5">
            <div>
              <p className="font-arcade text-xs uppercase text-electric-cyan">
                Insert Coin
              </p>
              <h1 className="mt-2 font-arcade text-3xl leading-tight text-coin-yellow sm:text-5xl">
                AI Arcade
              </h1>
            </div>
            <div className="flex flex-wrap gap-3">
              <div className="arcade-badge arcade-badge-green min-h-12 px-4">
                SYSTEM READY
              </div>
              <div className="arcade-badge arcade-badge-yellow min-h-12 px-4">
                GAMES {games.length}
              </div>
            </div>
          </header>

          <section className="grid flex-1 items-center gap-8 py-8 lg:grid-cols-[0.9fr_1.1fr] lg:py-10">
            <div className="max-w-xl">
              <p className="font-arcade text-sm text-pixel-blue">
                Game Select
              </p>
              <h2 className="mt-4 text-3xl font-black leading-tight text-screen-white sm:text-5xl">
                오늘의 AI 게임을 선택하세요
              </h2>
              <p className="mt-5 text-lg leading-8 text-muted-gray">
                여러 명이 동시에 접속해 즐기는 AI 레크리에이션 허브입니다.
                첫 게임은 사람이 그림을 그리고, 사람과 AI가 함께 정답을
                맞히는 대결입니다.
              </p>
              <div className="mt-7 grid grid-cols-3 gap-3 text-center text-sm">
                <div className="arcade-meter">
                  <strong>{games.length}</strong>
                  <span>게임</span>
                </div>
                <div className="arcade-meter">
                  <strong>MVP</strong>
                  <span>허브</span>
                </div>
                <div className="arcade-meter">
                  <strong>TEST</strong>
                  <span>부하 확인</span>
                </div>
              </div>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              {games.map((game) => (
                <GameCard game={game} key={game.id} />
              ))}
            </div>
          </section>

          <HubActions />
        </div>
      </div>
    </main>
  );
}
