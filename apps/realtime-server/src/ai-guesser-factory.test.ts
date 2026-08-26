import { describe, expect, it } from "vitest";

import {
  describeInvalidOpenAIApiKey,
  parseDetail,
  parseReasoningEffort,
  sanitizeOpenAIApiKey,
} from "./ai-guesser-factory.js";

describe("sanitizeOpenAIApiKey", () => {
  it("accepts raw ASCII API keys and strips accidental wrapping quotes", () => {
    expect(sanitizeOpenAIApiKey("sk-proj-test_123")).toBe("sk-proj-test_123");
    expect(sanitizeOpenAIApiKey('"sk-proj-test_123"')).toBe("sk-proj-test_123");
  });

  it("repairs keys that picked up whitespace or a line break when pasted", () => {
    expect(sanitizeOpenAIApiKey("sk-proj-abc\ndef")).toBe("sk-proj-abcdef");
    expect(sanitizeOpenAIApiKey("sk-proj test")).toBe("sk-projtest");
    expect(sanitizeOpenAIApiKey("  sk-proj-abc \r\n def  ")).toBe("sk-proj-abcdef");
  });

  it("repairs keys that picked up invisible Unicode format characters", () => {
    expect(sanitizeOpenAIApiKey("sk-proj-abc​def")).toBe("sk-proj-abcdef");
    expect(sanitizeOpenAIApiKey("﻿sk-proj-abc⁠def‍")).toBe("sk-proj-abcdef");
  });

  it("describes an invalid key without leaking its content", () => {
    expect(describeInvalidOpenAIApiKey(undefined)).toBe("env var is not set");
    expect(describeInvalidOpenAIApiKey("  ")).toContain("value is empty");
    const description = describeInvalidOpenAIApiKey("sk-proj-한글abc");
    expect(description).toContain("nonAsciiChars=2");
    expect(description).toContain("firstNonAscii=U+D55C");
    expect(description).toContain("startsWithSk=true");
    expect(description).not.toContain("abc");
  });

  it("rejects placeholders or values that cannot be sent as an HTTP header", () => {
    expect(sanitizeOpenAIApiKey("여기에_실제_API_KEY")).toBeUndefined();
    expect(sanitizeOpenAIApiKey("")).toBeUndefined();
    expect(sanitizeOpenAIApiKey(undefined)).toBeUndefined();
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
