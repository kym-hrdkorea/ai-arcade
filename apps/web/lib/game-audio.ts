"use client";

export type MusicScene =
  | "hub"
  | "lobby"
  | "draw-duel-drawing"
  | "draw-duel-ai"
  | "real-or-ai-answering"
  | "result"
  | "muted";

export type AudioCue =
  | "ui_select"
  | "ui_confirm"
  | "ui_back"
  | "ui_error"
  | "room_join"
  | "copy_link"
  | "game_start"
  | "countdown_tick"
  | "countdown_go"
  | "round_start"
  | "round_result"
  | "final_result"
  | "tool_select"
  | "canvas_clear"
  | "guess_submit"
  | "ai_thinking"
  | "correct"
  | "wrong"
  | "candidate_select"
  | "zoom_open"
  | "answer_submit"
  | "answer_reveal"
  | "score_reveal";

export type AudioSettings = {
  enabled: boolean;
  musicVolume: number;
  muted: boolean;
  sfxVolume: number;
};

export type PlayCueOptions = {
  delayMs?: number;
  key?: string;
};

export type AudioSnapshot = {
  isSupported: boolean;
  isUnlocked: boolean;
  scene: MusicScene;
  settings: AudioSettings;
};

export type AudioDebugEvent =
  | {
      atMs: number;
      scene: MusicScene;
      type: "scene";
    }
  | {
      atMs: number;
      muted: boolean;
      type: "mute";
    }
  | {
      atMs: number;
      type: "unlock";
      unlocked: boolean;
    }
  | {
      atMs: number;
      cue: AudioCue;
      delayMs: number;
      key?: string;
      played: boolean;
      reason:
        | "cooldown"
        | "duplicate"
        | "locked"
        | "muted"
        | "played"
        | "unsupported";
      scene: MusicScene;
      type: "cue";
    };
type AudioDebugEventInput =
  | Omit<Extract<AudioDebugEvent, { type: "scene" }>, "atMs">
  | Omit<Extract<AudioDebugEvent, { type: "mute" }>, "atMs">
  | Omit<Extract<AudioDebugEvent, { type: "unlock" }>, "atMs">
  | Omit<Extract<AudioDebugEvent, { type: "cue" }>, "atMs">;

type AudioStorage = Pick<Storage, "getItem" | "setItem">;
type LegacyAudioWindow = Window & {
  webkitAudioContext?: typeof AudioContext;
};
type AudioDebugWindow = Window & {
  __AI_ARCADE_AUDIO_EVENTS__?: AudioDebugEvent[];
};

type ToneEvent = {
  delayMs: number;
  durationMs: number;
  frequency: number;
  gain: number;
  type?: OscillatorType;
};

export const AUDIO_STORAGE_KEY = "ai-arcade:audio-settings";
export const DEFAULT_BACKGROUND_MUSIC_SRC = "/audio/music/coin-jump.mp3";
export const AUDIO_CUE_DEFAULT_COOLDOWN_MS = 180;
export const AUDIO_MUSIC_FADE_IN_MS = 360;
export const AUDIO_MUSIC_FADE_OUT_MS = 240;
export const AUDIO_VERDICT_CUE_DELAY_MS = 340;
export const BACKGROUND_MUSIC_SCENES = ["hub", "lobby"] as const satisfies readonly MusicScene[];

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  enabled: true,
  musicVolume: 0.32,
  muted: false,
  sfxVolume: 0.72,
};

const defaultSnapshot: AudioSnapshot = {
  isSupported: true,
  isUnlocked: false,
  scene: "muted",
  settings: DEFAULT_AUDIO_SETTINGS,
};

const cueCooldownMs: Partial<Record<AudioCue, number>> = {
  ai_thinking: 900,
  answer_reveal: 420,
  canvas_clear: 360,
  countdown_go: 450,
  countdown_tick: 760,
  final_result: 1200,
  round_result: 700,
  score_reveal: 420,
};

