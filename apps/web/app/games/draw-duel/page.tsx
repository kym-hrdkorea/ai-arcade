import { Suspense } from "react";

import { DrawDuelLobby } from "@/features/draw-duel/draw-duel-lobby";

export default function DrawDuelPage() {
  return (
    <Suspense
      fallback={
        <main className="grid min-h-screen place-items-center bg-console-black text-screen-white">
          <div className="arcade-panel p-6 font-black">로비를 불러오는 중...</div>
        </main>
      }
    >
      <DrawDuelLobby />
    </Suspense>
  );
}
