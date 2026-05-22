import { describe, expect, it } from "vitest";

import { drawDuelAIBenchmarkFixtures } from "./draw-duel-ai-benchmark-fixtures.js";
import {
  renderDrawDuelNormalizedSnapshot,
  renderDrawDuelSnapshot,
} from "./draw-duel-snapshot-renderer.js";
import { guessDrawDuelTemplate } from "./draw-duel-template-guesser.js";

describe("guessDrawDuelTemplate", () => {
  it("matches canonical benchmark sketches locally without a provider call", async () => {
    const fixture = drawDuelAIBenchmarkFixtures.find(
      (candidate) => candidate.id === "animal-cat",
    );

    if (!fixture) {
      throw new Error("Expected animal-cat fixture.");
    }

    const finalImage = await renderDrawDuelSnapshot(fixture.strokes);
    const normalizedFinalImage = await renderDrawDuelNormalizedSnapshot(fixture.strokes);
    const result = await guessDrawDuelTemplate({
      finalImage,
      normalizedFinalImage,
      roomCode: "BENCH1",
      roundId: "round-1",
      strokeSequence: [],
    });

    expect(result?.text).toBe(fixture.word);
    expect(result?.confidence).toBe(0.99);
  });
});
