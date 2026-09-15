import { describe, expect, it } from "vitest";
import {
  EXTRACTION_UNAVAILABLE_PREFIX,
  generationFailureCode,
  generationFailureMessage
} from "../src/failure-code";

describe("generationFailureCode", () => {
  it.each([
    ["profile failed the evidence floor", "evidence_insufficiency"],
    ["no accepted provider sources returned", "provider_unavailable"],
    ["Your credit balance is too low to access the Anthropic API", "provider_unavailable"],
    ["insufficient_quota from the configured model provider", "provider_unavailable"],
    ['Failed query: insert into "sources" (id, card_id, url) values (default, $1, $2)', "storage_unavailable"],
    ["connection terminated unexpectedly", "storage_unavailable"],
    ["Zod schema validation failed for synthesis", "model_contract"],
    ["Unexpected non-whitespace character after JSON at position 2615", "model_contract"],
    ["Unexpected end of JSON input", "model_contract"],
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

describe("exhausted extraction recovery", () => {
  const detail = "upstream.example timed out";

  function terminal(message: string, cause?: unknown) {
    return new Error(`${EXTRACTION_UNAVAILABLE_PREFIX} ${message}`, { cause });
  }

  it.each([
    ["a timeout cause", new DOMException("Profile extraction timed out", "TimeoutError"), "timeout"],
    ["an HTTP 429 cause", new Error("openai-compat request failed with 429: slow down"), "provider_unavailable"],
    ["an HTTP 503 cause", new Error("openai-compat request failed with 503: unavailable"), "provider_unavailable"],
    ["a transport cause", new TypeError("fetch failed"), "provider_unavailable"],
    ["no cause at all", undefined, "provider_unavailable"]
  ] as const)("classifies %s behind the prefix", (_label, cause, expected) => {
    expect(generationFailureCode(terminal("providers exhausted", cause))).toBe(expected);
  });

  it("classifies a fallback host collision as provider_unavailable", () => {
    const cause = new Error("openai-compat request failed with 503: unavailable");
    const message = 'Provider fallback "openrouter" resolves to the primary endpoint host gateway.example.com';
    expect(generationFailureCode(terminal(message, cause))).toBe("provider_unavailable");
  });

  it("reads the detail when a stored failure message arrives without a cause", () => {
    expect(generationFailureCode(`${EXTRACTION_UNAVAILABLE_PREFIX} ${detail}`)).toBe("timeout");
  });

  it("leaves an unrelated message unclassified", () => {
    expect(generationFailureCode(new Error("the printer caught fire"))).toBe("unknown");
  });

  it("still rewrites the user-facing message", () => {
    expect(generationFailureMessage(`${EXTRACTION_UNAVAILABLE_PREFIX} ${detail}`)).toBe(
      "Cold Start could not finish this profile. Please try again later."
    );
    expect(generationFailureMessage("evidence floor not met")).toBe("evidence floor not met");
  });
});
