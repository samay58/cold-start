import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ProviderSource } from "@cold-start/providers";
import type { StoredSource } from "@cold-start/db";

import type { webEnv } from "../src/lib/web-env";

// Task 5.3: ANALYSIS_SOURCE_REFRESH gates the unconditional 13-probe stableenrich re-fetch on the
// analysis reuseExistingForAnalysis branch. analysisSourceFetchPlan is the pure routing decision
// (mode/freshness/flag in, plan out); fetchInitialSourcesForGeneration is the wiring that actually
// swaps which stableenrich call runs. Direct Exa is unaffected by the plan in every branch: only
// the AgentCash-billed stableenrich probes are gated.

const mocks = vi.hoisted(() => ({
  fetchDirectExaFundamentalsSources: vi.fn(),
  fetchStableenrichFastSources: vi.fn(),
  fetchStableenrichSources: vi.fn(),
  fetchStableenrichEnrichmentSources: vi.fn()
}));

vi.mock("@cold-start/providers", async () => {
  const actual = await vi.importActual<typeof import("@cold-start/providers")>("@cold-start/providers");
  return {
    ...actual,
    fetchDirectExaFundamentalsSources: mocks.fetchDirectExaFundamentalsSources,
    fetchStableenrichFastSources: mocks.fetchStableenrichFastSources,
    fetchStableenrichSources: mocks.fetchStableenrichSources,
    fetchStableenrichEnrichmentSources: mocks.fetchStableenrichEnrichmentSources
  };
});

import {
  analysisSourceFetchPlan,
  fetchInitialSourcesForGeneration,
  providerSourcesFromStoredSources,
  stableenrichLateEnrichmentSkipsForBlocks
} from "../src/inngest/source-fetching";

describe("analysisSourceFetchPlan", () => {
  // The six-way matrix: three ANALYSIS_SOURCE_REFRESH values x fresh/stale signals, all on the
  // reuseExistingForAnalysis branch (the only branch the flag can affect).
  const matrix: Array<{
    refreshMode: "full" | "targeted" | "skip-fresh";
    signalsFresh: boolean;
    expectedKind: "full" | "targeted" | "skip";
  }> = [
    { refreshMode: "full", signalsFresh: true, expectedKind: "full" },
    { refreshMode: "full", signalsFresh: false, expectedKind: "full" },
    { refreshMode: "targeted", signalsFresh: true, expectedKind: "targeted" },
    { refreshMode: "targeted", signalsFresh: false, expectedKind: "targeted" },
    { refreshMode: "skip-fresh", signalsFresh: true, expectedKind: "skip" },
    { refreshMode: "skip-fresh", signalsFresh: false, expectedKind: "targeted" }
  ];

  it.each(matrix)(
    "reuseExistingForAnalysis=true, refreshMode=$refreshMode, signalsFresh=$signalsFresh -> $expectedKind",
    ({ refreshMode, signalsFresh, expectedKind }) => {
      expect(analysisSourceFetchPlan({ reuseExistingForAnalysis: true, signalsFresh, refreshMode })).toEqual({
        kind: expectedKind
      });
    }
  );

  it.each(matrix)(
    "reuseExistingForAnalysis=false always returns full regardless of refreshMode=$refreshMode, signalsFresh=$signalsFresh",
    ({ refreshMode, signalsFresh }) => {
      expect(analysisSourceFetchPlan({ reuseExistingForAnalysis: false, signalsFresh, refreshMode })).toEqual({
        kind: "full"
      });
    }
  );
});

