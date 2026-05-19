import { Suspense } from "react";

import { RealOrAiLobby } from "@/features/real-or-ai/real-or-ai-lobby";

export default function RealOrAiPage() {
  return (
    <Suspense
      fallback={
        <main className="grid min-h-screen place-items-center bg-console-black text-screen-white">
          <div className="arcade-panel p-6 font-black">Real or AI 로비를 불러오는 중...</div>
        </main>
      }
    >
      <RealOrAiLobby />
    </Suspense>
  );
}
