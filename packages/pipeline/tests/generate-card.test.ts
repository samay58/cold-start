import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildSeedProfileCard,
  buildSkeletonCard,
  cardWithExtractedSections,
  evaluateSynthesisGate,
  type ExtractedCardSections,
  fallbackSectionsFromEvidence,
  finalizeGeneratedCard,
  generateCardForDomain,
  generateCardForDomainWithTrace,
  type GenerateCardDeps,
  synthesisEvidenceFingerprint,
  synthesizeCardDraft,
  verifyCardSynthesisDraft
} from "../src/index";

const originalAnalysisSynthesisMinCitations = process.env.ANALYSIS_SYNTHESIS_MIN_CITATIONS;

beforeEach(() => {
  process.env.ANALYSIS_SYNTHESIS_MIN_CITATIONS = "0";
});

afterEach(() => {
  if (originalAnalysisSynthesisMinCitations === undefined) {
    delete process.env.ANALYSIS_SYNTHESIS_MIN_CITATIONS;
  } else {
    process.env.ANALYSIS_SYNTHESIS_MIN_CITATIONS = originalAnalysisSynthesisMinCitations;
  }
});

describe("buildSkeletonCard", () => {
  it("creates a public-safe unknown card before evidence arrives", () => {
    const card = buildSkeletonCard("cartesia.ai");

    expect(card.slug).toBe("cartesia");
    expect(card.identity.name.status).toBe("unknown");
    expect(card.identity.name.value).toBeNull();
    expect(card.synthesis).toBeUndefined();
  });

  it("creates independent citation arrays for unknown facts", () => {
    const card = buildSkeletonCard("cartesia.ai");

    card.identity.name.citationIds.push("mutated");

    expect(card.identity.oneLiner.citationIds).toEqual([]);
    expect(card.funding.totalRaisedUsd.citationIds).toEqual([]);
  });

  it("uses the domain-derived company name when fallback evidence starts with a news headline", () => {
    const skeleton = buildSkeletonCard("wabi.ai");
    const sections = fallbackSectionsFromEvidence(skeleton, [
      {
        id: "e1",
        url: "https://techcrunch.com/2026/05/01/waabi-raises-1b",
        title: "Waabi raises $1B and expands into robotaxis with Uber | TechCrunch",
        sourceType: "news",
        fetchedAt: "2026-06-04T00:00:00.000Z",
        intents: ["funding"],
        authorityScore: 12,
        rawText: "Waabi raised $1 billion and works on autonomous trucking.",
        supportingSnippets: ["Waabi raised $1 billion and works on autonomous trucking."]
      }
    ]);

    expect(sections?.identity.name.value).toBe("Wabi");
  });
});

describe("buildSeedProfileCard", () => {
  it("creates a cited provider-first card without LLM extraction", () => {
    const seeded = buildSeedProfileCard({
      domain: "cartesia.ai",
      sources: [
        {
          url: "https://cartesia.ai",
          title: "Cartesia",
          sourceType: "company_site",
          fetchedAt: "2026-05-19T00:00:00.000Z",
          rawText: "Cartesia builds real-time multimodal intelligence for voice agents and interactive applications.",
          intent: "homepage"
        }
      ],
      providerFacts: [
        {
          path: "identity.name",
          value: "Cartesia",
          status: "inferred",
          confidence: "high",
          sourceType: "enrichment",
          provider: "stableenrich",
          endpoint: "org_enrichment",
          citationUrl: "https://stableenrich.dev/api/apollo/org-enrich?domain=cartesia.ai",
          citationTitle: "Apollo org enrichment for cartesia.ai",
          fetchedAt: "2026-05-19T00:00:00.000Z",
          rawText: "{}"
        },
        {
          path: "identity.description",
          value: {
            shortDescription: "Cartesia builds real-time multimodal intelligence for voice agents.",
            expandedDescription:
              "Cartesia builds real-time multimodal intelligence for teams shipping voice agents. Its model APIs support low-latency speech workflows where natural conversation depends on response speed.",
            concept: null,
            serves: null,
            mechanism: null
          },
          status: "inferred",
          confidence: "medium",
          sourceType: "enrichment",
          provider: "stableenrich",
          endpoint: "org_enrichment",
          citationUrl: "https://stableenrich.dev/api/apollo/org-enrich?domain=cartesia.ai",
          citationTitle: "Apollo org enrichment for cartesia.ai",
          fetchedAt: "2026-05-19T00:00:00.000Z",
          rawText: "{}"
        }
      ]
    });

    expect(seeded.card.identity.name.value).toBe("Cartesia");
    expect(seeded.card.identity.oneLiner.value).toBe("Cartesia builds real-time multimodal intelligence for voice agents.");
    expect(seeded.card.identity.description?.value?.expandedDescription).toContain("low-latency speech workflows");
    expect(seeded.card.citations.length).toBeGreaterThan(0);
    expect(seeded.trace.providerFactAppliedCount).toBe(2);
  });

  it("compresses provider description fields before they become reader-facing card copy", () => {
    const seeded = buildSeedProfileCard({
      domain: "oboe.com",
      sources: [],
      providerFacts: [
        {
          path: "identity.name",
          value: "Oboe",
          status: "inferred",
          confidence: "high",
          sourceType: "enrichment",
          provider: "stableenrich",
          endpoint: "org_enrichment",
          citationUrl: "https://stableenrich.dev/api/apollo/org-enrich?domain=oboe.com",
          citationTitle: "Apollo org enrichment for oboe.com",
          fetchedAt: "2026-05-26T18:00:00.000Z",
          rawText: "{}"
        },
        {
          path: "identity.description",
          value: {
            shortDescription:
              "Oboe is a personalized learning platform that creates educational courses on any topic. Founded by Michael Mignano and Nir Zicherman, Oboe aims to enhance learning experiences through AI-powered tutors, eliminating the need for human instructors or pre-recorded content. The platform generates structured, chapter-based curricula that adapt to individual user goals, prior knowledge, learning styles, and available time.",
            expandedDescription:
              "Oboe creates personalized educational courses on any topic for individual learners and training teams. It uses AI tutors and generated curricula to replace static course catalogs with lessons that adapt to each user's goals, prior knowledge, learning style, and available time...",
            concept:
              "Oboe helps users create personalized educational courses on any topic with AI-generated curricula and tutors. It also supports quizzes, flashcards, games, and multiple learning formats.",
            serves:
              "The platform appears to serve individual learners, corporate training teams, and higher education institutions. It may also serve creators who want to package expertise into courses.",
            mechanism:
              "Users start with a diagnostic conversation that tailors the learning journey, then Oboe generates a structured chapter-based course. The system adapts to user goals, prior knowledge, learning style, and available time."
          },
          status: "inferred",
          confidence: "medium",
          sourceType: "enrichment",
          provider: "stableenrich",
          endpoint: "org_enrichment",
          citationUrl: "https://stableenrich.dev/api/apollo/org-enrich?domain=oboe.com",
          citationTitle: "Apollo org enrichment for oboe.com",
          fetchedAt: "2026-05-26T18:00:00.000Z",
          rawText: "{}"
        }
      ]
    });

    const description = seeded.card.identity.description?.value;
    expect(description?.shortDescription.length).toBeLessThanOrEqual(180);
    expect(description?.expandedDescription).not.toContain("...");
    expect(description?.expandedDescription?.split(".").filter(Boolean).length).toBeLessThanOrEqual(3);
    expect(description?.concept?.split(".").filter(Boolean)).toHaveLength(1);
    expect(description?.serves?.split(".").filter(Boolean)).toHaveLength(1);
    expect(description?.mechanism?.split(".").filter(Boolean)).toHaveLength(1);
    expect(seeded.card.identity.oneLiner.value).not.toContain("Founded by");
  });
});

