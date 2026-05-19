"use client";

import type { GameModuleMeta } from "@ai-arcade/shared";
import { useState } from "react";

import { HubActions } from "@/components/hub-actions";
import { HubGameSelector } from "@/components/hub-game-selector";

type HubPlayConsoleProps = {
  games: readonly GameModuleMeta[];
};

export function HubPlayConsole({ games }: HubPlayConsoleProps) {
  const [selectedGameId, setSelectedGameId] = useState(games[0]?.id ?? "");

  return (
    <div className="grid gap-5 pb-6">
      <HubGameSelector
        games={games}
        onSelectedGameIdChange={setSelectedGameId}
        selectedGameId={selectedGameId}
      />
      <HubActions
        games={games}
        onSelectedGameIdChange={setSelectedGameId}
        selectedGameId={selectedGameId}
      />
    </div>
  );
}
