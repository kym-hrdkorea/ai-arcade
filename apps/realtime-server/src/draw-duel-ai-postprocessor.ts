import type {
  AIGuesserCandidate,
  AIGuesserOutput,
  AIGuesserScoringContext,
} from "./ai-guesser.js";
import { normalizeAIGuesserText } from "./ai-guesser.js";
import { drawDuelWordBank } from "./draw-duel-word-bank.js";

const unknownFallbackText = "모르겠음";

const genericGuessTexts = new Set([
  "animal",
  "beverage",
  "building",
  "drawing",
  "food",
  "fruit",
  "object",
  "place",
  "shape",
  "sketch",
  "sport",
  "thing",
  "tool",
  "vehicle",
  "건물",
  "과일",
  "그림",
  "동물",
  "물건",
  "사물",
  "스포츠",
  "음식",
  "음료",
  "장소",
  "탈것",
  "형태",
]);

const unknownGuessTexts = new Set([
  "unknown",
  "unsure",
  "모르겠음",
  "모름",
  "몰라",
  "알수없음",
  "알 수 없음",
]);

const fallbackCommentarySteps = [
  "그림의 전체 윤곽을 먼저 살펴보고 있어요.",
  "몇 가지 시각 단서를 조합해 보고 있습니다.",
];

const synonymAliasMap = new Map<string, string>([
  ["aeroplane", "airplane"],
  ["aircraft", "airplane"],
  ["auto", "car"],
  ["automobile", "car"],
  ["bikecycle", "bicycle"],
  ["biking", "bicycle"],
  ["canine", "dog"],
  ["cellphone", "phone"],
  ["couch", "sofa"],
  ["cycle", "bicycle"],
  ["feline", "cat"],
  ["football ball", "soccer ball"],
  ["gift", "present"],
  ["kitty", "cat"],
  ["kitten", "cat"],
  ["lollipop", "candy"],
  ["mic", "microphone"],
  ["mobile", "phone"],
  ["mobile phone", "phone"],
  ["motorbike", "motorcycle"],
  ["plane", "airplane"],
  ["puppy", "dog"],
  ["puppy dog", "dog"],
  ["school building", "school"],
  ["ship", "boat"],
  ["smartphone", "phone"],
  ["soccer", "soccer ball"],
  ["sofa chair", "sofa"],
  ["tv", "television"],
  ["vessel", "boat"],
]);

