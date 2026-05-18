import { Suspense } from "react";

import { ThreeWordMonsterLobby } from "@/features/three-word-monster/three-word-monster-lobby";

export default function ThreeWordMonsterPage() {
  return (
    <Suspense
      fallback={
        <main className="grid min-h-screen place-items-center bg-console-black text-screen-white">
          <div className="arcade-panel p-6 font-black">괴물 소환기를 준비하는 중...</div>
        </main>
      }
    >
      <ThreeWordMonsterLobby />
    </Suspense>
  );
}
