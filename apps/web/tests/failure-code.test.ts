import { describe, expect, it } from "vitest";
import { generationFailureCode } from "../src/lib/failure-code";

describe("generationFailureCode", () => {
  it.each([
    ["profile failed the evidence floor", "evidence_insufficiency"],
    ["no accepted provider sources returned", "provider_unavailable"],
    ["Zod schema validation failed for synthesis", "model_contract"],
    ["Failed to update card after concurrent writes", "concurrent_write"],
    ["generation run went silent; retired by watchdog", "timeout"],
    ["extension token invalid", "authentication"],
    ["Lens allowance exhausted", "allowance_exhausted"],
    ["unexpected failure", "unknown"],
    ["output token limit reached", "unknown"],
    ["max_tokens exceeded", "unknown"],
    ["invalid token", "authentication"],
    ["missing x-api-key header", "authentication"],
    ["bearer token rejected", "authentication"]
  ] as const)("classifies %s", (message, expected) => {
    expect(generationFailureCode(new Error(message))).toBe(expected);
  });
});
