"use client";

import { Volume2, VolumeX } from "lucide-react";

import { useGameAudio } from "@/lib/use-game-audio";

type AudioToggleProps = {
  className?: string;
};

export function AudioToggle({ className = "" }: AudioToggleProps) {
  const { isSupported, isUnlocked, playCue, setMuted, settings, unlockAudio } = useGameAudio();
  const isAudioActive = settings.enabled && !settings.muted && isUnlocked;
  const needsUnlock = settings.enabled && !settings.muted && !isUnlocked;
  const Icon = isAudioActive ? Volume2 : VolumeX;
  const label = isAudioActive ? "소리 끄기" : "소리 켜기";

  async function toggleAudio() {
    if (isAudioActive) {
      setMuted(true);
      return;
    }

    setMuted(false);

    const unlocked = needsUnlock || !isUnlocked ? await unlockAudio() : true;

    if (unlocked) {
      playCue("ui_confirm");
    }
  }

  if (!isSupported) {
    return null;
  }

  return (
    <button
      aria-label={label}
      aria-pressed={isAudioActive}
      className={`arcade-button arcade-button-ghost min-h-11 px-3 ${className}`}
      onClick={() => void toggleAudio()}
      title={label}
      type="button"
    >
      <Icon aria-hidden="true" size={18} />
      <span className="hidden sm:inline">
        {isAudioActive ? "소리 켜짐" : "소리 꺼짐"}
      </span>
    </button>
  );
}
