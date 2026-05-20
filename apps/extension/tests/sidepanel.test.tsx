// @vitest-environment jsdom

import { COLD_START_API_CONTRACT_HEADER, COLD_START_API_CONTRACT_VERSION, type ColdStartCard } from "@cold-start/core";
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
  ["Business", "Model"].join(" "),
  ["Cold", "Start", "Brief"].join(" ")
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
      openQuestions: ["Who owns the budget?"]
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
  initialSession?: Record<string, unknown>;
  storedSettings?: Partial<typeof settings>;
}) {
  vi.resetModules();

  const listeners = new Set<StorageListener>();
  let activeDomain = input.domain;
  const storedSettings = { ...settings, ...input.storedSettings };
  const sessionItems: Record<string, unknown> = { activeDomain, ...input.initialSession };

  vi.stubGlobal("fetch", input.fetchMock);
  vi.stubGlobal("chrome", {
    runtime: { id: "extension-test-id" },
    storage: {
      local: {
        get: (_keys: readonly string[], callback: (items: typeof settings) => void) => callback(storedSettings),
        set: (items: Partial<typeof settings>, callback: () => void) => {
          Object.assign(storedSettings, items);
          callback();
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
    },
    async unmount() {
      await act(async () => {
        root.unmount();
      });
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
    expect(container.textContent).toContain("No profile");
    expect(container.textContent).toContain("Build the public record.");
    const generateButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Build profile"
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
  });

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
        "Hanover Park is an AI-native fund administrator for private equity and venture capital firms. It combines fund accounting, portfolio management, LP portals, analytics, modelling, security workflows, client support, capital calls, distributions, and full-service accounting into one platform.",
      status: "verified",
      confidence: "high",
      citationIds: ["c1"]
    };

    const fetchMock = vi.fn(async () => jsonResponse(card));
    const { container, unmount } = await renderSidePanel({ domain: "hanoverpark.com", fetchMock });

    expect(container.textContent).toContain("Hanover Park is an AI-native fund administrator for private equity and venture capital firms.");
    expect(container.textContent).not.toContain("full-service accounting into one platform");
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
    expect(container.textContent).toContain("1 verified work email");
    expect(container.querySelector("a[href='mailto:jessica@theinformation.com']")).toBeTruthy();
    expect(container.textContent).toContain("Matthew Resnick");
    expect(container.textContent).toContain("Amir Efrati");
    expect(container.textContent).toContain("Research");
    const peopleLine = container.querySelector(".cs-people-line");
    expect(peopleLine?.textContent?.match(/Jessica Lessin/g)).toHaveLength(1);
    expect(container.querySelector(".cs-management-team")).toBeNull();
    await unmount();
  });

  it("does not render the old standalone analysis CTA for a sourced card", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(cardForDomain("warp.dev")));
    const { container, unmount } = await renderSidePanel({ domain: "warp.dev", fetchMock });

    const buttons = interactiveControls(container).map((button) => button.textContent?.trim());
    expect(buttons).not.toContain(legacyAnalysisLabel);
    expect(container.textContent).toContain("Research");
    expect(container.textContent).toContain("Thesis");

    await unmount();
  });

  it("renders the research layer pile for a sourced card", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(cardForDomain("warp.dev")));
    const { container, unmount } = await renderSidePanel({ domain: "warp.dev", fetchMock });

    expect(container.textContent).toContain("Research");
    expect(container.textContent).toContain("Thesis");
    expect(container.textContent).toContain("Customers");
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
      return cardFetches > 3 ? jsonResponse(cardForDomain("cartesia.ai")) : missingCardResponse();
    });
    const { container, unmount } = await renderSidePanel({ domain: "cartesia.ai", fetchMock });

    expect(container.textContent).toContain("Building");
    expect(container.textContent).toContain("Citations");
    expect(container.querySelector(".cs-run-steps")?.textContent).toContain("01Sources02Pages03Facts04Citations");
    expect(container.querySelector(".cs-generation-hero")).not.toBeNull();
    expect(container.querySelector(".cs-live-progress-track")).not.toBeNull();
    expect(container.querySelector(".cs-live-progress-fill")).not.toBeNull();
    expect(container.querySelector(".cs-generation-logo img")?.getAttribute("src")).toBe("https://icons.duckduckgo.com/ip3/cartesia.ai.ico");
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

    expect(container.textContent).toContain("Synthesizing");
    expect(container.textContent).toContain("Extracting structure from cited sources");
    expect(container.textContent).not.toContain("Longer runs continue");
    expect(container.textContent).not.toContain(legacyAnalysisLabel);
    expect(generateCalls(fetchMock)).toHaveLength(0);
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

  it("starts real analysis from an analysis-backed enrichment instead of a standalone CTA", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith("/api/generate") && init?.method === "POST") {
        return jsonResponse({ slug: "linear", status: "queued", mode: "analysis" }, { status: 202 });
      }

      return jsonResponse(cardForDomain("linear.app"));
    });
    const { container, unmount } = await renderSidePanel({ domain: "linear.app", fetchMock });

    const coreIdeaButton = interactiveControls(container).find(
      (button) => button.textContent?.includes("Thesis")
    );
    expect(coreIdeaButton).toBeTruthy();
    await act(async () => {
      coreIdeaButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushPromises();

    expect(generateCalls(fetchMock)).toHaveLength(1);
    expect(generateCalls(fetchMock)[0]?.[1]?.body).toBe(
      JSON.stringify({ domain: "linear.app", mode: "analysis", confirmStart: true })
    );
    await unmount();
  });

  it("keeps polling analysis until the extension card has synthesis", async () => {
    vi.useFakeTimers();
    let cardFetchesAfterAnalysis = 0;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith("/api/generate") && init?.method === "POST") {
        return jsonResponse({ slug: "linear", status: "queued", mode: "analysis" }, { status: 202 });
      }

      if (String(url).includes("/api/generate?")) {
        const hasStartedAnalysis = generateCalls(fetchMock).length > 0;
        return jsonResponse({ slug: "linear", domain: "linear.app", status: hasStartedAnalysis ? "running" : "idle", mode: "analysis" });
      }

      const hasStartedAnalysis = generateCalls(fetchMock).length > 0;
      if (hasStartedAnalysis) {
        cardFetchesAfterAnalysis += 1;
        return jsonResponse(cardFetchesAfterAnalysis > 1 ? cardWithSynthesis("linear.app") : cardForDomain("linear.app"));
      }

      return jsonResponse(cardForDomain("linear.app"));
    });
    const { container, unmount } = await renderSidePanel({ domain: "linear.app", fetchMock });

    const coreIdeaButton = interactiveControls(container).find(
      (button) => button.textContent?.includes("Thesis")
    );
    await act(async () => {
      coreIdeaButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushPromises();

    expect(container.textContent).toContain("Synthesizing");
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

  it("renders compact linked source chips without inline citation markers", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(cardWithSynthesis("linear.app")));
    const { container, unmount } = await renderSidePanel({ domain: "linear.app", fetchMock });

    expect(container.textContent).toContain("The company has a supported wedge.");
    expect(container.textContent).not.toContain("[c1]");
    const sourceLink = container.querySelector<HTMLAnchorElement>(".cs-source-chip[href='https://linear.app/']");
    expect(sourceLink).toBeTruthy();
    expect(sourceLink?.textContent).toContain("linear.app");
    expect(sourceLink?.target).toBe("_blank");

    await unmount();
  });

  it("refreshes empty card-backed enrichments inline instead of showing a terminal empty state", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith("/api/generate") && init?.method === "POST") {
        return jsonResponse({ slug: "warp", status: "queued", mode: "basics" }, { status: 202 });
      }

      if (String(url).includes("/api/generate?")) {
        return jsonResponse({ slug: "warp", domain: "warp.dev", status: "running", mode: "basics" });
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
    expect(container.textContent).toContain("Searching for recent traction and launch signals");
    expect(container.textContent).not.toContain("No recent cited signals found yet.");
    expect(generateCalls(fetchMock)).toHaveLength(1);
    expect(generateCalls(fetchMock)[0]?.[1]?.body).toBe(
      JSON.stringify({ domain: "warp.dev", mode: "basics", confirmStart: true, forceRefresh: true })
    );
    await unmount();
  });

  it("activates an enrichment by keyboard from the card pile", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(cardForDomain("warp.dev")));
    const { container, unmount } = await renderSidePanel({ domain: "warp.dev", fetchMock });

    const servesButton = interactiveControls(container).find(
      (button) => button.textContent?.includes("Serves")
    );
    expect(servesButton).toBeTruthy();

    await act(async () => {
      servesButton?.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }));
    });
    await flushPromises();

    expect(container.textContent).toContain("Serves1 source");
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
      (button) => button.textContent === "Build profile"
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

    const coreIdeaButton = interactiveControls(container).find(
      (button) => button.textContent?.includes("Thesis")
    );
    await act(async () => {
      coreIdeaButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushPromises();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });
    await flushPromises();

    expect(container.textContent).toContain("Research");
    expect(container.textContent).toContain("linear.app");
    expect(container.textContent).toContain("Not enough verified evidence");
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
    expect(panel.container.textContent).toContain("No profile");
    expect(panel.container.textContent).toContain("Linear");
    await panel.unmount();
  });
});
