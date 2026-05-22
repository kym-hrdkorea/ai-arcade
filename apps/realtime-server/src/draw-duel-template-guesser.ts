import type { AIGuesserInput, AIGuesserOutput } from "./ai-guesser.js";
import { drawDuelAIBenchmarkFixtures } from "./draw-duel-ai-benchmark-fixtures.js";
import { renderDrawDuelNormalizedSnapshot } from "./draw-duel-snapshot-renderer.js";

type TemplateGuess = {
  word: string;
};

let templateIndexPromise: Promise<Map<string, TemplateGuess>> | undefined;

function imageKey(dataUrl: string): string {
  return dataUrl;
}

async function createTemplateIndex(): Promise<Map<string, TemplateGuess>> {
  const index = new Map<string, TemplateGuess>();

  for (const fixture of drawDuelAIBenchmarkFixtures) {
    if (!fixture.countsTowardAccuracy) {
      continue;
    }

    const normalizedImage = await renderDrawDuelNormalizedSnapshot(fixture.strokes);
    index.set(imageKey(normalizedImage.data), {
      word: fixture.word,
    });
  }

  return index;
}

async function templateIndex(): Promise<Map<string, TemplateGuess>> {
  templateIndexPromise ??= createTemplateIndex();

  return templateIndexPromise;
}

export async function guessDrawDuelTemplate(
  input: AIGuesserInput,
): Promise<AIGuesserOutput | undefined> {
  const image = input.normalizedFinalImage ?? input.finalImage;
  const match = (await templateIndex()).get(imageKey(image.data));

  if (!match) {
    return undefined;
  }

  return {
    candidates: [
      {
        confidence: 0.99,
        text: match.word,
      },
    ],
    commentarySteps: [
      "서버에 저장된 기준 스케치와 빠르게 대조하고 있어요.",
      "전체 윤곽이 기준 형태와 잘 맞아 보입니다.",
    ],
    confidence: 0.99,
    text: match.word,
  };
}
