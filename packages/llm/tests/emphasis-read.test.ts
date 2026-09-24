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

  // Captured from a live claude-sonnet-4-6 read on the Notion card (2026-09-24): the model cited
  // p2 and p5 once per sentence that used them, so the text repeats markers its citationIds list
  // once. 13 of 14 captured failures had this shape; before the fix each one became nothing_notable.
  it("accepts a read that repeats a marker across sentences", () => {
    const parsed = parseEmphasisReadToolUse(
      toolUseMessage({
        ...validReadPayload,
        loud: {
          text: "Notion leads with Custom Agents as its identity pivot: 1 million agents built in two months of beta [p3][p5], autonomous AI teammates running across Slack, Figma, Linear, and MCP servers [p2], and a homepage claim of being trusted by 98% of the Forbes Cloud 100 [p7]. The co-founder bylines the agent launch posts personally [p2][p5], signaling this is the strategic bet, not a feature drop.",
          citationIds: ["p2", "p3", "p5", "p7"]
        }
      })
    );

    if (parsed.status !== "read") {
      throw new Error("expected a read result");
    }
    expect(parsed.loud.citationIds).toEqual(["p2", "p3", "p5", "p7"]);
    expect(parsed.loud.text).toContain("signaling this is the strategic bet, not a feature drop");
    expect(parsed.loud.text.match(/\[p5\]/g)).toHaveLength(1);
  });

  // Captured from the CasaPHQ card: citationIds lists e2, which the text never shows.
  it("accepts a read whose citationIds lists an id the text leaves out", () => {
    const parsed = parseEmphasisReadToolUse(
      toolUseMessage({
        ...validReadPayload,
        read: {
          text: "The loudest proof on offer is the funding round itself, not customer outcomes. Emergence leading a $33.5M total raise [e7][e9] is a real signal.",
          citationIds: ["e7", "e9", "e2"]
        }
      })
    );

    if (parsed.status !== "read") {
      throw new Error("expected a read result");
    }
    expect(parsed.read.citationIds).toEqual(["e7", "e9", "e2"]);
    expect(parsed.read.text).toMatch(/\[e2\]/);
  });

  it("still fails a read whose citationIds name an id missing from the card", () => {
    const parsed = parseEmphasisReadToolUse(
      toolUseMessage({
        ...validReadPayload,
        loud: { text: "They lead every post with GitHub stars [c1].", citationIds: ["c9"] }
      })
    );

    expect(() => assertEmphasisCitationsExistOnCard(parsed, cardWith(["c1", "c2", "c3"].map(citation)))).toThrow(/c9/);
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
