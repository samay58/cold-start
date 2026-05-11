// @vitest-environment jsdom

import { COLD_START_API_CONTRACT_HEADER, COLD_START_API_CONTRACT_VERSION, type ColdStartCard } from "@cold-start/core";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@cold-start/ui", () => ({
  CardShell: ({ card }: { card: ColdStartCard }) => (
    <div data-card-shell="true">Card loaded for {card.domain}</div>
  )
}));

type StorageListener = (
  changes: Record<string, chrome.storage.StorageChange>,
  areaName: string
) => void;

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

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

describe("SidePanel generation gate", () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    document.body.innerHTML = "";
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
    expect(container.textContent).toContain("Card loaded for amazon.com");
    await unmount();
  });

  it("renders a cached card without requiring Start", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(cardForDomain("linear.app")));
    const { container, unmount } = await renderSidePanel({ domain: "linear.app", fetchMock });

    expect(container.textContent).toContain("Card loaded for linear.app");
    expect(container.textContent).not.toContain("Generate Linear?");
    expect(generateCalls(fetchMock)).toHaveLength(0);
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
    expect(container.textContent).not.toContain("Generate Cartesia?");
    expect(generateCalls(fetchMock)).toHaveLength(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });
    await flushPromises();

    expect(container.textContent).toContain("Card loaded for cartesia.ai");
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

    expect(container.textContent).toContain("Building lens");
    expect(container.textContent).toContain("Still running in the background");
    expect(container.textContent).not.toContain("Analyze");
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
    expect(container.textContent).not.toContain("Run the cited investor read");
    expect(Array.from(container.querySelectorAll("button")).some((button) => button.textContent === "Analyze")).toBe(false);

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

  it("offers manual analysis after basics are loaded", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith("/api/generate") && init?.method === "POST") {
        return jsonResponse({ slug: "linear", status: "queued", mode: "analysis" }, { status: 202 });
      }

      return jsonResponse(cardForDomain("linear.app"));
    });
    const { container, unmount } = await renderSidePanel({ domain: "linear.app", fetchMock });

    const analyzeButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Analyze"
    );
    expect(analyzeButton).toBeTruthy();
    await act(async () => {
      analyzeButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
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

    const analyzeButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Analyze"
    );
    await act(async () => {
      analyzeButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushPromises();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });
    await flushPromises();

    expect(container.textContent).toContain("Building lens");
    expect(container.textContent).not.toContain("Analyze");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });
    await flushPromises();

    expect(container.textContent).toContain("Card loaded for linear.app");
    expect(container.textContent).not.toContain("Analyze");
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

    expect(container.textContent).toContain("Card loaded for obvious.ai");
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

    const analyzeButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Analyze"
    );
    await act(async () => {
      analyzeButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushPromises();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });
    await flushPromises();

    expect(container.textContent).toContain("Card loaded for linear.app");
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
