import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildSkeletonCard } from "@cold-start/pipeline";
import type { FounderVoiceItem } from "@cold-start/providers";

import {
  emphasisReadStepBody,
  founderVoiceCitations,
  founderVoiceTargetsFromCard
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
