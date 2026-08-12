import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildSkeletonCard } from "@cold-start/pipeline";
import type { Citation } from "@cold-start/core";
import type { FounderVoiceItem } from "@cold-start/providers";

import {
  citationIdsReferencedIn,
  citationsPrunedToReferencedFounderVoice,
  citationsWithoutFounderVoice,
  emphasisDigestCitations,
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

  it("numbers from a custom startIndex so a repeat run's fresh batch never collides", () => {
    const citations = founderVoiceCitations([founderItem(), founderItem()], 5);

    expect(citations.map((citation) => citation.id)).toEqual(["fv5", "fv6"]);
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

// Round-2 coordinator finding: the working card must stay additive during a run (a synthesis
// draft claim can legitimately cite a stale fv id, and stripping it before verify would silently
// orphan that claim). emphasisDigestCitations narrows only the view fed to emphasisSourceDigests,
// never the real working card.
describe("emphasisDigestCitations", () => {
  it("excludes stale fv citations but includes the fresh batch, non-fv citations untouched", () => {
    const staleFv = citation({ id: "fv1", url: "https://old.example/founder-post", title: "Stale founder post" });
    const workingCardCitations = [citation({ id: "c1" }), staleFv];
    const freshCitations = founderVoiceCitations(
      [founderItem({ url: "https://news.ycombinator.com/item?id=99", text: "Fresh founder post from this run." })],
      2
    );

    const digestCitations = emphasisDigestCitations(workingCardCitations, freshCitations);

    const ids = digestCitations.map((entry) => entry.id);
    expect(ids).toEqual(["c1", "fv2"]);
    expect(ids).not.toContain("fv1");
  });

  it("returns the working card's non-fv citations unchanged when this run found nothing fresh", () => {
    const workingCardCitations = [citation({ id: "c1" }), citation({ id: "fv1" })];

    expect(emphasisDigestCitations(workingCardCitations, [])).toEqual([citation({ id: "c1" })]);
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

describe("citationIdsReferencedIn", () => {
  it("collects citationIds from a nested synthesis shape, including emphasisRead's loud/read claims", () => {
    const synthesis = {
      whyItMatters: { text: "Thesis [c1].", citationIds: ["c1"] },
      bullCase: [{ text: "Bull [c1] [fv2].", citationIds: ["c1", "fv2"] }],
      bearCase: [{ text: "Bear [c3].", citationIds: ["c3"] }],
      openQuestions: [{ question: "What next?", category: null }],
      marketStructureAndTiming: {
        buyerBudget: { text: "Budget [fv5].", citationIds: ["fv5"] },
        painSeverity: null
      },
      emphasisRead: {
        status: "read" as const,
        loud: { text: "Loud [fv2].", citationIds: ["fv2"] },
        quiet: "Nothing filed shows a named paying customer.",
        read: { text: "Read [fv2].", citationIds: ["fv2"] },
        wouldChangeIf: "A named customer would break this."
      }
    };

    const ids = citationIdsReferencedIn(synthesis);

    expect(ids).toEqual(new Set(["c1", "fv2", "c3", "fv5"]));
  });

  it("returns an empty set for undefined (no synthesis attached)", () => {
    expect(citationIdsReferencedIn(undefined)).toEqual(new Set());
  });

  it("returns an empty set for a thin_file or nothing_notable emphasisRead (no citationIds field)", () => {
    expect(citationIdsReferencedIn({ status: "thin_file" as const })).toEqual(new Set());
  });
});

describe("citationsPrunedToReferencedFounderVoice", () => {
  it("drops unreferenced fv citations, keeps referenced fv citations and every non-fv citation", () => {
    const citations = [
      citation({ id: "c1" }),
      citation({ id: "fv1", url: "https://referenced.example" }),
      citation({ id: "fv2", url: "https://unreferenced.example" }),
      citation({ id: "c2" })
    ];

    const pruned = citationsPrunedToReferencedFounderVoice(citations, new Set(["fv1"]));

    expect(pruned.map((entry) => entry.id)).toEqual(["c1", "fv1", "c2"]);
  });

  it("drops every fv citation when nothing references any of them", () => {
    const citations = [citation({ id: "c1" }), citation({ id: "fv1" }), citation({ id: "fv2" })];

    expect(citationsPrunedToReferencedFounderVoice(citations, new Set())).toEqual([citation({ id: "c1" })]);
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
    telemetry: () => {},
    freshFounderVoiceCitations: [] as Citation[]
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

  it("feeds digests built from non-fv plus fresh-fv citations only, stale fv excluded", async () => {
    const cardWithStaleFv = {
      ...card,
      citations: [
        {
          id: "c1",
          url: "https://cognition.ai/blog",
          title: "Cognition blog",
          fetchedAt: "2026-08-11T00:00:00.000Z",
          sourceType: "company_site" as const,
          snippet: "Company blog snippet."
        },
        citation({ id: "fv1", url: "https://old.example/stale", title: "Stale founder post" })
      ]
    };
    const freshCitations = founderVoiceCitations(
      [founderItem({ url: "https://news.ycombinator.com/item?id=99", text: "Fresh founder post from this run." })],
      2
    );
    mocks.synthesizeEmphasisRead.mockResolvedValue({ status: "nothing_notable" as const });

    await emphasisReadStepBody({ ...input, card: cardWithStaleFv, freshFounderVoiceCitations: freshCitations });

    expect(mocks.synthesizeEmphasisRead).toHaveBeenCalledTimes(1);
    const digestsArg = mocks.synthesizeEmphasisRead.mock.calls[0]?.[0]?.digests as Array<{ citationId: string }>;
    const digestCitationIds = digestsArg.map((digest) => digest.citationId);

    expect(digestCitationIds).toContain("c1");
    expect(digestCitationIds).toContain("fv2");
    expect(digestCitationIds).not.toContain("fv1");

    // The real (additive) card is still what is passed through for company name/domain and for
    // synthesizeEmphasisRead's own citation-existence check, so the stale fv1 citation the digest
    // excluded is still present there.
    const cardArg = mocks.synthesizeEmphasisRead.mock.calls[0]?.[0]?.card;
    expect(cardArg.citations.map((c: Citation) => c.id)).toContain("fv1");
  });
});
