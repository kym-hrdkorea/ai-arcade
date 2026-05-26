"use client";

import type { MusicScene } from "@/lib/game-audio";
import { useAudioScene } from "@/lib/use-game-audio";

type AudioSceneProps = {
  scene: MusicScene;
};

export function AudioScene({ scene }: AudioSceneProps) {
  useAudioScene(scene);

  return null;
}
