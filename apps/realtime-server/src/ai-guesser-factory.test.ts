import { describe, expect, it } from "vitest";

import {
  parseDetail,
  parseReasoningEffort,
  sanitizeOpenAIApiKey,
} from "./ai-guesser-factory.js";

describe("sanitizeOpenAIApiKey", () => {
  it("accepts raw ASCII API keys and strips accidental wrapping quotes", () => {
    expect(sanitizeOpenAIApiKey("sk-proj-test_123")).toBe("sk-proj-test_123");
    expect(sanitizeOpenAIApiKey('"sk-proj-test_123"')).toBe("sk-proj-test_123");
  });

  it("rejects placeholders or values that cannot be sent as an HTTP header", () => {
    expect(sanitizeOpenAIApiKey("여기에_실제_API_KEY")).toBeUndefined();
    expect(sanitizeOpenAIApiKey("sk-proj test")).toBeUndefined();
    expect(sanitizeOpenAIApiKey("")).toBeUndefined();
  });
});


describe("parseDetail / parseReasoningEffort", () => {
  it("accepts values case-insensitively with surrounding whitespace", () => {
    expect(parseReasoningEffort("MEDIUM")).toBe("medium");
    expect(parseReasoningEffort(" Low ")).toBe("low");
    expect(parseDetail("AUTO")).toBe("auto");
    expect(parseDetail(" High ")).toBe("high");
  });

  it("rejects unknown values", () => {
    expect(parseReasoningEffort("midium")).toBeUndefined();
    expect(parseDetail("ultra")).toBeUndefined();
    expect(parseReasoningEffort(undefined)).toBeUndefined();
  });
});
