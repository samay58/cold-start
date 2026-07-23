// @vitest-environment jsdom

import { type ColdStartCard, type ResearchSection } from "@cold-start/core";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import type { ExtensionResearchRunEvent } from "../src/shared/extension-config";

import {
  registerSidePanelHooks,
  legacyAnalysisLabel,
  cardForDomain,
  cardWithSynthesis,
  jsonResponse,
  testSection,
  flushPromises,
  renderSidePanel,
  generateCalls,
  interactiveControls,
} from "./sidepanel-harness";

describe("SidePanel analysis and sections", () => {
  registerSidePanelHooks();

  it("queues full investor analysis from the global Lens action", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith("/api/generate") && init?.method === "POST") {
        return jsonResponse({ slug: "linear", status: "queued", mode: "analysis" }, { status: 202 });
      }

      return jsonResponse(cardForDomain("linear.app"));
    });
    const { container, unmount } = await renderSidePanel({ domain: "linear.app", fetchMock });

    const lensButton = interactiveControls(container).find(
      (button) => button.getAttribute("aria-label") === "Run Investor Lens"
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

  it("does not flash the prior run's advanced stage when a withheld verdict is retried", async () => {
    // Regression test for commit dd66745: the optimistic retry state used to keep the prior
    // run's terminal events, so a fresh wait instrument flashed fully advanced for one poll
    // tick. Bootstrap seeds requestState.events with a prior, already-terminal run (run-old,
    // reaching card.saved/generation.complete) alongside a withheld card, exactly the state
    // shape handleRunAnalysis(true) -> runAnalysisGenerationWithController sees on retry.
    const domain = "linear.app";
    const staleRunEvents: ExtensionResearchRunEvent[] = [
      {
        id: "old-1", runId: "run-old", slug: "linear", domain, sectionId: null,
        type: "generation.queued", message: "Queued for analysis", metadata: {},
        createdAt: "2026-07-15T12:00:00.000Z"
      },
      {
        id: "old-2", runId: "run-old", slug: "linear", domain, sectionId: null,
        type: "source.found", message: "Found 4 sources", metadata: { acceptedCount: 4 },
        createdAt: "2026-07-15T12:00:05.000Z"
      },
      {
        id: "old-3", runId: "run-old", slug: "linear", domain, sectionId: null,
        type: "synthesis.started", message: "Reading the filed evidence", metadata: {},
        createdAt: "2026-07-15T12:00:10.000Z"
      },
      {
        id: "old-4", runId: "run-old", slug: "linear", domain, sectionId: null,
        type: "verify.complete", message: "0 claims survived", metadata: { claimCount: 0 },
        createdAt: "2026-07-15T12:00:15.000Z"
      },
      {
        id: "old-5", runId: "run-old", slug: "linear", domain, sectionId: null,
        type: "card.saved", message: "Saved with sources attached", metadata: {},
        createdAt: "2026-07-15T12:00:20.000Z"
      },
      {
        id: "old-6", runId: "run-old", slug: "linear", domain, sectionId: null,
        type: "generation.complete", message: "Research run complete", metadata: {},
        createdAt: "2026-07-15T12:00:25.000Z"
      }
    ];
    const withheldCard: ColdStartCard = {
      ...cardForDomain(domain),
      synthesisWithheld: {
        at: "2026-07-15T12:00:25.000Z",
        reasons: ["citation-floor"],
        advisories: [],
        citationCount: 3,
        sourceTypeCount: 2
      }
    };

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes("/api/extension/bootstrap")) {
        return jsonResponse({
          domain,
          slug: "linear",
          card: withheldCard,
          sections: [],
          events: staleRunEvents,
          runs: {
            basics: { slug: "linear", domain, mode: "basics", status: "idle" },
            analysis: { slug: "linear", domain, mode: "analysis", status: "complete", runId: "run-old" }
          }
        });
      }
      if (String(url).endsWith("/api/generate") && init?.method === "POST") {
        return jsonResponse({ slug: "linear", domain, status: "queued", mode: "analysis" }, { status: 202 });
      }
      if (String(url).includes("/api/generate?")) {
        return jsonResponse({ slug: "linear", domain, status: "running", mode: "analysis" });
      }
      // The retry's own card GET must not still carry the old synthesisWithheld verdict: a
      // card with synthesisWithheld set short-circuits pollGenerationUntilCard's first-tick
      // completeness check (analysisCardIsComplete, sidepanel-network.ts) and resolves the
      // whole retry instantly, which would collapse this test's observation window to zero. A
      // real retry's card genuinely has not decided a new verdict yet at this point.
      return jsonResponse(cardForDomain(domain));
    });

    const { container, unmount } = await renderSidePanel({ domain, fetchMock });

    // The fixture actually carries the "advanced" state the fix guards against: the withheld
    // card renders, seeded from bootstrap with run-old's terminal events already in state.
    expect(container.querySelector(".cs-lens-withheld")).toBeTruthy();

    const retryButton = interactiveControls(container).find(
      (button) => button.textContent?.includes("Refresh evidence and retry")
    );
    expect(retryButton).toBeTruthy();

    await act(async () => {
      retryButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushPromises();

    const stages = Array.from(container.querySelectorAll(".cs-wait-stage"));
    const queueStage = stages.find((stage) => stage.querySelector("strong")?.textContent === "Queue");
    const fileStage = stages.find((stage) => stage.querySelector("strong")?.textContent === "File");
    expect(queueStage?.getAttribute("data-status")).toBe("current");
    // Pre-fix, run-old's retained card.saved/generation.complete events would put File at
    // "current" (index 4, the highest reached) immediately on retry, before any new-run event
    // ever arrived.
    expect(fileStage?.getAttribute("data-status")).toBe("pending");

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
      (button) => button.getAttribute("aria-label") === "Run Investor Lens"
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

    // The memo renders on synthesis alone, no card to activate; Timing states the honest
    // not-found row directly.
    const investorRead = container.querySelector("[aria-label='Investor read']");
    expect(investorRead?.querySelector(".cs-lens-timing")?.textContent).toContain("Not supported by current sources.");
    expect(generateCalls(fetchMock)).toHaveLength(0);
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

  it("carries source posture through the footer caveat and chip titles, not a dot glyph", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(cardWithSynthesis("linear.app")));
    const { container, unmount } = await renderSidePanel({ domain: "linear.app", fetchMock });

    expect(container.textContent).toContain("The company has a supported wedge.");
    expect(container.querySelector(".cs-lens-dot")).toBeNull();
    const sourceLink = container.querySelector<HTMLAnchorElement>(".cs-lens-source[href='https://linear.app/']");
    expect(sourceLink?.getAttribute("title")).toMatch(/^.+: /);

    await unmount();
  });

  it("shows the ranked next question in the memo, with its category label", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(cardWithSynthesis("linear.app")));
    const { container, unmount } = await renderSidePanel({ domain: "linear.app", fetchMock });

    const questionSection = container.querySelector("[aria-label='Investor read'] [aria-label='Next question']");
    expect(questionSection).toBeTruthy();
    expect(questionSection?.textContent).toContain("Who owns the budget?");
    expect(questionSection?.textContent).toContain("Buyer & budget");
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
    // The single Series B round accounts for the whole raised total, so the copy composes one
    // line with compact currency and a human date instead of repeating the raw number twice.
    // The hero slot carries the figure; the note keeps round and date without repeating it.
    expect(container.textContent).toContain("$35M");
    expect(container.textContent).toContain("Series B (Sep 2025)");
    expect(container.textContent).not.toContain("Raised $35M in a Series B");
    // Backers render once in a deduped ledger row (Accel and Sequoia appear both as round leads
    // and named investors); the derived "Named investors include ..." text row is suppressed.
    const investors = container.querySelector(".cs-layer-money-investors");
    expect(investors?.textContent).toContain("Investors");
    expect(investors?.textContent).toContain("Accel · Sequoia");
    expect(container.textContent).not.toContain("Named investors include");
    // Investor names are plain ledger text, never links masquerading as citations.
    expect(investors?.querySelector("a")).toBeNull();

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
});
