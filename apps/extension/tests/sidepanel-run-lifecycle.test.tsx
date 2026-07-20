// @vitest-environment jsdom

import { type ColdStartCard, type ResearchSection } from "@cold-start/core";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  registerSidePanelHooks,
  legacyAnalysisLabel,
  futureCardTitles,
  cardForDomain,
  noSourcePartialCard,
  cardWithSynthesis,
  jsonResponse,
  missingCardResponse,
  testSection,
  flushPromises,
  renderSidePanel,
  generateCalls,
  interactiveControls,
  expectSignal,
} from "./sidepanel-harness";

describe("SidePanel run lifecycle", () => {
  registerSidePanelHooks();

  it("does not render the old standalone analysis CTA for a sourced card", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(cardForDomain("warp.dev")));
    const { container, unmount } = await renderSidePanel({ domain: "warp.dev", fetchMock });

    const buttons = interactiveControls(container).map((button) => button.textContent?.trim());
    expect(buttons).not.toContain(legacyAnalysisLabel);
    expect(container.textContent).toContain("Research");
    expect(container.textContent).toContain("Who pays");

    await unmount();
  });

  it("renders the research layer pile for a sourced card", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(cardForDomain("warp.dev")));
    const { container, unmount } = await renderSidePanel({ domain: "warp.dev", fetchMock });

    expect(container.textContent).toContain("Research");
    expect(container.textContent).toContain("Who pays");
    expect(container.textContent).toContain("Money");
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

    // While building, the panel renders the whisper, clippings, and the early read only; nothing
    // from the gated synthesis may appear before the profile phase, even when the stored card has it.
    expect(container.textContent).not.toContain("supported wedge");
    // The header whisper is the one progress voice; the seal instrument replaces the breathing dot.
    const whisper = container.querySelector(".cs-assembly-whisper");
    expect(whisper).not.toBeNull();
    expect(whisper?.querySelector(".cs-seal-inst")?.getAttribute("data-level")).toBe("0");
    expect(whisper?.textContent).toContain("Queued");
    // No wall-clock estimation: with no run events yet the seal holds at the opening level.
    expect(container.textContent).not.toContain("Looking for useful places to read");
    expect(container.textContent).not.toContain("Pulling in what matters");
    expect(container.textContent).not.toContain("Turning evidence into a card");
    expect(container.textContent).not.toContain("Saving the final profile");
    // The labeled four-segment trail, the main status row, the source strip, and the run clock are gone.
    expect(container.querySelector(".cs-trail-segment")).toBeNull();
    expect(container.querySelector(".cs-research-progress")).toBeNull();
    expect(container.querySelector(".cs-research-source-strip")).toBeNull();
    expect(container.querySelector(".cs-company-run-time")).toBeNull();
    // The details tree stays behind one quiet toggle.
    expect(container.querySelector(".cs-assembly-details-toggle")).not.toBeNull();
    // The persistent header carries the identity; there is no separate hero.
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

    // Still resuming the run, not the generate gate: the building shell and identity hold.
    expect(container.querySelector(".cs-company-context[data-phase='building']")).not.toBeNull();
    expect(container.textContent).toContain("cartesia.ai");
    expect(container.textContent).not.toContain("Generate Cartesia?");
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

    // The source.found event drives the header whisper and the seal, not a labeled trail.
    expect(container.querySelector(".cs-assembly-whisper")?.textContent).toContain("8 sources, building profile");
    expect(container.querySelector(".cs-seal-inst")?.getAttribute("data-level")).toBe("2");
    expect(container.querySelector(".cs-trail-segment")).toBeNull();
    // The details tree opens on demand and carries the source count.
    const detailsButton = container.querySelector<HTMLButtonElement>(".cs-assembly-details-toggle");
    expect(detailsButton).not.toBeNull();
    await act(async () => {
      detailsButton?.click();
    });
    await flushPromises();
    expect(container.querySelector(".cs-build-tree")?.textContent).toContain("8 sources found");
    // The details tree keeps its stage labels, ordinal markers, and status marks, but drops the
    // caption and the head counter chip; the whisper above already states progress.
    expect(container.querySelector(".cs-build-head")).toBeNull();
    expect(container.querySelector(".cs-build-step")).toBeNull();
    expect(container.querySelector(".cs-build-meta")).toBeNull();
    expect(container.textContent).not.toContain("Research progress");
    expect(container.querySelector(".cs-build-stage-marker")).not.toBeNull();
    await unmount();
  });

  it("flips the whisper to its attention voice and auto-opens the details tree on a generation.failed event", async () => {
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
              createdAt: "2026-06-30T00:00:01.000Z"
            },
            {
              id: "event-failed",
              runId: "run-1",
              slug: "cartesia",
              domain: "cartesia.ai",
              sectionId: null,
              type: "generation.failed",
              message: "Provider request timed out",
              metadata: { stage: "generate-card" },
              createdAt: "2026-06-30T00:00:02.000Z"
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

    const whisper = container.querySelector(".cs-assembly-whisper");
    expect(whisper?.getAttribute("data-attention")).toBe("true");
    expect(whisper?.textContent).toContain("Needs a closer look");
    // Attention auto-opens the tree; the quiet toggle does not render alongside it.
    expect(container.querySelector(".cs-assembly-details-toggle")).toBeNull();
    expect(container.querySelector(".cs-assembly-details")?.getAttribute("data-attention")).toBe("true");
    expect(container.querySelector(".cs-build-tree")?.textContent).toContain("Provider request timed out");
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

    // The stored synthesis already renders in the memo (Timing honestly reads not-found,
    // since cardWithSynthesis carries no marketStructureAndTiming), and resuming the
    // backgrounded analysis run must not refire generation behind it.
    expect(container.textContent).toContain("The company has a supported wedge.");
    const investorRead = container.querySelector("[aria-label='Investor read']");
    expect(investorRead?.querySelector(".cs-lens-timing")?.textContent).toContain("Not supported by current sources.");
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

    // The stored section belongs to a gated synthesis-only sectionId (why_it_matters), which no
    // longer has a standalone tray card, so it never shows as a spuriously running module.
    expect(container.querySelector<HTMLElement>("[data-state='running']")).toBeNull();
    expect(container.textContent).not.toContain("Finishing profile");
    expect(container.textContent).not.toContain("Getting the profile ready");
    expect(container.textContent).toContain("6 waiting");
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

  it("shows filed sources as settled clippings fed from the stored sources list", async () => {
    const domain = "llamaindex.ai";
    const card = cardForDomain(domain);
    card.identity.name.value = "LlamaIndex";
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/api/extension/bootstrap")) {
        return jsonResponse({
          domain,
          slug: "llamaindex",
          card,
          sections: [],
          sources: [
            {
              id: "source-1",
              url: "https://llamaindex.ai/",
              title: "LlamaIndex",
              domain: "llamaindex.ai",
              sourceType: "company_site",
              fetchedAt: new Date().toISOString(),
              snippet: "LlamaIndex is a data framework.",
              imageUrl: null
            },
            {
              id: "source-2",
              url: "https://techcrunch.com/llamaindex-raises",
              title: "LlamaIndex raises a Series A",
              domain: "techcrunch.com",
              sourceType: "news",
              fetchedAt: new Date().toISOString(),
              snippet: "The company raised a round.",
              imageUrl: "https://img/tc.png"
            }
          ],
          events: [
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
            basics: { slug: "llamaindex", domain, mode: "basics", status: "idle" },
            analysis: { slug: "llamaindex", domain, mode: "analysis", status: "idle" }
          }
        });
      }

      return jsonResponse(card);
    });

    const { container, unmount } = await renderSidePanel({ domain, fetchMock });

    const region = container.querySelector(".cs-clippings");
    expect(region?.getAttribute("data-state")).toBe("settled");
    // The awaiting quiet rule never appears: the profile mount already knows its full list.
    expect(container.querySelector(".cs-clippings-rule")).toBeNull();
    const items = container.querySelectorAll(".cs-clipping");
    expect(items).toHaveLength(2);
    expect(items[0]?.querySelector(".cs-clipping-domain")?.textContent).toBe("llamaindex.ai");
    expect(items[1]?.querySelector(".cs-clipping-domain")?.textContent).toBe("techcrunch.com");
    expect(items[1]?.querySelector(".cs-clipping-dot")?.getAttribute("data-source-class")).toBe("funding");
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
});
