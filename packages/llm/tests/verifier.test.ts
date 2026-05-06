import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { applyVerifierResults, verifySynthesis } from "../src/index";

describe("applyVerifierResults", () => {
  it("keeps supported claims and drops unsupported claims", () => {
    const result = applyVerifierResults(
      [
        { text: "Bull claim [c1].", citationIds: ["c1"] },
        { text: "Unsupported claim [c2].", citationIds: ["c2"] }
      ],
      [
        { text: "Bull claim [c1].", status: "supported" },
        { text: "Unsupported claim [c2].", status: "unsupported" }
      ]
    );

    expect(result).toEqual([{ text: "Bull claim [c1].", citationIds: ["c1"] }]);
  });
});

describe("verifySynthesis", () => {
  it("rejects malformed verifier JSON", async () => {
    const client = {
      messages: {
        create: async () => ({
          content: [{ type: "text", text: JSON.stringify([{ text: "Claim [c1].", status: "maybe" }]) }]
        })
      }
    } as unknown as Anthropic;

    await expect(
      verifySynthesis({
        client,
        model: "claude-test",
        claims: [{ text: "Claim [c1].", citationIds: ["c1"] }],
        sources: [{ id: "c1", url: "https://example.com", title: "Example" }]
      })
    ).rejects.toThrow();
  });
});
