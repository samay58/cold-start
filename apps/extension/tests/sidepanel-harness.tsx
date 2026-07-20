import { COLD_START_API_CONTRACT_HEADER, COLD_START_API_CONTRACT_VERSION, type ColdStartCard, type ResearchSection } from "@cold-start/core";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, vi } from "vitest";

type StorageListener = (
  changes: Record<string, chrome.storage.StorageChange>,
  areaName: string
) => void;

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

export const legacyAnalysisLabel = ["Ana", "lyze"].join("");

export const futureCardTitles = [
  "Business Model & Unit Economics",
  "Team & Execution",
  "Strategic Relevance"
];

export const settings = {
  coldStartApiOrigin: "http://localhost:3000",
  coldStartApiToken: "token-123"
};

function companyNameFromDomain(domain: string) {
  const root = domain.replace(/^www\./i, "").split(".")[0] ?? domain;
  return root
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ") || domain;
}

export function cardForDomain(domain: string): ColdStartCard {
  return {
    slug: domain.split(".")[0] ?? domain,
    domain,
    generatedAt: "2026-05-07T12:00:00.000Z",
    generationCostUsd: 0,
    cacheStatus: "hit",
    identity: {
      name: { value: companyNameFromDomain(domain), status: "verified", confidence: "high", citationIds: ["c1"] },
      websiteUrl: { value: `https://${domain}/`, status: "verified", confidence: "high", citationIds: ["c1"] },
      logoUrl: null,
      oneLiner: { value: "Cached company card", status: "verified", confidence: "high", citationIds: ["c1"] },
      hq: { value: { city: "San Francisco", country: "United States" }, status: "verified", confidence: "medium", citationIds: ["c1"] },
      foundedYear: { value: 2023, status: "verified", confidence: "medium", citationIds: ["c1"] },
      status: "private"
    },
    funding: {
      totalRaisedUsd: { value: null, status: "unknown", confidence: "low", citationIds: [] },
      lastRound: { value: null, status: "unknown", confidence: "low", citationIds: [] },
      investors: { value: null, status: "unknown", confidence: "low", citationIds: [] }
    },
    team: {
      founders: { value: [], status: "unknown", confidence: "low", citationIds: [] },
      keyExecs: { value: [], status: "unknown", confidence: "low", citationIds: [] },
      headcount: { value: { value: 64, asOf: "2026-05-14" }, status: "inferred", confidence: "low", citationIds: ["c1"] }
    },
    signals: [],
    comparables: [{ name: "Example Peer", domain: "peer.example", oneLiner: "Adjacent company." }],
    citations: [
      {
        id: "c1",
        url: `https://${domain}/`,
        title: domain,
        fetchedAt: "2026-05-07T12:00:00.000Z",
        sourceType: "company_site",
        snippet: "Cached company card"
      },
      {
        id: "c2",
        url: `https://news.example/${domain}/launch`,
        title: `${domain} launch coverage`,
        fetchedAt: "2026-05-07T12:00:00.000Z",
        sourceType: "news",
        snippet: "Independent coverage of the company."
      },
      {
        id: "c3",
        url: `https://registry.example/${domain}`,
        title: `${domain} registry profile`,
        fetchedAt: "2026-05-07T12:00:00.000Z",
        sourceType: "other",
        snippet: "Registry profile for the company."
      }
    ]
  };
}

export function noSourcePartialCard(domain: string): ColdStartCard {
  return {
    ...cardForDomain(domain),
    cacheStatus: "partial",
    identity: {
      ...cardForDomain(domain).identity,
      name: { value: domain, status: "unknown", confidence: "low", citationIds: [] },
      websiteUrl: { value: null, status: "unknown", confidence: "low", citationIds: [] },
      oneLiner: { value: null, status: "unknown", confidence: "low", citationIds: [] },
      hq: { value: null, status: "unknown", confidence: "low", citationIds: [] },
      foundedYear: { value: null, status: "unknown", confidence: "low", citationIds: [] }
    },
    funding: {
      totalRaisedUsd: { value: null, status: "unknown", confidence: "low", citationIds: [] },
      lastRound: { value: null, status: "unknown", confidence: "low", citationIds: [] },
      investors: { value: null, status: "unknown", confidence: "low", citationIds: [] }
    },
    team: {
      founders: { value: [], status: "unknown", confidence: "low", citationIds: [] },
      keyExecs: { value: [], status: "unknown", confidence: "low", citationIds: [] },
      headcount: { value: null, status: "unknown", confidence: "low", citationIds: [] }
    },
    comparables: [],
    citations: []
  };
}

