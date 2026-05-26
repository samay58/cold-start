import { describe, expect, it } from "vitest";
import type { ColdStartCard, GenerationTrace } from "../src/index";
import { formatGenerationQualityFlags, generationQualityFlags } from "../src/index";

function baseTrace(): GenerationTrace {
  return {
    jobKind: "analysis",
    mode: "analysis",
    steps: {
      "plan-research": { status: "complete", durationMs: 100 },
      "generate-card": { status: "complete", durationMs: 200 }
    },
    providers: {
      directExa: { skipped: false, sourceCount: 3, failureCount: 0 },
      stableenrich: { sourceCount: 2, factCount: 3, failureCount: 0 },
      mergedSourceCount: 5
    },
    sourceGate: {
      acceptedCount: 5,
      rejectedCount: 0,
      acceptedSamples: [],
      rejectedSamples: []
    },
    extraction: {
      sourceCount: 5,
      evidenceCount: 5,
      citationCount: 3,
      fallbackUsed: false
    },
    synthesis: {
      required: true,
      produced: true,
      claimCountBeforeVerify: 3,
      claimCountAfterVerify: 2
    }
  };
}

function card(): ColdStartCard {
  return {
    slug: "cartesia",
    domain: "cartesia.ai",
    generatedAt: "2026-05-11T00:00:00.000Z",
    generationCostUsd: 0,
    cacheStatus: "hit",
    identity: {
      name: { value: "Cartesia", status: "verified", confidence: "high", citationIds: ["c1"] },
      websiteUrl: { value: "https://cartesia.ai", status: "verified", confidence: "high", citationIds: ["c1"] },
      logoUrl: null,
      oneLiner: { value: "Voice AI infrastructure.", status: "verified", confidence: "high", citationIds: ["c1"] },
      description: {
        value: {
          shortDescription: "Voice AI infrastructure.",
          concept: "Builds voice AI systems.",
          serves: "Developers and enterprises.",
          mechanism: "APIs and models."
        },
        status: "verified",
        confidence: "high",
        citationIds: ["c1"]
      },
      hq: { value: { city: "San Francisco", country: "United States" }, status: "verified", confidence: "medium", citationIds: ["c1"] },
      foundedYear: { value: 2023, status: "verified", confidence: "medium", citationIds: ["c1"] },
      status: "private"
    },
    funding: {
      totalRaisedUsd: { value: 91000000, status: "verified", confidence: "medium", citationIds: ["c1"] },
      lastRound: { value: null, status: "unknown", confidence: "low", citationIds: [] },
      investors: { value: null, status: "unknown", confidence: "low", citationIds: [] }
    },
    team: {
      founders: { value: null, status: "unknown", confidence: "low", citationIds: [] },
      keyExecs: { value: null, status: "unknown", confidence: "low", citationIds: [] },
      headcount: { value: { value: 64, asOf: "2026-05-11" }, status: "inferred", confidence: "low", citationIds: ["c1"] }
    },
    signals: [],
    comparables: [{ name: "ElevenLabs", domain: "elevenlabs.io", oneLiner: "Voice AI platform" }],
    citations: [
      {
        id: "c1",
        url: "https://cartesia.ai",
        title: "Cartesia",
        fetchedAt: "2026-05-11T00:00:00.000Z",
        sourceType: "company_site"
      }
    ],
    synthesis: {
      whyItMatters: { text: "Cartesia has cited evidence.", citationIds: ["c1"] },
      bullCase: [],
      bearCase: [],
      openQuestions: ["What traction is disclosed?"]
    }
  };
}

