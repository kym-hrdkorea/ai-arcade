import { games } from "@ai-arcade/shared";

import { ArcadeLogo } from "@/components/arcade-logo";
import { HubPlayConsole } from "@/components/hub-play-console";

export default function HomePage() {
  return (
    <main className="min-h-screen overflow-hidden bg-console-black text-screen-white">
      <div className="screen-grid min-h-screen">
        <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-4 sm:px-8 sm:py-6 lg:px-10">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line-gray/80 pb-4 sm:gap-4 sm:pb-5">
            <ArcadeLogo />
            <div className="flex flex-wrap gap-3">
              <div className="arcade-badge arcade-badge-green min-h-12 px-4">
                바로 플레이
              </div>
              <div className="arcade-badge arcade-badge-yellow min-h-12 px-4">
                게임 {games.length}개
              </div>
            </div>
          </header>

          <section className="grid gap-4 py-4 lg:py-8">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
              <div>
                <p className="font-arcade text-xs text-pixel-blue">게임 선택</p>
                <h2 className="mt-2 text-2xl font-black leading-tight text-screen-white sm:mt-3 sm:text-5xl">
                  플레이할 게임을 고르세요
                </h2>
                <p className="mt-3 hidden max-w-3xl text-sm leading-6 text-muted-gray sm:mt-4 sm:block sm:text-lg sm:leading-8">
                  방 코드와 QR로 바로 입장하는 실시간 AI 레크리에이션 허브입니다.
                  화살표로 게임을 넘기고, 원하는 게임의 로비를 시작하세요.
                </p>
              </div>
              <div className="hidden grid-cols-3 gap-2 text-center text-xs sm:grid sm:min-w-[360px] sm:text-sm">
                <div className="arcade-meter min-h-14 sm:min-h-16">
                  <strong>{games.length}</strong>
                  <span>게임</span>
                </div>
                <div className="arcade-meter min-h-14 sm:min-h-16">
                  <strong>LIVE</strong>
                  <span>실시간</span>
                </div>
                <div className="arcade-meter min-h-14 sm:min-h-16">
                  <strong>QR</strong>
                  <span>입장</span>
                </div>
              </div>
            </div>

            <HubPlayConsole games={games} />
          </section>
        </div>
      </div>
    </main>
  );
}