describe("generateCardForDomain", () => {
  const citation = {
    id: "c1",
    url: "https://cartesia.ai/",
    title: "Cartesia",
    fetchedAt: "2026-05-06T12:00:00.000Z",
    sourceType: "company_site" as const,
    snippet: "Cartesia is building voice AI infrastructure."
  };

  it("never attaches synthesis: the assembly path has no synthesis awareness", async () => {
    // Synthesis and verification run as separately-callable units (synthesizeCardDraft,
    // verifyCardSynthesisDraft, tested below in "split synthesize/verify units"), never inside
    // generateCardForDomain/WithTrace. This is the assembly-only path production actually uses
    // (apps/web/src/inngest/functions.ts never spreads synthesize/verify deps into it).
    const skeleton = buildSkeletonCard("cartesia.ai");

    const card = await generateCardForDomain("cartesia.ai", {
      fetchSources: async () => [],
      extractSections: async () => ({
        identity: skeleton.identity,
        funding: skeleton.funding,
        team: skeleton.team,
        signals: [],
        comparables: [],
        citations: [citation]
      })
    });

    expect(card.synthesis).toBeUndefined();
    expect(card.generationCostUsd).toBe(0);
  });

  it("drops unresolved extracted citation refs instead of crashing the run", async () => {
    // Reproduces the SpaceX basics failure: extraction cited evidence-ledger id "e19"
    // on identity facts, but no citation with id "e19" survived in citations[]. The full
    // schema parse used to throw a ZodError, which then leaked into every public section.
    const skeleton = buildSkeletonCard("spacex.com");

    const card = await generateCardForDomain("spacex.com", {
      fetchSources: async () => [],
      extractSections: async () => ({
        identity: {
          ...skeleton.identity,
          name: { value: "SpaceX", status: "verified", confidence: "high", citationIds: ["e19", "c1"] },
          websiteUrl: { value: "https://spacex.com", status: "verified", confidence: "high", citationIds: ["e19"] },
          linkedinUrl: { value: "https://www.linkedin.com/company/spacex", status: "verified", confidence: "high", citationIds: ["e19"] }
        },
        funding: skeleton.funding,
        team: skeleton.team,
        signals: [],
        comparables: [],
        citations: [
          { id: "c1", url: "https://spacex.com/", title: "SpaceX", fetchedAt: "2026-05-29T00:00:00.000Z", sourceType: "company_site" as const }
        ]
      })
    } as unknown as GenerateCardDeps);

    // The run completes. The unresolved "e19" ref is dropped everywhere.
    expect(card.identity.name.value).toBe("SpaceX");
    expect(card.identity.name.citationIds).toEqual(["c1"]);
    expect(card.identity.websiteUrl?.value ?? null).toBeNull();
    expect(card.identity.linkedinUrl?.value ?? null).toBeNull();
    const allRefs = [
      ...card.identity.name.citationIds,
      ...(card.identity.websiteUrl?.citationIds ?? []),
      ...(card.identity.linkedinUrl?.citationIds ?? [])
    ];
    expect(allRefs).not.toContain("e19");
  });

  it("includes cost lines recorded during extraction into the assembled card", async () => {
    // The old version of this test threaded a shared costLines array through a combined
    // synthesize+verify call inside generateCardForDomain; that combined path is gone (see the
    // "no synthesis awareness" test above). Cost accumulation across the synthesize-card and
    // verify-synthesis Inngest steps now happens at the orchestration level in
    // apps/web/src/inngest/functions.ts via cardWithTraceCost/generationRunAnthropicCostUsd
    // (functions.ts:623,740,943); that arithmetic has no dedicated unit test today, a real
    // pre-existing gap this migration surfaces rather than introduces.
    const skeleton = buildSkeletonCard("cartesia.ai");
    const costLines = [{ label: "provider", usd: 0.01 }];

    const card = await generateCardForDomain("cartesia.ai", {
      costLines,
      fetchSources: async () => [],
      extractSections: async () => {
        costLines.push({ label: "extraction", usd: 0.02 });
        return {
          identity: skeleton.identity,
          funding: skeleton.funding,
          team: skeleton.team,
          signals: [],
          comparables: [],
          citations: [citation]
        };
      }
    });

    expect(card.generationCostUsd).toBe(0.03);
  });

  it("falls back to a supported synthesis claim when whyItMatters is unsupported", async () => {
    const skeleton = buildSkeletonCard("cartesia.ai");
    const whyItMatters = { text: "Cartesia is building voice AI infrastructure. [c1]", citationIds: ["c1"] };
    const bullCase = { text: "Cartesia has public product evidence. [c1]", citationIds: ["c1"] };
    const bearCase = { text: "Cartesia still needs clearer public traction evidence. [c1]", citationIds: ["c1"] };

    const card = await generateCardForDomain("cartesia.ai", {
      fetchSources: async () => [],
      extractSections: async () => ({
        identity: skeleton.identity,
        funding: skeleton.funding,
        team: skeleton.team,
        signals: [],
        comparables: [],
        citations: [citation]
      })
    });

    const draft = await synthesizeCardDraft(card, {
      synthesize: async () => ({
        whyItMatters,
        bullCase: [bullCase],
        bearCase: [bearCase],
        openQuestions: [{ question: "What customer traction has Cartesia disclosed?", category: "adoption_proof" }]
      })
    });
    const result = await verifyCardSynthesisDraft(card, draft, {
      verify: async () => [
        { ...whyItMatters, status: "unsupported" },
        { ...bullCase, status: "supported" },
        { ...bearCase, status: "supported" }
      ]
    });

    expect(result.synthesis?.whyItMatters).toEqual(bullCase);
    expect(result.synthesis?.bullCase).toEqual([]);
    expect(result.synthesis?.bearCase).toEqual([bearCase]);
  });

  // "fails required synthesis when no verified claims survive" used to assert this as a single
  // combined-path throw. It now splits across two layers, both covered elsewhere:
  //  - verifyCardSynthesisDraft returning no synthesis (without throwing) when nothing survives
  //    verification: "returns no synthesis when nothing survives verification, without throwing"
  //    in the "split synthesize/verify units" describe block below.
  //  - the function-level throw itself, which only exists in orchestration now
  //    (apps/web/src/inngest/functions.ts:~732-737): "fails the run when verify-synthesis produces
  //    no surviving claims, without ever storing the card" in
  //    apps/web/tests/generate-analysis-synthesis-steps.test.ts.

  it("keeps verifier-dropped bull and bear claims dropped even when whole sections are empty", async () => {
    const skeleton = buildSkeletonCard("cartesia.ai");
    const whyItMatters = { text: "Cartesia is building voice AI infrastructure. [c1]", citationIds: ["c1"] };
    const bullCase = [
      { text: "Cartesia has a focused infrastructure wedge. [c1]", citationIds: ["c1"] },
      { text: "Developer adoption can compound through APIs. [c1]", citationIds: ["c1"] },
      { text: "Enterprise demand for low-latency voice is visible. [c1]", citationIds: ["c1"] },
    ];
    const bearCase = [
      { text: "Durable differentiation is not fully proven. [c1]", citationIds: ["c1"] },
      { text: "Gross margin is not disclosed. [c1]", citationIds: ["c1"] },
      { text: "Customer concentration remains unclear. [c1]", citationIds: ["c1"] },
    ];

    const card = await generateCardForDomain("cartesia.ai", {
      fetchSources: async () => [],
      extractSections: async () => ({
        identity: skeleton.identity,
        funding: skeleton.funding,
        team: skeleton.team,
        signals: [],
        comparables: [],
        citations: [citation]
      })
    });

    const draft = await synthesizeCardDraft(card, {
      synthesize: async () => ({
        whyItMatters,
        bullCase,
        bearCase,
        openQuestions: [
          { question: "What is retention?", category: "adoption_proof" },
          { question: "What is margin?", category: "unit_economics" },
          { question: "What is concentration?", category: "unit_economics" }
        ]
      })
    });
    const result = await verifyCardSynthesisDraft(card, draft, {
      verify: async () => [
        { ...whyItMatters, status: "supported" },
        ...bullCase.map((claim) => ({ ...claim, status: "unsupported" as const })),
        ...bearCase.map((claim) => ({ ...claim, status: "unsupported" as const })),
      ],
      synthesisRequired: true
    });

    expect(result.synthesis?.whyItMatters).toEqual(whyItMatters);
    expect(result.synthesis?.bullCase).toEqual([]);
    expect(result.synthesis?.bearCase).toEqual([]);
  });

  it("keeps only supported bull and bear claims after verification", async () => {
    const skeleton = buildSkeletonCard("cartesia.ai");
    const whyItMatters = { text: "Cartesia is building voice AI infrastructure. [c1]", citationIds: ["c1"] };
    const bullCase = [
      { text: "Cartesia has a focused infrastructure wedge. [c1]", citationIds: ["c1"] },
      { text: "Developer adoption can compound through APIs. [c1]", citationIds: ["c1"] },
      { text: "Enterprise demand for low-latency voice is visible. [c1]", citationIds: ["c1"] },
    ];
    const bearCase = [
      { text: "Durable differentiation is not fully proven. [c1]", citationIds: ["c1"] },
      { text: "Gross margin is not disclosed. [c1]", citationIds: ["c1"] },
      { text: "Customer concentration remains unclear. [c1]", citationIds: ["c1"] },
    ];

    const card = await generateCardForDomain("cartesia.ai", {
      fetchSources: async () => [],
      extractSections: async () => ({
        identity: skeleton.identity,
        funding: skeleton.funding,
        team: skeleton.team,
        signals: [],
        comparables: [],
        citations: [citation]
      })
    });

    const draft = await synthesizeCardDraft(card, {
      synthesize: async () => ({
        whyItMatters,
        bullCase,
        bearCase,
        openQuestions: [
          { question: "What is retention?", category: "adoption_proof" },
          { question: "What is margin?", category: "unit_economics" },
          { question: "What is concentration?", category: "unit_economics" }
        ]
      })
    });
    const result = await verifyCardSynthesisDraft(card, draft, {
      verify: async () => [
        { ...whyItMatters, status: "supported" },
        { ...bullCase[0]!, status: "supported" },
        ...bullCase.slice(1).map((claim) => ({ ...claim, status: "unsupported" as const })),
        ...bearCase.map((claim) => ({ ...claim, status: "unsupported" as const })),
      ],
      synthesisRequired: true
    });

    expect(result.synthesis?.bullCase).toEqual([bullCase[0]]);
    expect(result.synthesis?.bearCase).toEqual([]);
  });

  it("verifies market structure claims with the rest of synthesis", async () => {
    const skeleton = buildSkeletonCard("cartesia.ai");
    const whyItMatters = { text: "Cartesia is building voice AI infrastructure. [c1]", citationIds: ["c1"] };
    const buyerBudget = { text: "The likely buyer budget is contact-center automation. [c1]", citationIds: ["c1"] };
    const painSeverity = { text: "Unsupported market pain. [c1]", citationIds: ["c1"] };

    const card = await generateCardForDomain("cartesia.ai", {
      fetchSources: async () => [],
      extractSections: async () => ({
        identity: skeleton.identity,
        funding: skeleton.funding,
        team: skeleton.team,
        signals: [],
        comparables: [],
        citations: [citation]
      })
    });

    const draft = await synthesizeCardDraft(card, {
      synthesize: async () => ({
        whyItMatters,
        bullCase: [],
        bearCase: [],
        openQuestions: [{ question: "Which buyer owns the budget?", category: "buyer_budget" }],
        marketStructureAndTiming: {
          buyerBudget,
          painSeverity,
          adoptionTrigger: null,
          marketStructure: null,
          profitPool: null,
          expansionPath: null,
          timingRisk: null
        }
      })
    });
    const result = await verifyCardSynthesisDraft(card, draft, {
      verify: async () => [
        { ...whyItMatters, status: "supported" },
        { ...buyerBudget, status: "supported" },
        { ...painSeverity, status: "unsupported" }
      ],
      synthesisRequired: true
    });

    expect(result.synthesis?.marketStructureAndTiming).toEqual({
      buyerBudget,
      painSeverity: null,
      adoptionTrigger: null,
      marketStructure: null,
      profitPool: null,
      expansionPath: null,
      timingRisk: null
    });
  });

  it("propagates synthesize errors instead of silently keeping a card without synthesis", async () => {
    // The old combined path caught a synthesize failure and, when synthesis was optional, kept
    // the extracted card unchanged without calling verify. That "optional synthesis" concept no
    // longer exists in production: apps/web/src/inngest/functions.ts always sets
    // synthesisRequired: true for mode "analysis" (the only mode that ever calls synthesize) and
    // turns a synthesize failure into a run failure (see item 3, generation-helpers.ts, for the
    // transient-vs-semantic split of that failure path). At the unit level, synthesizeCardDraft
    // has no try/catch of its own, so a throwing synthesize propagates directly, guaranteeing a
    // caller never reaches verifyCardSynthesisDraft on a failed draft.
    const skeleton = buildSkeletonCard("cartesia.ai");

    const card = await generateCardForDomain("cartesia.ai", {
      fetchSources: async () => [],
      extractSections: async () => ({
        identity: {
          ...skeleton.identity,
          name: {
            value: "Cartesia",
            status: "verified",
            confidence: "high",
            citationIds: ["c1"]
          }
        },
        funding: skeleton.funding,
        team: skeleton.team,
        signals: [],
        comparables: [],
        citations: [citation]
      })
    });

    expect(card.identity.name.value).toBe("Cartesia");
    expect(card.synthesis).toBeUndefined();

    await expect(
      synthesizeCardDraft(card, {
        synthesize: async () => {
          throw new Error("Synthesis citation ID not found on card: e9");
        }
      })
    ).rejects.toThrow("Synthesis citation ID not found on card: e9");
  });

  // "produces synthesis for a previously-gated news-only card and records advisory diagnostics"
  // and "gates required synthesis before LLM calls when analysis evidence is weak" used to drive
  // this through the combined path's tracePatch.synthesis.gate. The gate diagnostics themselves
  // are evaluateSynthesisGate's own output (a real, still-live production unit); both fixtures
  // and their exact expected advisories/reasons/counts move to the "evaluateSynthesisGate"
  // describe block below as "computes advisory diagnostics on a clearing news-only card" and
  // "blocks with an exact reasons/advisories/counts shape on thin, source-diverse citations".
  // "without calling synthesize or verify" is inherent post-refactor: evaluateSynthesisGate's
  // signature does not accept either function, so there is nothing for it to call.

  it("ignores unexpected top-level extracted section keys", async () => {
    const skeleton = buildSkeletonCard("cartesia.ai");

    const card = await generateCardForDomain("cartesia.ai", {
      fetchSources: async () => [],
      extractSections: async () =>
        ({
          slug: "overridden",
          generationCostUsd: 99,
          identity: skeleton.identity,
          funding: skeleton.funding,
          team: skeleton.team,
          signals: [],
          comparables: [],
          citations: [citation]
        }) as unknown as ExtractedCardSections,
      costLines: [{ label: "provider", usd: 1.23456 }]
    } as GenerateCardDeps);

    expect(card.slug).toBe("cartesia");
    expect(card.generationCostUsd).toBe(1.2346);
  });

  it("rejects no-source extracted cards when no provider sources exist", async () => {
    const skeleton = buildSkeletonCard("cartesia.ai");

    await expect(
      generateCardForDomain("cartesia.ai", {
        fetchSources: async () => [],
        extractSections: async () => ({
          identity: skeleton.identity,
          funding: skeleton.funding,
          team: skeleton.team,
          signals: [],
          comparables: [],
          citations: []
        })
      })
    ).rejects.toThrow("No cited sources survived extraction");
  });

  it("stores a cited fallback profile when extraction drops citations but provider sources exist", async () => {
    const skeleton = buildSkeletonCard("legora.com");

    const card = await generateCardForDomain("legora.com", {
      fetchSources: async () => [
        {
          url: "https://legora.com/",
          title: "Legora",
          sourceType: "company_site",
          fetchedAt: "2026-05-11T00:00:00.000Z",
          intent: "company_profile",
          rawText: "Legora is a legal AI platform."
        }
      ],
      extractSections: async () => ({
        identity: skeleton.identity,
        funding: skeleton.funding,
        team: skeleton.team,
        signals: [],
        comparables: [],
        citations: []
      })
    });

    expect(card.identity.name).toMatchObject({
      value: "Legora",
      status: "inferred",
      confidence: "low",
      citationIds: ["c1"]
    });
    expect(card.citations).toEqual([
      expect.objectContaining({
        id: "c1",
        url: "https://legora.com/",
        title: "Legora",
        sourceType: "company_site"
      })
    ]);
  });

  it("passes an evidence ledger into extraction", async () => {
    const skeleton = buildSkeletonCard("perplexity.ai");
    let ledgerLength = 0;

    await generateCardForDomain("perplexity.ai", {
      fetchSources: async () => [
        {
          url: "https://www.perplexity.ai/hub/blog/series-b",
          title: "Perplexity Series B",
          sourceType: "news",
          fetchedAt: "2026-05-07T00:00:00.000Z",
          intent: "funding",
          rawText: "Perplexity raised $63 million in a Series B led by IVP.",
        },
      ],
      extractSections: async ({ evidenceLedger }) => {
        ledgerLength = evidenceLedger.length;
        return {
          identity: skeleton.identity,
          funding: skeleton.funding,
          team: skeleton.team,
          signals: [],
          comparables: [],
        citations: [citation],
        };
      },
    } as GenerateCardDeps);

    expect(ledgerLength).toBe(1);
  });

  it("passes the research plan into source fetching and extraction", async () => {
    const skeleton = buildSkeletonCard("harvey.ai");
    const researchPlan = {
      searchQueries: {
        funding: "harvey funding",
        companyProfile: "harvey product",
        independentAnalysis: "harvey analysis",
      },
    };
    let fetchSawPlan = false;
    let extractionSawPlan = false;

    await generateCardForDomain("harvey.ai", {
      researchPlan,
      fetchSources: async (_domain, plan) => {
        fetchSawPlan = plan === researchPlan;
        return [];
      },
      extractSections: async ({ researchPlan: plan }) => {
        extractionSawPlan = plan === researchPlan;
        return {
          identity: skeleton.identity,
          funding: skeleton.funding,
          team: skeleton.team,
          signals: [],
          comparables: [],
          citations: [citation],
        };
      },
    } as GenerateCardDeps);

    expect(fetchSawPlan).toBe(true);
    expect(extractionSawPlan).toBe(true);
  });

  it("runs cited block enrichments for fields the broad extraction misses", async () => {
    const skeleton = buildSkeletonCard("zo.computer");
    const seenBlocks: string[] = [];

    const result = await generateCardForDomainWithTrace("zo.computer", {
      fetchSources: async () => [
        {
          url: "https://www.businesswire.com/zo-seed",
          title: "Zo Computer seed financing",
          sourceType: "news",
          fetchedAt: "2026-05-14T16:00:00.000Z",
          intent: "funding",
          rawText: "Zo Computer raised a $4 million seed round led by Conviction.",
        },
        {
          url: "https://zo.computer/team",
          title: "Zo Computer team",
          sourceType: "company_site",
          fetchedAt: "2026-05-14T16:00:00.000Z",
          intent: "management_team",
          rawText: "Raymond Luo is founder and CEO. Contact raymond@zo.computer for company inquiries.",
        },
        {
          url: "https://zo.computer/blog/product",
          title: "Zo Computer launches persistent AI workspaces",
          sourceType: "company_site",
          fetchedAt: "2026-05-14T16:00:00.000Z",
          intent: "recent_signals",
          rawText: "Zo Computer launched persistent cloud workspaces for AI-assisted research and projects.",
        },
        {
          url: "https://browserbase.com",
          title: "Browserbase",
          sourceType: "news",
          fetchedAt: "2026-05-14T16:00:00.000Z",
          intent: "comparables",
          rawText: "Browserbase provides cloud browser automation infrastructure for AI agents.",
        },
      ],
      extractSections: async () => ({
        identity: {
          ...skeleton.identity,
          name: {
            value: "Zo Computer",
            status: "verified",
            confidence: "high",
            citationIds: ["c1"],
          },
        },
        funding: skeleton.funding,
        team: skeleton.team,
        signals: [],
        comparables: [],
        citations: [citation],
      }),
      enrichSections: async ({ block }) => {
        seenBlocks.push(block);

        if (block === "description") {
          return {
            identity: {
              description: {
                value: {
                  shortDescription: "Zo Computer provides cloud computers that users and AI agents can share.",
                  expandedDescription:
                    "Zo Computer provides cloud computers that users and AI agents can share. It gives researchers, builders, and AI-heavy knowledge workers a persistent hosted workspace for handoffs between people and agents.",
                  concept: "A persistent cloud computer for human and AI collaboration.",
                  serves: "Researchers, builders, and AI-heavy knowledge workers.",
                  mechanism: "Runs a hosted workspace that can be controlled by the user and their AI agent.",
                },
                status: "verified",
                confidence: "medium",
                citationIds: ["bd1"],
              },
            },
            citations: [
              {
                id: "bd1",
                url: "https://zo.computer/blog/product",
                title: "Zo Computer launches persistent AI workspaces",
                fetchedAt: "2026-05-14T16:00:00.000Z",
                sourceType: "company_site",
              },
            ],
          };
        }

        if (block === "funding") {
          return {
            funding: {
              lastRound: {
                value: {
                  name: "Seed",
                  amountUsd: 4000000,
                  announcedAt: "2026-05-14",
                  leadInvestors: ["Conviction"],
                },
                status: "verified",
                confidence: "high",
                citationIds: ["bf1"],
              },
            },
            citations: [
              {
                id: "bf1",
                url: "https://www.businesswire.com/zo-seed",
                title: "Zo Computer seed financing",
                fetchedAt: "2026-05-14T16:00:00.000Z",
                sourceType: "news",
              },
            ],
          };
        }

        if (block === "team") {
          return {
            team: {
              founders: {
                value: [
                  {
                    name: "Raymond Luo",
                    role: "Founder and CEO",
                    sourceUrl: "https://zo.computer/team",
                    email: "raymond@zo.computer",
                  },
                ],
                status: "verified",
                confidence: "medium",
                citationIds: ["bt1"],
              },
            },
            citations: [
              {
                id: "bt1",
                url: "https://zo.computer/team",
                title: "Zo Computer team",
                fetchedAt: "2026-05-14T16:00:00.000Z",
                sourceType: "company_site",
              },
            ],
          };
        }

        if (block === "signals") {
          return {
            signals: [
              {
                title: "Launched persistent AI workspaces",
                url: "https://zo.computer/blog/product",
                date: "2026-05-14",
                source: "Zo Computer",
                category: "launch",
                citationIds: ["bs1"],
              },
            ],
            citations: [
              {
                id: "bs1",
                url: "https://zo.computer/blog/product",
                title: "Zo Computer launches persistent AI workspaces",
                fetchedAt: "2026-05-14T16:00:00.000Z",
                sourceType: "company_site",
              },
            ],
          };
        }

        if (block === "comparables") {
          return {
            comparables: [
              {
                name: "Browserbase",
                domain: "browserbase.com",
                oneLiner: "Cloud browser automation infrastructure for AI agents.",
                basis: "Adjacent cloud execution surface for AI-controlled browser work.",
                confidence: "medium",
                citationIds: ["bc1"],
              },
            ],
            competitionFraming: {
              value: "Zo Computer competes in the shared AI-agent workspace slice, which is still sparsely populated.",
              status: "verified",
              confidence: "medium",
              citationIds: ["bc1"],
            },
            citations: [
              {
                id: "bc1",
                url: "https://browserbase.com",
                title: "Browserbase",
                fetchedAt: "2026-05-14T16:00:00.000Z",
                sourceType: "news",
              },
            ],
          };
        }

        return { citations: [] };
      },
    } as GenerateCardDeps);

    expect(seenBlocks).toEqual(["description", "funding", "team", "signals", "comparables"]);
    expect(result.card.identity.description?.value?.serves).toBe("Researchers, builders, and AI-heavy knowledge workers.");
    expect(result.card.funding.lastRound.value).toMatchObject({ name: "Seed", amountUsd: 4000000 });
    expect(result.card.team.founders.value?.[0]).toMatchObject({
      name: "Raymond Luo",
      role: "Founder and CEO",
      email: "raymond@zo.computer",
    });
    expect(result.card.signals[0]?.title).toBe("Launched persistent AI workspaces");
    expect(result.card.comparables[0]).toMatchObject({ name: "Browserbase", domain: "browserbase.com" });
    expect(result.card.competitionFraming?.value).toBe(
      "Zo Computer competes in the shared AI-agent workspace slice, which is still sparsely populated."
    );
    expect(result.card.competitionFraming?.citationIds).toContain(
      result.card.comparables[0]?.citationIds?.[0]
    );
    expect(result.tracePatch.extraction?.blockEnrichment).toMatchObject({
      requested: ["description", "funding", "team", "signals", "comparables"],
      produced: ["description", "funding", "team", "signals", "comparables"],
    });
  });

  it("merges contact facts when emails are missing but the team block is otherwise complete", async () => {
    const skeleton = buildSkeletonCard("zo.computer");
    const seenBlocks: string[] = [];
    const completeSections: ExtractedCardSections = {
      identity: {
        ...skeleton.identity,
        name: {
          value: "Zo Computer",
          status: "verified",
          confidence: "high",
          citationIds: ["c1"],
        },
        description: {
          value: {
            shortDescription: "Zo Computer provides cloud computers for people and AI agents.",
            expandedDescription:
              "Zo Computer provides cloud computers for people and AI agents. It gives researchers and builders a hosted workspace they can access through the browser.",
            concept: "A persistent cloud computer.",
            serves: "Researchers and builders.",
            mechanism: "Hosts a browser-accessible workspace.",
          },
          status: "verified",
          confidence: "medium",
          citationIds: ["c1"],
        },
      },
      funding: {
        ...skeleton.funding,
        lastRound: {
          value: {
            name: "Seed",
            amountUsd: 4000000,
            announcedAt: "2026-05-14",
            leadInvestors: ["Conviction"],
          },
          status: "verified",
          confidence: "high",
          citationIds: ["c1"],
        },
        investors: {
          value: [{ name: "Conviction", domain: null }],
          status: "verified",
          confidence: "medium",
          citationIds: ["c1"],
        },
      },
      team: {
        ...skeleton.team,
        founders: {
          value: [
            {
              name: "Raymond Luo",
              role: "Founder and CEO",
              sourceUrl: "https://zo.computer/team",
            },
          ],
          status: "verified",
          confidence: "medium",
          citationIds: ["c1"],
        },
      },
      signals: [
        {
          title: "Launched persistent AI workspaces",
          url: "https://zo.computer/blog/product",
          date: "2026-05-14",
          source: "Zo Computer",
          category: "launch",
          citationIds: ["c1"],
        },
        {
          title: "Announced seed financing",
          url: "https://www.businesswire.com/zo-seed",
          date: "2026-05-14",
          source: "Business Wire",
          category: "funding",
          citationIds: ["c1"],
        },
      ],
      comparables: [
        {
          name: "Browserbase",
          domain: "browserbase.com",
          oneLiner: "Cloud browser automation infrastructure.",
          basis: "Adjacent cloud execution layer.",
          confidence: "medium",
          citationIds: ["c1"],
        },
        {
          name: "Poolside",
          domain: "poolside.ai",
          oneLiner: "AI software engineering agents.",
          basis: "Adjacent AI workspace workflow.",
          confidence: "low",
          citationIds: ["c1"],
        },
        {
          name: "Replit",
          domain: "replit.com",
          oneLiner: "Browser-based software workspace.",
          basis: "Adjacent hosted development surface.",
          confidence: "medium",
          citationIds: ["c1"],
        },
      ],
      citations: [citation],
    };

    const result = await generateCardForDomainWithTrace("zo.computer", {
      providerFacts: [
        {
          path: "team.founders",
          value: [
            {
              name: "Raymond Luo",
              role: "Founder and CEO",
              sourceUrl: "https://zo.computer/team",
              email: "raymond@zo.computer",
            },
          ],
          status: "verified",
          confidence: "high",
          sourceType: "enrichment",
          provider: "stableenrich",
          endpoint: "hunter_email_verifier",
          citationUrl: "https://stable.example/hunter?domain=raymond@zo.computer",
          citationTitle: "Hunter email verification for raymond@zo.computer",
          fetchedAt: "2026-05-14T16:05:00.000Z",
        },
      ],
      fetchSources: async () => [
        {
          url: "https://zo.computer/team",
          title: "Zo Computer team",
          sourceType: "company_site",
          fetchedAt: "2026-05-14T16:00:00.000Z",
          intent: "management_team",
          rawText: "Raymond Luo is founder and CEO. Contact raymond@zo.computer for company inquiries.",
        },
      ],
      extractSections: async () => completeSections,
      enrichSections: async ({ block }) => {
        seenBlocks.push(block);
        return null;
      },
    } as GenerateCardDeps);

    expect(seenBlocks).toEqual([]);
    expect(result.card.team.founders.value?.[0]).toMatchObject({
      name: "Raymond Luo",
      role: "Founder and CEO",
      sourceUrl: "https://zo.computer/team",
      email: "raymond@zo.computer",
    });
    expect(result.tracePatch.extraction?.blockEnrichment).toBeUndefined();
  });

  it("merges deterministic provider facts into missing table-stakes fields", async () => {
    const skeleton = buildSkeletonCard("cartesia.ai");

    const result = await generateCardForDomainWithTrace("cartesia.ai", {
      providerFacts: [
        {
          path: "identity.name",
          value: "Ignored Provider Name",
          status: "inferred",
          confidence: "medium",
          sourceType: "enrichment",
          provider: "stableenrich",
          endpoint: "org_enrichment",
          citationUrl: "https://stableenrich.dev/ignored-name",
          citationTitle: "Ignored provider name",
          fetchedAt: "2026-05-13T00:00:00.000Z",
        },
        {
          path: "identity.websiteUrl",
          value: "https://cartesia.ai",
          status: "inferred",
          confidence: "high",
          sourceType: "enrichment",
          provider: "stableenrich",
          endpoint: "org_enrichment",
          citationUrl: "https://stableenrich.dev/api/apollo/org-enrich?domain=cartesia.ai",
          citationTitle: "Apollo org enrichment for cartesia.ai",
          fetchedAt: "2026-05-13T00:00:00.000Z",
        },
        {
          path: "team.headcount",
          value: { value: 64, asOf: "2026-05-13" },
          status: "inferred",
          confidence: "low",
          sourceType: "enrichment",
          provider: "stableenrich",
          endpoint: "org_enrichment",
          citationUrl: "https://stableenrich.dev/api/apollo/org-enrich?domain=cartesia.ai",
          citationTitle: "Apollo org enrichment for cartesia.ai",
          fetchedAt: "2026-05-13T00:00:00.000Z",
        },
        {
          path: "team.founders",
          value: [
            {
              name: "Karan Goel",
              role: "Co-founder and CEO",
              sourceUrl: "https://www.linkedin.com/in/karangoel",
              email: "karan@cartesia.ai",
            },
          ],
          status: "verified",
          confidence: "high",
          sourceType: "enrichment",
          provider: "stableenrich",
          endpoint: "apollo_people_enrich",
          citationUrl: "https://www.linkedin.com/in/karangoel",
          citationTitle: "Apollo people enrichment for Karan Goel",
          fetchedAt: "2026-05-13T00:00:00.000Z",
        },
        {
          path: "comparables",
          value: {
            name: "ElevenLabs",
            domain: "elevenlabs.io",
            oneLiner: "Voice AI platform.",
            basis: "Similar web and market context from Exa find-similar",
            confidence: "medium",
          },
          status: "inferred",
          confidence: "medium",
          sourceType: "news",
          provider: "stableenrich",
          endpoint: "exa_find_similar",
          citationUrl: "https://elevenlabs.io",
          citationTitle: "ElevenLabs",
          fetchedAt: "2026-05-13T00:00:00.000Z",
        },
        {
          path: "signals",
          value: {
            title: "Cartesia announces Series B",
            url: "https://cartesia.ai/blog/series-b",
            date: "2026-05-01",
            source: "cartesia.ai",
            category: "funding",
            citationIds: [],
          },
          status: "verified",
          confidence: "medium",
          sourceType: "news",
          provider: "stableenrich",
          endpoint: "exa_recent_signals",
          citationUrl: "https://cartesia.ai/blog/series-b",
          citationTitle: "Cartesia announces Series B",
          fetchedAt: "2026-05-13T00:00:00.000Z",
        },
      ],
      fetchSources: async () => [
        {
          url: "https://cartesia.ai",
          title: "Cartesia",
          sourceType: "company_site",
          fetchedAt: "2026-05-06T12:00:00.000Z",
          intent: "company_profile",
          rawText: "Cartesia is building voice AI infrastructure.",
        },
      ],
      extractSections: async () => ({
        identity: {
          ...skeleton.identity,
          name: {
            value: "Cartesia",
            status: "verified",
            confidence: "high",
            citationIds: ["c1"],
          },
        },
        funding: skeleton.funding,
        team: skeleton.team,
        signals: [],
        comparables: [],
        citations: [citation],
      }),
    });

    expect(result.card.identity.name.value).toBe("Cartesia");
    expect(result.card.identity.websiteUrl?.value).toBe("https://cartesia.ai");
    expect(result.card.team.headcount.value).toEqual({ value: 64, asOf: "2026-05-13" });
    expect(result.card.team.founders.value?.[0]).toMatchObject({
      name: "Karan Goel",
      email: "karan@cartesia.ai",
    });
    expect(result.card.comparables[0]).toMatchObject({
      name: "ElevenLabs",
      domain: "elevenlabs.io",
      citationIds: ["p3"],
    });
    expect(result.card.signals[0]).toMatchObject({
      title: "Cartesia announces Series B",
      category: "funding",
      citationIds: ["p4"],
    });
    expect(result.card.citations.map((item) => item.url)).not.toContain("https://stableenrich.dev/ignored-name");
    expect(result.tracePatch.extraction).toMatchObject({
      providerFactCandidateCount: 6,
      providerFactAppliedCount: 5,
      providerFactPaths: ["comparables", "identity.websiteUrl", "signals", "team.founders", "team.headcount"],
    });
  });

  it("returns an extraction trace patch from the assembly-only path", async () => {
    const skeleton = buildSkeletonCard("cartesia.ai");

    const result = await generateCardForDomainWithTrace("cartesia.ai", {
      fetchSources: async () => [
        {
          url: "https://cartesia.ai",
          title: "Cartesia",
          sourceType: "company_site",
          fetchedAt: "2026-05-06T12:00:00.000Z",
          intent: "company_profile",
          rawText: "Cartesia is building voice AI infrastructure."
        }
      ],
      extractSections: async () => ({
        identity: skeleton.identity,
        funding: skeleton.funding,
        team: skeleton.team,
        signals: [],
        comparables: [],
        citations: [citation]
      })
    });

    expect(result.tracePatch.extraction).toMatchObject({
      sourceCount: 1,
      evidenceCount: 1,
      citationCount: 1,
      fallbackUsed: false,
      providerFactCandidateCount: 0,
      providerFactAppliedCount: 0,
      providerFactPaths: []
    });
    expect(result.tracePatch.synthesis).toBeUndefined();
  });

  it("returns a synthesis trace patch from verifyCardSynthesisDraft, including usefulness-gate diagnostics", async () => {
    const skeleton = buildSkeletonCard("cartesia.ai");
    const whyItMatters = { text: "Cartesia has cited public product evidence. [c1]", citationIds: ["c1"] };
    const bullCase = { text: "The company has a clear infrastructure wedge. [c1]", citationIds: ["c1"] };

    const card = await generateCardForDomain("cartesia.ai", {
      fetchSources: async () => [],
      extractSections: async () => ({
        identity: skeleton.identity,
        funding: skeleton.funding,
        team: skeleton.team,
        signals: [],
        comparables: [],
        citations: [citation]
      })
    });

    const draft = await synthesizeCardDraft(card, {
      synthesize: async () => ({
        whyItMatters,
        bullCase: [bullCase],
        bearCase: [],
        openQuestions: [{ question: "What buyer owns expansion?", category: "buyer_budget" }]
      })
    });
    const result = await verifyCardSynthesisDraft(card, draft, {
      verify: async () => [
        { ...whyItMatters, status: "supported" },
        { ...bullCase, status: "unsupported" }
      ],
      synthesisRequired: true
    });

    expect(result.tracePatch.synthesis).toEqual({
      required: true,
      produced: true,
      claimCountBeforeVerify: 2,
      claimCountAfterVerify: 1,
      usefulnessDroppedClaims: 0
    });
  });

  it("carries trace patches through extraction failure", async () => {
    const skeleton = buildSkeletonCard("legora.com");

    await expect(
      generateCardForDomainWithTrace("legora.com", {
        fetchSources: async () => [],
        extractSections: async () => ({
          identity: skeleton.identity,
          funding: skeleton.funding,
          team: skeleton.team,
          signals: [],
          comparables: [],
          citations: []
        })
      })
    ).rejects.toMatchObject({
      tracePatch: {
        extraction: {
          sourceCount: 0,
          evidenceCount: 0,
          citationCount: 0,
          fallbackUsed: false,
          providerFactCandidateCount: 0,
          providerFactAppliedCount: 0,
          providerFactPaths: []
        }
      }
    });
  });
});

