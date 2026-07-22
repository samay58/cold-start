// @vitest-environment jsdom

import type { ColdStartCard } from "@cold-start/core";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CompanyArc } from "../src/company/CompanyArc";
import {
  AnalysisWaitInstrument,
  analysisWaitStagePlan,
  currentAnalysisRunEvents,
  verifySurvivorCount,
  type AnalysisWaitStageId
} from "../src/research/AnalysisWaitInstrument";
import type { ExtensionResearchRunEvent } from "../src/shared/extension-config";
import runningEventsFixtureRaw from "./fixtures/lens-phases/running-events.json";
import { cardForDomain, cardWithSynthesis } from "./sidepanel-harness";

const runningEventsFixture = runningEventsFixtureRaw as ExtensionResearchRunEvent[];

let eventCounter = 0;

function event(
  overrides: Partial<ExtensionResearchRunEvent> & Pick<ExtensionResearchRunEvent, "type">
): ExtensionResearchRunEvent {
  eventCounter += 1;
  return {
    id: `e${eventCounter}`,
    runId: "run-1",
    slug: "acme",
    domain: "acme.example",
    sectionId: null,
    message: overrides.type,
    metadata: {},
    createdAt: new Date(2026, 6, 20, 12, 0, eventCounter).toISOString(),
    ...overrides
  };
}

function stubMatchMedia(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      addEventListener: vi.fn(),
      addListener: vi.fn(),
      dispatchEvent: vi.fn(),
      matches,
      media: "(prefers-reduced-motion: reduce)",
      onchange: null,
      removeEventListener: vi.fn(),
      removeListener: vi.fn()
    }))
  );
}

function stubChromeStorage() {
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

async function flushPromises() {
  await act(async () => {
    for (let index = 0; index < 10; index += 1) {
      await Promise.resolve();
    }
  });
}

async function mountInstrument(input: {
  elapsedSeconds?: number;
  events: ExtensionResearchRunEvent[];
  reducedMotion?: boolean;
}) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <AnalysisWaitInstrument
        elapsedSeconds={input.elapsedSeconds ?? 0}
        events={input.events}
        prefersReducedMotion={input.reducedMotion ?? false}
      />
    );
  });
  return {
    container,
    async unmount() {
      await act(async () => root.unmount());
    }
  };
}

type PanelProfileInput = {
  analysisRun?: { generationStatus: "queued" | "running"; startedAt: number };
  card: ColdStartCard;
  events?: ExtensionResearchRunEvent[];
};

function renderCompanyArc(root: ReturnType<typeof createRoot>, input: PanelProfileInput) {
  root.render(
    <CompanyArc
      arc={{
        phase: "profile",
        card: input.card,
        sections: [],
        events: input.events ?? [],
        sources: [],
        ...(input.analysisRun ? { analysisRun: input.analysisRun } : {})
      }}
      domain={input.card.domain}
      onEditSettings={() => undefined}
      onRegenerate={() => undefined}
      onRunAnalysis={() => undefined}
      onRunSection={() => undefined}
      onStart={() => undefined}
    />
  );
}

async function mountPanel(input: PanelProfileInput) {
  // ResearchLayerPanel is React.lazy-loaded by CompanyArc; warm the import first so the first
  // render below does not stall on the Suspense fallback for a tick.
  await import("../src/research/ResearchLayerPanel");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    renderCompanyArc(root, input);
  });
  await flushPromises();
  return {
    container,
    async rerender(next: PanelProfileInput) {
      await act(async () => {
        renderCompanyArc(root, next);
      });
      await flushPromises();
    },
    async unmount() {
      await act(async () => root.unmount());
    }
  };
}

