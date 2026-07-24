// @vitest-environment jsdom

import { COLD_START_API_CONTRACT_HEADER, COLD_START_API_CONTRACT_VERSION, type ColdStartCard, type ResearchSection } from "@cold-start/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { pollGenerationUntilCard, startAnalysisGenerationAndPoll, startSectionGenerationAndPoll } from "../src/sidepanel-network";
import type { ExtensionResearchRunEvent, Settings } from "../src/shared/extension-config";

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

describe("analysis polling race between the card write and the complete status", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("refetches once when the in-hand card carries neither synthesis nor synthesisWithheld but the run already reports complete", async () => {
    vi.stubGlobal("chrome", { runtime: { id: "extension-test-id" } });
    const domain = "linear.app";
    // The server writes the card strictly before marking the run complete. This fixture
    // reproduces the window where a card fetch races ahead of that write (staleCard, neither
    // field set) in the same iteration where the status poll already reports "complete": the
    // second card fetch stands in for the post-write read that closes the race.
    const staleCard = cardForDomain(domain);
    const withheldCard: ColdStartCard = {
      ...cardForDomain(domain),
      synthesisWithheld: {
        at: "2026-07-20T12:00:00.000Z",
        reasons: ["citation-floor"],
        advisories: ["single-source-class"],
        citationCount: 3,
        sourceTypeCount: 1
      }
    };
    let cardCallCount = 0;
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/api/extension/cards/")) {
        cardCallCount += 1;
        return jsonResponse(cardCallCount === 1 ? staleCard : withheldCard);
      }

      if (String(url).includes("/api/generate?")) {
        return jsonResponse({ slug: "linear", domain, status: "complete", mode: "analysis" });
      }

      throw new Error(`unexpected request: ${String(url)}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await pollGenerationUntilCard(
      domain,
      settings,
      new AbortController().signal,
      "analysis",
      vi.fn()
    );

    expect(cardCallCount).toBe(2);
    expect(result.card.synthesisWithheld).toMatchObject({ reasons: ["citation-floor"] });
  });

  it("short-circuits on the first card fetch once a withheld record has landed, without waiting on the status poll", async () => {
    vi.stubGlobal("chrome", { runtime: { id: "extension-test-id" } });
    const domain = "linear.app";
    const withheldCard: ColdStartCard = {
      ...cardForDomain(domain),
      synthesisWithheld: {
        at: "2026-07-20T12:00:00.000Z",
        reasons: ["no-usable-source-type"],
        advisories: [],
        citationCount: 9,
        sourceTypeCount: 0
      }
    };
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/api/extension/cards/")) {
        return jsonResponse(withheldCard);
      }

      throw new Error(`unexpected request outside the fast path: ${String(url)}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await pollGenerationUntilCard(
      domain,
      settings,
      new AbortController().signal,
      "analysis",
      vi.fn()
    );

    expect(result.card.synthesisWithheld).toMatchObject({ reasons: ["no-usable-source-type"] });
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/api/generate?"))).toHaveLength(0);
  });
});