describe("finalizeGeneratedCard", () => {
  it("drops same-name unrelated comparables proposed by enrichment", () => {
    const card = {
      ...buildSkeletonCard("cognition.ai"),
      identity: {
        ...buildSkeletonCard("cognition.ai").identity,
        name: {
          value: "Cognition AI",
          status: "verified" as const,
          confidence: "high" as const,
          citationIds: ["c1"],
        },
      },
      citations: [
        {
          id: "c1",
          url: "https://cognition.ai",
          title: "Cognition",
          fetchedAt: "2026-05-15T00:00:00.000Z",
          sourceType: "company_site" as const,
        },
      ],
      comparables: [
        {
          name: "Cursor",
          domain: "cursor.com",
          oneLiner: "AI coding IDE.",
          citationIds: ["c1"],
        },
        {
          name: "Cognition (Cognition Therapeutics)",
          domain: "cogtherapeutics.com",
          oneLiner: "Unrelated therapeutics company.",
          citationIds: ["c1"],
        },
      ],
    };

    expect(finalizeGeneratedCard(card).comparables.map((comparable) => comparable.name)).toEqual(["Cursor"]);
  });

  it("derives a readable name from the domain when extraction leaves it missing but the site is cited", () => {
    const skeleton = buildSkeletonCard("bolt.com");
    const card = {
      ...skeleton,
      citations: [
        {
          id: "c1",
          url: "https://bolt.com",
          title: "Bolt",
          fetchedAt: "2026-05-29T00:00:00.000Z",
          sourceType: "company_site" as const,
        },
      ],
    };

    const finalized = finalizeGeneratedCard(card);
    expect(finalized.identity.name.value).toBe("Bolt");
    expect(finalized.identity.name.status).toBe("inferred");
    expect(finalized.identity.name.citationIds).toEqual(["c1"]);
  });

  it("derives the name from a subdomain company-site citation", () => {
    const skeleton = buildSkeletonCard("bolt.com");
    const card = {
      ...skeleton,
      citations: [
        {
          id: "c1",
          url: "https://app.bolt.com/dashboard",
          title: "Bolt App",
          fetchedAt: "2026-05-29T00:00:00.000Z",
          sourceType: "company_site" as const,
        },
      ],
    };

    const finalized = finalizeGeneratedCard(card);
    expect(finalized.identity.name.value).toBe("Bolt");
    expect(finalized.identity.name.citationIds).toEqual(["c1"]);
  });

  it("does not derive the name from a look-alike domain citation", () => {
    const skeleton = buildSkeletonCard("bolt.com");
    const card = {
      ...skeleton,
      citations: [
        {
          id: "c1",
          url: "https://evil-bolt.com",
          title: "Not Bolt",
          fetchedAt: "2026-05-29T00:00:00.000Z",
          sourceType: "company_site" as const,
        },
      ],
    };

    expect(finalizeGeneratedCard(card).identity.name.value).toBeNull();
  });

  it("leaves the name missing when the company site is not cited", () => {
    const skeleton = buildSkeletonCard("bolt.com");
    const card = {
      ...skeleton,
      citations: [
        {
          id: "c1",
          url: "https://techcrunch.com/2026/bolt",
          title: "News",
          fetchedAt: "2026-05-29T00:00:00.000Z",
          sourceType: "news" as const,
        },
      ],
    };

    expect(finalizeGeneratedCard(card).identity.name.value).toBeNull();
  });

  it("clusters duplicate raise coverage into one corroborated signal", () => {
    // The real granola failure shape: one March 2026 raise extracted once per outlet, including
    // a wrong-date member and a mislabeled launch member, plus one genuinely distinct event.
    const skeleton = buildSkeletonCard("granola.ai");
    const citationFor = (id: string, url: string) => ({
      id,
      url,
      title: id,
      fetchedAt: "2026-06-01T00:00:00.000Z",
      sourceType: "news" as const,
    });
    const card = {
      ...skeleton,
      citations: [
        citationFor("e1", "https://thenextweb.com/news/granola-series-c"),
        citationFor("e2", "https://techcrunch.com/2026/03/25/granola-raises-125m/"),
        citationFor("p2", "https://technotrenz.com/news/granola-raises-125m/"),
        citationFor("p3", "https://worktechjournal.com/granola-series-c-spaces/"),
        citationFor("e4", "https://venturebeat.com/business/granola-43m-series-b"),
      ],
      signals: [
        {
          title: "Granola raises $125M at $1.5B valuation to turn meetings into enterprise AI context",
          url: "https://thenextweb.com/news/granola-series-c",
          date: "2026-03-25",
          source: "TNW",
          category: "funding" as const,
          citationIds: ["e1"],
        },
        {
          title: "Granola raises $125M, hits $1.5B valuation as it expands from meeting notetaker",
          url: "https://techcrunch.com/2026/03/25/granola-raises-125m/",
          date: "2026-03-25",
          source: "TechCrunch",
          category: "funding" as const,
          citationIds: ["e2"],
        },
        {
          title: "Granola Raises $125M, Achieves $1.5B Valuation",
          url: "https://technotrenz.com/news/granola-raises-125m/",
          date: "2026-03-26",
          source: "technotrenz.com",
          category: "funding" as const,
          citationIds: ["p2"],
        },
        {
          title: "Granola Raises $125M, Launches Spaces, API, and MCP for Team Note Sharing",
          url: "https://worktechjournal.com/granola-series-c-spaces/",
          date: "2026-05-08",
          source: "worktechjournal.com",
          category: "launch" as const,
          citationIds: ["p3"],
        },
        {
          title: "Granola Launches AI Workspace for Teams and Raises $43M Series B",
          url: "https://venturebeat.com/business/granola-43m-series-b",
          date: "2025-05-14",
          source: "VentureBeat",
          category: "funding" as const,
          citationIds: ["e4"],
        },
      ],
    };

    const finalized = finalizeGeneratedCard(card);
    expect(finalized.signals).toHaveLength(2);
    expect(finalized.signals[0]?.citationIds).toEqual(expect.arrayContaining(["e1", "e2", "p2", "p3"]));
    expect(finalized.signals[0]?.date).toBe("2026-03-25");
    expect(finalized.signals[1]?.citationIds).toEqual(["e4"]);
  });
});

