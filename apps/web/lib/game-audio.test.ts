import { describe, expect, it } from "vitest";

import {
  AUDIO_STORAGE_KEY,
  AUDIO_VERDICT_CUE_DELAY_MS,
  createCueCooldownGate,
  createUniqueCueGate,
  DEFAULT_BACKGROUND_MUSIC_SRC,
  loadAudioSettings,
  normalizeAudioSettings,
  saveAudioSettings,
  shouldPlayBackgroundMusic,
  type AudioSettings,
} from "./game-audio";
import {
  evaluateAudioDesignBenchmark,
  evaluateAudioTimelineBenchmark,
} from "./game-audio-benchmark";

function createStorage(initialValue?: string) {
  const values = new Map<string, string>();

  if (initialValue !== undefined) {
    values.set(AUDIO_STORAGE_KEY, initialValue);
  }

  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}

describe("game audio settings", () => {
  it("normalizes persisted settings and clamps volumes", () => {
    expect(
      normalizeAudioSettings({
        enabled: false,
        musicVolume: 4,
        muted: true,
        sfxVolume: -1,
      }),
    ).toEqual({
      enabled: false,
      musicVolume: 1,
      muted: true,
      sfxVolume: 0,
    });
  });

  it("falls back to defaults when storage is empty or invalid", () => {
    expect(loadAudioSettings(createStorage("{bad-json"))).toEqual({
      enabled: true,
      musicVolume: 0.32,
      muted: false,
      sfxVolume: 0.72,
    });
    expect(loadAudioSettings(createStorage())).toEqual({
      enabled: true,
      musicVolume: 0.32,
      muted: false,
      sfxVolume: 0.72,
    });
  });

  it("falls back to defaults when browser storage access is blocked", () => {
    const previousWindow = globalThis.window;

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        get localStorage() {
          throw new Error("storage blocked");
        },
      },
    });

    try {
      expect(loadAudioSettings()).toEqual({
        enabled: true,
        musicVolume: 0.32,
        muted: false,
        sfxVolume: 0.72,
      });
    } finally {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: previousWindow,
      });
    }
  });

  it("saves and reloads user settings", () => {
    const storage = createStorage();
    const settings: AudioSettings = {
      enabled: true,
      musicVolume: 0.2,
      muted: true,
      sfxVolume: 0.6,
    };

    saveAudioSettings(settings, storage);

    expect(loadAudioSettings(storage)).toEqual(settings);
  });
});

describe("game audio cue gates", () => {
  it("blocks repeated cues inside the cooldown window", () => {
    const gate = createCueCooldownGate(200);

    expect(gate.shouldPlay("ui_select", 1000)).toBe(true);
    expect(gate.shouldPlay("ui_select", 1120)).toBe(false);
    expect(gate.shouldPlay("ui_select", 1210)).toBe(true);
  });

  it("dedupes unique event keys such as round results", () => {
    const gate = createUniqueCueGate();

    expect(gate.shouldPlay("draw-duel:round-result:r1")).toBe(true);
    expect(gate.shouldPlay("draw-duel:round-result:r1")).toBe(false);
    expect(gate.shouldPlay("draw-duel:round-result:r2")).toBe(true);

    gate.reset("draw-duel:");
    expect(gate.shouldPlay("draw-duel:round-result:r1")).toBe(true);
  });
});

describe("game background music scenes", () => {
  it("uses the supplied lobby track only outside live gameplay", () => {
    expect(DEFAULT_BACKGROUND_MUSIC_SRC).toBe("/audio/music/coin-jump.mp3");
    expect(shouldPlayBackgroundMusic("hub")).toBe(true);
    expect(shouldPlayBackgroundMusic("lobby")).toBe(true);
    expect(shouldPlayBackgroundMusic("draw-duel-drawing")).toBe(false);
    expect(shouldPlayBackgroundMusic("draw-duel-ai")).toBe(false);
    expect(shouldPlayBackgroundMusic("real-or-ai-answering")).toBe(false);
    expect(shouldPlayBackgroundMusic("result")).toBe(false);
    expect(shouldPlayBackgroundMusic("muted")).toBe(false);
  });
});

describe("game audio UX benchmark", () => {
  it("scores the cue design as excellent", () => {
    const report = evaluateAudioDesignBenchmark();

    expect(report).toMatchObject({
      grade: "excellent",
      issues: [],
      score: 100,
    });
    expect(report.metrics.musicTransitionMs).toBe(600);
    expect(report.metrics.backgroundMusicSceneCount).toBe(2);
    expect(report.metrics.minCueCooldownMs).toBeGreaterThanOrEqual(120);
  });

  it("keeps result timelines spaced so verdict cues do not mask reveals", () => {
    const drawDuelReport = evaluateAudioTimelineBenchmark([
      { atMs: 0, cue: "round_result", label: "round result" },
      {
        atMs: 0,
        cue: "correct",
        delayMs: AUDIO_VERDICT_CUE_DELAY_MS,
        label: "personal verdict",
      },
      { atMs: 1100, cue: "score_reveal", label: "score reveal" },
    ]);
    const realOrAiReport = evaluateAudioTimelineBenchmark([
      { atMs: 0, cue: "answer_reveal", label: "answer reveal" },
      {
        atMs: 0,
        cue: "wrong",
        delayMs: AUDIO_VERDICT_CUE_DELAY_MS,
        label: "personal verdict",
      },
      { atMs: 1000, cue: "score_reveal", label: "score reveal" },
    ]);

    expect(drawDuelReport.grade).toBe("excellent");
    expect(drawDuelReport.issues).toEqual([]);
    expect(realOrAiReport.grade).toBe("excellent");
    expect(realOrAiReport.issues).toEqual([]);
  });

  it("flags simultaneous result and verdict cues as below benchmark", () => {
    const report = evaluateAudioTimelineBenchmark([
      { atMs: 0, cue: "round_result", label: "round result" },
      { atMs: 0, cue: "correct", label: "personal verdict" },
    ]);

    expect(report.grade).not.toBe("excellent");
    expect(report.issues.join("\n")).toContain("cue start gap 0ms");
    expect(report.issues.join("\n")).toContain("overlaps");
  });
});
