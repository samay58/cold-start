import { type AlphaEvent, type ColdStartCard, type ResearchSection } from "@cold-start/core";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, vi } from "vitest";
import { cardForDomain, jsonResponse } from "./test-stubs";

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

// Re-exported so existing `from "./sidepanel-harness"` imports keep working; the builder itself
// lives in test-stubs.ts, the environment-agnostic module background.test.ts and card-cache.test.ts
// (both non-jsdom) import directly instead of pulling react-dom/client in through this file.
export { cardForDomain, jsonResponse };

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

export function stubReducedMotion(matches = false) {
  vi.stubGlobal("matchMedia", vi.fn(() => ({
    addEventListener: vi.fn(),
    addListener: vi.fn(),
    dispatchEvent: vi.fn(),
    matches,
    media: "(prefers-reduced-motion: reduce)",
    onchange: null,
    removeEventListener: vi.fn(),
    removeListener: vi.fn()
  })));
}

export function stubChromeStorage() {
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        get: (_keys: string | string[], callback: (items: Record<string, unknown>) => void) => callback({}),
        set: (_items: Record<string, unknown>, callback?: () => void) => callback?.()
      },
      session: {
        get: (_keys: string | string[], callback: (items: Record<string, unknown>) => void) => callback({}),
        set: (_items: Record<string, unknown>, callback?: () => void) => callback?.()
      }
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
  Object.assign(storedLocal, {
    ...settings,
    coldStartAlphaEventQueueBlocked: "test_harness",
    ...input.storedSettings,
    ...storedLocal
  });
  const sessionItems: Record<string, unknown> = { activeDomain, ...input.initialSession };

  vi.stubGlobal("fetch", input.fetchMock);
  vi.stubGlobal("chrome", {
    runtime: {
      getManifest: () => ({ version: "0.1.0" }),
      id: "extension-test-id"
    },
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
    alphaEvents() {
      const queue = storedLocal.coldStartAlphaEventQueue;
      if (!Array.isArray(queue)) {
        return [];
      }
      return queue.flatMap((item) => {
        if (!item || typeof item !== "object" || !("event" in item)) {
          return [];
        }
        return [(item as { event: AlphaEvent }).event];
      });
    },
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
