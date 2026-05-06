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
        { text: "Bull claim [c1].", citationIds: ["c1"], status: "supported" },
        { text: "Unsupported claim [c2].", citationIds: ["c2"], status: "unsupported" }
      ]
    );

    expect(result).toEqual([{ text: "Bull claim [c1].", citationIds: ["c1"] }]);
  });

  it("matches supported claims by text and citation IDs", () => {
    const result = applyVerifierResults(
      [
        { text: "Same claim.", citationIds: ["c1"] },
        { text: "Same claim.", citationIds: ["c2"] }
      ],
      [{ text: "Same claim.", citationIds: ["c1"], status: "supported" }]
    );

    expect(result).toEqual([{ text: "Same claim.", citationIds: ["c1"] }]);
  });

  it("normalizes citation ID order when matching", () => {
    const result = applyVerifierResults(
      [{ text: "Combined claim.", citationIds: ["c2", "c1"] }],
      [{ text: "Combined claim.", citationIds: ["c1", "c2"], status: "supported" }]
    );

    expect(result).toEqual([{ text: "Combined claim.", citationIds: ["c2", "c1"] }]);
  });

  it("drops claims with conflicting duplicate verifier results", () => {
    const result = applyVerifierResults(
      [{ text: "Conflicted claim [c1].", citationIds: ["c1"] }],
      [
        { text: "Conflicted claim [c1].", citationIds: ["c1"], status: "supported" },
        { text: "Conflicted claim [c1].", citationIds: ["c1"], status: "unsupported" }
      ]
    );

    expect(result).toEqual([]);
  });

  it("drops claims with duplicate supported verifier results", () => {
    const result = applyVerifierResults(
      [{ text: "Duplicated claim [c1].", citationIds: ["c1"] }],
      [
        { text: "Duplicated claim [c1].", citationIds: ["c1"], status: "supported" },
        { text: "Duplicated claim [c1].", citationIds: ["c1"], status: "supported" }
      ]
    );

    expect(result).toEqual([]);
  });
});

describe("verifySynthesis", () => {
  it("rejects malformed verifier JSON", async () => {
    const client = {
      messages: {
        create: async () => ({
          content: [{ type: "text", text: JSON.stringify([{ text: "Claim [c1].", citationIds: ["c1"], status: "maybe" }]) }]
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

  it("rejects non-json verifier output", async () => {
    const client = {
      messages: {
        create: async () => ({
          content: [{ type: "text", text: "supported" }]
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

  it("rejects non-array verifier JSON", async () => {
    const client = {
      messages: {
        create: async () => ({
          content: [{ type: "text", text: JSON.stringify({ text: "Claim [c1].", citationIds: ["c1"], status: "supported" }) }]
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