describe("fetchInitialSourcesForGeneration - ANALYSIS_SOURCE_REFRESH plan wiring", () => {
  const domain = "modal.com";
  const researchPlan = { searchQueries: {} };

  const directSource: ProviderSource = {
    url: "https://modal.com",
    title: "Modal",
    sourceType: "company_site",
    intent: "company_profile",
    fetchedAt: "2026-07-20T00:00:00.000Z",
    rawText: "Modal runs serverless compute for AI teams."
  };
  const stableSource: ProviderSource = {
    url: "https://modal.com/blog/launch",
    title: "Modal launch",
    sourceType: "news",
    intent: "recent_signals",
    fetchedAt: "2026-07-20T00:00:00.000Z",
    rawText: "Modal launched a new inference product."
  };
  const storedSource: StoredSource = {
    url: "https://modal.com/about",
    title: "About Modal",
    sourceType: "company_site",
    fetchedAt: "2026-06-01T00:00:00.000Z",
    rawText: "Modal is a serverless compute platform.",
    imageUrl: null
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchDirectExaFundamentalsSources.mockResolvedValue({
      sources: [directSource],
      failures: [],
      skipped: false,
      requestCount: 1,
      estimatedCostUsd: 0.007
    });
    mocks.fetchStableenrichSources.mockResolvedValue({ sources: [stableSource], facts: [], failures: [], endpoints: [] });
    mocks.fetchStableenrichEnrichmentSources.mockResolvedValue({ sources: [stableSource], facts: [], failures: [], endpoints: [] });
    mocks.fetchStableenrichFastSources.mockResolvedValue({ sources: [stableSource], facts: [], failures: [], endpoints: [] });
  });

  // Both internal call sites in fetchInitialSourcesForGeneration (the CHEAP_FIRST_EXA_ENABLED
  // branch and the Promise.allSettled fallback) route through the same plan; exercise both.
  for (const cheapFirst of [true, false]) {
    describe(`CHEAP_FIRST_EXA_ENABLED=${cheapFirst}`, () => {
      const runtimeEnv = { CHEAP_FIRST_EXA_ENABLED: cheapFirst } as unknown as ReturnType<typeof webEnv>;

      it("plan full calls fetchStableenrichSources (today's unconditional 13-probe path); Direct Exa runs normally", async () => {
        const result = await fetchInitialSourcesForGeneration({
          mode: "analysis",
          domain,
          researchPlan,
          runtimeEnv,
          stableEnv: {},
          directExaEnv: {},
          agentcashBudgetCeiling: null,
          analysisSourceFetch: { kind: "full" }
        });

        expect(mocks.fetchStableenrichSources).toHaveBeenCalledTimes(1);
        expect(mocks.fetchStableenrichEnrichmentSources).not.toHaveBeenCalled();
        expect(mocks.fetchStableenrichFastSources).not.toHaveBeenCalled();
        expect(mocks.fetchDirectExaFundamentalsSources).toHaveBeenCalledTimes(1);
        expect(result.trace.providers.stableenrich.analysisSourceRefresh).toBe("full");
        expect(result.error).toBeNull();
      });

      it("plan targeted calls fetchStableenrichEnrichmentSources with the 3-probe signals skip list, never the full path", async () => {
        const result = await fetchInitialSourcesForGeneration({
          mode: "analysis",
          domain,
          researchPlan,
          runtimeEnv,
          stableEnv: {},
          directExaEnv: {},
          agentcashBudgetCeiling: null,
          analysisSourceFetch: { kind: "targeted" }
        });

        expect(mocks.fetchStableenrichSources).not.toHaveBeenCalled();
        expect(mocks.fetchStableenrichFastSources).not.toHaveBeenCalled();
        expect(mocks.fetchStableenrichEnrichmentSources).toHaveBeenCalledTimes(1);
        expect(mocks.fetchStableenrichEnrichmentSources).toHaveBeenCalledWith(
          expect.objectContaining({
            skipProbeNames: stableenrichLateEnrichmentSkipsForBlocks(["signals"])
          })
        );
        expect(mocks.fetchDirectExaFundamentalsSources).toHaveBeenCalledTimes(1);
        expect(result.trace.providers.stableenrich.analysisSourceRefresh).toBe("targeted");
        expect(result.error).toBeNull();
      });

      it("plan skip makes no stableenrich call at all and substitutes stored sources; Direct Exa still runs", async () => {
        const loadStoredSourcesForSkip = vi.fn(async () => providerSourcesFromStoredSources([storedSource]));

        const result = await fetchInitialSourcesForGeneration({
          mode: "analysis",
          domain,
          researchPlan,
          runtimeEnv,
          stableEnv: {},
          directExaEnv: {},
          agentcashBudgetCeiling: null,
          analysisSourceFetch: { kind: "skip" },
          loadStoredSourcesForSkip
        });

        expect(mocks.fetchStableenrichSources).not.toHaveBeenCalled();
        expect(mocks.fetchStableenrichEnrichmentSources).not.toHaveBeenCalled();
        expect(mocks.fetchStableenrichFastSources).not.toHaveBeenCalled();
        expect(loadStoredSourcesForSkip).toHaveBeenCalledTimes(1);
        expect(mocks.fetchDirectExaFundamentalsSources).toHaveBeenCalledTimes(1);
        expect(result.trace.providers.stableenrich.analysisSourceRefresh).toBe("skip");
        expect(result.trace.providers.stableenrich.sourceCount).toBe(1);
        expect(result.providerFacts).toEqual([]);
        expect(result.error).toBeNull();

        // Citation-merge input shape: this is exactly what functions.ts's fetch-sources step feeds
        // downstream into sectionsWithSourceCitations(existingCard, sources) on the reuse branch.
        // The stored row must survive the round trip through providerSourcesFromStoredSources and
        // the source gate as a real ProviderSource, not a StoredSource or a partial shape.
        expect(result.sources).toContainEqual({
          url: storedSource.url,
          title: storedSource.title,
          sourceType: storedSource.sourceType,
          fetchedAt: storedSource.fetchedAt,
          rawText: storedSource.rawText,
          imageUrl: storedSource.imageUrl
        });
      });

      it("mode basics ignores the plan entirely and always uses the fast tier", async () => {
        const loadStoredSourcesForSkip = vi.fn(async () => providerSourcesFromStoredSources([storedSource]));

        const result = await fetchInitialSourcesForGeneration({
          mode: "basics",
          domain,
          researchPlan,
          runtimeEnv,
          stableEnv: {},
          directExaEnv: {},
          agentcashBudgetCeiling: null,
          analysisSourceFetch: { kind: "skip" },
          loadStoredSourcesForSkip
        });

        expect(mocks.fetchStableenrichFastSources).toHaveBeenCalledTimes(1);
        expect(mocks.fetchStableenrichSources).not.toHaveBeenCalled();
        expect(mocks.fetchStableenrichEnrichmentSources).not.toHaveBeenCalled();
        expect(loadStoredSourcesForSkip).not.toHaveBeenCalled();
        // Absent, not "full": basics never carried this field before Task 5.3 and the plan never
        // applies there, so the trace should not grow a new field on every basics run.
        expect(result.trace.providers.stableenrich.analysisSourceRefresh).toBeUndefined();
      });
    });
  }

  it("omitting analysisSourceFetch behaves exactly like plan full (the unpromoted default)", async () => {
    const runtimeEnv = { CHEAP_FIRST_EXA_ENABLED: true } as unknown as ReturnType<typeof webEnv>;

    const result = await fetchInitialSourcesForGeneration({
      mode: "analysis",
      domain,
      researchPlan,
      runtimeEnv,
      stableEnv: {},
      directExaEnv: {},
      agentcashBudgetCeiling: null
    });

    expect(mocks.fetchStableenrichSources).toHaveBeenCalledTimes(1);
    expect(result.trace.providers.stableenrich.analysisSourceRefresh).toBe("full");
  });

  describe("zero accepted sources", () => {
    const runtimeEnv = { CHEAP_FIRST_EXA_ENABLED: false } as unknown as ReturnType<typeof webEnv>;

    beforeEach(() => {
      // Both providers come back empty: Direct Exa disabled/no results, and (for the reuse case)
      // the stored-source substitute for a skip-fresh plan is also empty.
      mocks.fetchDirectExaFundamentalsSources.mockResolvedValue({
        sources: [],
        failures: [],
        skipped: false,
        requestCount: 1,
        estimatedCostUsd: 0
      });
      mocks.fetchStableenrichSources.mockResolvedValue({ sources: [], facts: [], failures: [], endpoints: [] });
      mocks.fetchStableenrichEnrichmentSources.mockResolvedValue({ sources: [], facts: [], failures: [], endpoints: [] });
      mocks.fetchStableenrichFastSources.mockResolvedValue({ sources: [], facts: [], failures: [], endpoints: [] });
    });

    it("reuse mode (skip-fresh plan) proceeds with the reused extraction instead of erroring when the stored-source substitute and Direct Exa are both empty", async () => {
      const loadStoredSourcesForSkip = vi.fn(async () => []);

      const result = await fetchInitialSourcesForGeneration({
        mode: "analysis",
        domain,
        researchPlan,
        runtimeEnv,
        stableEnv: {},
        directExaEnv: {},
        agentcashBudgetCeiling: null,
        analysisSourceFetch: { kind: "skip" },
        loadStoredSourcesForSkip,
        reuseExistingForAnalysis: true
      });

      // sectionsWithSourceCitations(existingCard, []) is a no-op over an already-usable card
      // (functions.ts's extractSectionsForCard reuse branch): zero fresh sources to merge in is
      // fine, since the reused card's own citations already satisfied hasInvestorUsableProfile.
      expect(result.error).toBeNull();
      expect(result.sources).toEqual([]);
    });

    it("non-reuse mode (full plan) still errors on zero accepted sources: there is no existing card to fall back on", async () => {
      const result = await fetchInitialSourcesForGeneration({
        mode: "analysis",
        domain,
        researchPlan,
        runtimeEnv,
        stableEnv: {},
        directExaEnv: {},
        agentcashBudgetCeiling: null,
        analysisSourceFetch: { kind: "full" },
        reuseExistingForAnalysis: false
      });

      expect(result.error).toMatch(/^No accepted provider sources returned/);
      expect(result.sources).toEqual([]);
    });

    it("reuse mode still errors when reuseExistingForAnalysis is omitted (default false, matching the pre-fix contract)", async () => {
      const loadStoredSourcesForSkip = vi.fn(async () => []);

      const result = await fetchInitialSourcesForGeneration({
        mode: "analysis",
        domain,
        researchPlan,
        runtimeEnv,
        stableEnv: {},
        directExaEnv: {},
        agentcashBudgetCeiling: null,
        analysisSourceFetch: { kind: "skip" },
        loadStoredSourcesForSkip
      });

      expect(result.error).toMatch(/^No accepted provider sources returned/);
    });
  });
});
