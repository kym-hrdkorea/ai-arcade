import {
  ALL_AUDIO_CUES,
  AUDIO_MUSIC_FADE_IN_MS,
  AUDIO_MUSIC_FADE_OUT_MS,
  BACKGROUND_MUSIC_SCENES,
  type AudioCue,
  type MusicScene,
  getAudioCueCooldownMs,
  getAudioCueDurationMs,
  getAudioCueMaxToneOverlap,
  shouldPlayBackgroundMusic,
} from "./game-audio";

export type AudioTimelineEvent = {
  atMs: number;
  cue: AudioCue;
  delayMs?: number;
  label?: string;
};

export type AudioUxBenchmarkReport = {
  grade: "excellent" | "good" | "needs-work";
  issues: string[];
  metrics: {
    maxCueDurationMs: number;
    maxCueToneOverlap: number;
    backgroundMusicSceneCount: number;
    minCueCooldownMs: number;
    minTimelineCueGapMs: number | null;
    musicTransitionMs: number;
  };
  score: number;
};

export const AUDIO_UX_BENCHMARK_TARGETS = {
  excellentScore: 95,
  maxCueDurationMs: 650,
  maxCueEnvelopeOverlapMs: 80,
  maxCueToneOverlap: 2,
  maxMusicTransitionMs: 600,
  minCueCooldownMs: 120,
  minMusicTransitionMs: 300,
  minTimelineCueGapMs: 120,
} as const;

function gradeForScore(score: number): AudioUxBenchmarkReport["grade"] {
  if (score >= AUDIO_UX_BENCHMARK_TARGETS.excellentScore) {
    return "excellent";
  }

  if (score >= 80) {
    return "good";
  }

  return "needs-work";
}

function scoreFromIssues(issueCount: number) {
  return Math.max(0, 100 - issueCount * 8);
}

export function evaluateAudioDesignBenchmark(): AudioUxBenchmarkReport {
  const issues: string[] = [];
  const cueDurations = ALL_AUDIO_CUES.map((cue) => getAudioCueDurationMs(cue));
  const cueOverlaps = ALL_AUDIO_CUES.map((cue) => getAudioCueMaxToneOverlap(cue));
  const cueCooldowns = ALL_AUDIO_CUES.map((cue) => getAudioCueCooldownMs(cue));
  const maxCueDurationMs = Math.max(...cueDurations);
  const maxCueToneOverlap = Math.max(...cueOverlaps);
  const minCueCooldownMs = Math.min(...cueCooldowns);
  const musicTransitionMs = AUDIO_MUSIC_FADE_OUT_MS + AUDIO_MUSIC_FADE_IN_MS;
  const musicScenes: readonly MusicScene[] = [
    "hub",
    "lobby",
    "draw-duel-drawing",
    "draw-duel-ai",
    "real-or-ai-answering",
    "result",
    "muted",
  ];
  const backgroundMusicSceneCount = musicScenes.filter(shouldPlayBackgroundMusic).length;

  if (maxCueDurationMs > AUDIO_UX_BENCHMARK_TARGETS.maxCueDurationMs) {
    issues.push(`cue duration ${maxCueDurationMs}ms exceeds target`);
  }

  if (maxCueToneOverlap > AUDIO_UX_BENCHMARK_TARGETS.maxCueToneOverlap) {
    issues.push(`tone overlap ${maxCueToneOverlap} exceeds target`);
  }

  if (minCueCooldownMs < AUDIO_UX_BENCHMARK_TARGETS.minCueCooldownMs) {
    issues.push(`cue cooldown ${minCueCooldownMs}ms is below target`);
  }

  if (
    musicTransitionMs < AUDIO_UX_BENCHMARK_TARGETS.minMusicTransitionMs ||
    musicTransitionMs > AUDIO_UX_BENCHMARK_TARGETS.maxMusicTransitionMs
  ) {
    issues.push(`music transition ${musicTransitionMs}ms is outside target range`);
  }

  if (
    backgroundMusicSceneCount !== BACKGROUND_MUSIC_SCENES.length ||
    shouldPlayBackgroundMusic("draw-duel-drawing") ||
    shouldPlayBackgroundMusic("draw-duel-ai") ||
    shouldPlayBackgroundMusic("real-or-ai-answering") ||
    shouldPlayBackgroundMusic("result")
  ) {
    issues.push("background music must be limited to hub and lobby scenes");
  }

  const score = scoreFromIssues(issues.length);

  return {
    grade: gradeForScore(score),
    issues,
    metrics: {
      maxCueDurationMs,
      maxCueToneOverlap,
      backgroundMusicSceneCount,
      minCueCooldownMs,
      minTimelineCueGapMs: null,
      musicTransitionMs,
    },
    score,
  };
}

export function evaluateAudioTimelineBenchmark(
  events: readonly AudioTimelineEvent[],
): AudioUxBenchmarkReport {
  const issues: string[] = [];
  const scheduledEvents = events
    .map((event) => {
      const startMs = event.atMs + Math.max(0, event.delayMs ?? 0);

      return {
        ...event,
        endMs: startMs + getAudioCueDurationMs(event.cue),
        startMs,
      };
    })
    .sort((first, second) => first.startMs - second.startMs);
  const cueGaps: number[] = [];

  for (let index = 1; index < scheduledEvents.length; index += 1) {
    const previous = scheduledEvents[index - 1];
    const current = scheduledEvents[index];

    if (!previous || !current) {
      continue;
    }

    cueGaps.push(current.startMs - previous.startMs);
  }
  const minTimelineCueGapMs = cueGaps.length > 0 ? Math.min(...cueGaps) : null;

  if (
    minTimelineCueGapMs !== null &&
    minTimelineCueGapMs < AUDIO_UX_BENCHMARK_TARGETS.minTimelineCueGapMs
  ) {
    issues.push(`cue start gap ${minTimelineCueGapMs}ms is below target`);
  }

  for (let index = 1; index < scheduledEvents.length; index += 1) {
    const previous = scheduledEvents[index - 1];
    const current = scheduledEvents[index];

    if (!previous || !current) {
      continue;
    }

    const overlapMs = Math.min(previous.endMs, current.endMs) - current.startMs;

    if (overlapMs > AUDIO_UX_BENCHMARK_TARGETS.maxCueEnvelopeOverlapMs) {
      issues.push(
        `${previous.label ?? previous.cue} overlaps ${current.label ?? current.cue} by ${overlapMs}ms`,
      );
    }
  }

  const designReport = evaluateAudioDesignBenchmark();
  const allIssues = [...designReport.issues, ...issues];
  const score = scoreFromIssues(allIssues.length);

  return {
    grade: gradeForScore(score),
    issues: allIssues,
    metrics: {
      ...designReport.metrics,
      minTimelineCueGapMs,
    },
    score,
  };
}
