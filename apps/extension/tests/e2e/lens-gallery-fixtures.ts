import { createRequire } from "node:module";
import type { ColdStartCard } from "@cold-start/core";
import type { Page } from "@playwright/test";
import { fulfillJson, installChromeShim, mockExtensionApi } from "./fixtures";

const require = createRequire(import.meta.url);

// The 6 named fixture phases from the task brief. lens-gallery.spec.ts renders one screenshot
// per phase, in this order, against the fixture gallery mount (the existing sidepanel.html
// harness via vite.sidepanel.config.ts, driven by the same chrome-shim + route-mock convention
// as tests/e2e/fixtures.ts). Later Phase 2 tasks screenshot this same gallery to iterate on the
// investor read card and its CSS.
export type LensGalleryPhaseId =
  | "read-full"
  | "read-sparse"
  | "withheld"
  | "withheld-advisory"
  | "running-events"
  | "failed"
  | "dossier";

export const LENS_GALLERY_PHASE_IDS: readonly LensGalleryPhaseId[] = [
  "read-full",
  "read-sparse",
  "withheld",
  "withheld-advisory",
  "running-events",
  "failed",
  "dossier"
];

function readFixtureCard(name: string): ColdStartCard {
  return structuredClone(require(`../fixtures/lens-phases/${name}.json`)) as ColdStartCard;
}

// read-full.json: a real prod card (baseten.co, pulled read-only 2026-07-20) with rich
// synthesis, mirrored verbatim. Public-tier plus gated synthesis, same as every other card the
// extension already renders; nothing here reaches the public site.
export function readFullCard(): ColdStartCard {
  return readFixtureCard("read-full");
}

// read-sparse.json: synthesis with 1 surviving bull claim, 0 bear claims (verifier-dropped),
// 1 open question. Exercises the honest-empty bear-case state.
export function readSparseCard(): ColdStartCard {
  return readFixtureCard("read-sparse");
}

// withheld.json: synthesisWithheld with reasons ["citation-floor"] (5 citations, floor is 8)
// and no synthesis field at all.
export function withheldCard(): ColdStartCard {
  return readFixtureCard("withheld");
}

// withheld-advisory.json: HAS synthesis (a successful run clears any withheld record), no
// synthesisWithheld. Every non-enrichment citation is sourceType "news", so
// synthesisEvidenceSignals(card).nonEnrichmentSourceTypes is exactly ["news"] (length 1): the
// evidence composition a future posture line would read as "single-source-class". See the
// lens-gallery-fixtures.test.ts assertion that checks this directly.
export function withheldAdvisoryCard(): ColdStartCard {
  return readFixtureCard("withheld-advisory");
}

// failed.json: a normal public-tier card (no synthesis, no synthesisWithheld) paired at mount
// time with an analysis run status of "failed", the "run-status failure with an existing card"
// case from the brief.
export function failedCard(): ColdStartCard {
  return readFixtureCard("failed");
}

// dossier.json: task 4.2's content-hierarchy and size-budget fixture. 6 people (mirroring the
// read-full baseten fixture's people shapes): Mara Voss (rich read past the 3-line clamp,
// observed email, GitHub + X channels) and Idris Kanu (no read, inferred email with a basis,
// a site channel) sit in the 4 visible primary rows alongside 2 filler execs; 2 more filler
// execs sit behind the "+2 more" overflow chip, exercising the measured-height expansion in
// the same phase.
export function dossierCard(): ColdStartCard {
  return readFixtureCard("dossier");
}