export function cardWithManagement(domain: string): ColdStartCard {
  const base = cardForDomain(domain);

  return {
    ...base,
    identity: {
      ...base.identity,
      websiteUrl: { value: `https://${domain}/`, status: "verified", confidence: "high", citationIds: ["c1"] },
      hq: { value: { city: "San Francisco", country: "United States" }, status: "verified", confidence: "medium", citationIds: ["c1"] },
      foundedYear: { value: 2013, status: "verified", confidence: "medium", citationIds: ["c1"] },
      name: { value: "The Information", status: "verified", confidence: "high", citationIds: ["c1"] },
      oneLiner: { value: "Subscription-only tech journalism publication", status: "verified", confidence: "high", citationIds: ["c1"] }
    },
    team: {
      founders: {
        value: [{ name: "Jessica Lessin", role: "Founder", sourceUrl: `https://${domain}/about`, email: "jessica@theinformation.com" }],
        status: "verified",
        confidence: "medium",
        citationIds: ["c1"]
      },
      headcount: {
        value: { value: 87, asOf: "2026-04-26" },
        status: "inferred",
        confidence: "low",
        citationIds: ["c2"]
      },
      keyExecs: {
        value: [
          { name: "Jessica Lessin", role: "Founder & CEO (prev. reporter)", sourceUrl: `https://${domain}/team` },
          { name: "Jessica Lessin", role: "CEO", sourceUrl: `https://${domain}/team` },
          { name: "Matthew Resnick", role: "Chief operating officer", sourceUrl: "https://linkedin.com/in/matthew" },
          { name: "Amir Efrati", role: "Executive editor", sourceUrl: "https://linkedin.com/in/amir" }
        ],
        status: "verified",
        confidence: "medium",
        citationIds: ["c2"]
      }
    },
    citations: [
      ...base.citations,
      {
        id: "c2",
        url: "https://linkedin.com/company/the-information/",
        title: "The Information LinkedIn",
        fetchedAt: "2026-05-07T12:00:00.000Z",
        sourceType: "enrichment"
      }
    ]
  };
}

export function cardWithSynthesis(domain: string): ColdStartCard {
  return {
    ...cardForDomain(domain),
    synthesis: {
      whyItMatters: { text: "The company has a supported wedge [c1].", citationIds: ["c1"] },
      bullCase: [{ text: "Demand is visible in cited sources [c1].", citationIds: ["c1"] }],
      bearCase: [],
      openQuestions: [{ question: "Who owns the budget?", category: "buyer_budget" }]
    }
  };
}

export function jsonResponse(body: unknown, init?: ResponseInit) {
  const response = new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    ...init
  });
  response.headers.set(COLD_START_API_CONTRACT_HEADER, COLD_START_API_CONTRACT_VERSION);
  return response;
}

export function missingCardResponse() {
  return jsonResponse({ error: "card not found" }, { status: 404 });
}

export function testSection(domain: string, sectionId: ResearchSection["sectionId"], status: ResearchSection["status"]): ResearchSection {
  return {
    slug: domain.split(".")[0] ?? domain,
    domain,
    sectionId,
    visibility: sectionId === "market" || sectionId === "risks" || sectionId === "why_it_matters" ? "gated" : "public",
    status,
    content: null,
    citationIds: [],
    sourceIds: [],
    runId: null,
    error: null,
    generatedAt: null,
    staleAt: null
  };
}

export async function flushPromises() {
  await act(async () => {
    for (let index = 0; index < 10; index += 1) {
      await Promise.resolve();
    }
  });
}

