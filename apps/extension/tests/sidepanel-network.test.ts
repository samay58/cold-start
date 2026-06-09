// @vitest-environment jsdom

import { COLD_START_API_CONTRACT_HEADER, COLD_START_API_CONTRACT_VERSION, type ColdStartCard, type ResearchSection } from "@cold-start/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { pollGenerationUntilCard, startSectionGenerationAndPoll } from "../src/sidepanel-network";
import type { ExtensionResearchRunEvent, Settings } from "../src/extension-config";

const settings: Settings = {
  apiOrigin: "http://localhost:3000",
  apiToken: "token-123"
};

function jsonResponse(body: unknown, init?: ResponseInit) {
  const response = new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    ...init
  });
  response.headers.set(COLD_START_API_CONTRACT_HEADER, COLD_START_API_CONTRACT_VERSION);
  return response;
}

function cardForDomain(domain: string): ColdStartCard {
  return {
    slug: domain.split(".")[0] ?? domain,
    domain,
    generatedAt: "2026-06-07T12:00:00.000Z",
    generationCostUsd: 0,
    cacheStatus: "hit",
    identity: {
      name: { value: "Linear", status: "verified", confidence: "high", citationIds: ["c1"] },
      websiteUrl: { value: `https://${domain}/`, status: "verified", confidence: "high", citationIds: ["c1"] },
      logoUrl: null,
      oneLiner: { value: "Linear builds issue tracking software.", status: "verified", confidence: "high", citationIds: ["c1"] },
      hq: { value: { city: "San Francisco", country: "United States" }, status: "verified", confidence: "medium", citationIds: ["c1"] },
      foundedYear: { value: 2019, status: "verified", confidence: "medium", citationIds: ["c1"] },
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
      headcount: { value: { value: 131, asOf: "2026-06-07" }, status: "inferred", confidence: "medium", citationIds: ["c1"] }
    },
    signals: [],
    comparables: [{ name: "Jira", domain: "atlassian.com", oneLiner: "Issue tracking and project management software." }],
    citations: [
      {
        id: "c1",
        url: `https://${domain}/`,
        title: "Linear",
        fetchedAt: "2026-06-07T12:00:00.000Z",
        sourceType: "company_site"
      }
    ]
  };
}

function storedCustomerProofSection(domain: string): ResearchSection {
  return {
    slug: domain.split(".")[0] ?? domain,
    domain,
    sectionId: "customer_proof",
    visibility: "public",
    status: "available",
    content: {
      status: "available",
      summary: "Stored customer proof survives a section poll.",
      items: [{
        label: "Customer proof",
        text: "Linear has stored customer proof from a prior run [c1].",
        citationIds: ["c1"]
      }],
      confidence: "medium"
    },
    citationIds: ["c1"],
    sourceIds: ["c1"],
    runId: "run-customer-proof",
    error: null,
    generatedAt: "2026-06-07T12:00:00.000Z",
    staleAt: null
  };
}

function eventFor(domain: string, type: string, createdAt: string): ExtensionResearchRunEvent {
  return {
    id: `${type}-${createdAt}`,
    runId: "run-basics",
    slug: domain.split(".")[0] ?? domain,
    domain,
    sectionId: null,
    type,
    message: type === "card.partial" ? "Saved first usable company card" : "Found 2 sources",
    metadata: type === "card.partial" ? { citationCount: 6 } : { sourceCount: 2 },
    createdAt
  };
}