export type LensGalleryRunningEvent = {
  id: string;
  runId: string;
  slug: string;
  domain: string;
  sectionId: string | null;
  type: string;
  message: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

// running-events.json: the real deepinfra.com 2026-07-20 analysis run's 6 events
// (research_run_events, read-only prod query), plus a synthetic 3-event tail
// (synthesis.started, verify.started, verify.complete) inserted into the real ~50s gap between
// source.found and card.saved. Task 5.2 now emits these three event types for real (see
// apps/web/src/inngest/functions.ts); the survivor-count metadata shape on this fixture's
// verify.complete row was corrected in Task 5.5 to match that real payload
// (metadata.claimCount), which the original fixture omitted. Task 5.5 also closed the
// resumeAnalysisWithController/runAnalysisGenerationWithController gap that used to drop these
// events on the floor, so AnalysisWaitInstrument (research/AnalysisWaitInstrument.tsx, which
// replaced ResearchLayerPanel's old LensRunningCard) now renders a real, event-driven stage list
// from this fixture.
export function runningEvents(): LensGalleryRunningEvent[] {
  return structuredClone(require("../fixtures/lens-phases/running-events.json")) as LensGalleryRunningEvent[];
}

// The analysis run's startedAt feeds a live wall-clock elapsed-seconds ticker in
// AnalysisWaitInstrument (formatElapsed(Date.now() - startedAt)), a presentation-only value
// distinct from running-events.json's frozen event timestamps above. Anchoring it to the real prod
// timestamp would make the gallery screenshot show an ever-growing, increasingly absurd elapsed
// time on every later run; anchoring it to "now minus a fixed offset" instead keeps the
// screenshot readable regardless of when the gallery runs, matching the
// `new Date(Date.now() - 30_000).toISOString()` convention already used for running-state
// fixtures in tests/e2e/sidepanel-ui.spec.ts.
function runningStartedAt(): string {
  return new Date(Date.now() - 42_000).toISOString();
}

// Gallery-only companion card for the running-events phase. Not one of the 6 named fixture
// files (running-events.json is event data only): a card an in-progress analysis run needs to
// resume against (hasUsablePublicProfile, no synthesis yet). Built from the same deepinfra prod
// dump as running-events.json so the two stay consistent; unconfirmed facts (hq, founded year,
// investor list) are left null rather than invented.
export function deepinfraRunningCard(): ColdStartCard {
  return {
    slug: "deepinfra",
    domain: "deepinfra.com",
    generatedAt: "2026-07-20T16:39:28.705Z",
    generationCostUsd: 0.0076,
    cacheStatus: "hit",
    identity: {
      name: { value: "DeepInfra", status: "verified", confidence: "high", citationIds: ["d1"] },
      websiteUrl: { value: "https://deepinfra.com/", status: "verified", confidence: "high", citationIds: ["d1"] },
      logoUrl: null,
      oneLiner: {
        value: "DeepInfra runs low-cost serverless inference for open-source AI models.",
        status: "verified",
        confidence: "high",
        citationIds: ["d1"]
      },
      hq: { value: null, status: "unknown", confidence: "low", citationIds: [] },
      foundedYear: { value: null, status: "unknown", confidence: "low", citationIds: [] },
      status: "private"
    },
    funding: {
      totalRaisedUsd: { value: null, status: "unknown", confidence: "low", citationIds: [] },
      lastRound: {
        value: { name: "Series B", amountUsd: 107000000, announcedAt: "2026-05-06", leadInvestors: [] },
        status: "verified",
        confidence: "high",
        citationIds: ["d2"]
      },
      investors: { value: null, status: "unknown", confidence: "low", citationIds: [] }
    },
    team: {
      founders: {
        value: [
          { name: "Nikola Borisov", role: "Co-founder & CEO", sourceUrl: "https://linkedin.com/in/nikola-borisov", email: null }
        ],
        status: "verified",
        confidence: "medium",
        citationIds: ["d5"]
      },
      keyExecs: { value: null, status: "unknown", confidence: "low", citationIds: [] },
      headcount: { value: null, status: "unknown", confidence: "low", citationIds: [] }
    },
    signals: [
      {
        title: "AI cloud DeepInfra raises $107m in Series B funding round",
        url: "https://www.datacenterdynamics.com/en/news/ai-cloud-deepinfra-raises-107m-in-series-b-funding-round/",
        date: "2026-05-06",
        source: "DatacenterDynamics",
        category: "funding",
        citationIds: ["d2"]
      }
    ],
    comparables: [
      { name: "Together AI", domain: "together.ai", oneLiner: "Cloud platform for running and fine-tuning open-source AI models." }
    ],
    citations: [
      { id: "d1", url: "https://deepinfra.com/", title: "DeepInfra", fetchedAt: "2026-07-20T16:38:33.771Z", sourceType: "company_site" },
      {
        id: "d2",
        url: "https://www.datacenterdynamics.com/en/news/ai-cloud-deepinfra-raises-107m-in-series-b-funding-round/",
        title: "AI cloud DeepInfra raises $107m in Series B funding round - DCD",
        fetchedAt: "2026-07-20T16:38:33.771Z",
        sourceType: "news"
      },
      {
        id: "d3",
        url: "https://deepinfra.com/blog/18m-milestone",
        title: "A Milestone on Our Journey Building DeepInfra and Scaling Open Source AI Infrastructure",
        fetchedAt: "2026-07-20T16:38:33.771Z",
        sourceType: "company_site"
      },
      {
        id: "d4",
        url: "https://www.hpcwire.com/aiwire/2026/05/06/deepinfra-closes-107m-series-b-to-power-production-scale-ai-inference/",
        title: "AIwire - Covering Scientific & Technical AI",
        fetchedAt: "2026-07-20T16:38:33.771Z",
        sourceType: "news"
      },
      { id: "d5", url: "https://linkedin.com/in/nikola-borisov", title: "Nikola Borisov", fetchedAt: "2026-07-20T16:38:33.771Z", sourceType: "enrichment" }
    ]
  };
}

async function installStaticProfile(page: Page, card: ColdStartCard) {
  await installChromeShim(page, { activeDomain: card.domain });
  await mockExtensionApi(page, card);
}

// failed.json needs a distinct run status ("failed", not the idle default mockExtensionApi
// sends) so the panel renders the run-failed receipt over the existing card, per the
// LENS_RUN_FAILED_NOTICE branch in sidepanel.tsx's bootstrap resolution.
async function installFailedRun(page: Page, card: ColdStartCard) {
  await installChromeShim(page, { activeDomain: card.domain });
  await page.route("**/api/extension/bootstrap?**", async (route) => {
    await fulfillJson(route, {
      domain: card.domain,
      slug: card.slug,
      card,
      runs: {
        basics: { slug: card.slug, domain: card.domain, mode: "basics", status: "complete" },
        analysis: { slug: card.slug, domain: card.domain, mode: "analysis", status: "failed", error: "Investor Lens run failed." }
      }
    });
  });
  await page.route("**/api/extension/cards/**", async (route) => {
    await fulfillJson(route, card);
  });
  await page.route("**/api/generate?**", async (route) => {
    const url = new URL(route.request().url());
    await fulfillJson(route, {
      slug: card.slug,
      domain: url.searchParams.get("domain") ?? card.domain,
      status: "idle",
      mode: url.searchParams.get("mode") ?? "basics"
    });
  });
}

// running-events.json needs an active analysis run (status "running") so the panel resumes
// into the analysisRun state instead of the static idle/idle profile the other phases use.
async function installRunningAnalysis(page: Page, card: ColdStartCard, events: LensGalleryRunningEvent[]) {
  const startedAt = runningStartedAt();
  await installChromeShim(page, { activeDomain: card.domain });
  await page.route("**/api/extension/bootstrap?**", async (route) => {
    await fulfillJson(route, {
      domain: card.domain,
      slug: card.slug,
      card,
      events,
      runs: {
        basics: { slug: card.slug, domain: card.domain, mode: "basics", status: "complete" },
        analysis: { slug: card.slug, domain: card.domain, mode: "analysis", status: "running", startedAt, events }
      }
    });
  });
  await page.route("**/api/extension/cards/**", async (route) => {
    await fulfillJson(route, card);
  });
  await page.route("**/api/generate?**", async (route) => {
    const url = new URL(route.request().url());
    await fulfillJson(route, {
      slug: card.slug,
      domain: url.searchParams.get("domain") ?? card.domain,
      status: "running",
      mode: url.searchParams.get("mode") ?? "analysis",
      startedAt,
      events
    });
  });
}

// Installs the chrome shim and network mocks for one gallery phase against the shared
// sidepanel.html mount, and returns the domain the spec should navigate the panel to
// (via chrome.storage.session.activeDomain, already seeded by installChromeShim above).
export async function installLensGalleryPhase(page: Page, phaseId: LensGalleryPhaseId): Promise<string> {
  switch (phaseId) {
    case "read-full": {
      const card = readFullCard();
      await installStaticProfile(page, card);
      return card.domain;
    }
    case "read-sparse": {
      const card = readSparseCard();
      await installStaticProfile(page, card);
      return card.domain;
    }
    case "withheld": {
      const card = withheldCard();
      await installStaticProfile(page, card);
      return card.domain;
    }
    case "withheld-advisory": {
      const card = withheldAdvisoryCard();
      await installStaticProfile(page, card);
      return card.domain;
    }
    case "failed": {
      const card = failedCard();
      await installFailedRun(page, card);
      return card.domain;
    }
    case "dossier": {
      const card = dossierCard();
      await installStaticProfile(page, card);
      return card.domain;
    }
    case "running-events": {
      const card = deepinfraRunningCard();
      await installRunningAnalysis(page, card, runningEvents());
      return card.domain;
    }
    default: {
      const exhaustive: never = phaseId;
      throw new Error(`Unhandled lens gallery phase: ${String(exhaustive)}`);
    }
  }
}
