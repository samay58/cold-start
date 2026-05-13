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

function cardForDomain(domain: string): ColdStartCard {
  return {
    slug: domain.split(".")[0] ?? domain,
    domain,
    generatedAt: "2026-05-07T12:00:00.000Z",
    generationCostUsd: 0,
    cacheStatus: "hit",
    identity: {
      name: { value: domain, status: "verified", confidence: "high", citationIds: ["c1"] },
      logoUrl: null,
      oneLiner: { value: "Cached company card", status: "verified", confidence: "high", citationIds: ["c1"] },
      hq: { value: null, status: "unknown", confidence: "low", citationIds: [] },
      foundedYear: { value: null, status: "unknown", confidence: "low", citationIds: [] },
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
      headcount: { value: null, status: "unknown", confidence: "low", citationIds: [] }
    },
    signals: [],
    comparables: [],
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
      oneLiner: { value: null, status: "unknown", confidence: "low", citationIds: [] }
    },
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
        value: [{ name: "Jessica Lessin", role: "Founder and CEO", sourceUrl: `https://${domain}/about` }],
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
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function renderSidePanel(input: {
  domain: string;
  fetchMock: ReturnType<typeof vi.fn>;
}) {
  vi.resetModules();

  const listeners = new Set<StorageListener>();
  let activeDomain = input.domain;

  vi.stubGlobal("fetch", input.fetchMock);
  vi.stubGlobal("chrome", {
    runtime: { id: "extension-test-id" },
    storage: {
      local: {
        get: (_keys: readonly string[], callback: (items: typeof settings) => void) => callback(settings),
        set: (_items: unknown, callback: () => void) => callback()
      },
      session: {
        get: (_key: string, callback: (items: { activeDomain: string }) => void) => callback({ activeDomain }),
        set: vi.fn()
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
    expect(container.textContent).toContain("Generate Amazon?");
    const generateButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Generate profile"
    );
    expect(generateButton).toBeTruthy();

    await act(async () => {
      generateButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushPromises();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });
    await flushPromises();

    expect(generateCalls(fetchMock)).toHaveLength(1);
    expect(generateCalls(fetchMock)[0]?.[1]?.body).toBe(
      JSON.stringify({ domain: "amazon.com", mode: "basics", confirmStart: true })
    );
    expect(container.textContent).toContain("Research layer");
    expect(container.textContent).toContain("amazon.com");
    await unmount();
  });

  it("renders a cached card without requiring Start", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(cardForDomain("linear.app")));
    const { container, unmount } = await renderSidePanel({ domain: "linear.app", fetchMock });

    expect(container.textContent).toContain("Research layer");
    expect(container.textContent).toContain("linear.app");
    expect(container.textContent).not.toContain("Generate Linear?");
    expect(generateCalls(fetchMock)).toHaveLength(0);
    await unmount();
  });

  it("renders core metrics and management as fixed company context", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(cardWithManagement("theinformation.com")));
    const { container, unmount } = await renderSidePanel({ domain: "theinformation.com", fetchMock });

    expect(container.querySelector("dl[aria-label='Core metrics']")).toBeTruthy();
    expect(container.textContent).toContain("Employees");
    expect(container.textContent).toContain("87");
    expect(container.textContent).toContain("As of 2026-04-26");
    expect(container.textContent).toContain("theinformation.com");
    expect(container.textContent).toContain("Management team");
    expect(container.textContent).toContain("2 sources");
    expect(container.textContent).toContain("Jessica Lessin");
    expect(container.textContent).toContain("Matthew Resnick");
    expect(container.textContent).toContain("Amir Efrati");
    expect(container.textContent).toContain("Research layer");
    const managementNames = Array.from(container.querySelectorAll(".cs-management-team strong"))
      .map((name) => name.textContent);
    expect(managementNames.filter((name) => name === "Jessica Lessin")).toHaveLength(1);
    await unmount();
  });

  it("does not render the old standalone analysis CTA for a sourced card", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(cardForDomain("warp.dev")));
    const { container, unmount } = await renderSidePanel({ domain: "warp.dev", fetchMock });

    const buttons = interactiveControls(container).map((button) => button.textContent?.trim());
    expect(buttons).not.toContain(legacyAnalysisLabel);
    expect(container.textContent).toContain("Research layer");
    expect(container.textContent).toContain("Core Idea");

    await unmount();
  });

  it("renders the research layer pile for a sourced card", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(cardForDomain("warp.dev")));
    const { container, unmount } = await renderSidePanel({ domain: "warp.dev", fetchMock });

    expect(container.textContent).toContain("Research layer");
    expect(container.textContent).toContain("Core Idea");
    expect(container.textContent).toContain("Customers");
    expect(container.textContent).toContain("Add enrichment");
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
      return cardFetches > 1 ? jsonResponse(cardForDomain("cartesia.ai")) : missingCardResponse();
    });
    const { container, unmount } = await renderSidePanel({ domain: "cartesia.ai", fetchMock });

    expect(container.textContent).toContain("Building profile");
    expect(container.textContent).not.toContain("Collecting source distance");
    expect(container.textContent).not.toContain("Still running in the background");
    expect(container.textContent).not.toContain("Generate Cartesia?");
    expect(generateCalls(fetchMock)).toHaveLength(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });
    await flushPromises();

    expect(container.textContent).toContain("Research layer");
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

  it("does not offer analysis on a no-source partial profile", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith("/api/generate") && init?.method === "POST") {
        return jsonResponse({ slug: "cartesia", status: "queued", mode: "basics" }, { status: 202 });
      }

      if (String(url).includes("/api/generate?")) {
        return jsonResponse({ slug: "cartesia", domain: "cartesia.ai", status: "idle", mode: "analysis" });
      }

      return jsonResponse(noSourcePartialCard("cartesia.ai"));
    });
    const { container, unmount } = await renderSidePanel({ domain: "cartesia.ai", fetchMock });

    expect(container.textContent).toContain("Regenerate the profile before running investor analysis.");
    expect(interactiveControls(container).some((button) => button.textContent === legacyAnalysisLabel)).toBe(false);

    const regenerateButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Regenerate"
    );
    expect(regenerateButton).toBeTruthy();

    await act(async () => {
      regenerateButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushPromises();

    expect(generateCalls(fetchMock)).toHaveLength(1);
    expect(generateCalls(fetchMock)[0]?.[1]?.body).toBe(
      JSON.stringify({ domain: "cartesia.ai", mode: "basics", confirmStart: true })
    );
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
      (button) => button.textContent?.includes("Core Idea")
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
      (button) => button.textContent?.includes("Core Idea")
    );
    await act(async () => {
      coreIdeaButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushPromises();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });
    await flushPromises();

    expect(container.textContent).toContain("Synthesizing");
    expect(container.textContent).not.toContain(legacyAnalysisLabel);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
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

  it("activates a card-backed enrichment by click without starting model analysis", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(cardForDomain("warp.dev")));
    const { container, unmount } = await renderSidePanel({ domain: "warp.dev", fetchMock });

    const signalsButton = interactiveControls(container).find(
      (button) => button.textContent?.includes("Signals")
    );
    expect(signalsButton).toBeTruthy();

    await act(async () => {
      signalsButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushPromises();

    expect(container.textContent).toContain("No recent cited signals found yet.");
    expect(generateCalls(fetchMock)).toHaveLength(0);
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
      (button) => button.textContent === "Generate profile"
    );
    await act(async () => {
      generateButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushPromises();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });
    await flushPromises();

    expect(container.textContent).not.toContain("request failed with 405");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });
    await flushPromises();

    expect(container.textContent).toContain("Research layer");
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
      (button) => button.textContent?.includes("Core Idea")
    );
    await act(async () => {
      coreIdeaButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushPromises();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });
    await flushPromises();

    expect(container.textContent).toContain("Research layer");
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
    expect(panel.container.textContent).toContain("Generate Linear?");
    await panel.unmount();
  });
});