describe("section generation polling", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("waits for a card milestone before fetching the full card during active basics polling", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("chrome", { runtime: { id: "extension-test-id" } });
    const domain = "linear.app";
    const eventsByPoll: ExtensionResearchRunEvent[][] = [
      [eventFor(domain, "source.found", "2026-06-07T12:00:01.000Z")],
      [eventFor(domain, "source.found", "2026-06-07T12:00:02.000Z")],
      [
        eventFor(domain, "source.found", "2026-06-07T12:00:02.000Z"),
        eventFor(domain, "card.partial", "2026-06-07T12:00:03.000Z")
      ]
    ];
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/api/generate?")) {
        const events = eventsByPoll.shift() ?? eventsByPoll.at(-1) ?? [];
        return jsonResponse({
          slug: "linear",
          domain,
          status: "running",
          mode: "basics",
          events
        });
      }

      if (String(url).includes("/api/extension/cards/")) {
        return jsonResponse(cardForDomain(domain));
      }

      throw new Error(`unexpected request: ${String(url)}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const resultPromise = pollGenerationUntilCard(
      domain,
      settings,
      new AbortController().signal,
      "basics",
      vi.fn()
    );

    await Promise.resolve();
    await Promise.resolve();
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/api/extension/cards/"))).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(350);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/api/extension/cards/"))).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(350);
    await expect(resultPromise).resolves.toMatchObject({
      card: { domain }
    });
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/api/extension/cards/"))).toHaveLength(1);
  });

  it("does not refetch the same card milestone on every completion-watch poll", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("chrome", { runtime: { id: "extension-test-id" } });
    const domain = "linear.app";
    const partialEvent = eventFor(domain, "card.partial", "2026-06-07T12:00:03.000Z");
    const completeEvent = eventFor(domain, "generation.complete", "2026-06-07T12:00:09.000Z");
    const statusResponses: Array<{
      status: "running" | "complete";
      events: ExtensionResearchRunEvent[];
    }> = [
      { status: "running", events: [partialEvent] },
      { status: "running", events: [partialEvent] },
      { status: "running", events: [partialEvent] },
      { status: "complete", events: [partialEvent, completeEvent] }
    ];
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/api/generate?")) {
        const nextStatus = statusResponses.shift() ?? { status: "complete" as const, events: [partialEvent, completeEvent] };
        return jsonResponse({
          slug: "linear",
          domain,
          mode: "basics",
          ...nextStatus
        });
      }

      if (String(url).includes("/api/extension/cards/")) {
        return jsonResponse(cardForDomain(domain));
      }

      throw new Error(`unexpected request: ${String(url)}`);
    });
    const onInterimCard = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const cardRequests = () => fetchMock.mock.calls.filter(([url]) => String(url).includes("/api/extension/cards/"));

    const resultPromise = pollGenerationUntilCard(
      domain,
      settings,
      new AbortController().signal,
      "basics",
      vi.fn(),
      null,
      true,
      onInterimCard
    );

    await vi.waitFor(() => expect(cardRequests()).toHaveLength(1));
    expect(onInterimCard).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(350);
    expect(cardRequests()).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(350);
    expect(cardRequests()).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(350);
    await expect(resultPromise).resolves.toMatchObject({
      card: { domain }
    });
    expect(cardRequests()).toHaveLength(2);
    expect(onInterimCard).toHaveBeenCalledTimes(1);
  });

  it("preserves known section rows when bootstrap omits sections during polling", async () => {
    vi.stubGlobal("chrome", { runtime: { id: "extension-test-id" } });
    const domain = "linear.app";
    const card = cardForDomain(domain);
    const knownSection = storedCustomerProofSection(domain);
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith("/api/generate") && init?.method === "POST") {
        return jsonResponse({ slug: "linear", status: "queued", mode: "analysis" });
      }

      if (String(url).includes("/api/extension/bootstrap")) {
        return jsonResponse({
          domain,
          slug: "linear",
          card,
          runs: {
            basics: { slug: "linear", domain, mode: "basics", status: "idle" },
            analysis: { slug: "linear", domain, mode: "analysis", status: "idle" }
          }
        });
      }

      if (String(url).includes("/api/generate?")) {
        return jsonResponse({
          slug: "linear",
          domain,
          status: "failed",
          mode: "analysis",
          error: "Market section failed."
        });
      }

      throw new Error(`unexpected request: ${String(url)}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await startSectionGenerationAndPoll(
      domain,
      settings,
      new AbortController().signal,
      "market",
      card,
      [knownSection],
      vi.fn()
    );

    expect(result.sections.find((section) => section.sectionId === "customer_proof")).toMatchObject({
      status: "available",
      content: { summary: "Stored customer proof survives a section poll." }
    });
    expect(result.sections.find((section) => section.sectionId === "market")).toMatchObject({
      status: "failed",
      error: "Market section failed."
    });
  });
});
