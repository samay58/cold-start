import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildSkeletonCard } from "@cold-start/pipeline";
import type { Citation } from "@cold-start/core";
import type { FounderVoiceItem } from "@cold-start/providers";

import {
  citationsWithoutFounderVoice,
  emphasisReadStepBody,
  founderVoiceCitations,
  founderVoiceTargetsFromCard,
  nextFounderVoiceIndex
} from "../src/inngest/emphasis-read";

const mocks = vi.hoisted(() => ({
  synthesizeEmphasisRead: vi.fn()
}));

vi.mock("@cold-start/llm", async () => {
  const actual = await vi.importActual<typeof import("@cold-start/llm")>("@cold-start/llm");
  return {
    ...actual,
    synthesizeEmphasisRead: mocks.synthesizeEmphasisRead
  };
});

function founderItem(overrides: Partial<FounderVoiceItem> = {}): FounderVoiceItem {
  return {
    lane: "hn_search",
    url: "https://news.ycombinator.com/item?id=1",
    title: "Show HN: our launch",
    text: "We just shipped our first production customer.",
    authorship: "founder",
    ...overrides
  };
}

describe("founderVoiceCitations", () => {
  it("builds fv-prefixed citations and stamps authorship tiers", () => {
    const items: FounderVoiceItem[] = [
      founderItem({ lane: "hn_search", authorship: "founder", url: "https://news.ycombinator.com/item?id=1" }),
      founderItem({ lane: "github_author_activity", authorship: "company", url: "https://github.com/acme/acme" }),
      founderItem({ lane: "bluesky_author_feed", authorship: "third_party", url: "https://bsky.app/profile/acme" })
    ];

    const citations = founderVoiceCitations(items);

    expect(citations.map((citation) => citation.id)).toEqual(["fv1", "fv2", "fv3"]);

    // founder item -> sourceQuality.tier "founder_authored"
    expect(citations[0]?.sourceQuality?.tier).toBe("founder_authored");
    expect(citations[0]?.sourceType).toBe("other");

    // company item -> sourceQuality.tier "primary_company"; github lane -> sourceType "github"
    expect(citations[1]?.sourceQuality?.tier).toBe("primary_company");
    expect(citations[1]?.sourceType).toBe("github");

    // third_party item -> no sourceQuality stamped (derived downstream)
    expect(citations[2]?.sourceQuality).toBeUndefined();
    expect(citations[2]?.sourceType).toBe("other");
  });

  it("caps the snippet at 240 chars", () => {
    const longText = "x".repeat(400);
    const [citation] = founderVoiceCitations([founderItem({ text: longText })]);

    expect(citation?.snippet).toHaveLength(240);
    expect(citation?.snippet).toBe(longText.slice(0, 240));
  });
});

function citation(overrides: Partial<Citation> = {}): Citation {
  return {
    id: "c1",
    url: "https://example.com/c1",
    title: "Some source",
    fetchedAt: "2026-08-11T00:00:00.000Z",
    sourceType: "news",
    ...overrides
  };
}

describe("citationsWithoutFounderVoice", () => {
  it("strips fv-prefixed citations and leaves everything else untouched, in order", () => {
    const citations = [
      citation({ id: "c1" }),
      citation({ id: "fv1", url: "https://old.example/founder-post" }),
      citation({ id: "c2" }),
      citation({ id: "fv2", url: "https://old.example/founder-post-2" })
    ];

    expect(citationsWithoutFounderVoice(citations)).toEqual([citation({ id: "c1" }), citation({ id: "c2" })]);
  });
});

describe("nextFounderVoiceIndex", () => {
  it("defaults to 1 when no fv citation exists anywhere", () => {
    expect(nextFounderVoiceIndex([citation({ id: "c1" })], [])).toBe(1);
  });

  it("numbers past the highest fv index across every list passed in", () => {
    const workingCardCitations = [citation({ id: "c1" }), citation({ id: "fv1" })];
    const existingCardCitations = [citation({ id: "c1" }), citation({ id: "fv1" }), citation({ id: "fv3" })];

    expect(nextFounderVoiceIndex(workingCardCitations, existingCardCitations)).toBe(4);
  });

  it("tolerates an undefined list (no existing card on a first run)", () => {
    expect(nextFounderVoiceIndex([citation({ id: "fv2" })], undefined)).toBe(3);
  });
});