const cuePatterns: Record<AudioCue, readonly ToneEvent[]> = {
  ai_thinking: [
    { delayMs: 0, durationMs: 42, frequency: 440, gain: 0.12, type: "square" },
    { delayMs: 60, durationMs: 48, frequency: 554, gain: 0.1, type: "square" },
    { delayMs: 124, durationMs: 70, frequency: 392, gain: 0.08, type: "triangle" },
  ],
  answer_reveal: [
    { delayMs: 0, durationMs: 58, frequency: 523, gain: 0.13, type: "square" },
    { delayMs: 72, durationMs: 58, frequency: 659, gain: 0.12, type: "square" },
    { delayMs: 144, durationMs: 115, frequency: 784, gain: 0.11, type: "triangle" },
  ],
  answer_submit: [
    { delayMs: 0, durationMs: 52, frequency: 659, gain: 0.12, type: "square" },
    { delayMs: 72, durationMs: 92, frequency: 988, gain: 0.11, type: "square" },
  ],
  candidate_select: [
    { delayMs: 0, durationMs: 48, frequency: 494, gain: 0.1, type: "square" },
    { delayMs: 58, durationMs: 68, frequency: 740, gain: 0.09, type: "square" },
  ],
  canvas_clear: [
    { delayMs: 0, durationMs: 46, frequency: 740, gain: 0.11, type: "sawtooth" },
    { delayMs: 54, durationMs: 46, frequency: 523, gain: 0.1, type: "sawtooth" },
    { delayMs: 108, durationMs: 70, frequency: 262, gain: 0.08, type: "triangle" },
  ],
  copy_link: [
    { delayMs: 0, durationMs: 45, frequency: 784, gain: 0.11, type: "square" },
    { delayMs: 58, durationMs: 90, frequency: 1047, gain: 0.1, type: "triangle" },
  ],
  correct: [
    { delayMs: 0, durationMs: 70, frequency: 523, gain: 0.12, type: "square" },
    { delayMs: 80, durationMs: 70, frequency: 659, gain: 0.11, type: "square" },
    { delayMs: 160, durationMs: 160, frequency: 1047, gain: 0.1, type: "triangle" },
  ],
  countdown_go: [
    { delayMs: 0, durationMs: 95, frequency: 523, gain: 0.14, type: "square" },
    { delayMs: 110, durationMs: 150, frequency: 1047, gain: 0.12, type: "square" },
  ],
  countdown_tick: [
    { delayMs: 0, durationMs: 56, frequency: 880, gain: 0.11, type: "square" },
  ],
  final_result: [
    { delayMs: 0, durationMs: 84, frequency: 523, gain: 0.13, type: "square" },
    { delayMs: 96, durationMs: 84, frequency: 659, gain: 0.12, type: "square" },
    { delayMs: 192, durationMs: 84, frequency: 784, gain: 0.12, type: "square" },
    { delayMs: 288, durationMs: 210, frequency: 1047, gain: 0.1, type: "triangle" },
  ],
  game_start: [
    { delayMs: 0, durationMs: 72, frequency: 262, gain: 0.13, type: "square" },
    { delayMs: 82, durationMs: 72, frequency: 392, gain: 0.12, type: "square" },
    { delayMs: 164, durationMs: 115, frequency: 784, gain: 0.11, type: "square" },
  ],
  guess_submit: [
    { delayMs: 0, durationMs: 48, frequency: 587, gain: 0.11, type: "square" },
    { delayMs: 62, durationMs: 82, frequency: 880, gain: 0.1, type: "triangle" },
  ],
  room_join: [
    { delayMs: 0, durationMs: 60, frequency: 392, gain: 0.12, type: "square" },
    { delayMs: 74, durationMs: 90, frequency: 659, gain: 0.1, type: "square" },
  ],
  round_result: [
    { delayMs: 0, durationMs: 70, frequency: 392, gain: 0.12, type: "square" },
    { delayMs: 84, durationMs: 70, frequency: 523, gain: 0.11, type: "square" },
    { delayMs: 168, durationMs: 130, frequency: 784, gain: 0.1, type: "triangle" },
  ],
  round_start: [
    { delayMs: 0, durationMs: 52, frequency: 440, gain: 0.12, type: "square" },
    { delayMs: 68, durationMs: 92, frequency: 880, gain: 0.11, type: "square" },
  ],
  score_reveal: [
    { delayMs: 0, durationMs: 54, frequency: 659, gain: 0.12, type: "square" },
    { delayMs: 68, durationMs: 54, frequency: 784, gain: 0.11, type: "square" },
    { delayMs: 136, durationMs: 120, frequency: 988, gain: 0.1, type: "triangle" },
  ],
  tool_select: [
    { delayMs: 0, durationMs: 38, frequency: 698, gain: 0.08, type: "square" },
  ],
  ui_back: [
    { delayMs: 0, durationMs: 42, frequency: 523, gain: 0.08, type: "triangle" },
    { delayMs: 48, durationMs: 70, frequency: 330, gain: 0.07, type: "triangle" },
  ],
  ui_confirm: [
    { delayMs: 0, durationMs: 42, frequency: 587, gain: 0.09, type: "square" },
    { delayMs: 52, durationMs: 74, frequency: 880, gain: 0.08, type: "square" },
  ],
  ui_error: [
    { delayMs: 0, durationMs: 70, frequency: 196, gain: 0.12, type: "sawtooth" },
    { delayMs: 86, durationMs: 110, frequency: 147, gain: 0.1, type: "sawtooth" },
  ],
  ui_select: [
    { delayMs: 0, durationMs: 36, frequency: 784, gain: 0.075, type: "square" },
  ],
  wrong: [
    { delayMs: 0, durationMs: 85, frequency: 330, gain: 0.11, type: "sawtooth" },
    { delayMs: 96, durationMs: 150, frequency: 196, gain: 0.09, type: "triangle" },
  ],
  zoom_open: [
    { delayMs: 0, durationMs: 42, frequency: 740, gain: 0.08, type: "square" },
    { delayMs: 46, durationMs: 80, frequency: 1175, gain: 0.07, type: "triangle" },
  ],
};

