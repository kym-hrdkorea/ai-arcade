import { Suspense } from "react";

import { ThreeWordMonsterLobby } from "@/features/three-word-monster/three-word-monster-lobby";

export default function ThreeWordMonsterJoinPage() {
  return (
    <Suspense
      fallback={
        <main className="grid min-h-screen place-items-center bg-console-black text-screen-white">
          <div className="arcade-panel p-6 font-black">참가 화면을 불러오는 중...</div>
        </main>
      }
    >
      <ThreeWordMonsterLobby entryMode="join-only" />
    </Suspense>
  );
}