const koreanParticleSuffixes = [
  "입니다",
  "이에요",
  "예요",
  "처럼",
  "보다",
  "까지",
  "부터",
  "에서",
  "으로",
  "라고",
  "이고",
  "이다",
  "같음",
  "같아",
  "같다",
  "같은",
  "같아요",
  "같습니다",
  "은",
  "는",
  "이",
  "가",
  "을",
  "를",
  "에",
  "의",
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
const wordBankEntriesByWord = new Map(
  drawDuelWordBank.map((entry) => [entry.word, entry] as const),
);

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

function allowedWordSet(scoringContext: AIGuesserScoringContext): Set<string> {
  return new Set(
    scoringContext.candidateWords.map((candidateWord) =>
      normalizeComparableText(candidateWord),
    ),
  );
}

function isAllowedCandidateWord(
  word: string,
  scoringContext: AIGuesserScoringContext,
): boolean {
  const allowedWords = allowedWordSet(scoringContext);

  return allowedWords.size === 0 || allowedWords.has(normalizeComparableText(word));
}

function canonicalizeKnownWord(
  text: string,
  scoringContext: AIGuesserScoringContext,
): string | undefined {
  for (const key of comparableTextKeys(text)) {
    const synonym = synonymAliasMap.get(key);
    const canonicalWord =
      wordAliasIndex.get(key) ??
      (synonym ? wordAliasIndex.get(normalizeComparableText(synonym)) : undefined) ??
      (synonym ? wordAliasIndex.get(normalizeAliasKey(synonym)) : undefined);

    if (canonicalWord && isAllowedCandidateWord(canonicalWord, scoringContext)) {
      return canonicalWord;
    }
  }

  return undefined;
}

function containedKnownWord(
  text: string,
  scoringContext: AIGuesserScoringContext,
): string | undefined {
  const compactText = normalizeComparableText(text);
  const spacedText = normalizeAliasKey(text);
  const matches: { length: number; word: string }[] = [];

  for (const word of scoringContext.candidateWords) {
    const entry = wordBankEntriesByWord.get(word);

    if (!entry) {
      continue;
    }

    for (const value of [entry.word, ...entry.aliases]) {
      for (const key of comparableTextKeys(value)) {
        const compactKey = normalizeComparableText(key);
        const spacedKey = normalizeAliasKey(key);

        if (compactKey.length < 2 && spacedKey.length < 2) {
          continue;
        }

        if (
          (compactKey.length >= 2 && compactText.includes(compactKey)) ||
          (spacedKey.length >= 2 && spacedText.includes(spacedKey))
        ) {
          matches.push({
            length: Math.max(compactKey.length, spacedKey.length),
            word: entry.word,
          });
        }
      }
    }
  }

  return matches.sort((first, second) => second.length - first.length)[0]?.word;
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

  return acceptedAnswers.some((answer) =>
    normalizedTextKeys.includes(normalizeComparableText(answer)),
  )
    ? scoringContext.correctWord
    : undefined;
}

function canonicalizeCandidateText(
  text: string,
  scoringContext: AIGuesserScoringContext,
): string | undefined {
  if (isUnknownGuess(text)) {
    return unknownFallbackText;
  }

  if (isGenericGuess(text)) {
    return undefined;
  }

  return (
    canonicalizeAcceptedAnswer(text, scoringContext) ??
    canonicalizeKnownWord(text, scoringContext) ??
    containedKnownWord(text, scoringContext)
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

function canonicalizeCandidate(
  candidate: AIGuesserCandidate,
  scoringContext: AIGuesserScoringContext,
): AIGuesserCandidate | undefined {
  const canonicalText = canonicalizeCandidateText(candidate.text, scoringContext);

  if (!canonicalText) {
    return undefined;
  }

  return {
    ...candidate,
    text: canonicalText,
  };
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

function cleanCommentaryText(value: string): string | undefined {
  const cleaned = value
    .replace(/\s+/g, " ")
    .replace(/^[`"'“”‘’({[<\s]+/, "")
    .replace(/[`"'“”‘’)}\]>,\s]+$/, "")
    .trim();

  if (!cleaned || cleaned.length > 90) {
    return undefined;
  }

  return cleaned;
}

function mentionsCandidate(text: string, candidateTexts: string[]): boolean {
  const textKeys = comparableTextKeys(text);

  for (const candidateText of candidateTexts) {
    for (const candidateKey of comparableTextKeys(candidateText)) {
      if (candidateKey.length < 2) {
        continue;
      }

      if (textKeys.some((textKey) => textKey.includes(candidateKey))) {
        return true;
      }
    }
  }

  return false;
}

export function sanitizeAICommentarySteps(
  steps: string[] | undefined,
  candidateTexts: string[],
): string[] {
  const sanitized: string[] = [];

  for (const step of steps ?? []) {
    const cleaned = cleanCommentaryText(step);

    if (!cleaned || mentionsCandidate(cleaned, candidateTexts)) {
      continue;
    }

    sanitized.push(cleaned);

    if (sanitized.length >= 4) {
      break;
    }
  }

  if (sanitized.length >= 2) {
    return sanitized;
  }

  return fallbackCommentarySteps;
}

export function postProcessAIGuesserOutput(
  output: AIGuesserOutput,
  scoringContext: AIGuesserScoringContext,
): AIGuesserOutput {
  const canonicalCandidates = dedupeCandidates(
    createCandidateList(output)
      .map((candidate) => canonicalizeCandidate(candidate, scoringContext))
      .filter((candidate): candidate is AIGuesserCandidate => Boolean(candidate)),
  );
  const acceptedCandidate = canonicalCandidates.find((candidate) =>
    Boolean(canonicalizeAcceptedAnswer(candidate.text, scoringContext)),
  );
  const selectedCandidate =
    acceptedCandidate ??
    canonicalCandidates.find((candidate) => !isUnknownGuess(candidate.text)) ??
    canonicalCandidates[0];
  const canonicalSelectedText = selectedCandidate?.text ?? unknownFallbackText;
  const resultCandidates =
    canonicalCandidates.length > 0
      ? canonicalCandidates
      : [
          {
            confidence: output.confidence,
            text: unknownFallbackText,
          },
        ];
  const commentarySteps = sanitizeAICommentarySteps(output.commentarySteps, [
    canonicalSelectedText,
    ...resultCandidates.map((candidate) => candidate.text),
  ]);

  return {
    candidates: resultCandidates,
    commentarySteps,
    confidence: selectedCandidate?.confidence ?? output.confidence,
    text: canonicalSelectedText,
  };
}
