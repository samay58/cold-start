import { describe, expect, it } from "vitest";
import type { ColdStartCard } from "@cold-start/core";
import { assertEmphasisCitationsExistOnCard, emphasisReadSystemPrompt, parseEmphasisReadToolUse } from "../src/index";

function toolUseMessage(input: unknown) {
  return { content: [{ type: "tool_use", name: "emit_emphasis_read", input }] };
}

function citation(id: string): ColdStartCard["citations"][number] {
  return {
    id,
    url: `https://example.com/${id}`,
    title: `Title ${id}`,
    fetchedAt: "2026-08-11T00:00:00.000Z",
    sourceType: "news"
  };
}

function fact<T>(value: T) {
  return { value, status: "verified" as const, confidence: "medium" as const, citationIds: ["c1"] };
}

function cardWith(citations: ColdStartCard["citations"]): ColdStartCard {
  return {
    slug: "acme",
    domain: "acme.com",
    generatedAt: "2026-08-11T00:00:00.000Z",
    generationCostUsd: 0,
    cacheStatus: "hit",
    identity: {
      name: fact("Acme"),
      logoUrl: null,
      oneLiner: fact("Acme sells to mid-market ops teams."),
      hq: fact({ city: "San Francisco", country: "United States" }),
      foundedYear: fact(2024),
      status: "private"
    },
    funding: { totalRaisedUsd: fact(null), lastRound: fact(null), investors: fact(null) },
    team: { founders: fact([]), keyExecs: fact([]), headcount: fact(null) },
    signals: [],
    comparables: [],
    citations
  };
}

const validReadPayload = {
  status: "read",
  loud: { text: "They lead every post with GitHub stars [c1] [c2].", citationIds: ["c2", "c1"] },
  quiet: "Nothing filed shows a named paying customer.",
  read: { text: "The loudest proof sits at product, not customers [c3].", citationIds: ["c3"] },
  wouldChangeIf: "A named customer with a dollar figure would break this read."
};

describe("emphasisReadSystemPrompt", () => {
  it("carries the never-claim-absence rule and the proof ladder verbatim, with no em dash", () => {
    expect(emphasisReadSystemPrompt).toContain("Nothing filed shows");
    expect(emphasisReadSystemPrompt).toContain("absence on the web is not knowable");
    expect(emphasisReadSystemPrompt).toContain(
      "paying customers, then demand, then a working product, then a real problem, then team, then idea"
    );
    expect(emphasisReadSystemPrompt).toContain("never a yardstick");
    expect(emphasisReadSystemPrompt).toContain("emit nothing_notable instead");
    expect(emphasisReadSystemPrompt).not.toContain("—");
  });
});

describe("parseEmphasisReadToolUse", () => {
  it("parses a full read and normalizes citation markers", () => {
    const parsed = parseEmphasisReadToolUse(toolUseMessage(validReadPayload));

    expect(parsed.status).toBe("read");
    if (parsed.status !== "read") {
      throw new Error("expected a read result");
    }
    expect([...parsed.loud.citationIds].sort()).toEqual(["c1", "c2"]);
    expect(parsed.read.citationIds).toEqual(["c3"]);
    expect(parsed.quiet).toBe("Nothing filed shows a named paying customer.");
    expect(parsed.wouldChangeIf).toBe(validReadPayload.wouldChangeIf);
  });

  it("parses nothing_notable with null parts", () => {
    const parsed = parseEmphasisReadToolUse(
      toolUseMessage({ status: "nothing_notable", loud: null, quiet: null, read: null, wouldChangeIf: null })
    );

    expect(parsed).toEqual({ status: "nothing_notable" });
  });

  it("rejects a read whose quiet does not start with Nothing filed shows", () => {
    expect(() =>
      parseEmphasisReadToolUse(
        toolUseMessage({
          ...validReadPayload,
          quiet: "They have no revenue."
        })
      )
    ).toThrow();
  });

  it("rejects a read whose visible markers do not match citationIds", () => {
    expect(() =>
      parseEmphasisReadToolUse(
        toolUseMessage({
          ...validReadPayload,
          loud: { text: "They lead every post with GitHub stars [c1].", citationIds: ["c9"] }
        })
      )
    ).toThrow();
  });
});

describe("assertEmphasisCitationsExistOnCard", () => {
  it("rejects a read citing an id absent from the card", () => {
    const card = cardWith([citation("c2"), citation("c3")]);
    const parsed = parseEmphasisReadToolUse(toolUseMessage(validReadPayload));

    expect(() => assertEmphasisCitationsExistOnCard(parsed, card)).toThrow(/c1/);
  });

  it("passes when every cited id exists on the card", () => {
    const card = cardWith([citation("c1"), citation("c2"), citation("c3")]);
    const parsed = parseEmphasisReadToolUse(toolUseMessage(validReadPayload));

    expect(() => assertEmphasisCitationsExistOnCard(parsed, card)).not.toThrow();
  });

  it("is a no-op for nothing_notable", () => {
    const card = cardWith([citation("c1")]);
    const parsed = parseEmphasisReadToolUse(
      toolUseMessage({ status: "nothing_notable", loud: null, quiet: null, read: null, wouldChangeIf: null })
    );

    expect(() => assertEmphasisCitationsExistOnCard(parsed, card)).not.toThrow();
  });
});
