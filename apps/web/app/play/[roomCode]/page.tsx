import { Suspense } from "react";

import { DrawDuelLobby } from "@/features/draw-duel/draw-duel-lobby";

type PlayRoomPageProps = {
  params: Promise<{
    roomCode: string;
  }>;
};

export default async function PlayRoomPage({ params }: PlayRoomPageProps) {
  const { roomCode } = await params;

  return (
    <Suspense
      fallback={
        <main className="grid min-h-screen place-items-center bg-console-black text-screen-white">
          <div className="arcade-panel p-6 font-black">플레이 화면을 불러오는 중...</div>
        </main>
      }
    >
      <DrawDuelLobby entryMode="join-only" initialRoomCode={roomCode} />
    </Suspense>
  );
}