export const ALL_AUDIO_CUES = Object.keys(cuePatterns) as readonly AudioCue[];

export function shouldPlayBackgroundMusic(scene: MusicScene) {
  return (BACKGROUND_MUSIC_SCENES as readonly MusicScene[]).includes(scene);
}

function clampVolume(value: number) {
  return Math.min(Math.max(value, 0), 1);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getBrowserStorage(): AudioStorage | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function getCurrentTimeMs() {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

function recordAudioDebugEvent(event: AudioDebugEventInput) {
  if (typeof window === "undefined") {
    return;
  }

  const debugWindow = window as AudioDebugWindow;
  const events = debugWindow.__AI_ARCADE_AUDIO_EVENTS__ ?? [];
  events.push({
    ...event,
    atMs: getCurrentTimeMs(),
  } as AudioDebugEvent);
  debugWindow.__AI_ARCADE_AUDIO_EVENTS__ = events.slice(-240);
}

export function getAudioCueDurationMs(cue: AudioCue) {
  return cuePatterns[cue].reduce(
    (durationMs, event) => Math.max(durationMs, event.delayMs + event.durationMs),
    0,
  );
}

export function getAudioCueCooldownMs(cue: AudioCue) {
  return cueCooldownMs[cue] ?? AUDIO_CUE_DEFAULT_COOLDOWN_MS;
}

export function getAudioCueMaxToneOverlap(cue: AudioCue) {
  const events = cuePatterns[cue];
  const boundaries = events.flatMap((event) => [
    event.delayMs,
    event.delayMs + event.durationMs,
  ]);

  return boundaries.reduce((maxOverlap, timeMs) => {
    const overlap = events.filter(
      (event) => event.delayMs <= timeMs && event.delayMs + event.durationMs > timeMs,
    ).length;

    return Math.max(maxOverlap, overlap);
  }, 0);
}

export function normalizeAudioSettings(value: unknown): AudioSettings {
  if (!isRecord(value)) {
    return DEFAULT_AUDIO_SETTINGS;
  }

  return {
    enabled:
      typeof value.enabled === "boolean"
        ? value.enabled
        : DEFAULT_AUDIO_SETTINGS.enabled,
    musicVolume:
      typeof value.musicVolume === "number"
        ? clampVolume(value.musicVolume)
        : DEFAULT_AUDIO_SETTINGS.musicVolume,
    muted:
      typeof value.muted === "boolean" ? value.muted : DEFAULT_AUDIO_SETTINGS.muted,
    sfxVolume:
      typeof value.sfxVolume === "number"
        ? clampVolume(value.sfxVolume)
        : DEFAULT_AUDIO_SETTINGS.sfxVolume,
  };
}

export function loadAudioSettings(storage: AudioStorage | null = getBrowserStorage()) {
  if (!storage) {
    return DEFAULT_AUDIO_SETTINGS;
  }

  try {
    const raw = storage.getItem(AUDIO_STORAGE_KEY);

    if (!raw) {
      return DEFAULT_AUDIO_SETTINGS;
    }

    return normalizeAudioSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_AUDIO_SETTINGS;
  }
}

export function saveAudioSettings(settings: AudioSettings, storage: AudioStorage | null = getBrowserStorage()) {
  if (!storage) {
    return;
  }

  try {
    storage.setItem(AUDIO_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Audio preferences are nice to have; blocked storage should not affect play.
  }
}

export function createCueCooldownGate(
  defaultCooldownMs = AUDIO_CUE_DEFAULT_COOLDOWN_MS,
  overrides: Partial<Record<AudioCue, number>> = cueCooldownMs,
) {
  const lastPlayedAt = new Map<AudioCue, number>();

  return {
    reset() {
      lastPlayedAt.clear();
    },
    shouldPlay(cue: AudioCue, nowMs: number) {
      const cooldown = overrides[cue] ?? defaultCooldownMs;
      const previous = lastPlayedAt.get(cue);

      if (previous !== undefined && nowMs - previous < cooldown) {
        return false;
      }

      lastPlayedAt.set(cue, nowMs);
      return true;
    },
  };
}

export function createUniqueCueGate() {
  const playedKeys = new Set<string>();

  return {
    reset(prefix?: string) {
      if (!prefix) {
        playedKeys.clear();
        return;
      }

      for (const key of playedKeys) {
        if (key.startsWith(prefix)) {
          playedKeys.delete(key);
        }
      }
    },
    shouldPlay(key: string) {
      if (playedKeys.has(key)) {
        return false;
      }

      playedKeys.add(key);
      return true;
    },
  };
}

class GameAudioController {
  private context: AudioContext | null = null;
  private cooldownGate = createCueCooldownGate();
  private isSupported = true;
  private isUnlocked = false;
  private listeners = new Set<() => void>();
  private musicElement: HTMLAudioElement | null = null;
  private musicFadeIntervalId: number | null = null;
  private musicDuckingTimeoutId: number | null = null;
  private musicTransitionTimeoutId: number | null = null;
  private scene: MusicScene = "muted";
  private settings = loadAudioSettings();
  private snapshot: AudioSnapshot = this.createSnapshot();
  private sfxGain: GainNode | null = null;
  private uniqueCueGate = createUniqueCueGate();

  getServerSnapshot = (): AudioSnapshot => defaultSnapshot;

  getSnapshot = (): AudioSnapshot => this.snapshot;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  };

  async unlockAudio() {
    const context = this.ensureContext();

    if (!context) {
      return false;
    }

    if (context.state === "suspended") {
      try {
        await context.resume();
      } catch {
        this.isUnlocked = false;
        this.notify();
        return false;
      }
    }

    this.isUnlocked = context.state === "running";

    if (this.isUnlocked) {
      this.startMusicLoop({ fadeIn: true });
    }

    recordAudioDebugEvent({ type: "unlock", unlocked: this.isUnlocked });
    this.notify();
    return this.isUnlocked;
  }

  setMusicScene(scene: MusicScene) {
    if (this.scene === scene) {
      return;
    }

    const previousScene = this.scene;
    this.scene = scene;
    recordAudioDebugEvent({ type: "scene", scene });

    if (
      scene === "muted" ||
      !shouldPlayBackgroundMusic(scene) ||
      this.settings.muted ||
      !this.settings.enabled
    ) {
      this.fadeOutAndStopMusicLoop();
    } else if (this.isUnlocked) {
      if (!shouldPlayBackgroundMusic(previousScene) || !this.isMusicPlaying()) {
        this.startMusicLoop({ fadeIn: true });
      } else {
        this.syncGainValues();
      }
    }

    this.notify();
  }

  setMuted(muted: boolean) {
    this.updateSettings(muted ? { muted } : { enabled: true, muted: false });
    recordAudioDebugEvent({ type: "mute", muted });

    if (muted) {
      this.fadeOutAndStopMusicLoop();
      return;
    }

    if (this.isUnlocked) {
      this.startMusicLoop({ fadeIn: true });
    }
  }

  setVolumes(volumes: Pick<AudioSettings, "musicVolume" | "sfxVolume">) {
    this.updateSettings(volumes);
  }

  playCue(cue: AudioCue, options: PlayCueOptions = {}) {
    if (options.key && !this.uniqueCueGate.shouldPlay(options.key)) {
      this.recordCueEvent(cue, false, "duplicate", options);
      return false;
    }

    if (!this.settings.enabled || this.settings.muted) {
      this.recordCueEvent(cue, false, "muted", options);
      return false;
    }

    const nowMs = getCurrentTimeMs();

    if (!this.cooldownGate.shouldPlay(cue, nowMs)) {
      this.recordCueEvent(cue, false, "cooldown", options);
      return false;
    }

    const context = this.ensureContext();

    if (!context || !this.sfxGain) {
      this.recordCueEvent(cue, false, "unsupported", options);
      return false;
    }

    const wasUnlocked = this.isUnlocked;

    if (context.state === "suspended") {
      void context.resume().then(() => {
        this.isUnlocked = context.state === "running";
        if (this.isUnlocked && !wasUnlocked) {
          this.startMusicLoop({ fadeIn: true });
        }
        recordAudioDebugEvent({ type: "unlock", unlocked: this.isUnlocked });
        this.notify();
      });
      this.recordCueEvent(cue, false, "locked", options);
      return false;
    }

    this.isUnlocked = context.state === "running";

    if (!this.isUnlocked) {
      this.recordCueEvent(cue, false, "locked", options);
      this.notify();
      return false;
    }

    if (!wasUnlocked) {
      this.startMusicLoop({ fadeIn: true });
    }

    const delayMs = Math.max(0, options.delayMs ?? 0);
    this.applyDucking(delayMs);

    for (const event of cuePatterns[cue]) {
      this.playTone(event, this.sfxGain, delayMs);
    }

    this.recordCueEvent(cue, true, "played", options);
    this.notify();
    return true;
  }

  resetUniqueCues(prefix?: string) {
    this.uniqueCueGate.reset(prefix);
  }

  private applyDucking(delayMs = 0) {
    if (!this.musicElement || !shouldPlayBackgroundMusic(this.scene)) {
      return;
    }

    const normalVolume = this.getMusicGainValue();
    const duckedVolume = normalVolume * 0.48;

    if (this.musicDuckingTimeoutId !== null && typeof window !== "undefined") {
      window.clearTimeout(this.musicDuckingTimeoutId);
    }

    this.musicDuckingTimeoutId = window.setTimeout(() => {
      if (!this.musicElement || !shouldPlayBackgroundMusic(this.scene)) {
        return;
      }

      this.musicElement.volume = duckedVolume;
      this.musicDuckingTimeoutId = window.setTimeout(() => {
        this.musicDuckingTimeoutId = null;
        this.fadeMusicVolume(normalVolume, 160);
      }, 180);
    }, delayMs);
  }

  private recordCueEvent(
    cue: AudioCue,
    played: boolean,
    reason: Extract<AudioDebugEvent, { type: "cue" }>["reason"],
    options: PlayCueOptions,
  ) {
    recordAudioDebugEvent({
      cue,
      delayMs: Math.max(0, options.delayMs ?? 0),
      key: options.key,
      played,
      reason,
      scene: this.scene,
      type: "cue",
    });
  }

  private ensureContext() {
    if (typeof window === "undefined") {
      return null;
    }

    if (this.context) {
      return this.context;
    }

    const AudioContextConstructor =
      window.AudioContext ?? (window as LegacyAudioWindow).webkitAudioContext;

    if (!AudioContextConstructor) {
      this.isSupported = false;
      this.notify();
      return null;
    }

    const context = new AudioContextConstructor();
    const sfxGain = context.createGain();

    sfxGain.connect(context.destination);

    this.context = context;
    this.sfxGain = sfxGain;
    this.syncGainValues();

    return context;
  }

  private getMusicGainValue() {
    return this.settings.enabled && !this.settings.muted ? this.settings.musicVolume : 0;
  }

  private getSfxGainValue() {
    return this.settings.enabled && !this.settings.muted ? this.settings.sfxVolume : 0;
  }

  private createSnapshot(): AudioSnapshot {
    return {
      isSupported: this.isSupported,
      isUnlocked: this.isUnlocked,
      scene: this.scene,
      settings: this.settings,
    };
  }

  private notify() {
    this.snapshot = this.createSnapshot();

    for (const listener of this.listeners) {
      listener();
    }
  }

  private playTone(event: ToneEvent, destination: AudioNode, extraDelayMs = 0) {
    if (!this.context) {
      return;
    }

    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const start = this.context.currentTime + (event.delayMs + extraDelayMs) / 1000;
    const end = start + event.durationMs / 1000;

    oscillator.frequency.setValueAtTime(event.frequency, start);
    oscillator.type = event.type ?? "square";
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, event.gain), start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);

    oscillator.connect(gain);
    gain.connect(destination);
    oscillator.start(start);
    oscillator.stop(end + 0.02);
  }

  private startMusicLoop(options: { fadeIn?: boolean } = {}) {
    this.clearMusicTransitionTimeout();
    this.clearMusicFadeInterval();

    if (
      !shouldPlayBackgroundMusic(this.scene) ||
      this.settings.muted ||
      !this.settings.enabled ||
      !this.isUnlocked ||
      typeof window === "undefined"
    ) {
      return;
    }

    const musicElement = this.ensureMusicElement();

    if (!musicElement) {
      return;
    }

    musicElement.loop = true;
    musicElement.muted = false;
    musicElement.volume = options.fadeIn ? 0 : this.getMusicGainValue();
    const playPromise = musicElement.play();

    if (playPromise) {
      void playPromise.catch(() => {
        this.isUnlocked = false;
        this.notify();
      });
    }

    if (options.fadeIn) {
      this.fadeMusicVolume(this.getMusicGainValue(), AUDIO_MUSIC_FADE_IN_MS);
    }
  }

  private stopMusicLoop() {
    this.clearMusicTransitionTimeout();
    this.clearMusicFadeInterval();
    this.clearMusicDuckingTimeout();

    if (this.musicElement) {
      this.musicElement.pause();
    }
  }

  private fadeOutAndStopMusicLoop() {
    if (!this.musicElement || typeof window === "undefined") {
      this.stopMusicLoop();
      return;
    }

    this.clearMusicTransitionTimeout();
    this.fadeMusicVolume(0, AUDIO_MUSIC_FADE_OUT_MS);
    this.musicTransitionTimeoutId = window.setTimeout(() => {
      this.musicTransitionTimeoutId = null;
      this.musicElement?.pause();
    }, AUDIO_MUSIC_FADE_OUT_MS);
  }

  private ensureMusicElement() {
    if (typeof window === "undefined") {
      return null;
    }

    if (!this.musicElement) {
      this.musicElement = new Audio(DEFAULT_BACKGROUND_MUSIC_SRC);
      this.musicElement.preload = "auto";
      this.musicElement.loop = true;
    }

    return this.musicElement;
  }

  private isMusicPlaying() {
    return Boolean(this.musicElement && !this.musicElement.paused);
  }

  private fadeMusicVolume(targetValue: number, durationMs: number) {
    if (!this.musicElement || typeof window === "undefined") {
      return;
    }

    this.clearMusicFadeInterval();
    const startValue = this.musicElement.volume;
    const startedAt = getCurrentTimeMs();

    if (durationMs <= 0) {
      this.musicElement.volume = targetValue;
      return;
    }

    this.musicFadeIntervalId = window.setInterval(() => {
      if (!this.musicElement) {
        this.clearMusicFadeInterval();
        return;
      }

      const progress = Math.min(1, (getCurrentTimeMs() - startedAt) / durationMs);
      this.musicElement.volume = startValue + (targetValue - startValue) * progress;

      if (progress >= 1) {
        this.clearMusicFadeInterval();
      }
    }, 32);
  }

  private clearMusicTransitionTimeout() {
    if (this.musicTransitionTimeoutId !== null && typeof window !== "undefined") {
      window.clearTimeout(this.musicTransitionTimeoutId);
    }

    this.musicTransitionTimeoutId = null;
  }

  private clearMusicFadeInterval() {
    if (this.musicFadeIntervalId !== null && typeof window !== "undefined") {
      window.clearInterval(this.musicFadeIntervalId);
    }

    this.musicFadeIntervalId = null;
  }

  private clearMusicDuckingTimeout() {
    if (this.musicDuckingTimeoutId !== null && typeof window !== "undefined") {
      window.clearTimeout(this.musicDuckingTimeoutId);
    }

    this.musicDuckingTimeoutId = null;
  }

  private syncGainValues() {
    if (!this.context) {
      return;
    }

    const now = this.context.currentTime;

    if (this.sfxGain) {
      this.sfxGain.gain.cancelScheduledValues(now);
      this.sfxGain.gain.setTargetAtTime(this.getSfxGainValue(), now, 0.01);
    }

    if (this.musicElement) {
      this.musicElement.volume = this.getMusicGainValue();
    }
  }

  private updateSettings(patch: Partial<AudioSettings>) {
    this.settings = normalizeAudioSettings({
      ...this.settings,
      ...patch,
    });
    saveAudioSettings(this.settings);
    this.syncGainValues();
    this.notify();
  }
}

export const gameAudio = new GameAudioController();
