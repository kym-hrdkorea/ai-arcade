import { describe, expect, it } from "vitest";

import { sanitizeOpenAIApiKey } from "./ai-guesser-factory.js";

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