beforeEach(() => {
  eventCounter = 0;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  document.body.innerHTML = "";
  stubMatchMedia(false);
  stubChromeStorage();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("analysisWaitStagePlan (pure)", () => {
  it("advances through the fixed stage vocabulary in order as running-events.json replays", () => {
    const cumulative: ExtensionResearchRunEvent[] = [];
    const currentSequence: AnalysisWaitStageId[] = [];

    for (const fixtureEvent of runningEventsFixture) {
      cumulative.push(fixtureEvent);
      const plan = analysisWaitStagePlan(cumulative);
      const current = plan.find((stage) => stage.status === "current");
      if (current && currentSequence.at(-1) !== current.id) {
        currentSequence.push(current.id);
      }
    }

    expect(currentSequence).toEqual(["queue", "gather", "read", "verify", "file"]);
  });

  it("holds the previous stage current, with no blank stage, during the real gap before synthesis.started", () => {
    const upToGather = runningEventsFixture.filter((candidate) =>
      ["generation.queued", "generation.started", "plan.ready", "source.found"].includes(candidate.type)
    );
    expect(upToGather).toHaveLength(4);

    const plan = analysisWaitStagePlan(upToGather);

    expect(plan.find((stage) => stage.id === "gather")?.status).toBe("current");
    expect(plan.find((stage) => stage.id === "read")?.status).toBe("pending");
    expect(plan.find((stage) => stage.id === "verify")?.status).toBe("pending");
    expect(plan.find((stage) => stage.id === "file")?.status).toBe("pending");
    // Every stage always has a proof line, even ones not yet reached: no blank state.
    expect(plan.every((stage) => stage.proofLine.trim().length > 0)).toBe(true);
  });

  it("defaults to Queue as current before any event has arrived", () => {
    const plan = analysisWaitStagePlan([]);
    expect(plan[0]?.id).toBe("queue");
    expect(plan[0]?.status).toBe("current");
    expect(plan.slice(1).every((stage) => stage.status === "pending")).toBe(true);
  });

  it("marks Read and Verify skipped, not falsely done, when a gate-withheld run jumps straight from Gather to File", () => {
    const withheldRun = [
      event({ type: "generation.queued" }),
      event({ type: "generation.started" }),
      event({ type: "plan.ready" }),
      event({ type: "source.found", metadata: { acceptedCount: 12 } }),
      event({ type: "card.saved" }),
      event({ type: "generation.complete" })
    ];

    const plan = analysisWaitStagePlan(withheldRun);

    expect(plan.find((stage) => stage.id === "queue")?.status).toBe("done");
    expect(plan.find((stage) => stage.id === "gather")?.status).toBe("done");
    expect(plan.find((stage) => stage.id === "read")?.status).toBe("skipped");
    expect(plan.find((stage) => stage.id === "verify")?.status).toBe("skipped");
    expect(plan.find((stage) => stage.id === "file")?.status).toBe("current");
  });

  it("renders 'Reusing filed evidence' at Gather when the run skips re-fetch (Task 5.3's analysisSourceRefresh)", () => {
    const events = [
      event({ type: "generation.started" }),
      event({ type: "source.found", metadata: { acceptedCount: 38, analysisSourceRefresh: "skip" } })
    ];

    const plan = analysisWaitStagePlan(events);
    expect(plan.find((stage) => stage.id === "gather")?.proofLine).toBe("Reusing filed evidence");
  });

  it("reads Verify's proof line from the real verify.started/verify.complete message copy", () => {
    const started = analysisWaitStagePlan([
      event({ type: "generation.started" }),
      event({ type: "source.found" }),
      event({ type: "synthesis.started" }),
      event({ type: "verify.started", message: "Verifying 6 claims against sources", metadata: { claimCount: 6 } })
    ]);
    expect(started.find((stage) => stage.id === "verify")?.proofLine).toBe("Verifying 6 claims against sources");

    const complete = analysisWaitStagePlan([
      event({ type: "generation.started" }),
      event({ type: "source.found" }),
      event({ type: "synthesis.started" }),
      event({ type: "verify.started", message: "Verifying 6 claims against sources", metadata: { claimCount: 6 } }),
      event({ type: "verify.complete", message: "5 claims survived", metadata: { claimCount: 5 } })
    ]);
    expect(complete.find((stage) => stage.id === "verify")?.proofLine).toBe("5 claims survived");
  });

  it("scopes to the latest run's events, so a retried run's fresh events are not shadowed by a stale prior run's terminal state", () => {
    const staleRun = [
      event({ runId: "run-old", type: "generation.queued" }),
      event({ runId: "run-old", type: "card.saved" }),
      event({ runId: "run-old", type: "generation.complete" })
    ];
    const freshRun = [event({ runId: "run-new", type: "generation.started" })];
    const mixed = [...staleRun, ...freshRun];

    expect(currentAnalysisRunEvents(mixed).every((candidate) => candidate.runId === "run-new")).toBe(true);
    const plan = analysisWaitStagePlan(mixed);
    expect(plan.find((stage) => stage.id === "queue")?.status).toBe("current");
    expect(plan.find((stage) => stage.id === "file")?.status).toBe("pending");
  });
});

describe("verifySurvivorCount (pure)", () => {
  it("binds to verify.complete's real metadata.claimCount field", () => {
    expect(verifySurvivorCount(event({ type: "verify.complete", message: "5 claims survived", metadata: { claimCount: 5 } }))).toBe(5);
  });

  it("returns 0, not null, when the run genuinely verified and nothing survived", () => {
    expect(verifySurvivorCount(event({ type: "verify.complete", message: "0 claims survived", metadata: { claimCount: 0 } }))).toBe(0);
  });

  it("falls back to parsing the message when metadata is absent", () => {
    expect(verifySurvivorCount(event({ type: "verify.complete", message: "4 claims survived", metadata: {} }))).toBe(4);
  });

  it("returns null when there is no verify.complete event yet", () => {
    expect(verifySurvivorCount(undefined)).toBeNull();
  });
});

describe("AnalysisWaitInstrument", () => {
  it("renders the elapsed receipt and keeps counting through an event gap", async () => {
    const { container, unmount } = await mountInstrument({
      elapsedSeconds: 53,
      events: [
        event({ type: "generation.started" }),
        event({ type: "source.found", metadata: { acceptedCount: 12 } })
      ]
    });

    expect(container.querySelector(".cs-wait-elapsed")?.textContent).toBe("0:53");
    expect(container.querySelectorAll(".cs-wait-stage")).toHaveLength(5);
    expect(container.querySelector(".cs-wait-stage[data-status='current']")?.textContent).toContain("Gather");
    await unmount();
  });

  it("stamps in the verifier's exact survivor count as marks, never invented claim text", async () => {
    const { container, unmount } = await mountInstrument({
      events: [
        event({ type: "generation.started" }),
        event({ type: "source.found" }),
        event({ type: "synthesis.started" }),
        event({ type: "verify.started", message: "Verifying 5 claims against sources", metadata: { claimCount: 5 } }),
        event({ type: "verify.complete", message: "5 claims survived", metadata: { claimCount: 5 } })
      ]
    });

    const stamps = container.querySelectorAll(".cs-wait-stamp");
    expect(stamps).toHaveLength(5);
    expect(container.querySelector(".cs-wait-stamps")?.getAttribute("aria-label")).toBe("5 claims survived");
    await unmount();
  });

  it("caps visible stamps and shows the overflow count for a large survivor count", async () => {
    const { container, unmount } = await mountInstrument({
      events: [
        event({ type: "generation.started" }),
        event({ type: "source.found" }),
        event({ type: "synthesis.started" }),
        event({ type: "verify.started" }),
        event({ type: "verify.complete", message: "15 claims survived", metadata: { claimCount: 15 } })
      ]
    });

    expect(container.querySelectorAll(".cs-wait-stamp")).toHaveLength(12);
    expect(container.querySelector(".cs-wait-stamps-more")?.textContent).toBe("+3");
    await unmount();
  });

  it("renders the same stage and stamp structure under reduced motion: nothing freezes or disappears", async () => {
    const events = [
      event({ type: "generation.started" }),
      event({ type: "source.found" }),
      event({ type: "synthesis.started" }),
      event({ type: "verify.started" }),
      event({ type: "verify.complete", message: "3 claims survived", metadata: { claimCount: 3 } })
    ];

    const full = await mountInstrument({ events, reducedMotion: false });
    const reduced = await mountInstrument({ events, reducedMotion: true });

    expect(reduced.container.querySelectorAll(".cs-wait-stage")).toHaveLength(
      full.container.querySelectorAll(".cs-wait-stage").length
    );
    expect(reduced.container.querySelectorAll(".cs-wait-stamp")).toHaveLength(
      full.container.querySelectorAll(".cs-wait-stamp").length
    );
    expect(reduced.container.querySelector(".cs-wait-mark[data-status='current']")).not.toBeNull();

    await full.unmount();
    await reduced.unmount();
  });
});

describe("Investor Lens wait-to-read hand-off (exit-state rule)", () => {
  it("swaps cleanly from the wait instrument to the filed read with no stray node left behind", async () => {
    const domain = "acme.example";
    const runningCard = cardForDomain(domain);
    const filedCard = cardWithSynthesis(domain);

    const { container, rerender, unmount } = await mountPanel({
      analysisRun: { generationStatus: "running", startedAt: Date.now() - 4000 },
      card: runningCard,
      events: [
        event({ domain, type: "generation.started" }),
        event({ domain, type: "source.found", metadata: { acceptedCount: 10 } }),
        event({ domain, type: "synthesis.started" }),
        event({ domain, type: "verify.started" }),
        event({ domain, type: "verify.complete", message: "1 claim survived", metadata: { claimCount: 1 } })
      ]
    });

    expect(container.querySelector(".cs-wait")).not.toBeNull();
    expect(container.querySelector("[aria-label='Investor read']")).toBeNull();

    // The run resolved: analysisRun clears and the fetched card now carries synthesis, matching
    // exactly what runAnalysisGenerationWithController / resumeAnalysisWithController hand off in
    // sidepanel.tsx once pollGenerationUntilCard's promise settles.
    await rerender({ card: filedCard, events: [] });

    expect(container.querySelector(".cs-wait")).toBeNull();
    expect(container.querySelector("[aria-label='Investor read']")).not.toBeNull();
    await unmount();
  });
});