describe("analysis polling event-gated card fetch", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function withheldCardFor(domain: string, reason: string, at: string): ColdStartCard {
    return {
      ...cardForDomain(domain),
      synthesisWithheld: {
        at,
        reasons: [reason],
        advisories: [],
        citationCount: 3,
        sourceTypeCount: 1
      }
    };
  }

  it("limits the analysis card fetch to a periodic fallback across quiet ticks", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("chrome", { runtime: { id: "extension-test-id" } });
    const domain = "linear.app";
    const incompleteCard = cardForDomain(domain);
    const withheldCard = withheldCardFor(domain, "citation-floor", "2026-07-21T12:00:00.000Z");
    let cardCallCount = 0;
    // Five quiet status polls (no card-bearing events) precede the 6th tick, where the periodic
    // fallback forces a fetch regardless of events. The 1st tick's bootstrap fetch (see the next
    // test's comment) plus this fallback fetch should be the only two card fetches across 6 ticks.
    const statusResponses: Array<{ status: "running"; events: ExtensionResearchRunEvent[] }> = Array.from(
      { length: 5 },
      () => ({ status: "running" as const, events: [] })
    );
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/api/extension/cards/")) {
        cardCallCount += 1;
        return jsonResponse(cardCallCount === 1 ? incompleteCard : withheldCard);
      }

      if (String(url).includes("/api/generate?")) {
        const next = statusResponses.shift();
        if (!next) {
          throw new Error("unexpected extra status poll in this fixture");
        }
        return jsonResponse({ slug: "linear", domain, mode: "analysis", ...next });
      }

      throw new Error(`unexpected request: ${String(url)}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const resultPromise = pollGenerationUntilCard(
      domain,
      settings,
      new AbortController().signal,
      "analysis",
      vi.fn()
    );

    await vi.waitFor(() => expect(cardCallCount).toBe(1));

    for (let tick = 2; tick <= 5; tick += 1) {
      await vi.advanceTimersByTimeAsync(350);
      expect(cardCallCount).toBe(1);
    }

    await vi.advanceTimersByTimeAsync(350);
    await expect(resultPromise).resolves.toMatchObject({
      card: { synthesisWithheld: { reasons: ["citation-floor"] } }
    });
    expect(cardCallCount).toBe(2);
    expect(statusResponses).toHaveLength(0);
  });

  it("fetches the analysis card again as soon as a card.saved event lands, without waiting for the fallback", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("chrome", { runtime: { id: "extension-test-id" } });
    const domain = "linear.app";
    const incompleteCard = cardForDomain(domain);
    const finalCard = withheldCardFor(domain, "no-usable-source-type", "2026-07-21T12:05:00.000Z");
    const cardSavedEvent = eventFor(domain, "card.saved", "2026-07-21T12:04:30.000Z");
    let cardCallCount = 0;
    const statusResponses: Array<{ status: "running"; events: ExtensionResearchRunEvent[] }> = [
      { status: "running", events: [] },
      { status: "running", events: [cardSavedEvent] }
    ];
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/api/extension/cards/")) {
        cardCallCount += 1;
        return jsonResponse(cardCallCount === 1 ? incompleteCard : finalCard);
      }

      if (String(url).includes("/api/generate?")) {
        const next = statusResponses.shift() ?? { status: "running" as const, events: [] };
        return jsonResponse({ slug: "linear", domain, mode: "analysis", ...next });
      }

      throw new Error(`unexpected request: ${String(url)}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const resultPromise = pollGenerationUntilCard(
      domain,
      settings,
      new AbortController().signal,
      "analysis",
      vi.fn()
    );

    // Tick 1 always attempts a card fetch before ever requesting status, so a run that is already
    // complete or withheld resolves on reopen without paying for a status round trip (91c7175).
    await vi.waitFor(() => expect(cardCallCount).toBe(1));

    await vi.advanceTimersByTimeAsync(350); // tick 2: quiet; this status call carries the card.saved event
    expect(cardCallCount).toBe(1);

    await vi.advanceTimersByTimeAsync(350); // tick 3: sees the card.saved event recorded on tick 2, fetches now
    await expect(resultPromise).resolves.toMatchObject({
      card: { synthesisWithheld: { reasons: ["no-usable-source-type"] } }
    });
    expect(cardCallCount).toBe(2);
  });

  it("does not fetch on synthesis.started or verify.started, only on verify.complete", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("chrome", { runtime: { id: "extension-test-id" } });
    const domain = "linear.app";
    const incompleteCard = cardForDomain(domain);
    const finalCard = withheldCardFor(domain, "citation-floor", "2026-07-21T12:10:00.000Z");
    const synthesisStartedEvent = eventFor(domain, "synthesis.started", "2026-07-21T12:09:00.000Z");
    const verifyStartedEvent = eventFor(domain, "verify.started", "2026-07-21T12:09:20.000Z");
    const verifyCompleteEvent = eventFor(domain, "verify.complete", "2026-07-21T12:09:50.000Z");
    let cardCallCount = 0;
    const statusResponses: Array<{ status: "running"; events: ExtensionResearchRunEvent[] }> = [
      { status: "running", events: [] },
      { status: "running", events: [synthesisStartedEvent] },
      { status: "running", events: [synthesisStartedEvent, verifyStartedEvent] },
      { status: "running", events: [synthesisStartedEvent, verifyStartedEvent, verifyCompleteEvent] }
    ];
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/api/extension/cards/")) {
        cardCallCount += 1;
        return jsonResponse(cardCallCount === 1 ? incompleteCard : finalCard);
      }

      if (String(url).includes("/api/generate?")) {
        const next = statusResponses.shift() ?? { status: "running" as const, events: [] };
        return jsonResponse({ slug: "linear", domain, mode: "analysis", ...next });
      }

      throw new Error(`unexpected request: ${String(url)}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const resultPromise = pollGenerationUntilCard(
      domain,
      settings,
      new AbortController().signal,
      "analysis",
      vi.fn()
    );

    await vi.waitFor(() => expect(cardCallCount).toBe(1)); // tick 1 bootstrap fetch

    await vi.advanceTimersByTimeAsync(350); // tick 2: status carries synthesis.started, not card-bearing
    expect(cardCallCount).toBe(1);

    await vi.advanceTimersByTimeAsync(350); // tick 3: status adds verify.started, still not card-bearing
    expect(cardCallCount).toBe(1);

    await vi.advanceTimersByTimeAsync(350); // tick 4: status adds verify.complete (read on the next tick)
    expect(cardCallCount).toBe(1);

    await vi.advanceTimersByTimeAsync(350); // tick 5: sees verify.complete, fetches ahead of the 6th-tick fallback
    await expect(resultPromise).resolves.toMatchObject({
      card: { synthesisWithheld: { reasons: ["citation-floor"] } }
    });
    expect(cardCallCount).toBe(2);
  });
});

describe("startAnalysisGenerationAndPoll forceRefresh threading", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function capturePostBody(fetchMock: ReturnType<typeof vi.fn>) {
    const call = fetchMock.mock.calls.find(([url, init]) => String(url).endsWith("/api/generate") && (init as RequestInit | undefined)?.method === "POST");
    const body = (call?.[1] as RequestInit | undefined)?.body;
    return body ? JSON.parse(String(body)) : null;
  }

  it("sends forceRefresh: true on the generate POST body when the retry path runs", async () => {
    vi.stubGlobal("chrome", { runtime: { id: "extension-test-id" } });
    const domain = "linear.app";
    const card = cardForDomain(domain);
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith("/api/generate") && init?.method === "POST") {
        return jsonResponse({ slug: "linear", domain, status: "cached", mode: "analysis" });
      }

      if (String(url).includes("/api/extension/cards/")) {
        return jsonResponse(card);
      }

      throw new Error(`unexpected request: ${String(url)}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await startAnalysisGenerationAndPoll(
      domain,
      settings,
      new AbortController().signal,
      true,
      card,
      [],
      vi.fn(),
      true
    );

    expect(capturePostBody(fetchMock)).toMatchObject({ domain, mode: "analysis", forceRefresh: true });
  });

  it("omits forceRefresh from the generate POST body on a plain analysis request", async () => {
    vi.stubGlobal("chrome", { runtime: { id: "extension-test-id" } });
    const domain = "linear.app";
    const card = cardForDomain(domain);
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith("/api/generate") && init?.method === "POST") {
        return jsonResponse({ slug: "linear", domain, status: "cached", mode: "analysis" });
      }

      if (String(url).includes("/api/extension/cards/")) {
        return jsonResponse(card);
      }

      throw new Error(`unexpected request: ${String(url)}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await startAnalysisGenerationAndPoll(
      domain,
      settings,
      new AbortController().signal,
      true,
      card,
      [],
      vi.fn()
    );

    const body = capturePostBody(fetchMock);
    expect(body).not.toBeNull();
    expect(body).not.toHaveProperty("forceRefresh");
  });

  it("does not settle a forced retry from the prior withheld card", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("chrome", { runtime: { id: "extension-test-id" } });
    const domain = "linear.app";
    const priorCard: ColdStartCard = {
      ...cardForDomain(domain),
      synthesisWithheld: {
        at: "2026-07-20T12:00:00.000Z",
        reasons: ["citation-floor"],
        advisories: [],
        citationCount: 3,
        sourceTypeCount: 1
      }
    };
    const refreshedCard: ColdStartCard = {
      ...priorCard,
      synthesisWithheld: {
        ...priorCard.synthesisWithheld!,
        at: "2026-07-20T12:10:00.000Z",
        reasons: ["no-claims-survived"]
      }
    };
    const savedEvent = {
      ...eventFor(domain, "card.saved", "2026-07-20T12:09:50.000Z"),
      runId: "run-new"
    };
    let cardReads = 0;
    let statusReads = 0;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith("/api/generate") && init?.method === "POST") {
        return jsonResponse({
          slug: "linear",
          domain,
          runId: "run-new",
          status: "queued",
          mode: "analysis"
        }, { status: 202 });
      }
      if (String(url).includes("/api/extension/cards/")) {
        cardReads += 1;
        return jsonResponse(cardReads === 1 ? priorCard : refreshedCard);
      }
      if (String(url).includes("/api/generate?")) {
        statusReads += 1;
        return jsonResponse({
          slug: "linear",
          domain,
          runId: "run-new",
          status: "running",
          mode: "analysis",
          events: statusReads === 1 ? [] : [savedEvent]
        });
      }
      throw new Error(`unexpected request: ${String(url)}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const resultPromise = startAnalysisGenerationAndPoll(
      domain,
      settings,
      new AbortController().signal,
      true,
      priorCard,
      [],
      vi.fn(),
      true
    );

    await vi.waitFor(() => expect(cardReads).toBe(1));
    expect(statusReads).toBe(1);

    await vi.advanceTimersByTimeAsync(350);
    expect(cardReads).toBe(1);

    await vi.advanceTimersByTimeAsync(350);
    await expect(resultPromise).resolves.toMatchObject({
      card: {
        synthesisWithheld: {
          at: "2026-07-20T12:10:00.000Z",
          reasons: ["no-claims-survived"]
        }
      }
    });
    expect(cardReads).toBe(2);
  });
});
