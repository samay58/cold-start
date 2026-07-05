// @vitest-environment jsdom

import { COLD_START_API_CONTRACT_HEADER, COLD_START_API_CONTRACT_VERSION, type ColdStartCard, type ResearchSection } from "@cold-start/core";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type StorageListener = (
  changes: Record<string, chrome.storage.StorageChange>,
  areaName: string
) => void;

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

const legacyAnalysisLabel = ["Ana", "lyze"].join("");
const futureCardTitles = [
  "Business Model & Unit Economics",
  "Team & Execution",
  "Strategic Relevance"
];

const settings = {
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

function cardForDomain(domain: string): ColdStartCard {
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

function noSourcePartialCard(domain: string): ColdStartCard {
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

function cardWithManagement(domain: string): ColdStartCard {
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

function cardWithSynthesis(domain: string): ColdStartCard {
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

function cardWithMarketSynthesis(domain: string): ColdStartCard {
  return {
    ...cardWithSynthesis(domain),
    synthesis: {
      ...cardWithSynthesis(domain).synthesis!,
      marketStructureAndTiming: {
        buyerBudget: null,
        painSeverity: null,
        adoptionTrigger: null,
        marketStructure: null,
        profitPool: null,
        expansionPath: null,
        timingRisk: null
      }
    }
  };
}

function jsonResponse(body: unknown, init?: ResponseInit) {
  const response = new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    ...init
  });
  response.headers.set(COLD_START_API_CONTRACT_HEADER, COLD_START_API_CONTRACT_VERSION);
  return response;
}

function missingCardResponse() {
  return jsonResponse({ error: "card not found" }, { status: 404 });
}

function testSection(domain: string, sectionId: ResearchSection["sectionId"], status: ResearchSection["status"]): ResearchSection {
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

async function flushPromises() {
  await act(async () => {
    for (let index = 0; index < 10; index += 1) {
      await Promise.resolve();
    }
  });
}

async function renderSidePanel(input: {
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
  await import("../src/ResearchLayerPanel");
  await import("../src/SourcePassInstrument");
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

function generateCalls(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.filter(([url, init]) => {
    return String(url).endsWith("/api/generate") && (init as RequestInit | undefined)?.method === "POST";
  });
}

function interactiveControls(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>("button, [role='button']"));
}

function expectSignal(value: AbortSignal | null): asserts value is AbortSignal {
  expect(value).toBeTruthy();
}

describe("SidePanel generation gate", () => {
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

  it("waits for the user before generating a missing-card domain", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith("/api/generate") && init?.method === "POST") {
        return jsonResponse({ slug: "amazon", status: "queued", mode: "basics" }, { status: 202 });
      }

      return fetchMock.mock.calls.some(([calledUrl]) => String(calledUrl).endsWith("/api/generate"))
        ? jsonResponse(cardForDomain("amazon.com"))
        : missingCardResponse();
    });
    const { container, unmount } = await renderSidePanel({ domain: "amazon.com", fetchMock });

    expect(generateCalls(fetchMock)).toHaveLength(0);
    // The intake status slot renders empty; there is no "No profile" chip to earn its space.
    expect(container.textContent).not.toContain("No profile");
    // The scope statement appears once, from the intake note; the module pile no longer
    // restates it in different words.
    expect(container.textContent).toContain("Build a cited profile from public sources: identity, funding, people, and proof.");
    // The intake previews the real research modules and the sealed Investor Lens, not
    // marketing copy or invented card names.
    expect(container.textContent).not.toContain("Get up to speed");
    expect(container.textContent).toContain("Next question");
    expect(container.textContent).toContain("Why care");
    expect(container.textContent).toContain("Investor Lens");
    expect(container.textContent).toContain("Runs on the cited profile once it is filed.");
    const generateButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Begin research"
    );
    expect(generateButton).toBeTruthy();

    await act(async () => {
      generateButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushPromises();

    expect(generateCalls(fetchMock)).toHaveLength(1);
    expect(generateCalls(fetchMock)[0]?.[1]?.body).toBe(
      JSON.stringify({ domain: "amazon.com", mode: "basics", confirmStart: true })
    );
    expect(container.textContent).toContain("Research");
    expect(container.textContent).toContain("amazon.com");
    await unmount();
  }, 10_000);

  it("renders a cached card without requiring Start", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(cardForDomain("linear.app")));
    const { container, unmount } = await renderSidePanel({ domain: "linear.app", fetchMock });

    expect(container.textContent).toContain("Research");
    expect(container.textContent).toContain("linear.app");
    expect(container.textContent).not.toContain("No profile");
    expect(generateCalls(fetchMock)).toHaveLength(0);
    await unmount();
  });

  it("does not let a bloated overview take over the profile card", async () => {
    const card = cardForDomain("hanoverpark.com");
    card.identity.name = { value: "Hanover Park", status: "verified", confidence: "high", citationIds: ["c1"] };
    card.identity.oneLiner = {
      value:
        "Hanover Park is an automated fund administrator for private equity and venture capital firms. It combines fund accounting, portfolio management, LP portals, analytics, modelling, security workflows, client support, capital calls, distributions, and full-service accounting into one platform.",
      status: "verified",
      confidence: "high",
      citationIds: ["c1"]
    };

    const fetchMock = vi.fn(async () => jsonResponse(card));
    const { container, unmount } = await renderSidePanel({ domain: "hanoverpark.com", fetchMock });
    const visibleSummary = container.querySelector(".cs-company-summary");

    expect(visibleSummary?.textContent).toContain("Hanover Park is an automated fund administrator for private equity and venture capital firms.");
    expect(visibleSummary?.textContent).not.toContain("full-service accounting into one platform");
    await unmount();
  });

  it("keeps critical metrics visible when structured funding misses cited financing", async () => {
    const card = cardForDomain("polymarket.com");
    card.identity.name = { value: "Polymarket", status: "verified", confidence: "high", citationIds: ["c1"] };
    card.identity.hq = {
      value: { city: "New York", country: "United States" },
      status: "verified",
      confidence: "medium",
      citationIds: ["c1"]
    };
    card.team.headcount = {
      value: { value: 209, asOf: "2026-04-21" },
      status: "inferred",
      confidence: "low",
      citationIds: ["c1"]
    };
    card.citations.push({
      id: "e1",
      url: "https://www.covers.com/industry/polymarket-seeks-fundraising-at-15b-valuation-april-21-2026",
      title: "Polymarket Seeks Fundraising at $15B Valuation",
      fetchedAt: "2026-05-19T12:00:00.000Z",
      sourceType: "news",
      snippet: "ICE pledged $2B, completed with $600M injection in March 2026 at $9B valuation."
    });

    const fetchMock = vi.fn(async () => jsonResponse(card));
    const { container, unmount } = await renderSidePanel({ domain: "polymarket.com", fetchMock });
    const metrics = container.querySelector(".cs-company-facts");

    expect(metrics?.querySelectorAll("div")).toHaveLength(3);
    expect(metrics?.textContent).toContain("Employees");
    expect(metrics?.textContent).toContain("209");
    expect(metrics?.textContent).toContain("Funding");
    expect(metrics?.textContent).toContain("$600M");
    expect(metrics?.textContent).toContain("reported");
    expect(metrics?.textContent).toContain("HQ");
    expect(metrics?.textContent).toContain("New York, United States");
    await unmount();
  });

  it("renders a session-cached card before network revalidation", async () => {
    const { defaultApiOrigin, storedApiOriginOrDefault } = await import("../src/extension-config");
    const cachedCard = cardForDomain("linear.app");
    const resolvedApiOrigin = storedApiOriginOrDefault(
      settings.coldStartApiOrigin,
      defaultApiOrigin(import.meta.env)
    );
    const cacheKey = `coldStartCard:${encodeURIComponent(resolvedApiOrigin)}:${encodeURIComponent("linear.app")}`;
    let resolveBootstrap: ((response: Response) => void) | undefined;
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => {
      resolveBootstrap = resolve;
    }));
    const { container, unmount } = await renderSidePanel({
      domain: "linear.app",
      fetchMock,
      initialSession: {
        [cacheKey]: {
          apiOrigin: resolvedApiOrigin,
          card: cachedCard,
          contractVersion: COLD_START_API_CONTRACT_VERSION,
          domain: "linear.app",
          storedAt: Date.now()
        }
      }
    });

    expect(container.textContent).toContain("Research");
    expect(container.textContent).toContain("linear.app");
    const firstFetchCall = fetchMock.mock.calls[0] as unknown as [string, RequestInit?] | undefined;
    expect(String(firstFetchCall?.[0])).toContain("/api/extension/bootstrap?");
    expect(firstFetchCall?.[1]?.method).toBeUndefined();
    expect(generateCalls(fetchMock)).toHaveLength(0);
    resolveBootstrap?.(jsonResponse({
      domain: "linear.app",
      slug: "linear",
      card: cachedCard,
      runs: {
        basics: { slug: "linear", domain: "linear.app", mode: "basics", status: "complete" },
        analysis: { slug: "linear", domain: "linear.app", mode: "analysis", status: "idle" }
      }
    }));
    await flushPromises();
    await unmount();
  });

  it("renders a durable local card before network revalidation", async () => {
    const { defaultApiOrigin, storedApiOriginOrDefault } = await import("../src/extension-config");
    const cachedCard = cardForDomain("linear.app");
    cachedCard.identity.name.value = "Cached Linear";
    const serverCard = cardForDomain("linear.app");
    serverCard.identity.name.value = "Server Linear";
    const resolvedApiOrigin = storedApiOriginOrDefault(
      settings.coldStartApiOrigin,
      defaultApiOrigin(import.meta.env)
    );
    const cacheKey = `coldStartCard:${encodeURIComponent(resolvedApiOrigin)}:${encodeURIComponent("linear.app")}`;
    let resolveBootstrap: ((response: Response) => void) | undefined;
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => {
      resolveBootstrap = resolve;
    }));
    const { container, unmount } = await renderSidePanel({
      domain: "linear.app",
      fetchMock,
      storedLocal: {
        [cacheKey]: {
          apiOrigin: resolvedApiOrigin,
          card: cachedCard,
          contractVersion: COLD_START_API_CONTRACT_VERSION,
          domain: "linear.app",
          storedAt: Date.now()
        }
      }
    });

    expect(container.textContent).toContain("Cached Linear");
    expect(container.textContent).not.toContain("Server Linear");
    resolveBootstrap?.(jsonResponse({
      domain: "linear.app",
      slug: "linear",
      card: serverCard,
      runs: {
        basics: { slug: "linear", domain: "linear.app", mode: "basics", status: "complete" },
        analysis: { slug: "linear", domain: "linear.app", mode: "analysis", status: "idle" }
      }
    }));
    await flushPromises();

    expect(container.textContent).toContain("Server Linear");
    await unmount();
  });

  it("keeps a durable local card visible when bootstrap revalidation fails", async () => {
    const { defaultApiOrigin, storedApiOriginOrDefault } = await import("../src/extension-config");
    const cachedCard = cardForDomain("linear.app");
    cachedCard.identity.name.value = "Cached Linear";
    const resolvedApiOrigin = storedApiOriginOrDefault(
      settings.coldStartApiOrigin,
      defaultApiOrigin(import.meta.env)
    );
    const cacheKey = `coldStartCard:${encodeURIComponent(resolvedApiOrigin)}:${encodeURIComponent("linear.app")}`;
    const fetchMock = vi.fn(async () => {
      throw new Error("bootstrap unavailable");
    });
    const { container, unmount } = await renderSidePanel({
      domain: "linear.app",
      fetchMock,
      storedLocal: {
        [cacheKey]: {
          apiOrigin: resolvedApiOrigin,
          card: cachedCard,
          contractVersion: COLD_START_API_CONTRACT_VERSION,
          domain: "linear.app",
          storedAt: Date.now()
        }
      }
    });

    expect(container.textContent).toContain("Cached Linear");
    expect(container.textContent).toContain("Could not check for a fresher profile");
    await unmount();
  });

  it("uses a saved company logo in the card context", async () => {
    const card = cardForDomain("figma.com");
    card.identity.name = { value: "Figma", status: "verified", confidence: "high", citationIds: ["c1"] };
    card.identity.logoUrl = "https://assets.example.com/figma-logo.svg";
    const fetchMock = vi.fn(async () => jsonResponse(card));
    const { container, unmount } = await renderSidePanel({ domain: "figma.com", fetchMock });

    const logo = container.querySelector(".cs-company-logo");
    expect(logo?.getAttribute("aria-label")).toBe("Figma logo");
    expect(logo?.querySelector("img")?.getAttribute("src")).toBe("https://assets.example.com/figma-logo.svg");
    expect(logo?.textContent).toBe("F");
    await unmount();
  });

  it("uses the aperture brand mark for access setup instead of a block logo", async () => {
    const fetchMock = vi.fn();
    const { container, unmount } = await renderSidePanel({
      domain: "linear.app",
      fetchMock,
      storedSettings: { coldStartApiToken: "" }
    });

    expect(container.textContent).toContain("Connect");
    expect(container.textContent).toContain("Private cards use the browser token.");
    expect(container.textContent).toContain("Extension token");
    expect(container.querySelector(".cs-panel-brand-mark .cs-brand-mark")).toBeTruthy();
    expect(container.querySelector(".cs-extension-brand")).toBeNull();
    expect(container.querySelector(".cs-extension-mark")).toBeNull();
    expect(container.textContent).not.toContain("CS");
    expect(fetchMock).not.toHaveBeenCalled();
    await unmount();
  });

  it("renders core metrics and management as fixed company context", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(cardWithManagement("theinformation.com")));
    const { container, unmount } = await renderSidePanel({ domain: "theinformation.com", fetchMock });

    expect(container.querySelector("dl[aria-label='Core metrics']")).toBeTruthy();
    expect(container.textContent).toContain("Employees");
    expect(container.textContent).toContain("87");
    expect(container.textContent).toContain("2026-04-26");
    expect(container.textContent).toContain("theinformation.com");
    expect(container.textContent).toContain("People");
    expect(container.textContent).toContain("2 sources");
    expect(container.textContent).toContain("Jessica Lessin");
    expect(container.textContent).toContain("jessica@theinformation.com");
    expect(container.textContent).toContain("1 work email");
    expect(container.textContent).toContain("work");
    expect(container.querySelector("a[href='mailto:jessica@theinformation.com']")).toBeTruthy();
    expect(container.textContent).toContain("Matthew Resnick");
    expect(container.textContent).toContain("Amir Efrati");
    expect(container.textContent).toContain("Research");
    const peopleLine = container.querySelector(".cs-people-line");
    expect(peopleLine?.textContent?.match(/Jessica Lessin/g)).toHaveLength(1);
    expect(container.querySelector(".cs-management-team")).toBeNull();
    await unmount();
  });

  it("labels personal contact emails instead of hiding them", async () => {
    const card = cardWithManagement("tolans.com");
    card.identity.name = { value: "Tolan", status: "verified", confidence: "high", citationIds: ["c1"] };
    card.team.founders.value = [
      { name: "Quinten Farmer", role: "Co-founder & CEO", sourceUrl: "https://linkedin.com/in/quinten", email: "quintendf@gmail.com" }
    ];
    card.team.keyExecs.value = [];
    const fetchMock = vi.fn(async () => jsonResponse(card));
    const { container, unmount } = await renderSidePanel({ domain: "tolans.com", fetchMock });

    expect(container.textContent).toContain("1 email found");
    expect(container.textContent).toContain("quintendf@gmail.com");
    expect(container.textContent).toContain("personal");
    expect(container.textContent).not.toContain("No verified work email found");
    await unmount();
  });

  it("shows the expanded company description in one shared tooltip overlay", async () => {
    const card = cardWithManagement("tolans.com");
    const shortDescription = "Tolan makes a voice-first AI companion app for young adults.";
    const expandedDescription = "Tolan makes a voice-first AI companion app for young adults. Its animated alien characters support daily check-ins and emotional wellbeing without trying to mimic a human therapist.";
    card.identity.description = {
      value: {
        shortDescription,
        expandedDescription,
        concept: null,
        serves: null,
        mechanism: null
      },
      status: "verified",
      confidence: "high",
      citationIds: ["c1"]
    };
    const fetchMock = vi.fn(async () => jsonResponse(card));
    const { container, unmount } = await renderSidePanel({ domain: "tolans.com", fetchMock });
    const summary = container.querySelector(".cs-company-summary");
    const summaryTrigger = container.querySelector(".cs-company-summary-more") as HTMLElement | null;
    expect(summary?.textContent).not.toContain("...");
    expect(summaryTrigger).toBeTruthy();
    expect(summaryTrigger?.textContent).toBe("(more)");
    expect(summaryTrigger?.getAttribute("aria-describedby")).toBe("cs-company-shared-tooltip");
    expect(container.querySelector(".cs-company-summary-trigger")).toBeNull();
    summaryTrigger!.getBoundingClientRect = () => ({
      bottom: 120,
      height: 20,
      left: 40,
      right: 320,
      top: 100,
      width: 280,
      x: 40,
      y: 100,
      toJSON: () => ({})
    });

    await act(async () => {
      summaryTrigger!.focus();
    });
    const tooltip = container.querySelector(".cs-shared-tooltip");
    expect(tooltip).toBeTruthy();
    expect(tooltip?.textContent).toContain("Description");
    expect(tooltip?.textContent).toContain("animated alien characters");
    expect(tooltip?.textContent).not.toMatch(/\.\.\.$/);
    expect(container.querySelectorAll(".cs-company-summary-popover")).toHaveLength(0);

    await act(async () => {
      summaryTrigger!.blur();
    });
    expect(container.querySelector(".cs-shared-tooltip")).toBeNull();
    await unmount();
  });

  it("uses structured description fields for the full summary tooltip", async () => {
    const card = cardWithManagement("decagon.ai");
    card.identity.name = { value: "Decagon", status: "verified", confidence: "high", citationIds: ["c1"] };
    card.identity.description = {
      value: {
        shortDescription: "Decagon sells AI agents that handle end-to-end customer support interactions...",
        concept: "AI agents for enterprise customer support.",
        serves: "Support, product, and operations teams at software companies.",
        mechanism: "The agents resolve tickets, execute backend actions, and escalate cases when automation is not enough."
      },
      status: "verified",
      confidence: "high",
      citationIds: ["c1"]
    };
    const fetchMock = vi.fn(async () => jsonResponse(card));
    const { container, unmount } = await renderSidePanel({ domain: "decagon.ai", fetchMock });
    const summary = container.querySelector(".cs-company-summary");
    const summaryTrigger = container.querySelector(".cs-company-summary-more") as HTMLElement | null;
    expect(summaryTrigger).toBeTruthy();
    expect(summary?.textContent).not.toContain("...");
    summaryTrigger!.getBoundingClientRect = () => ({
      bottom: 120,
      height: 20,
      left: 40,
      right: 320,
      top: 100,
      width: 280,
      x: 40,
      y: 100,
      toJSON: () => ({})
    });

    await act(async () => {
      summaryTrigger!.focus();
    });

    const tooltip = container.querySelector(".cs-shared-tooltip");
    expect(tooltip?.textContent).toContain("enterprise customer support");
    expect(tooltip?.textContent).toContain("execute backend actions");
    expect(tooltip?.textContent).not.toContain("...");
    await unmount();
  });

  it("does not turn core metric cells into tooltip triggers", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(cardWithManagement("theinformation.com")));
    const { container, unmount } = await renderSidePanel({ domain: "theinformation.com", fetchMock });
    const metricCells = Array.from(container.querySelectorAll("dl[aria-label='Core metrics'] > div")) as HTMLElement[];

    expect(metricCells.length).toBeGreaterThan(0);
    for (const cell of metricCells) {
      expect(cell.getAttribute("aria-describedby")).toBeNull();
      expect(cell.getAttribute("tabindex")).toBeNull();
    }

    await act(async () => {
      metricCells[0]!.focus();
    });
    expect(container.querySelector(".cs-shared-tooltip")).toBeNull();
    await unmount();
  });

  it("shows honest placeholder tooltips for visible people but not the overflow row", async () => {
    const card = cardWithManagement("theinformation.com");
    card.team.keyExecs.value = [
      ...(card.team.keyExecs.value ?? []),
      { name: "Jill Abramson", role: "Advisor", sourceUrl: "https://linkedin.com/in/jill" },
      { name: "Martin Peers", role: "Columnist", sourceUrl: "https://theinformation.com/team" },
      { name: "Wayne Ma", role: "Reporter", sourceUrl: "https://theinformation.com/team" }
    ];
    const fetchMock = vi.fn(async () => jsonResponse(card));
    const { container, unmount } = await renderSidePanel({ domain: "theinformation.com", fetchMock });
    const personRows = Array.from(container.querySelectorAll(".cs-people-person")) as HTMLElement[];
    const jessica = personRows.find((row) => row.textContent?.includes("Jessica Lessin"));

    expect(personRows).toHaveLength(4);
    expect(jessica).toBeTruthy();
    expect(jessica?.getAttribute("aria-describedby")).toBe("cs-company-shared-tooltip");
    jessica!.getBoundingClientRect = () => ({
      bottom: 220,
      height: 44,
      left: 48,
      right: 360,
      top: 176,
      width: 312,
      x: 48,
      y: 176,
      toJSON: () => ({})
    });

    await act(async () => {
      jessica!.focus();
    });
    const tooltip = container.querySelector(".cs-shared-tooltip");
    expect(tooltip).toBeTruthy();
    expect(tooltip?.textContent).toContain("Jessica Lessin");
    expect(tooltip?.textContent).toContain("Founder");
    expect(tooltip?.textContent).toContain("Work email found in a public source.");

    await act(async () => {
      jessica!.blur();
    });
    expect(container.querySelector(".cs-shared-tooltip")).toBeNull();

    const overflow = container.querySelector(".cs-people-more") as HTMLElement | null;
    expect(overflow).toBeTruthy();
    expect(overflow?.getAttribute("aria-describedby")).toBeNull();
    expect(overflow?.getAttribute("tabindex")).toBeNull();

    await act(async () => {
      overflow!.focus();
    });
    expect(container.querySelector(".cs-shared-tooltip")).toBeNull();
    await unmount();
  });

  it("does not render the old standalone analysis CTA for a sourced card", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(cardForDomain("warp.dev")));
    const { container, unmount } = await renderSidePanel({ domain: "warp.dev", fetchMock });

    const buttons = interactiveControls(container).map((button) => button.textContent?.trim());
    expect(buttons).not.toContain(legacyAnalysisLabel);
    expect(container.textContent).toContain("Research");
    expect(container.textContent).toContain("Why care");

    await unmount();
  });

  it("renders the research layer pile for a sourced card", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(cardForDomain("warp.dev")));
    const { container, unmount } = await renderSidePanel({ domain: "warp.dev", fetchMock });

    expect(container.textContent).toContain("Research");
    expect(container.textContent).toContain("Why care");
    expect(container.textContent).toContain("Timing");
    expect(container.textContent).toContain("Proof");
    expect(container.textContent).not.toContain("Add enrichment");
    for (const title of futureCardTitles) {
      expect(container.textContent).not.toContain(title);
    }

    await unmount();
  });

  it("resumes an active basics run instead of showing the generate gate", async () => {
    vi.useFakeTimers();
    let cardFetches = 0;
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/api/generate?")) {
        return jsonResponse({
          slug: "cartesia",
          domain: "cartesia.ai",
          status: "running",
          mode: "basics",
          startedAt: new Date(Date.now() - 30_000).toISOString()
        });
      }

      cardFetches += 1;
      return cardFetches > 3 ? jsonResponse(cardWithSynthesis("cartesia.ai")) : missingCardResponse();
    });
    const { container, unmount } = await renderSidePanel({ domain: "cartesia.ai", fetchMock });

    // While building, the panel renders run events and the early read only; nothing from the
    // gated synthesis may appear before the profile phase, even when the stored card has it.
    expect(container.textContent).not.toContain("supported wedge");
    expect(container.textContent).toContain("Researching");
    expect(container.textContent).toContain("Sources");
    expect(container.textContent).toContain("Checking company, product, funding, and proof sources");
    expect(container.textContent).toContain("Filed");
    expect(container.textContent).not.toContain("Looking for useful places to read");
    expect(container.textContent).not.toContain("Pulling in what matters");
    expect(container.textContent).not.toContain("Turning evidence into a card");
    expect(container.textContent).not.toContain("Saving the final profile");
    // No wall-clock stage estimation: with no run events yet, the trail holds at the first stage.
    const runningSegment = container.querySelector(".cs-trail-segment[data-status='running']");
    expect(runningSegment?.textContent).toContain("Sources");
    expect(container.querySelectorAll(".cs-trail-segment[data-status='done']")).toHaveLength(0);
    // The persistent header carries the identity and the run timer; there is no separate hero.
    expect(container.querySelector(".cs-company-context[data-phase='building']")).not.toBeNull();
    expect(container.querySelector(".cs-generation-hero")).toBeNull();
    expect(container.querySelector(".cs-build-bar")).toBeNull();
    expect(container.querySelector(".cs-company-logo img")?.getAttribute("src")).toBe("https://icons.duckduckgo.com/ip3/cartesia.ai.ico");
    expect(container.querySelector(".cs-card-tray")).toBeNull();
    expect(container.textContent).not.toContain("Collecting source distance");
    expect(container.textContent).not.toContain("Still running in the background");
    expect(container.textContent).not.toContain("Generate Cartesia?");
    expect(generateCalls(fetchMock)).toHaveLength(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });
    await flushPromises();

    expect(container.textContent).toContain("Research");
    expect(container.textContent).toContain("cartesia.ai");
    await unmount();
  });

  it("uses generation events to drive the research progress stage", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/api/generate?")) {
        return jsonResponse({
          slug: "cartesia",
          domain: "cartesia.ai",
          status: "running",
          mode: "basics",
          startedAt: new Date(Date.now() - 1_000).toISOString(),
          events: [
            {
              id: "event-source",
              runId: "run-1",
              slug: "cartesia",
              domain: "cartesia.ai",
              sectionId: null,
              type: "source.found",
              message: "Found 8 accepted sources",
              metadata: { acceptedCount: 8 },
              createdAt: new Date().toISOString()
            }
          ]
        });
      }

      return missingCardResponse();
    });
    const { container, unmount } = await renderSidePanel({ domain: "cartesia.ai", fetchMock });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });
    await flushPromises();

    // The source.found event advances the trail to its second stage and the count surfaces
    // in the trail copy without opening the details tree.
    expect(container.querySelectorAll(".cs-trail-segment[data-status='done']")).toHaveLength(1);
    expect(container.querySelector(".cs-trail-segment[data-status='running']")?.textContent).toContain("Proof");
    expect(container.querySelector(".cs-research-progress")?.textContent).toContain("8 sources found");
    const detailsButton = container.querySelector<HTMLButtonElement>(".cs-research-progress-details-toggle");
    expect(detailsButton).not.toBeNull();
    await act(async () => {
      detailsButton?.click();
    });
    await flushPromises();
    expect(container.querySelector(".cs-build-tree")?.textContent).toContain("8 sources found");
    await unmount();
  });

  it("carries generation events into the success state so the early read survives the handoff", async () => {
    vi.useFakeTimers();
    const domain = "cartesia.ai";
    const startedAtIso = new Date(Date.now() - 20_000).toISOString();
    const substantivePayoff = {
      status: "substantive_first_read",
      slug: "cartesia",
      domain,
      generatedAt: new Date().toISOString(),
      generatedAtMs: Date.now(),
      entityConfidence: "high",
      entityConfidenceReason: "Company-controlled source matches the current domain.",
      evidenceSoFar: [
        {
          sourceId: "company_site-cartesia.ai",
          url: "https://cartesia.ai/",
          domain,
          title: "Cartesia",
          sourceClass: "company_site",
          quality: "company",
          arrivedAtMs: Date.now(),
          entityMatched: true
        }
      ],
      stillChecking: { text: "Independent funding proof.", missingEvidenceClass: "funding" },
      whoItSeemsFor: {
        text: "Voice teams shipping real-time agents on constrained devices.",
        supportingText: "Voice teams shipping real-time agents on constrained devices.",
        sourceIds: ["company_site-cartesia.ai"],
        citationIds: [],
        sourceClass: "company_site",
        claimKind: "who_it_serves"
      },
      suppressionReasons: []
    };
    const runEvents = [
      {
        id: "event-source",
        runId: "run-1",
        slug: "cartesia",
        domain,
        sectionId: null,
        type: "source.found",
        message: "Found 6 accepted sources",
        metadata: { acceptedCount: 6 },
        createdAt: "2026-06-30T00:00:01.000Z"
      },
      {
        id: "event-payoff",
        runId: "run-1",
        slug: "cartesia",
        domain,
        sectionId: null,
        type: "first_payoff.ready",
        message: "Early read ready",
        metadata: { firstPayoff: substantivePayoff },
        createdAt: "2026-06-30T00:00:02.000Z"
      },
      {
        id: "event-partial",
        runId: "run-1",
        slug: "cartesia",
        domain,
        sectionId: null,
        type: "card.partial",
        message: "Saved first usable company card",
        metadata: { citationCount: 4 },
        createdAt: "2026-06-30T00:00:03.000Z"
      }
    ];
    let statusCalls = 0;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith("/api/generate") && init?.method === "POST") {
        return jsonResponse({ slug: "cartesia", domain, status: "queued", mode: "basics" }, { status: 202 });
      }

      if (String(url).includes("/api/generate?")) {
        if (generateCalls(fetchMock).length === 0) {
          return jsonResponse({ slug: "cartesia", domain, mode: "basics", status: "idle" });
        }
        statusCalls += 1;
        // The run completes between the handoff and the finalization watcher's first poll,
        // so the only copy of the run events is the one carried across the transition.
        return statusCalls === 1
          ? jsonResponse({
              slug: "cartesia",
              domain,
              status: "running",
              mode: "basics",
              startedAt: startedAtIso,
              events: runEvents
            })
          : jsonResponse({
              slug: "cartesia",
              domain,
              status: "complete",
              mode: "basics",
              startedAt: startedAtIso,
              completedAt: new Date().toISOString()
            });
      }

      return generateCalls(fetchMock).length > 0
        ? jsonResponse(cardForDomain(domain))
        : missingCardResponse();
    });
    const { container, unmount } = await renderSidePanel({ domain, fetchMock });

    const generateButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Begin research"
    );
    expect(generateButton).toBeTruthy();
    await act(async () => {
      generateButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushPromises();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    await flushPromises();

    // The fetched card reports cacheStatus "hit", so without the carried events the read
    // would file itself the moment the profile view mounted.
    expect(container.textContent).toContain("Research");
    const earlyRead = container.querySelector("[aria-label='Early read']");
    expect(earlyRead).not.toBeNull();
    expect(earlyRead?.textContent).toContain("Voice teams shipping real-time agents on constrained devices.");
    expect(container.querySelector("[aria-label='Sources checked']")).toBeNull();
    await unmount();
  });

  it("resumes an active analysis run for a basics card without restarting analysis", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/api/generate?")) {
        return jsonResponse({
          slug: "linear",
          domain: "linear.app",
          status: "running",
          mode: "analysis",
          startedAt: new Date(Date.now() - 85_000).toISOString()
        });
      }

      return jsonResponse(cardForDomain("linear.app"));
    });
    const { container, unmount } = await renderSidePanel({ domain: "linear.app", fetchMock });

    // The resumed run reads as Investor Lens, one receipt, not generic research progress.
    expect(container.textContent).toContain("Investor Lens running");
    expect(container.textContent).toContain("Weighing bull against bear");
    expect(container.textContent).not.toContain("Longer runs continue");
    expect(container.textContent).not.toContain(legacyAnalysisLabel);
    expect(generateCalls(fetchMock)).toHaveLength(0);
    await unmount();
  });

  it("resumes an active analysis run for stale synthesis missing market structure", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/api/extension/bootstrap")) {
        return jsonResponse({
          domain: "linear.app",
          slug: "linear",
          card: cardWithSynthesis("linear.app"),
          runs: {
            basics: { slug: "linear", domain: "linear.app", mode: "basics", status: "complete" },
            analysis: {
              slug: "linear",
              domain: "linear.app",
              mode: "analysis",
              status: "running",
              startedAt: new Date(Date.now() - 85_000).toISOString()
            }
          }
        });
      }

      if (String(url).includes("/api/generate?")) {
        return jsonResponse({
          slug: "linear",
          domain: "linear.app",
          status: "running",
          mode: "analysis",
          startedAt: new Date(Date.now() - 85_000).toISOString()
        });
      }

      return jsonResponse(cardWithSynthesis("linear.app"));
    });
    const { container, unmount } = await renderSidePanel({ domain: "linear.app", fetchMock });

    const marketButton = interactiveControls(container).find(
      (button) => button.textContent?.includes("Timing")
    );
    expect(marketButton).toBeTruthy();
    await act(async () => {
      marketButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushPromises();

    expect(container.textContent).toContain("Synthesizing");
    expect(container.textContent).toContain("Reading cited sources");
    expect(container.querySelector<HTMLElement>('[data-layer-id="marketStructureTiming"]')?.dataset.state).toBe("running");
    expect(generateCalls(fetchMock)).toHaveLength(0);
    await unmount();
  });

  it("keeps research cards available when a usable profile exists during active basics finalization", async () => {
    vi.useFakeTimers();
    const domain = "llamaindex.ai";
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith("/api/generate") && init?.method === "POST") {
        return jsonResponse({ error: "company profile is still generating" }, { status: 409 });
      }

      if (String(url).includes("/api/generate?")) {
        return jsonResponse({
          slug: "llamaindex",
          domain,
          mode: "basics",
          status: "running",
          events: [
            {
              id: "event-partial",
              runId: "run-basics",
              slug: "llamaindex",
              domain,
              sectionId: null,
              type: "card.partial",
              message: "Starter profile ready",
              metadata: { mode: "basics", citationCount: 4 },
              createdAt: new Date().toISOString()
            }
          ]
        });
      }

      if (String(url).includes("/api/extension/bootstrap")) {
        return jsonResponse({
          domain,
          slug: "llamaindex",
          card: cardForDomain(domain),
          sections: [testSection(domain, "why_it_matters", "not_started")],
          runs: {
            basics: {
              slug: "llamaindex",
              domain,
              mode: "basics",
              status: "running",
              startedAt: new Date(Date.now() - 51_000).toISOString()
            },
            analysis: { slug: "llamaindex", domain, mode: "analysis", status: "idle" }
          }
        });
      }

      return jsonResponse(cardForDomain(domain));
    });
    const { container, unmount } = await renderSidePanel({ domain, fetchMock });

    expect(container.querySelector<HTMLElement>('[data-layer-id="coreIdea"]')?.dataset.state).not.toBe("running");
    expect(container.textContent).not.toContain("Finishing profile");
    expect(container.textContent).not.toContain("Getting the profile ready");
    expect(container.textContent).toContain("10 waiting");
    expect(generateCalls(fetchMock)).toHaveLength(0);
    await unmount();
  });

  it("shows an analysis layer synthesizing under the active investor lens", async () => {
    vi.useFakeTimers();
    const domain = "linear.app";
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith("/api/generate") && init?.method === "POST") {
        return jsonResponse({ slug: "linear", domain, status: "queued", mode: "analysis" }, { status: 202 });
      }

      if (String(url).includes("/api/generate?")) {
        return jsonResponse({
          slug: "linear",
          domain,
          status: "running",
          mode: "analysis",
          startedAt: new Date(Date.now() - 42_000).toISOString()
        });
      }

      return jsonResponse(cardForDomain(domain));
    });
    const { container, unmount } = await renderSidePanel({ domain, fetchMock });

    const nextQuestionButton = interactiveControls(container).find(
      (button) => button.textContent?.includes("Next question")
    );
    expect(nextQuestionButton).toBeTruthy();

    await act(async () => {
      nextQuestionButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushPromises();

    // The lens fills every analysis layer at once, so Open Questions reads as synthesizing under
    // the active run rather than queued behind it, and activating it starts no extra generation.
    expect(container.querySelector<HTMLElement>('[data-layer-id="openQuestions"]')?.dataset.state).toBe("running");
    expect(container.querySelector<HTMLElement>('[data-layer-id="openQuestions"]')?.textContent).toContain("Synthesizing");
    expect(generateCalls(fetchMock)).toHaveLength(0);
    await unmount();
  });

  it("shows active research evidence while the company profile run is still active", async () => {
    vi.useFakeTimers();
    const domain = "llamaindex.ai";
    const card = cardForDomain(domain);
    card.identity.name.value = "LlamaIndex";
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/api/extension/bootstrap")) {
        return jsonResponse({
          domain,
          slug: "llamaindex",
          card,
          sections: [testSection(domain, "why_it_matters", "not_started")],
          sources: [
            {
              id: "source-1",
              url: "https://www.llamaindex.ai/",
              title: "LlamaIndex",
              domain: "llamaindex.ai",
              sourceType: "company_site",
              fetchedAt: new Date().toISOString(),
              snippet: "LlamaIndex is a data framework."
            },
            {
              id: "source-2",
              url: "https://example.com/llamaindex-funding",
              title: "LlamaIndex funding",
              domain: "example.com",
              sourceType: "news",
              fetchedAt: new Date().toISOString(),
              snippet: "The company raised a Series A."
            }
          ],
          events: [
            {
              id: "event-1",
              runId: "run-basics",
              slug: "llamaindex",
              domain,
              sectionId: null,
              type: "source.found",
              message: "Found 2 sources",
              metadata: { sourceCount: 2 },
              createdAt: new Date().toISOString()
            }
          ],
          runs: {
            basics: {
              slug: "llamaindex",
              domain,
              mode: "basics",
              status: "running",
              startedAt: new Date(Date.now() - 14_000).toISOString()
            },
            analysis: { slug: "llamaindex", domain, mode: "analysis", status: "idle" }
          }
        });
      }

      return jsonResponse(card);
    });

    const { container, unmount } = await renderSidePanel({ domain, fetchMock });

    // The profile-phase ResearchTrail mount is gone; the whisper carries this state instead.
    expect(container.querySelector(".cs-research-progress")).toBeNull();
    expect(container.textContent).toContain("LlamaIndex");
    await unmount();
  });

  it("keeps profile progress live after card.saved until a terminal profile event arrives", async () => {
    const domain = "llamaindex.ai";
    const card = cardForDomain(domain);
    card.identity.name.value = "LlamaIndex";
    const sectionIds: ResearchSection["sectionId"][] = [
      "buyer",
      "customer_proof",
      "traction",
      "financing",
      "competition",
      "product",
      "why_it_matters",
      "market",
      "risks"
    ];
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/api/extension/bootstrap")) {
        return jsonResponse({
          domain,
          slug: "llamaindex",
          card,
          sections: sectionIds.map((sectionId, index) =>
            testSection(domain, sectionId, index < 5 ? "available" : "not_started")
          ),
          sources: [],
          events: [
            {
              id: "old-event-complete",
              runId: "old-run",
              slug: "llamaindex",
              domain,
              sectionId: null,
              type: "generation.complete",
              message: "Research run complete",
              metadata: { mode: "basics" },
              createdAt: "2026-05-31T23:59:59.000Z"
            },
            {
              id: "event-sources",
              runId: "run-basics",
              slug: "llamaindex",
              domain,
              sectionId: null,
              type: "source.found",
              message: "Found 15 accepted sources",
              metadata: { mode: "basics", acceptedCount: 15 },
              createdAt: "2026-06-01T00:00:02.000Z"
            },
            {
              id: "event-saved",
              runId: "run-basics",
              slug: "llamaindex",
              domain,
              sectionId: null,
              type: "card.saved",
              message: "Saved cited company card",
              metadata: { mode: "basics", sourceCount: 15 },
              createdAt: "2026-06-01T00:00:03.000Z"
            }
          ],
          runs: {
            basics: { slug: "llamaindex", domain, mode: "basics", status: "idle" },
            analysis: { slug: "llamaindex", domain, mode: "analysis", status: "idle" }
          }
        });
      }

      return jsonResponse(card);
    });

    const { container, unmount } = await renderSidePanel({ domain, fetchMock });

    // The profile-phase ResearchTrail mount is gone; the whisper carries this state instead.
    expect(container.querySelector(".cs-research-progress")).toBeNull();
    expect(container.querySelector(".cs-build-tree")).toBeNull();
    await unmount();
  });

  it("collapses completed profile progress into a quiet filed state", async () => {
    const domain = "llamaindex.ai";
    const card = cardForDomain(domain);
    card.identity.name.value = "LlamaIndex";
    const sectionIds: ResearchSection["sectionId"][] = [
      "buyer",
      "customer_proof",
      "traction",
      "financing",
      "competition",
      "product",
      "why_it_matters",
      "market",
      "risks"
    ];
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/api/extension/bootstrap")) {
        return jsonResponse({
          domain,
          slug: "llamaindex",
          card,
          sections: sectionIds.map((sectionId) => testSection(domain, sectionId, "available")),
          sources: Array.from({ length: 3 }, (_, index) => ({
            id: `source-${index + 1}`,
            url: `https://example.com/source-${index + 1}`,
            title: `Source ${index + 1}`,
            domain: "example.com",
            sourceType: "news" as const,
            fetchedAt: new Date().toISOString(),
            snippet: "Research source."
          })),
          events: [
            {
              id: "event-started",
              runId: "run-basics",
              slug: "llamaindex",
              domain,
              sectionId: null,
              type: "generation.started",
              message: "Started company profile",
              metadata: { mode: "basics" },
              createdAt: "2026-06-01T00:00:01.000Z"
            },
            {
              id: "event-sources",
              runId: "run-basics",
              slug: "llamaindex",
              domain,
              sectionId: null,
              type: "source.found",
              message: "Found 35 accepted sources",
              metadata: { mode: "basics", acceptedCount: 35 },
              createdAt: "2026-06-01T00:00:02.000Z"
            },
            {
              id: "event-saved",
              runId: "run-basics",
              slug: "llamaindex",
              domain,
              sectionId: null,
              type: "card.saved",
              message: "Saved cited company card",
              metadata: { mode: "basics", sourceCount: 15 },
              createdAt: "2026-06-01T00:00:03.000Z"
            },
            {
              id: "event-enriched",
              runId: "run-basics",
              slug: "llamaindex",
              domain,
              sectionId: null,
              type: "card.enriched",
              message: "Saved enriched company card",
              metadata: { mode: "basics", sourceCount: 35 },
              createdAt: "2026-06-01T00:00:04.000Z"
            },
            {
              id: "event-complete",
              runId: "run-basics",
              slug: "llamaindex",
              domain,
              sectionId: null,
              type: "generation.complete",
              message: "Research run complete",
              metadata: { mode: "basics" },
              createdAt: "2026-06-01T00:00:05.000Z"
            }
          ],
          runs: {
            basics: {
              slug: "llamaindex",
              domain,
              mode: "basics",
              status: "complete",
              startedAt: "2026-06-01T00:00:00.000Z",
              completedAt: "2026-06-01T00:00:05.000Z"
            },
            analysis: { slug: "llamaindex", domain, mode: "analysis", status: "idle" }
          }
        });
      }

      return jsonResponse(card);
    });

    const { container, unmount } = await renderSidePanel({ domain, fetchMock });

    // The profile-phase ResearchTrail mount is gone; the whisper carries this state instead.
    expect(container.querySelector(".cs-research-progress")).toBeNull();
    expect(container.querySelector(".cs-build-tree")).toBeNull();
    expect(container.textContent).not.toContain("Filed the profile");
    await unmount();
  });

  it("shows a recovered basics card when the latest run is failed", async () => {
    let cardFetches = 0;
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/api/generate?")) {
        return jsonResponse({
          slug: "thinkwithmark",
          domain: "thinkwithmark.com",
          status: "failed",
          mode: "basics",
          error: "generated basics underfilled public profile (4/4 structured facts)"
        });
      }

      cardFetches += 1;
      return cardFetches > 1 ? jsonResponse(cardForDomain("thinkwithmark.com")) : missingCardResponse();
    });

    const { container, unmount } = await renderSidePanel({ domain: "thinkwithmark.com", fetchMock });
    await flushPromises();

    expect(container.textContent).toContain("Research");
    expect(container.textContent).toContain("thinkwithmark.com");
    expect(container.textContent).not.toContain("Card unavailable");
    await unmount();
  });

  it("auto-regenerates a no-source partial profile instead of presenting it as saved", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith("/api/generate") && init?.method === "POST") {
        return jsonResponse({ slug: "cartesia", status: "queued", mode: "basics" }, { status: 202 });
      }

      if (String(url).includes("/api/extension/bootstrap")) {
        return jsonResponse({
          domain: "cartesia.ai",
          slug: "cartesia",
          card: noSourcePartialCard("cartesia.ai"),
          runs: {
            basics: { slug: "cartesia", domain: "cartesia.ai", mode: "basics", status: "idle" },
            analysis: { slug: "cartesia", domain: "cartesia.ai", mode: "analysis", status: "idle" }
          }
        });
      }

      if (String(url).includes("/api/generate?")) {
        return jsonResponse({ slug: "cartesia", domain: "cartesia.ai", status: generateCalls(fetchMock).length > 0 ? "complete" : "idle", mode: "basics" });
      }

      return jsonResponse(generateCalls(fetchMock).length > 0 ? cardForDomain("cartesia.ai") : noSourcePartialCard("cartesia.ai"));
    });
    const { container, unmount } = await renderSidePanel({ domain: "cartesia.ai", fetchMock });

    expect(container.textContent).toContain("Research");
    expect(container.textContent).toContain("cartesia.ai");
    expect(container.textContent).not.toContain("No cited profile yet");
    expect(container.textContent).not.toContain("Not found");
    expect(interactiveControls(container).some((button) => button.textContent === legacyAnalysisLabel)).toBe(false);

    expect(generateCalls(fetchMock)).toHaveLength(1);
    expect(generateCalls(fetchMock)[0]?.[1]?.body).toBe(
      JSON.stringify({ domain: "cartesia.ai", mode: "basics", confirmStart: true })
    );
    await unmount();
  });

  it("auto-regenerates a cited domain-placeholder shell instead of promoting it into the dossier", async () => {
    const domain = "databricks.com";
    const shell: ColdStartCard = {
      ...cardForDomain(domain),
      identity: {
        ...cardForDomain(domain).identity,
        name: { value: domain, status: "verified", confidence: "low", citationIds: ["c1"] },
        oneLiner: { value: domain, status: "verified", confidence: "low", citationIds: ["c1"] },
        hq: { value: null, status: "unknown", confidence: "low", citationIds: [] },
        foundedYear: { value: null, status: "unknown", confidence: "low", citationIds: [] },
      },
      funding: {
        totalRaisedUsd: { value: null, status: "unknown", confidence: "low", citationIds: [] },
        lastRound: { value: null, status: "unknown", confidence: "low", citationIds: [] },
        investors: { value: [{ name: "Andreessen Horowitz", domain: "a16z.com" }], status: "verified", confidence: "low", citationIds: ["c1"] },
      },
      team: {
        founders: { value: [], status: "unknown", confidence: "low", citationIds: [] },
        keyExecs: { value: [], status: "unknown", confidence: "low", citationIds: [] },
        headcount: { value: null, status: "unknown", confidence: "low", citationIds: [] },
      },
      signals: [
        {
          title: "Databricks market mention",
          url: "https://example.com/databricks",
          date: "2026-05-15",
          source: "Example",
          category: "news",
          citationIds: ["c1"],
        },
      ],
      comparables: [
        {
          name: "Snowflake",
          domain: "snowflake.com",
          oneLiner: "Cloud data platform.",
          citationIds: ["c1"],
        },
      ],
    };
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith("/api/generate") && init?.method === "POST") {
        return jsonResponse({ slug: "databricks", status: "queued", mode: "basics" }, { status: 202 });
      }

      if (String(url).includes("/api/extension/bootstrap")) {
        return jsonResponse({
          domain,
          slug: "databricks",
          card: shell,
          runs: {
            basics: { slug: "databricks", domain, mode: "basics", status: "idle" },
            analysis: { slug: "databricks", domain, mode: "analysis", status: "idle" }
          }
        });
      }

      if (String(url).includes("/api/generate?")) {
        return jsonResponse({ slug: "databricks", domain, status: generateCalls(fetchMock).length > 0 ? "complete" : "idle", mode: "basics" });
      }

      return jsonResponse(generateCalls(fetchMock).length > 0 ? cardForDomain(domain) : shell);
    });
    const { container, unmount } = await renderSidePanel({ domain, fetchMock });

    expect(generateCalls(fetchMock)).toHaveLength(1);
    expect(container.textContent).toContain("Research");
    expect(container.textContent).not.toContain("Profile saved with gaps");
    expect(container.textContent).not.toContain("Latest round");
    expect(container.textContent).not.toContain("Not found");
    await unmount();
  });

  it("aborts the basics completion watcher when leaving the profile", async () => {
    const domain = "amazon.com";
    const firstWatcher: { signal: AbortSignal | null } = { signal: null };
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const requestUrl = new URL(String(url));
      const requestDomain = requestUrl.searchParams.get("domain") ?? domain;
      if (String(url).includes("/api/extension/bootstrap")) {
        return jsonResponse({
          domain: requestDomain,
          slug: requestDomain.split(".")[0],
          card: null,
          runs: {
            basics: { slug: requestDomain.split(".")[0], domain: requestDomain, mode: "basics", status: "idle" },
            analysis: { slug: requestDomain.split(".")[0], domain: requestDomain, mode: "analysis", status: "idle" }
          }
        });
      }

      if (String(url).endsWith("/api/generate") && init?.method === "POST") {
        return jsonResponse({ slug: "amazon", status: "queued", mode: "basics" }, { status: 202 });
      }

      if (String(url).includes("/api/generate?")) {
        if (!firstWatcher.signal) {
          firstWatcher.signal = init?.signal ?? null;
        }
        return jsonResponse({ slug: "amazon", domain, status: "running", mode: "basics" });
      }

      return jsonResponse(cardForDomain(requestDomain));
    });
    const { changeDomain, container, unmount } = await renderSidePanel({ domain, fetchMock });

    const beginButton = interactiveControls(container).find((button) => button.textContent === "Begin research");
    expect(beginButton).toBeTruthy();

    await act(async () => {
      beginButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushPromises();

    const firstWatcherSignal = firstWatcher.signal;
    expectSignal(firstWatcherSignal);
    expect(firstWatcherSignal.aborted).toBe(false);

    await changeDomain("linear.app");

    expect(firstWatcherSignal.aborted).toBe(true);
    await unmount();
  });

  it("queues full investor analysis from the global Lens action", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith("/api/generate") && init?.method === "POST") {
        return jsonResponse({ slug: "linear", status: "queued", mode: "analysis" }, { status: 202 });
      }

      return jsonResponse(cardForDomain("linear.app"));
    });
    const { container, unmount } = await renderSidePanel({ domain: "linear.app", fetchMock });

    const lensButton = interactiveControls(container).find(
      (button) => button.textContent === "Run Investor Lens"
    );
    expect(lensButton).toBeTruthy();
    await act(async () => {
      lensButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushPromises();

    expect(generateCalls(fetchMock)).toHaveLength(1);
    expect(generateCalls(fetchMock)[0]?.[1]?.body).toBe(
      JSON.stringify({ domain: "linear.app", mode: "analysis", confirmStart: true })
    );
    await unmount();
  });

  it("surfaces a notice when a completed section run has no saved section", async () => {
    const domain = "linear.app";
    const missingSectionMessage = "Section run completed, but no saved section result was returned.";
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith("/api/generate") && init?.method === "POST") {
        return jsonResponse({ slug: "linear", domain, status: "queued", mode: "analysis" }, { status: 202 });
      }

      if (String(url).includes("/api/generate?")) {
        return jsonResponse({ slug: "linear", domain, status: "complete", mode: "analysis" });
      }

      if (String(url).includes("/api/extension/bootstrap")) {
        return jsonResponse({
          domain,
          slug: "linear",
          card: cardForDomain(domain),
          sections: [],
          runs: {
            basics: { slug: "linear", domain, mode: "basics", status: "idle" },
            analysis: { slug: "linear", domain, mode: "analysis", status: "idle" }
          }
        });
      }

      return jsonResponse(cardForDomain(domain));
    });
    const { container, unmount } = await renderSidePanel({ domain, fetchMock });

    const signalsButton = interactiveControls(container).find(
      (button) => button.textContent?.includes("Signals")
    );
    expect(signalsButton).toBeTruthy();

    await act(async () => {
      signalsButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushPromises();

    expect(container.querySelector<HTMLElement>('[data-layer-id="signals"]')?.dataset.state).toBe("failed");
    expect(container.textContent).toContain("Research status");
    expect(container.textContent).toContain(missingSectionMessage);
    expect(generateCalls(fetchMock)).toHaveLength(1);
    await unmount();
  });

  it("clears a stale section notice after a later section succeeds", async () => {
    const domain = "linear.app";
    const signalsFailed = {
      ...testSection(domain, "traction", "failed"),
      error: "Signals failed before enough evidence was saved."
    };
    const signalsAvailable: ResearchSection = {
      ...testSection(domain, "traction", "available"),
      content: {
        status: "available",
        summary: "Signals are supported by cited evidence.",
        items: [{
          label: "Recent signal",
          text: "The company has a cited product signal [c1].",
          citationIds: ["c1"]
        }],
        confidence: "medium"
      },
      citationIds: ["c1"],
      sourceIds: ["c1"],
      runId: "section-run-signals",
      generatedAt: "2026-05-07T12:00:00.000Z"
    };
    let requestedSection: string | null = null;
    let signalsHasFailed = false;
    let signalsCanSucceed = false;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith("/api/generate") && init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as { sectionId?: string };
        requestedSection = body.sectionId ?? null;
        return jsonResponse({ slug: "linear", domain, status: "queued", mode: "analysis" }, { status: 202 });
      }

      if (String(url).includes("/api/extension/bootstrap")) {
        return jsonResponse({
          domain,
          slug: "linear",
          card: cardForDomain(domain),
          sections: [
            signalsCanSucceed ? signalsAvailable : signalsHasFailed ? signalsFailed : testSection(domain, "traction", "not_started")
          ],
          runs: {
            basics: { slug: "linear", domain, mode: "basics", status: "idle" },
            analysis: { slug: "linear", domain, mode: "analysis", status: "idle" }
          }
        });
      }

      if (String(url).includes("/api/generate?")) {
        if (requestedSection === "traction") {
          if (signalsCanSucceed) {
            return jsonResponse({ slug: "linear", domain, status: "complete", mode: "analysis" });
          }
          signalsHasFailed = true;
          return jsonResponse({
            slug: "linear",
            domain,
            status: "failed",
            mode: "analysis",
            error: signalsFailed.error
          });
        }
        return jsonResponse({ slug: "linear", domain, status: "running", mode: "analysis" });
      }

      return jsonResponse(cardForDomain(domain));
    });
    const { container, unmount } = await renderSidePanel({ domain, fetchMock });

    const signalsButton = interactiveControls(container).find(
      (button) => button.textContent?.includes("Signals")
    );
    expect(signalsButton).toBeTruthy();
    await act(async () => {
      signalsButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushPromises();

    expect(container.querySelector(".cs-research-notice")?.textContent).toContain(signalsFailed.error);

    signalsCanSucceed = true;
    const retrySignalsButton = container.querySelector<HTMLButtonElement>('[data-layer-id="signals"] .cs-layer-action');
    expect(retrySignalsButton?.textContent).toBe("Queue");
    await act(async () => {
      retrySignalsButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushPromises();

    expect(container.querySelector<HTMLElement>('[data-layer-id="signals"]')?.dataset.state).toBe("saved");
    expect(container.querySelector(".cs-research-notice")).toBeNull();
    expect(generateCalls(fetchMock)).toHaveLength(2);
    await unmount();
  });

  it("reattaches polling to a running section without restarting it after reopening the panel", async () => {
    vi.useFakeTimers();
    const domain = "linear.app";
    const runningSection = testSection(domain, "traction", "running");
    const availableSection: ResearchSection = {
      ...runningSection,
      status: "available",
      content: {
        status: "available",
        summary: "Linear has recent cited signals.",
        items: [{
          label: "Recent signal",
          text: "Linear shipped a cited product update [c1].",
          citationIds: ["c1"]
        }],
        confidence: "medium"
      },
      citationIds: ["c1"],
      sourceIds: ["c1"],
      generatedAt: "2026-05-07T12:00:00.000Z"
    };
    let completeSection = false;
    let bootstrapCount = 0;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith("/api/generate") && init?.method === "POST") {
        return jsonResponse({ slug: "linear", domain, status: "running", mode: "analysis" }, { status: 202 });
      }

      if (String(url).includes("/api/generate?")) {
        return jsonResponse({ slug: "linear", domain, status: "running", mode: "analysis" });
      }

      if (String(url).includes("/api/extension/bootstrap")) {
        bootstrapCount += 1;
        const section = bootstrapCount > 1 && completeSection ? availableSection : runningSection;
        return jsonResponse({
          domain,
          slug: "linear",
          card: cardForDomain(domain),
          sections: [section],
          runs: {
            basics: { slug: "linear", domain, mode: "basics", status: "idle" },
            analysis: { slug: "linear", domain, mode: "analysis", status: "idle" }
          }
        });
      }

      return jsonResponse(cardForDomain(domain));
    });
    const { container, unmount } = await renderSidePanel({ domain, fetchMock, deferPinnedLayerGet: true });
    await flushPromises();

    expect(container.querySelector<HTMLElement>('[data-layer-id="signals"]')?.dataset.state).toBe("running");
    await act(async () => {
      vi.advanceTimersByTime(0);
    });
    await flushPromises();
    expect(container.querySelector<HTMLElement>('[data-layer-id="signals"]')?.dataset.state).toBe("running");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(65_000);
    });
    await flushPromises();
    expect(container.textContent).toContain("Refreshing · 1:05");
    expect(container.textContent).not.toContain("Refreshing · 0:00");
    completeSection = true;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_600);
    });
    await flushPromises();
    expect(container.querySelector<HTMLElement>('[data-layer-id="signals"]')?.dataset.state).toBe("saved");
    expect(generateCalls(fetchMock)).toHaveLength(0);
    await unmount();
  });

  it("keeps section generation out of the global profile progress state", async () => {
    vi.useFakeTimers();
    const domain = "linear.app";
    const section = testSection(domain, "traction", "not_started");
    const source = {
      id: "source-1",
      url: "https://linear.app/",
      title: "Linear",
      domain,
      sourceType: "company_site",
      fetchedAt: new Date().toISOString(),
      snippet: "Linear builds issue tracking software."
    };
    const profileEvent = {
      id: "event-1",
      runId: "run-basics",
      slug: "linear",
      domain,
      sectionId: null,
      type: "source.found",
      message: "Found 1 source",
      metadata: { sourceCount: 1 },
      createdAt: new Date().toISOString()
    };
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith("/api/generate") && init?.method === "POST") {
        return jsonResponse({ slug: "linear", domain, status: "queued", mode: "analysis" }, { status: 202 });
      }

      if (String(url).includes("/api/generate?")) {
        return jsonResponse({ slug: "linear", domain, status: "running", mode: "analysis" });
      }

      if (String(url).includes("/api/extension/bootstrap")) {
        return jsonResponse({
          domain,
          slug: "linear",
          card: cardForDomain(domain),
          sections: [section],
          sources: [source],
          events: [profileEvent],
          runs: {
            basics: { slug: "linear", domain, mode: "basics", status: "idle" },
            analysis: { slug: "linear", domain, mode: "analysis", status: "idle" }
          }
        });
      }

      return jsonResponse(cardForDomain(domain));
    });
    const { container, unmount } = await renderSidePanel({ domain, fetchMock });

    const signalsButton = interactiveControls(container).find(
      (button) => button.textContent?.includes("Signals")
    );
    await act(async () => {
      signalsButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushPromises();

    expect(container.querySelector<HTMLElement>('[data-layer-id="signals"]')?.dataset.state).toBe("running");
    // No second, global progress voice exists on the profile phase to leak the section run into.
    expect(container.querySelector(".cs-research-progress")).toBeNull();
    expect(generateCalls(fetchMock)).toHaveLength(1);
    await unmount();
  });

  it("keeps polling analysis until the extension card has synthesis", async () => {
    vi.useFakeTimers();
    let cardFetchesAfterAnalysis = 0;
    let statusPollsAfterAnalysis = 0;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith("/api/generate") && init?.method === "POST") {
        return jsonResponse({ slug: "linear", status: "queued", mode: "analysis" }, { status: 202 });
      }

      if (String(url).includes("/api/generate?")) {
        const hasStartedAnalysis = generateCalls(fetchMock).length > 0;
        if (hasStartedAnalysis) {
          statusPollsAfterAnalysis += 1;
        }
        return jsonResponse({
          slug: "linear",
          domain: "linear.app",
          status: hasStartedAnalysis && statusPollsAfterAnalysis > 1 ? "complete" : hasStartedAnalysis ? "running" : "idle",
          mode: "analysis"
        });
      }

      const hasStartedAnalysis = generateCalls(fetchMock).length > 0;
      if (hasStartedAnalysis) {
        cardFetchesAfterAnalysis += 1;
        return jsonResponse(cardFetchesAfterAnalysis > 1 ? cardWithSynthesis("linear.app") : cardForDomain("linear.app"));
      }

      return jsonResponse(cardForDomain("linear.app"));
    });
    const { container, unmount } = await renderSidePanel({ domain: "linear.app", fetchMock });

    const lensButton = interactiveControls(container).find(
      (button) => button.textContent === "Run Investor Lens"
    );
    await act(async () => {
      lensButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushPromises();

    expect(container.textContent).toContain("Investor Lens running");
    expect(container.textContent).not.toContain(legacyAnalysisLabel);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });
    await flushPromises();

    expect(container.textContent).toContain("The company has a supported wedge");
    expect(container.textContent).not.toContain("[c1]");
    expect(container.textContent).not.toContain(legacyAnalysisLabel);
    await unmount();
  });

  it("keeps Timing honest when synthesis has no supported market timing", async () => {
    const staleCard = cardWithSynthesis("linear.app");
    const fetchMock = vi.fn(async () => jsonResponse(staleCard));
    const { container, unmount } = await renderSidePanel({ domain: "linear.app", fetchMock });

    const timingButton = interactiveControls(container).find(
      (button) => button.textContent?.includes("Timing")
    );
    expect(timingButton).toBeTruthy();

    await act(async () => {
      timingButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushPromises();

    expect(generateCalls(fetchMock)).toHaveLength(0);
    expect(container.querySelector<HTMLElement>('[data-layer-id="marketStructureTiming"]')?.dataset.state).toBe("empty");
    expect(container.textContent).toContain("Timing not found");
    expect(container.textContent).toContain("Current sources did not support a timing read.");
    await unmount();
  });

  it("renders compact linked source chips without inline citation markers", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(cardWithSynthesis("linear.app")));
    const { container, unmount } = await renderSidePanel({ domain: "linear.app", fetchMock });

    expect(container.textContent).toContain("The company has a supported wedge.");
    expect(container.textContent).not.toContain("[c1]");
    const sourceLink = container.querySelector<HTMLAnchorElement>(".cs-lens-source[href='https://linear.app/']");
    expect(sourceLink).toBeTruthy();
    expect(sourceLink?.textContent).toContain("linear.app");
    expect(sourceLink?.target).toBe("_blank");

    await unmount();
  });

  it("groups open questions separately from evidence rows", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(cardWithSynthesis("linear.app")));
    const { container, unmount } = await renderSidePanel({ domain: "linear.app", fetchMock });
    const nextQuestionButton = interactiveControls(container).find((button) => button.textContent?.includes("Next question"));
    expect(nextQuestionButton).toBeTruthy();

    await act(async () => {
      nextQuestionButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const questionGroup = container.querySelector(".cs-layer-questions");
    expect(questionGroup).toBeTruthy();
    expect(questionGroup?.textContent).toContain("Open questions");
    expect(questionGroup?.textContent).toContain("Who owns the budget?");
    expect(container.querySelector('[data-layer-id="openQuestions"] .cs-layer-items')).toBeNull();
    await unmount();
  });

  it("renders Money and Signals with bespoke ledger treatments", async () => {
    const card = cardForDomain("linear.app");
    card.funding.totalRaisedUsd = { value: 35000000, status: "verified", confidence: "high", citationIds: ["c1"] };
    card.funding.lastRound = {
      value: { name: "Series B", amountUsd: 35000000, announcedAt: "2025-09-20", leadInvestors: ["Accel", "Sequoia"] },
      status: "verified",
      confidence: "high",
      citationIds: ["c1"]
    };
    card.funding.investors = {
      value: [{ name: "Accel", domain: "accel.com" }, { name: "Sequoia", domain: "sequoiacap.com" }],
      status: "verified",
      confidence: "high",
      citationIds: ["c1"]
    };
    card.signals = [
      {
        title: "Linear launches planning update",
        url: "https://news.example/linear-planning",
        date: "2026-05-15",
        source: "Example News",
        category: "launch",
        citationIds: ["c2"]
      }
    ];
    const fetchMock = vi.fn(async () => jsonResponse(card));
    const { container, unmount } = await renderSidePanel({ domain: "linear.app", fetchMock });

    const moneyButton = interactiveControls(container).find((button) => button.textContent?.includes("Money"));
    expect(moneyButton).toBeTruthy();
    await act(async () => {
      moneyButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.querySelector(".cs-layer-money-ledger")).toBeTruthy();
    expect(container.textContent).toContain("$35,000,000");
    expect(container.textContent).toContain("Accel, Sequoia");

    const signalsButton = interactiveControls(container).find((button) => button.textContent?.includes("Signals"));
    expect(signalsButton).toBeTruthy();
    await act(async () => {
      signalsButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.querySelector(".cs-layer-signal-ledger")).toBeTruthy();
    expect(container.textContent).toContain("Linear launches planning update");
    // Dates render quietly under the headline, not as a raw ISO column.
    expect(container.querySelector(".cs-signal-meta time")?.textContent).toBe("May 15 2026");
    expect(container.querySelector(".cs-layer-signal-ledger strong")?.textContent).toBe("Linear launches planning update");
    await unmount();
  });

  it("queues empty card-backed enrichments when activated", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith("/api/generate") && init?.method === "POST") {
        return jsonResponse({ slug: "warp", status: "queued", mode: "basics" }, { status: 202 });
      }

      if (String(url).includes("/api/generate?")) {
        return jsonResponse({ slug: "warp", domain: "warp.dev", status: "idle", mode: "basics" });
      }

      return jsonResponse(cardForDomain("warp.dev"));
    });
    const { container, unmount } = await renderSidePanel({ domain: "warp.dev", fetchMock });

    const signalsButton = interactiveControls(container).find(
      (button) => button.textContent?.includes("Signals")
    );
    expect(signalsButton).toBeTruthy();

    await act(async () => {
      signalsButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushPromises();

    expect(container.textContent).toContain("Refreshing");
    expect(container.textContent).toContain("Checking recent traction");
    expect(generateCalls(fetchMock)).toHaveLength(1);
    await unmount();
  });

  it("shows an empty card-backed enrichment as running after activation", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith("/api/generate") && init?.method === "POST") {
        return jsonResponse({ slug: "warp", status: "queued", mode: "basics" }, { status: 202 });
      }

      if (String(url).includes("/api/generate?")) {
        return jsonResponse({ slug: "warp", domain: "warp.dev", status: "idle", mode: "basics" });
      }

      return jsonResponse(cardForDomain("warp.dev"));
    });
    const { container, unmount } = await renderSidePanel({ domain: "warp.dev", fetchMock });

    const signalsButton = interactiveControls(container).find(
      (button) => button.textContent?.includes("Signals")
    );
    expect(signalsButton).toBeTruthy();

    await act(async () => {
      signalsButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushPromises();

    const signalsCard = container.querySelector<HTMLElement>('[data-layer-id="signals"]');
    expect(signalsCard?.dataset.state).toBe("running");
    expect(signalsCard?.dataset.expanded).toBe("true");
    expect(container.textContent).toContain("Checking recent traction");
    expect(generateCalls(fetchMock)).toHaveLength(1);
    await unmount();
  });

  it("activates an enrichment by keyboard from the card pile", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(cardForDomain("warp.dev")));
    const { container, unmount } = await renderSidePanel({ domain: "warp.dev", fetchMock });

    const servesButton = interactiveControls(container).find(
      (button) => button.textContent?.includes("Who pays")
    );
    expect(servesButton).toBeTruthy();

    await act(async () => {
      servesButton?.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }));
    });
    await flushPromises();

    expect(container.textContent).toContain("Who pays1 source");
    expect(generateCalls(fetchMock)).toHaveLength(0);
    await unmount();
  });

  it("persists pinned research cards per domain without restarting generation on reopen", async () => {
    const storedLocal: Record<string, unknown> = {};
    const fetchMock = vi.fn(async () => jsonResponse(cardForDomain("warp.dev")));
    const firstRender = await renderSidePanel({ domain: "warp.dev", fetchMock, storedLocal });

    const servesButton = interactiveControls(firstRender.container).find(
      (button) => button.textContent?.includes("Who pays")
    );
    expect(servesButton).toBeTruthy();

    await act(async () => {
      servesButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushPromises();
    await firstRender.unmount();

    const secondRender = await renderSidePanel({ domain: "warp.dev", fetchMock, storedLocal });
    expect(secondRender.container.textContent).toContain("Who pays1 source");
    expect(generateCalls(fetchMock)).toHaveLength(0);
    await secondRender.unmount();
  });

  it("keeps a same-domain activation when pinned-layer hydration returns late", async () => {
    vi.useFakeTimers();
    const storedLocal: Record<string, unknown> = {};
    const fetchMock = vi.fn(async () => jsonResponse(cardForDomain("warp.dev")));
    const { container, unmount } = await renderSidePanel({
      domain: "warp.dev",
      fetchMock,
      storedLocal,
      deferPinnedLayerGet: true
    });

    const servesButton = interactiveControls(container).find(
      (button) => button.textContent?.includes("Who pays")
    );
    expect(servesButton).toBeTruthy();

    await act(async () => {
      servesButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushPromises();

    expect(container.textContent).toContain("Who pays1 source");

    await act(async () => {
      vi.advanceTimersByTime(0);
    });
    await flushPromises();

    expect(container.textContent).toContain("Who pays1 source");
    expect(storedLocal.coldStartPinnedResearchLayers).toEqual({ "warp.dev": ["serves"] });
    expect(generateCalls(fetchMock)).toHaveLength(0);
    await unmount();
  });

  it("keeps polling when the generation status route is unavailable", async () => {
    vi.useFakeTimers();
    let cardFetchesAfterGeneration = 0;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith("/api/generate") && init?.method === "POST") {
        return jsonResponse({ slug: "obvious", status: "queued", mode: "basics" }, { status: 202 });
      }

      if (String(url).includes("/api/generate?")) {
        return new Response(null, { status: 405 });
      }

      const hasStartedGeneration = generateCalls(fetchMock).length > 0;
      if (hasStartedGeneration) {
        cardFetchesAfterGeneration += 1;
        return cardFetchesAfterGeneration > 1 ? jsonResponse(cardForDomain("obvious.ai")) : missingCardResponse();
      }

      return missingCardResponse();
    });
    const { container, unmount } = await renderSidePanel({ domain: "obvious.ai", fetchMock });

    const generateButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Begin research"
    );
    await act(async () => {
      generateButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushPromises();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });
    await flushPromises();

    expect(container.textContent).not.toContain("request failed with 405");
    expect(container.textContent).toContain("Research");
    expect(container.textContent).toContain("obvious.ai");
    await unmount();
  });

  it("keeps the basics card visible when analysis fails for insufficient evidence", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith("/api/generate") && init?.method === "POST") {
        return jsonResponse({ slug: "linear", status: "queued", mode: "analysis" }, { status: 202 });
      }

      if (String(url).includes("/api/generate?")) {
        return jsonResponse({
          slug: "linear",
          domain: "linear.app",
          status: "failed",
          mode: "analysis",
          error: "No synthesis claims survived verification"
        });
      }

      return jsonResponse(cardForDomain("linear.app"));
    });
    const { container, unmount } = await renderSidePanel({ domain: "linear.app", fetchMock });

    const lensButton = interactiveControls(container).find(
      (button) => button.textContent === "Run Investor Lens"
    );
    await act(async () => {
      lensButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushPromises();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });
    await flushPromises();

    expect(container.textContent).toContain("Research");
    expect(container.textContent).toContain("linear.app");
    // The empty verifier outcome files as an honest Lens receipt, not a generic error notice,
    // and the Lens control stays available for a rerun.
    expect(container.textContent).toContain("Lens not filed");
    expect(container.textContent).toContain("No supported investor read survived verification.");
    expect(container.textContent).not.toContain("Research status");
    expect(
      interactiveControls(container).some((button) => button.textContent === "Run Investor Lens")
    ).toBe(true);
    await unmount();
  });

  it("shows the generation gate again when the active domain changes", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith("/api/generate") && init?.method === "POST") {
        return jsonResponse({ slug: "company", status: "queued", mode: "basics" }, { status: 202 });
      }

      return missingCardResponse();
    });
    const panel = await renderSidePanel({ domain: "amazon.com", fetchMock });

    await panel.changeDomain("linear.app");

    expect(generateCalls(fetchMock)).toHaveLength(0);
    const generateButton = Array.from(panel.container.querySelectorAll("button")).find(
      (button) => button.textContent === "Begin research"
    );
    expect(generateButton).toBeTruthy();
    expect(panel.container.textContent).toContain("Linear");
    await panel.unmount();
  });
});
