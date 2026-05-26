"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

import {
  gameAudio,
  type AudioCue,
  type MusicScene,
  type PlayCueOptions,
} from "@/lib/game-audio";

export function useGameAudio() {
  const snapshot = useSyncExternalStore(
    gameAudio.subscribe,
    gameAudio.getSnapshot,
    gameAudio.getServerSnapshot,
  );

  const playCue = useCallback((cue: AudioCue, options?: PlayCueOptions) => {
    return gameAudio.playCue(cue, options);
  }, []);

  const setMusicScene = useCallback((scene: MusicScene) => {
    gameAudio.setMusicScene(scene);
  }, []);

  const setMuted = useCallback((muted: boolean) => {
    gameAudio.setMuted(muted);
  }, []);

  const unlockAudio = useCallback(() => gameAudio.unlockAudio(), []);

  return {
    isSupported: snapshot.isSupported,
    isUnlocked: snapshot.isUnlocked,
    playCue,
    scene: snapshot.scene,
    setMusicScene,
    setMuted,
    settings: snapshot.settings,
    unlockAudio,
  };
}

export function useAudioScene(scene: MusicScene) {
  const { setMusicScene } = useGameAudio();

  useEffect(() => {
    setMusicScene(scene);

    return () => {
      setMusicScene("muted");
    };
  }, [scene, setMusicScene]);
}
