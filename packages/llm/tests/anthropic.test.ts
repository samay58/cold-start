import { describe, expect, it } from "vitest";
import { anthropicModelForStage, estimateAnthropicCostUsd } from "../src/index";

describe("estimateAnthropicCostUsd", () => {
  it("prices uncached, cache-read, cache-write, and output tokens by model family", () => {
    expect(
      estimateAnthropicCostUsd("claude-sonnet-4-6", {
        input_tokens: 1_000_000,
        cache_read_input_tokens: 1_000_000,
        cache_creation_input_tokens: 1_000_000,
        output_tokens: 1_000_000
      })
    ).toBe(22.05);
  });

  it("uses detailed cache creation TTL fields when present", () => {
    expect(
      estimateAnthropicCostUsd("claude-haiku-4-5", {
        cache_creation_input_tokens: 2_000_000,
        cache_creation: {
          ephemeral_5m_input_tokens: 1_000_000,
          ephemeral_1h_input_tokens: 1_000_000
        }
      })
    ).toBe(3.25);
  });
});

describe("anthropicModelForStage", () => {
  it("prefers a stage-specific model over the default model", () => {
    const previous = process.env.ANTHROPIC_VERIFIER_MODEL;
    process.env.ANTHROPIC_VERIFIER_MODEL = "claude-haiku-4-5";

    try {
      expect(anthropicModelForStage("verify", "claude-sonnet-4-6")).toBe("claude-haiku-4-5");
    } finally {
      if (previous === undefined) {
        delete process.env.ANTHROPIC_VERIFIER_MODEL;
      } else {
        process.env.ANTHROPIC_VERIFIER_MODEL = previous;
      }
    }
  });
});
