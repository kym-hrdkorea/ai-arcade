import type {
  AIGuesserCandidate,
  AIGuesserOutput,
  AIGuesserScoringContext,
} from "./ai-guesser.js";
import { normalizeAIGuesserText } from "./ai-guesser.js";
import { drawDuelWordBank } from "./draw-duel-word-bank.js";

const genericGuessTexts = new Set([
  "animal",
  "building",
  "drawing",
  "food",
  "object",
  "place",
  "shape",
  "sketch",
  "sport",
  "thing",
  "vehicle",
  "그림",
  "낙서",
  "동물",
  "물건",
  "사물",
  "스포츠",
  "음식",
  "장소",
  "차량",
]);

const unknownGuessTexts = new Set([
  "unknown",
  "unsure",
  "모르겠음",
  "모름",
  "몰라",
  "알수없음",
]);

const synonymAliasMap = new Map<string, string>([
  ["auto", "car"],
  ["automobile", "car"],
  ["bikecycle", "bicycle"],
  ["cycle", "bicycle"],
  ["kitty", "cat"],
  ["kitten", "cat"],
  ["puppy dog", "dog"],
  ["puppy", "dog"],
  ["aircraft", "airplane"],
  ["aeroplane", "airplane"],
  ["ship", "boat"],
  ["vessel", "boat"],
  ["cellphone", "phone"],
  ["mobile", "phone"],
  ["mobile phone", "phone"],
  ["smartphone", "phone"],
  ["tv", "television"],
  ["sofa chair", "sofa"],
  ["couch", "sofa"],
  ["football ball", "soccer ball"],
  ["soccer", "soccer ball"],
  ["mic", "microphone"],
]);

const koreanParticleSuffixes = [
  "입니다",
  "이에요",
  "예요",
  "에게",
  "에서",
  "으로",
  "처럼",
  "보다",
  "까지",
  "부터",
  "은",
  "는",
  "이",
  "가",
  "을",
  "를",
  "도",
  "와",
  "과",
  "로",
  "만",
];

function normalizeComparableText(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("ko-KR")
    .replace(/^[`"'“”‘’({[<\s]+/, "")
    .replace(/[`"'“”‘’)}\]>,.!?;:\s]+$/, "")
    .replace(/\s+/g, "");
}

function normalizeAliasKey(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("ko-KR")
    .replace(/^[`"'“”‘’({[<\s]+/, "")
    .replace(/[`"'“”‘’)}\]>,.!?;:\s]+$/, "")
    .replace(/\s+/g, " ");
}

function comparableTextKeys(value: string): string[] {
  const baseKeys = [normalizeComparableText(value), normalizeAliasKey(value)];
  const keys = new Set(baseKeys);

  for (const key of baseKeys) {
    for (const suffix of koreanParticleSuffixes) {
      if (key.length > suffix.length && key.endsWith(suffix)) {
        keys.add(key.slice(0, -suffix.length));
      }
    }
  }

  return [...keys].filter(Boolean);
}

function createWordAliasIndex(): Map<string, string> {
  const index = new Map<string, string>();

  for (const entry of drawDuelWordBank) {
    for (const value of [entry.word, ...entry.aliases]) {
      index.set(normalizeComparableText(value), entry.word);
      index.set(normalizeAliasKey(value), entry.word);
    }
  }

  return index;
}

const wordAliasIndex = createWordAliasIndex();

function isGenericGuess(text: string): boolean {
  const compact = normalizeComparableText(text);
  const spaced = normalizeAliasKey(text);

  return genericGuessTexts.has(compact) || genericGuessTexts.has(spaced);
}

function isUnknownGuess(text: string): boolean {
  const compact = normalizeComparableText(text);
  const spaced = normalizeAliasKey(text);

  return unknownGuessTexts.has(compact) || unknownGuessTexts.has(spaced);
}

function canonicalizeKnownWord(text: string): string | undefined {
  for (const key of comparableTextKeys(text)) {
    const synonym = synonymAliasMap.get(key);
    const canonicalWord =
      wordAliasIndex.get(key) ??
      (synonym ? wordAliasIndex.get(normalizeComparableText(synonym)) : undefined) ??
      (synonym ? wordAliasIndex.get(normalizeAliasKey(synonym)) : undefined);

    if (canonicalWord) {
      return canonicalWord;
    }
  }

  return undefined;
}

function canonicalizeAcceptedAnswer(
  text: string,
  scoringContext: AIGuesserScoringContext,
): string | undefined {
  const acceptedAnswers = [
    scoringContext.correctWord,
    ...scoringContext.aliases,
  ].filter(Boolean);
  const normalizedTextKeys = comparableTextKeys(text);

  return acceptedAnswers.some(
    (answer) => normalizedTextKeys.includes(normalizeComparableText(answer)),
  )
    ? scoringContext.correctWord
    : undefined;
}

function canonicalizeCandidateText(
  text: string,
  scoringContext: AIGuesserScoringContext,
): string {
  return (
    canonicalizeAcceptedAnswer(text, scoringContext) ??
    canonicalizeKnownWord(text) ??
    normalizeAIGuesserText(text)
  );
}

function normalizeCandidate(candidate: AIGuesserCandidate): AIGuesserCandidate | undefined {
  const text = normalizeAIGuesserText(candidate.text, "");

  if (!text) {
    return undefined;
  }

  return typeof candidate.confidence === "number" && Number.isFinite(candidate.confidence)
    ? {
        confidence: Math.min(1, Math.max(0, candidate.confidence)),
        text,
      }
    : {
        text,
      };
}

function createCandidateList(output: AIGuesserOutput): AIGuesserCandidate[] {
  const candidates =
    output.candidates && output.candidates.length > 0
      ? output.candidates
      : [
          {
            confidence: output.confidence,
            text: output.text,
          },
        ];

  return candidates
    .map(normalizeCandidate)
    .filter((candidate): candidate is AIGuesserCandidate => Boolean(candidate));
}

function dedupeCandidates(candidates: AIGuesserCandidate[]): AIGuesserCandidate[] {
  const seen = new Set<string>();
  const deduped: AIGuesserCandidate[] = [];

  for (const candidate of candidates) {
    const key = normalizeComparableText(candidate.text);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(candidate);
  }

  return deduped;
}

export function postProcessAIGuesserOutput(
  output: AIGuesserOutput,
  scoringContext: AIGuesserScoringContext,
): AIGuesserOutput {
  const candidates = createCandidateList(output);
  const firstCandidate = candidates[0];
  const firstSpecificCandidate = candidates.find(
    (candidate) => !isGenericGuess(candidate.text) && !isUnknownGuess(candidate.text),
  );
  const selectedCandidate =
    firstCandidate &&
    (isGenericGuess(firstCandidate.text) || isUnknownGuess(firstCandidate.text)) &&
    firstSpecificCandidate
      ? firstSpecificCandidate
      : firstCandidate;

  const canonicalCandidates = dedupeCandidates(
    candidates.map((candidate) => ({
      ...candidate,
      text: canonicalizeCandidateText(candidate.text, scoringContext),
    })),
  );
  const canonicalSelectedText = selectedCandidate
    ? canonicalizeCandidateText(selectedCandidate.text, scoringContext)
    : normalizeAIGuesserText(output.text);

  return {
    candidates: canonicalCandidates,
    confidence: selectedCandidate?.confidence ?? output.confidence,
    text: canonicalSelectedText,
  };
}