export async function renderSidePanel(input: {
  domain: string;
  fetchMock: ReturnType<typeof vi.fn>;
  deferPinnedLayerGet?: boolean;
  initialSession?: Record<string, unknown>;
  storedLocal?: Record<string, unknown>;
  storedSettings?: Partial<typeof settings>;
}) {
  vi.resetModules();

  const listeners = new Set<StorageListener>();
  let activeDomain = input.domain;
  const storedLocal: Record<string, unknown> = input.storedLocal ?? {};
  Object.assign(storedLocal, { ...settings, ...input.storedSettings, ...storedLocal });
  const sessionItems: Record<string, unknown> = { activeDomain, ...input.initialSession };

  vi.stubGlobal("fetch", input.fetchMock);
  vi.stubGlobal("chrome", {
    runtime: { id: "extension-test-id" },
    storage: {
      local: {
        get: (
          keys: string | readonly string[] | Record<string, unknown> | null,
          callback: (items: Record<string, unknown>) => void
        ) => {
          const respond = () => {
            if (keys === null) {
              callback({ ...storedLocal });
              return;
            }
            if (typeof keys === "string") {
              callback({ [keys]: storedLocal[keys] });
              return;
            }
            if (Array.isArray(keys)) {
              callback(Object.fromEntries(keys.map((key) => [key, storedLocal[key]])));
              return;
            }
            const defaults = keys as Record<string, unknown>;
            callback(Object.fromEntries(Object.keys(defaults).map((key) => [key, storedLocal[key] ?? defaults[key]])));
          };

          if (input.deferPinnedLayerGet && Array.isArray(keys) && keys.includes("coldStartPinnedResearchLayers")) {
            window.setTimeout(respond, 0);
            return;
          }

          respond();
        },
        set: (items: Record<string, unknown>, callback?: () => void) => {
          Object.assign(storedLocal, items);
          callback?.();
        },
        remove: (keys: string | string[], callback?: () => void) => {
          for (const key of Array.isArray(keys) ? keys : [keys]) {
            delete storedLocal[key];
          }
          callback?.();
        }
      },
      session: {
        get: (
          keys: string | readonly string[] | Record<string, unknown> | null,
          callback: (items: Record<string, unknown>) => void
        ) => {
          if (keys === null) {
            callback({ ...sessionItems });
            return;
          }
          if (typeof keys === "string") {
            callback({ [keys]: sessionItems[keys] });
            return;
          }
          if (Array.isArray(keys)) {
            callback(Object.fromEntries(keys.map((key) => [key, sessionItems[key]])));
            return;
          }
          const defaults = keys as Record<string, unknown>;
          callback(Object.fromEntries(Object.keys(defaults).map((key) => [key, sessionItems[key] ?? defaults[key]])));
        },
        set: (items: Record<string, unknown>, callback?: () => void) => {
          Object.assign(sessionItems, items);
          callback?.();
        },
        remove: (keys: string | string[], callback?: () => void) => {
          for (const key of Array.isArray(keys) ? keys : [keys]) {
            delete sessionItems[key];
          }
          callback?.();
        }
      },
      onChanged: {
        addListener: (listener: StorageListener) => listeners.add(listener),
        removeListener: (listener: StorageListener) => listeners.delete(listener)
      }
    }
  });

  const container = document.createElement("div");
  document.body.append(container);
  const { SidePanel } = await import("../src/sidepanel");
  await import("../src/research/ResearchLayerPanel");
  await import("../src/research/SourcePassInstrument");
  const root = createRoot(container);

  await act(async () => {
    root.render(<SidePanel />);
  });
  await flushPromises();

  return {
    container,
    async changeDomain(nextDomain: string) {
      const oldValue = activeDomain;
      activeDomain = nextDomain;
      sessionItems.activeDomain = nextDomain;
      await act(async () => {
        for (const listener of listeners) {
          listener({ activeDomain: { oldValue, newValue: nextDomain } }, "session");
        }
      });
      await flushPromises();
      // The presence-gated panel swap (loading -> gate) needs a real frame to commit,
      // not just drained microtasks.
      await act(async () => {
        if (vi.isFakeTimers()) {
          await vi.advanceTimersByTimeAsync(50);
        } else {
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      });
      await flushPromises();
    },
    async unmount() {
      await act(async () => {
        root.unmount();
      });
      await flushPromises();
    }
  };
}

export function generateCalls(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.filter(([url, init]) => {
    return String(url).endsWith("/api/generate") && (init as RequestInit | undefined)?.method === "POST";
  });
}

export function interactiveControls(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>("button, [role='button']"));
}

export function expectSignal(value: AbortSignal | null): asserts value is AbortSignal {
  expect(value).toBeTruthy();
}

export function registerSidePanelHooks() {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    document.body.innerHTML = "";
    class TestPointerEvent extends MouseEvent {
      pointerId: number;

      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 1;
      }
    }
    vi.stubGlobal("PointerEvent", TestPointerEvent);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
}