describe("cardWithExtractedSections", () => {
  it("drops unresolved fact citation refs instead of throwing", () => {
    const base = buildSkeletonCard("acme.com");
    const sections: ExtractedCardSections = {
      identity: {
        ...base.identity,
        name: { value: "Acme", status: "verified", confidence: "high", citationIds: ["c1"] },
      },
      funding: base.funding,
      team: {
        founders: {
          value: [{ name: "Jane Doe", role: "CEO", sourceUrl: null }],
          status: "verified",
          confidence: "high",
          citationIds: ["e1"],
        },
        keyExecs: base.team.keyExecs,
        headcount: base.team.headcount,
      },
      signals: [],
      comparables: [],
      citations: [
        {
          id: "c1",
          url: "https://acme.com",
          title: "Acme",
          fetchedAt: "2026-05-29T00:00:00.000Z",
          sourceType: "company_site" as const,
        },
      ],
    };

    const card = cardWithExtractedSections(base, sections);
    // Valid ref survives; the dangling "e1" ref is dropped and its fact nulled (no schema throw).
    expect(card.identity.name.value).toBe("Acme");
    expect(card.team.founders.value).toBeNull();
    expect(card.team.founders.citationIds).toEqual([]);
  });
});

// Split synthesize/verify units (Phase 4 Task 5.2): each is separately callable so the Inngest
// orchestration can run them as independent, independently-memoizable steps.
describe("split synthesize/verify units", () => {
  const citation = {
    id: "c1",
    url: "https://cartesia.ai/",
    title: "Cartesia",
    fetchedAt: "2026-05-06T12:00:00.000Z",
    sourceType: "company_site" as const,
    snippet: "Cartesia is building voice AI infrastructure."
  };

  async function assembledCard(citations: ExtractedCardSections["citations"] = [citation]) {
    const skeleton = buildSkeletonCard("cartesia.ai");
    return generateCardForDomain("cartesia.ai", {
      fetchSources: async () => [],
      extractSections: async () => ({
        identity: skeleton.identity,
        funding: skeleton.funding,
        team: skeleton.team,
        signals: [],
        comparables: [],
        citations
      })
    } as GenerateCardDeps);
  }

  describe("synthesizeCardDraft", () => {
    it("is callable without a verify function", async () => {
      const card = await assembledCard();
      const whyItMatters = { text: "Cartesia is building voice AI infrastructure. [c1]", citationIds: ["c1"] };
      const bullCase = { text: "Cartesia has public product evidence. [c1]", citationIds: ["c1"] };

      // deps only has `synthesize`; no `verify` in scope at all for this call.
      const draft = await synthesizeCardDraft(card, {
        synthesize: async () => ({
          whyItMatters,
          bullCase: [bullCase],
          bearCase: [],
          openQuestions: [{ question: "What customer traction has Cartesia disclosed?", category: "adoption_proof" }]
        })
      });

      expect(draft.synthesis.whyItMatters).toEqual(whyItMatters);
      expect(draft.synthesis.bullCase).toEqual([bullCase]);
      expect(draft.claimCountBeforeVerify).toBe(2);
    });
  });

  describe("verifyCardSynthesisDraft", () => {
    it("is callable with a stored synthesis draft, without re-deriving it from synthesize", async () => {
      const card = await assembledCard();
      const whyItMatters = { text: "Cartesia is building voice AI infrastructure. [c1]", citationIds: ["c1"] };
      const bullCase = { text: "Cartesia has public product evidence. [c1]", citationIds: ["c1"] };
      // Hand-built draft, standing in for one memoized by a prior "synthesize-card" Inngest step
      // and replayed into this call without touching synthesize again.
      const storedDraft = {
        synthesis: {
          whyItMatters,
          bullCase: [bullCase],
          bearCase: [],
          openQuestions: [{ question: "What customer traction has Cartesia disclosed?", category: "adoption_proof" as const }]
        },
        claimCountBeforeVerify: 2
      };
      const verify = vi.fn(async () => [
        { ...whyItMatters, status: "supported" as const },
        { ...bullCase, status: "supported" as const }
      ]);

      const result = await verifyCardSynthesisDraft(card, storedDraft, { verify, synthesisRequired: true });

      expect(verify).toHaveBeenCalledTimes(1);
      expect(result.synthesis?.whyItMatters).toEqual(whyItMatters);
      expect(result.synthesis?.bullCase).toEqual([bullCase]);
      expect(result.tracePatch.synthesis).toMatchObject({
        required: true,
        produced: true,
        claimCountBeforeVerify: 2,
        claimCountAfterVerify: 2
      });
    });

    it("returns no synthesis when nothing survives verification, without throwing", async () => {
      const card = await assembledCard();
      const whyItMatters = { text: "Cartesia is building voice AI infrastructure. [c1]", citationIds: ["c1"] };
      const storedDraft = {
        synthesis: {
          whyItMatters,
          bullCase: [],
          bearCase: [],
          openQuestions: [{ question: "What customer traction has Cartesia disclosed?", category: "adoption_proof" as const }]
        },
        claimCountBeforeVerify: 1
      };

      const result = await verifyCardSynthesisDraft(card, storedDraft, {
        verify: async () => [{ ...whyItMatters, status: "contradicted" as const }],
        synthesisRequired: true
      });

      expect(result.synthesis).toBeUndefined();
      expect(result.tracePatch.synthesis).toEqual({
        required: true,
        produced: false,
        claimCountBeforeVerify: 1,
        claimCountAfterVerify: 0
      });
    });
  });

  describe("evaluateSynthesisGate", () => {
    it("blocks synthesis and stamps synthesisWithheld on thin evidence, without calling synthesize or verify", async () => {
      process.env.ANALYSIS_SYNTHESIS_MIN_CITATIONS = "8";
      const card = await assembledCard([citation]);

      const outcome = evaluateSynthesisGate(card, { synthesisRequired: true });

      expect(outcome.blocked).toBe(true);
      expect(outcome.card.synthesisWithheld).toMatchObject({
        reasons: ["citation-floor"]
      });
      expect(outcome.tracePatch.synthesis).toMatchObject({
        required: true,
        produced: false,
        claimCountBeforeVerify: 0,
        claimCountAfterVerify: 0,
        gateMessage: "insufficient evidence for synthesis"
      });
    });

    it("does not block, and does not mutate the card, once evidence clears the floor", async () => {
      const citations = Array.from({ length: 8 }, (_, index) => ({
        ...citation,
        id: `c${index + 1}`,
        url: `https://example.com/cartesia-${index + 1}`,
        sourceType: "news" as const
      }));
      const card = await assembledCard(citations);

      const outcome = evaluateSynthesisGate(card, { synthesisRequired: true });

      expect(outcome.blocked).toBe(false);
      expect(outcome.card).toBe(card);
      expect(outcome.card.synthesisWithheld).toBeUndefined();
    });

    // Migrated from "produces synthesis for a previously-gated news-only card and records
    // advisory diagnostics" (packages/pipeline/tests/generate-card.test.ts, pre-Task-1): that test
    // drove this same all-news, 8-citation shape through the deleted combined
    // generateCardForDomainWithTrace path. The advisory computation is evaluateSynthesisGate's
    // own output; this asserts its exact shape directly on the real unit.
    it("computes advisory diagnostics (single source class, no funding, no named team) on a clearing news-only card", async () => {
      // synthesisEvidenceGate short-circuits to { ok: true } with no `gate` field at all when
      // ANALYSIS_SYNTHESIS_MIN_CITATIONS <= 0 (the file-level beforeEach default). The gate
      // diagnostics this test asserts only exist once a real floor is in effect.
      process.env.ANALYSIS_SYNTHESIS_MIN_CITATIONS = "8";
      const citations = Array.from({ length: 8 }, (_, index) => ({
        ...citation,
        id: `c${index + 1}`,
        url: `https://example.com/cartesia-news-${index + 1}`,
        title: `Cartesia coverage ${index + 1}`,
        sourceType: "news" as const
      }));
      const card = await assembledCard(citations);

      const outcome = evaluateSynthesisGate(card, { synthesisRequired: true });

      expect(outcome.blocked).toBe(false);
      expect(outcome.gate).toEqual({
        blocked: false,
        reasons: [],
        advisories: ["single-source-class", "no-funding-evidence", "no-named-team"],
        citationCount: 8,
        sourceTypeCount: 1,
        hasFundingEvidence: false,
        hasNamedTeamMember: false
      });
    });

    // Migrated from "gates required synthesis before LLM calls when analysis evidence is weak"
    // (same file, pre-Task-1): a thinner, source-diverse fixture than the "thin evidence" test
    // above, kept as a distinct case because it exercises a different sourceTypeCount and a fuller
    // advisories list.
    it("blocks with an exact reasons/advisories/counts shape on thin, source-diverse citations", async () => {
      process.env.ANALYSIS_SYNTHESIS_MIN_CITATIONS = "8";
      const citations: ExtractedCardSections["citations"] = [
        { ...citation, id: "c1", url: "https://cartesia.ai", title: "Cartesia" },
        { ...citation, id: "c2", url: "https://example.com/cartesia", title: "Cartesia profile", sourceType: "news" as const },
        { ...citation, id: "c3", url: "https://example.com/cartesia-funding", title: "Cartesia funding", sourceType: "news" as const }
      ];
      const card = await assembledCard(citations);

      const outcome = evaluateSynthesisGate(card, { synthesisRequired: true });

      expect(outcome.blocked).toBe(true);
      expect(outcome.tracePatch.synthesis).toEqual({
        required: true,
        produced: false,
        claimCountBeforeVerify: 0,
        claimCountAfterVerify: 0,
        evidenceFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
        gateMessage: "insufficient evidence for synthesis",
        gate: {
          blocked: true,
          reasons: ["citation-floor"],
          advisories: ["no-funding-evidence", "no-named-team"],
          citationCount: 3,
          sourceTypeCount: 2,
          hasFundingEvidence: false,
          hasNamedTeamMember: false
        }
      });
      expect(outcome.card.synthesisWithheld).toEqual({
        at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
        reasons: ["citation-floor"],
        advisories: ["no-funding-evidence", "no-named-team"],
        citationCount: 3,
        sourceTypeCount: 2
      });
      expect(outcome.tracePatch.synthesis?.evidenceFingerprint).toMatch(/^[a-f0-9]{64}$/);
    });

    it("fingerprints evidence content independent of collection order", async () => {
      const citations: ExtractedCardSections["citations"] = [
        { ...citation, id: "c1", url: "https://cartesia.ai", title: "Cartesia" },
        { ...citation, id: "c2", url: "https://example.com/cartesia", title: "Cartesia profile", sourceType: "news" as const }
      ];
      const card = await assembledCard(citations);
      const reordered = { ...card, citations: [...card.citations].reverse() };
      const changed = {
        ...card,
        citations: card.citations.map((entry, index) =>
          index === 0 ? { ...entry, title: "Changed evidence with the same count" } : entry
        )
      };

      expect(synthesisEvidenceFingerprint(reordered)).toBe(synthesisEvidenceFingerprint(card));
      expect(synthesisEvidenceFingerprint(changed)).not.toBe(synthesisEvidenceFingerprint(card));
    });
  });
});
