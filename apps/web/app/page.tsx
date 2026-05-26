import { games } from "@ai-arcade/shared";

import { ArcadeLogo } from "@/components/arcade-logo";
import { AudioScene } from "@/components/audio-scene";
import { AudioToggle } from "@/components/audio-toggle";
import { HubPlayConsole } from "@/components/hub-play-console";

export default function HomePage() {
  return (
    <main className="min-h-screen overflow-hidden bg-console-black text-screen-white">
      <AudioScene scene="hub" />
      <div className="screen-grid min-h-screen">
        <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-4 sm:px-8 sm:py-6 lg:px-10">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line-gray/80 pb-4 sm:gap-4 sm:pb-5">
            <ArcadeLogo />
            <div className="flex flex-wrap gap-3">
              <AudioToggle />
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
                  함께 즐길 게임을 고르세요
                </h2>
                <p className="mt-3 hidden max-w-3xl text-sm leading-6 text-muted-gray sm:mt-4 sm:block sm:text-lg sm:leading-8">
                  호스트가 방을 만들고, 참가자는 방 코드나 QR로 바로 들어옵니다.
                  그림을 맞히거나 진짜 사진을 고르는 짧은 라운드형 AI 게임을 플레이하세요.
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
