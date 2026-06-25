import { describe, expect, it } from "vitest";
import type { ColdStartCard } from "../src/index";
import { buildFirstPayoff } from "../src/first-payoff";
import { generationTraceSchema } from "../src/generation-trace";

const generatedAtMs = Date.parse("2026-06-23T12:00:00.000Z");

function fact<T>(value: T) {
  return { value, status: "verified" as const, confidence: "medium" as const, citationIds: ["c1"] };
}

function cardWithServes(serves: string): ColdStartCard {
  return {
    slug: "browserbase",
    domain: "browserbase.com",
    generatedAt: "2026-06-23T12:00:00.000Z",
    generationCostUsd: 0,
    cacheStatus: "hit",
    identity: {
      name: fact("Browserbase"),
      logoUrl: null,
      oneLiner: fact("Browser infrastructure for AI agents."),
      description: {
        value: {
          shortDescription: "Browser infrastructure for AI agents.",
          concept: "A hosted browser runtime for AI agents.",
          serves,
          mechanism: "Managed browser sessions behind one API."
        },
        status: "verified",
        confidence: "medium",
        citationIds: ["c1"]
      },
      hq: fact({ city: "San Francisco", country: "United States" }),
      foundedYear: fact(2024),
      status: "private"
    },
    funding: { totalRaisedUsd: fact(null), lastRound: fact(null), investors: fact(null) },
    team: { founders: fact([]), keyExecs: fact([]), headcount: fact(null) },
    signals: [],
    comparables: [],
    citations: [
      { id: "c1", url: "https://browserbase.com", title: "Browserbase", fetchedAt: "2026-06-23T12:00:00.000Z", sourceType: "company_site" }
    ]
  } as ColdStartCard;
}

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
      text: "Runloop reported $7M in seed funding.",
      supportingText: "Runloop raised a $7M seed round to build cloud test environments for AI coding agents.",
      sourceIds: ["src-news"],
      citationIds: [],
      claimKind: "proof_headline"
    });
    // The recomposed read never echoes the raw article title.
    expect(payoff.proofHeadline?.text).not.toContain("raises $7M seed to build");
    expect(payoff.suppressionReasons).toEqual([]);
  });

  it("recomposes a noisy funding headline into one plain-English read without the raw title or publisher", () => {
    const payoff = buildFirstPayoff({
      domain: "you.com",
      slug: "you",
      generatedAtMs,
      sources: [
        source({
          id: "src-funding",
          title: "You.com raises $100M in series C funding at $1.5B valuation to scale AI search infrastructure - Tech Startups",
          url: "https://techstartups.com/you-series-c",
          rawText: "You.com raised $100M in a Series C round at a $1.5B valuation to scale its AI search infrastructure."
        })
      ]
    });

    expect(payoff.status).toBe("substantive_first_read");
    expect(payoff.proofHeadline?.text).toBe("You reported $100M in Series C funding at a $1.5B valuation.");
    expect(payoff.proofHeadline?.text).not.toContain("Tech Startups");
    expect(payoff.proofHeadline?.text).not.toContain("to scale AI search infrastructure");
    expect(payoff.proofHeadline?.text).not.toContain("raises");
    expect(payoff.suppressionReasons).toEqual([]);
  });

  it("suppresses a newsworthy non-funding headline instead of echoing it as a read", () => {
    const payoff = buildFirstPayoff({
      domain: "acme.com",
      slug: "acme",
      generatedAtMs,
      sources: [
        source({
          id: "src-launch",
          title: "Acme launches Acme Cloud, its new developer platform",
          url: "https://techblog.com/acme-launch",
          rawText: "Acme launched Acme Cloud, a new developer platform, this week."
        })
      ]
    });

    expect(payoff.status).toBe("receipt");
    expect(payoff.proofHeadline).toBeUndefined();
    expect(payoff.suppressionReasons).toContain("no_incremental_claim");
  });

  it("uses provider JSON text as support instead of suppressing a clean proof headline", () => {
    const payoff = buildFirstPayoff({
      domain: "odyssey.ml",
      slug: "odyssey",
      generatedAtMs,
      sources: [
        source({
          id: "src-funding",
          title: "Odyssey Closes $310M Series B at $1.45B Valuation as Amazon Backs World Model AI Push",
          url: "https://theaiinsider.tech/odyssey-series-b",
          rawText: JSON.stringify({
            title: "Odyssey Closes $310M Series B at $1.45B Valuation as Amazon Backs World Model AI Push",
            text: "Odyssey closed a $310 million Series B at a $1.45 billion valuation with backing from Amazon."
          })
        })
      ]
    });

    expect(payoff.status).toBe("substantive_first_read");
    expect(payoff.proofHeadline).toMatchObject({
      text: "Odyssey reported $310M in Series B funding at a $1.45B valuation.",
      supportingText: "Odyssey closed a $310 million Series B at a $1.45 billion valuation with backing from Amazon.",
      sourceIds: ["src-funding"],
      claimKind: "proof_headline"
    });
    expect(payoff.proofHeadline?.text).not.toContain("Closes");
    expect(payoff.suppressionReasons).toEqual([]);
  });

  it("uses a short article excerpt to support a proof headline", () => {
    const payoff = buildFirstPayoff({
      domain: "odyssey.ml",
      slug: "odyssey",
      generatedAtMs,
      sources: [
        source({
          id: "src-funding",
          title: "Odyssey Closes $310M Series B at $1.45B Valuation as Amazon Backs World Model AI Push",
          url: "https://theaiinsider.tech/odyssey-series-b",
          rawText: JSON.stringify({
            text: [
              "Odyssey Closes $310M Series B at $1.45B Valuation as Amazon Backs World Model AI Push",
              "Newsletter",
              "Odyssey, the world model AI startup founded by autonomous vehicle veterans Oliver Cameron and Jeff Hawke, has closed a $310 million Series B round at a $1.45 billion valuation."
            ].join("\n\n")
          })
        })
      ]
    });

    expect(payoff.status).toBe("substantive_first_read");
    expect(payoff.proofHeadline).toMatchObject({
      text: "Odyssey reported $310M in Series B funding at a $1.45B valuation.",
      supportingText: "Odyssey, the world model AI startup founded by autonomous vehicle veterans Oliver Cameron and Jeff Hawke, has closed a $310 million Series B round at a $1.45 billion valuation."
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

  it("does not turn raw provider payload text into a First Read claim", () => {
    const payoff = buildFirstPayoff({
      domain: "getfreed.ai",
      slug: "getfreed",
      generatedAtMs,
      sources: [
        source({
          id: "src-home",
          sourceType: "company_site",
          title: "Freed",
          url: "https://getfreed.ai",
          rawText: "{\"id\":\" Freed Feed Inc. \\n\\nFreed is a Hospitals and Health Care company.\"}"
        }),
        source({
          id: "src-funding",
          title: "GetFreed raises funding for clinical AI assistant",
          url: "https://businesswire.com/getfreed-funding",
          rawText: "{\"id\":\"GetFreed raises funding for clinical AI assistant\"}"
        })
      ]
    });

    expect(payoff.status).toBe("receipt");
    expect(payoff.whatItDoes).toBeUndefined();
    expect(payoff.proofHeadline).toBeUndefined();
    expect(payoff.suppressionReasons).toContain("claim_not_source_supported");
  });

  it("dedupes repeated receipt entries for the same source URL and class", () => {
    const payoff = buildFirstPayoff({
      domain: "getfreed.ai",
      slug: "getfreed",
      generatedAtMs,
      sources: [
        source({
          id: "src-home-a",
          sourceType: "company_site",
          title: "Freed",
          url: "https://getfreed.ai/",
          rawText: "Freed"
        }),
        source({
          id: "src-home-b",
          sourceType: "company_site",
          title: "Freed home",
          url: "https://getfreed.ai",
          rawText: "Freed home"
        }),
        source({
          id: "src-docs",
          sourceType: "company_site",
          title: "Freed docs",
          url: "https://getfreed.ai/docs",
          rawText: "Freed API documentation for clinical workflows."
        })
      ]
    });

    expect(payoff.evidenceSoFar.map((item) => item.domain)).toEqual(["getfreed.ai", "getfreed.ai"]);
    expect(payoff.evidenceSoFar.map((item) => item.sourceClass)).toEqual(["company_site", "docs"]);
  });

  it("builds a who-it-serves claim from the card description and cites it", () => {
    const payoff = buildFirstPayoff({
      domain: "browserbase.com",
      slug: "browserbase",
      generatedAtMs,
      card: cardWithServes("AI agent developers and automation teams."),
      sources: [
        source({
          id: "src-home",
          sourceType: "company_site",
          title: "Browserbase",
          url: "https://browserbase.com",
          rawText: "Browserbase runs managed headless browser sessions for AI agents to navigate the web."
        })
      ]
    });

    expect(payoff.whoItSeemsFor).toMatchObject({
      text: "AI agent developers and automation teams.",
      claimKind: "who_it_serves",
      sourceIds: ["src-home"],
      citationIds: ["c1"]
    });
  });

  it("drops the who-it-serves claim when it collapses to the what-it-does line", () => {
    const payoff = buildFirstPayoff({
      domain: "browserbase.com",
      slug: "browserbase",
      generatedAtMs,
      card: cardWithServes("Browserbase runs managed headless browser sessions for AI agents to navigate the web."),
      sources: [
        source({
          id: "src-home",
          sourceType: "company_site",
          title: "Browserbase",
          url: "https://browserbase.com",
          rawText: "Browserbase runs managed headless browser sessions for AI agents to navigate the web."
        })
      ]
    });

    expect(payoff.whatItDoes?.text).toBe("Browserbase runs managed headless browser sessions for AI agents to navigate the web.");
    expect(payoff.whoItSeemsFor).toBeUndefined();
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