// The coordinator's IMPORTANT-1 finding: on a repeat analysis run, generatedCard.citations can
// already carry fv ids from a prior run (extraction reuse spreads the existing card's citations
// wholesale), and founderVoiceCitations always numbers a fresh batch from 1. Simulates that
// second-run shape end to end through the two fixes together (strip, then renumber) and asserts
// the resulting citation set the emphasis step would consume has no duplicate ids and no stale
// entry, so emphasisSourceDigests can never build two digests under one ambiguous fv label.
describe("repeat-run founder-voice citation wiring (strip + renumber)", () => {
  it("produces a citation set with no duplicate ids and no stale fv content", () => {
    const staleFvCitation = citation({
      id: "fv1",
      url: "https://old.example/founder-post-from-last-run",
      title: "Old founder post",
      snippet: "Stale content from a prior run.",
      sourceQuality: { tier: "founder_authored", label: "Founder-authored", rationale: "r", incentive: "i" }
    });
    const workingCardCitations = [citation({ id: "c1" }), staleFvCitation];
    const existingCardCitations = [citation({ id: "c1" }), staleFvCitation];

    const startIndex = nextFounderVoiceIndex(workingCardCitations, existingCardCitations);
    const freshItems: FounderVoiceItem[] = [
      founderItem({ url: "https://news.ycombinator.com/item?id=99", text: "Fresh founder post from this run." })
    ];
    const freshCitations = founderVoiceCitations(freshItems, startIndex);

    const merged = [...citationsWithoutFounderVoice(workingCardCitations), ...freshCitations];

    const ids = merged.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain("fv1");
    expect(merged.find((entry) => entry.id === "fv2")?.snippet).toBe("Fresh founder post from this run.");
    // digests derive one-to-one from citations by id (emphasisSourceDigests), so a unique id set
    // on the card the emphasis step consumes is what makes the fed digests unambiguous.
    const digestLabels = merged.map((entry) => entry.id);
    expect(new Set(digestLabels).size).toBe(digestLabels.length);
  });
});

describe("founderVoiceTargetsFromCard", () => {
  it("pulls name, domain, and founder channels", () => {
    const card = buildSkeletonCard("cognition.ai");
    card.identity.name = {
      value: "Cognition",
      status: "verified",
      confidence: "high",
      citationIds: ["c1"]
    };
    card.team.founders.value = [
      {
        name: "Scott Wu",
        role: "CEO",
        sourceUrl: "https://cognition.ai",
        xUrl: "https://x.com/ScottWu46",
        githubUrl: "https://github.com/scottwu"
      },
      {
        name: "Steven Hao",
        role: "Co-founder",
        sourceUrl: "https://cognition.ai"
      }
    ];

    const targets = founderVoiceTargetsFromCard(card);

    expect(targets.companyName).toBe("Cognition");
    expect(targets.domain).toBe("cognition.ai");
    expect(targets.founders).toEqual([
      { name: "Scott Wu", xUrl: "https://x.com/ScottWu46", githubUrl: "https://github.com/scottwu" },
      { name: "Steven Hao", xUrl: null, githubUrl: null }
    ]);
  });

  it("falls back to the domain when no name is filed", () => {
    const card = buildSkeletonCard("cognition.ai");

    const targets = founderVoiceTargetsFromCard(card);

    expect(targets.companyName).toBe("cognition.ai");
    expect(targets.founders).toEqual([]);
  });
});

describe("emphasisReadStepBody", () => {
  const card = buildSkeletonCard("cognition.ai");
  const input = {
    card,
    client: {} as never,
    model: "claude-test",
    telemetry: () => {}
  };

  beforeEach(() => {
    mocks.synthesizeEmphasisRead.mockReset();
  });

  it("memoizes a semantic failure as { ok: false }", async () => {
    // Same contract as synthesizeCardStepBody: a schema/content error from the stage is caught
    // and returned as a step-level failure value, never thrown.
    mocks.synthesizeEmphasisRead.mockRejectedValue(new Error("No emphasis read tool use returned"));

    const result = await emphasisReadStepBody(input);

    expect(result).toEqual({ ok: false, error: "No emphasis read tool use returned" });
  });

  it("rethrows a transient transport error instead of memoizing it", async () => {
    // Shaped like the error packages/llm/src/openai-compat.ts throws after its own retry loop is
    // exhausted on a sustained 529; isTransientLlmError parses the status back out of this exact
    // message format (packages/llm/src/transient-error.ts).
    mocks.synthesizeEmphasisRead.mockRejectedValue(new Error("openai-compat request failed with 529: overloaded"));

    await expect(emphasisReadStepBody(input)).rejects.toThrow("openai-compat request failed with 529: overloaded");
  });

  it("returns the emphasis read on success", async () => {
    const value = { status: "nothing_notable" as const };
    mocks.synthesizeEmphasisRead.mockResolvedValue(value);

    const result = await emphasisReadStepBody(input);

    expect(result).toEqual({ ok: true, value });
  });
});