describe("generationQualityFlags", () => {
  it("does not flag a complete traced analysis card", () => {
    expect(generationQualityFlags({ status: "complete", mode: "analysis", traceJson: baseTrace(), card: card() })).toEqual([]);
  });

  it("flags completed runs with missing extraction and synthesis trace", () => {
    const trace = baseTrace();
    delete trace.extraction;
    delete trace.synthesis;

    expect(generationQualityFlags({ status: "complete", mode: "analysis", traceJson: trace }).map((flag) => flag.code)).toEqual([
      "missing_extraction_trace",
      "missing_synthesis_trace"
    ]);
  });

  it("flags zero citations and source quality risks conservatively", () => {
    const trace = baseTrace();
    trace.extraction = { sourceCount: 5, evidenceCount: 5, citationCount: 0, fallbackUsed: false };
    trace.providers = {
      directExa: { skipped: false, sourceCount: 6, failureCount: 0 },
      stableenrich: { sourceCount: 0, failureCount: 7 },
      mergedSourceCount: 6
    };
    trace.sourceGate = { acceptedCount: 3, rejectedCount: 4, acceptedSamples: [], rejectedSamples: [] };

    expect(generationQualityFlags({ status: "complete", mode: "basics", traceJson: trace }).map((flag) => flag.code)).toEqual([
      "zero_citations",
      "stableenrich_all_failed",
      "high_source_rejection"
    ]);
  });

  it("flags analysis that completed without visible synthesis", () => {
    const visibleCard = { ...card(), synthesis: undefined };

    expect(generationQualityFlags({ status: "complete", mode: "analysis", traceJson: baseTrace(), card: visibleCard }).map((flag) => flag.code)).toContain(
      "no_synthesis_after_analysis"
    );
  });

  it("flags analysis runs that tried to synthesize without any evidence sources", () => {
    const trace = baseTrace();
    trace.providers = {
      directExa: { skipped: true, sourceCount: 0, failureCount: 0 },
      stableenrich: { sourceCount: 0, factCount: 0, failureCount: 0 },
      mergedSourceCount: 0
    };
    trace.sourceGate = { acceptedCount: 0, rejectedCount: 0, acceptedSamples: [], rejectedSamples: [] };
    trace.extraction = { sourceCount: 0, evidenceCount: 0, citationCount: 2, fallbackUsed: false };
    trace.synthesis = {
      required: true,
      produced: false,
      claimCountBeforeVerify: 12,
      claimCountAfterVerify: 0
    };

    expect(generationQualityFlags({ status: "failed", mode: "analysis", traceJson: trace }).map((flag) => flag.code)).toContain("zero_analysis_evidence");
  });

  it("flags completed cards backed only by enrichment/vendor citations", () => {
    const vendorOnly = card();
    vendorOnly.citations = [
      {
        id: "c1",
        url: "https://stableenrich.dev/api/apollo/org-enrich?domain=cartesia.ai",
        title: "Apollo org enrichment",
        fetchedAt: "2026-05-11T00:00:00.000Z",
        sourceType: "enrichment"
      },
      {
        id: "c2",
        url: "https://stableenrich.dev/api/hunter/domain-search?domain=cartesia.ai",
        title: "Hunter domain search",
        fetchedAt: "2026-05-11T00:00:00.000Z",
        sourceType: "enrichment"
      }
    ];

    expect(generationQualityFlags({ status: "complete", mode: "basics", traceJson: baseTrace(), card: vendorOnly }).map((flag) => flag.code)).toContain(
      "vendor_only_citations"
    );
  });

  it("flags completed cards that have citations but too few structured facts", () => {
    const underfilled = card();
    underfilled.identity.websiteUrl = { value: null, status: "unknown", confidence: "low", citationIds: [] };
    underfilled.identity.hq = { value: null, status: "unknown", confidence: "low", citationIds: [] };
    underfilled.identity.foundedYear = { value: null, status: "unknown", confidence: "low", citationIds: [] };
    underfilled.funding.totalRaisedUsd = { value: null, status: "unknown", confidence: "low", citationIds: [] };
    underfilled.team.headcount = { value: null, status: "unknown", confidence: "low", citationIds: [] };
    underfilled.comparables = [];

    expect(generationQualityFlags({ status: "complete", mode: "basics", traceJson: baseTrace(), card: underfilled }).map((flag) => flag.code)).toContain(
      "underfilled_public_profile"
    );
  });

  it("flags overview copy that bloats into product-page prose", () => {
    const bloated = card();
    bloated.identity.description = {
      ...bloated.identity.description!,
      value: {
        shortDescription:
          "Cartesia builds real-time voice AI infrastructure for developers. The platform includes multiple model families, APIs, deployment workflows, collaboration features, observability, and support tooling for teams across industries. It is designed to enhance every part of the voice application lifecycle.",
        concept: "Voice AI infrastructure.",
        serves: "Developers and enterprises.",
        mechanism: "APIs and models."
      }
    };

    expect(generationQualityFlags({ status: "complete", mode: "basics", traceJson: baseTrace(), card: bloated }).map((flag) => flag.code)).toContain(
      "bloated_overview"
    );
  });

  it("flags long steps", () => {
    const trace = baseTrace();
    trace.steps = {
      "plan-research": { status: "complete", durationMs: 31_000 },
      "generate-card": { status: "complete", durationMs: 91_000 }
    };

    expect(generationQualityFlags({ status: "complete", mode: "analysis", traceJson: trace }).map((flag) => flag.code)).toEqual([
      "long_plan_step",
      "long_generate_step"
    ]);
  });

  it("formats quality flags for QA scripts", () => {
    expect(formatGenerationQualityFlags([])).toBe("ok");

    const flags = generationQualityFlags({ status: "complete", mode: "analysis", traceJson: null });
    expect(formatGenerationQualityFlags(flags)).toBe("missing_trace");
  });
});
