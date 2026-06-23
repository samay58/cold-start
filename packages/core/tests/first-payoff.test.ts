import { describe, expect, it } from "vitest";
import { buildFirstPayoff } from "../src/first-payoff";
import { generationTraceSchema } from "../src/generation-trace";

const generatedAtMs = Date.parse("2026-06-23T12:00:00.000Z");

function source(input: {
  id: string;
  title: string;
  url: string;
  sourceType?: "company_site" | "news" | "filing" | "enrichment" | "github" | "rdap" | "other";
  rawText?: string;
  snippet?: string;
}) {
  return {
    fetchedAt: "2026-06-23T12:00:00.000Z",
    sourceType: input.sourceType ?? "news",
    rawText: input.rawText ?? input.snippet ?? input.title,
    snippet: input.snippet ?? input.rawText ?? input.title,
    ...input
  };
}

describe("buildFirstPayoff", () => {
  it("produces a receipt from source progress without requiring a usable public profile", () => {
    const payoff = buildFirstPayoff({
      domain: "runloop.ai",
      slug: "runloop",
      generatedAtMs,
      sources: [
        source({
          id: "src-home",
          sourceType: "company_site",
          title: "Runloop",
          url: "https://runloop.ai",
          rawText: "Runloop"
        })
      ]
    });

    expect(payoff.status).toBe("receipt");
    expect(payoff.evidenceSoFar).toHaveLength(1);
    expect(payoff.evidenceSoFar[0]).toMatchObject({
      sourceId: "src-home",
      domain: "runloop.ai",
      sourceClass: "company_site",
      quality: "company",
      entityMatched: true
    });
    expect(payoff.suppressionReasons).toContain("no_incremental_claim");
  });

  it("upgrades to a substantive proof read only when the source names the company and supplies supporting text", () => {
    const payoff = buildFirstPayoff({
      domain: "runloop.ai",
      slug: "runloop",
      generatedAtMs,
      sources: [
        source({
          id: "src-news",
          title: "Runloop raises $7M seed to build test environments for coding agents",
          url: "https://techcrunch.com/runloop-seed",
          rawText: "Runloop raised a $7M seed round to build cloud test environments for AI coding agents."
        })
      ]
    });

    expect(payoff.status).toBe("substantive_first_read");
    expect(payoff.proofHeadline).toMatchObject({
      text: "Runloop raises $7M seed to build test environments for coding agents.",
      supportingText: "Runloop raised a $7M seed round to build cloud test environments for AI coding agents.",
      sourceIds: ["src-news"],
      citationIds: [],
      claimKind: "proof_headline"
    });
    expect(payoff.suppressionReasons).toEqual([]);
  });

  it("withholds First Read when the only proof headline names the wrong company", () => {
    const payoff = buildFirstPayoff({
      domain: "runloop.ai",
      slug: "runloop",
      generatedAtMs,
      sources: [
        source({
          id: "src-wrong",
          title: "Acme raises $50M Series B",
          url: "https://example.com/acme",
          rawText: "Acme raised $50M."
        })
      ]
    });

    expect(payoff.status).toBe("withheld");
    expect(payoff.proofHeadline).toBeUndefined();
    expect(payoff.suppressionReasons).toContain("wrong_or_ambiguous_entity");
  });

  it("suppresses marketing filler instead of turning it into a First Read claim", () => {
    const payoff = buildFirstPayoff({
      domain: "runloop.ai",
      slug: "runloop",
      generatedAtMs,
      sources: [
        source({
          id: "src-home",
          sourceType: "company_site",
          title: "Runloop",
          url: "https://runloop.ai",
          rawText: "Runloop is an AI-native all-in-one platform revolutionizing software development."
        })
      ]
    });

    expect(payoff.status).toBe("receipt");
    expect(payoff.whatItDoes).toBeUndefined();
    expect(payoff.suppressionReasons).toContain("marketing_filler");
  });

  it("can be stored on generation trace JSON for later QA", () => {
    const firstPayoff = buildFirstPayoff({
      domain: "runloop.ai",
      slug: "runloop",
      generatedAtMs,
      sources: [
        source({
          id: "src-home",
          sourceType: "company_site",
          title: "Runloop",
          url: "https://runloop.ai",
          rawText: "Runloop"
        })
      ]
    });

    const parsed = generationTraceSchema.safeParse({
      jobKind: "basics",
      mode: "basics",
      firstPayoff
    });

    expect(parsed.success).toBe(true);
  });
});
