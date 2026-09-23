// @vitest-environment jsdom

import type { ColdStartCard, HowItWinsJobSummary } from "@cold-start/core";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { filedHowItWins } from "./lens-card-fixtures";
import {
  cardWithSynthesis,
  flushPromises,
  generateCalls,
  interactiveControls,
  jsonResponse,
  registerSidePanelHooks,
  renderSidePanel
} from "./sidepanel-harness";

function failedJob(overrides: Partial<HowItWinsJobSummary> = {}): HowItWinsJobSummary {
  return {
    id: "10000000-0000-4000-8000-000000000001",
    status: "failed",
    stage: "judge_initial",
    reasonCode: "structured_output",
    canRetry: true,
    updatedAt: "2026-09-14T20:00:00.000Z",
    ...overrides
  };
}

function bootstrap(domain: string, card: ColdStartCard) {
  return {
    domain,
    slug: card.slug,
    card,
    runs: {
      basics: { slug: card.slug, domain, mode: "basics", status: "idle" },
      analysis: { slug: card.slug, domain, mode: "analysis", status: "idle" }
    }
  };
}

describe("SidePanel How it wins recovery", () => {
  registerSidePanelHooks();

  it("shows persisted failure after reload without starting paid work", async () => {
    const domain = "warp.dev";
    const card = cardWithSynthesis(domain);
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/how-it-wins")) return jsonResponse({ job: failedJob() });
      if (String(url).includes("/api/extension/bootstrap")) return jsonResponse(bootstrap(domain, card));
      throw new Error(`unexpected request: ${String(url)}`);
    });

    const first = await renderSidePanel({ domain, fetchMock });
    expect(first.container.textContent).toContain("How it wins couldn't finish.");
    expect(generateCalls(fetchMock)).toHaveLength(0);
    await first.unmount();

    const second = await renderSidePanel({ domain, fetchMock });
    expect(second.container.textContent).toContain("How it wins couldn't finish.");
    expect(generateCalls(fetchMock)).toHaveLength(0);
    await second.unmount();
  });

  it("posts one scoped retry and never falls back to full analysis", async () => {
    const domain = "warp.dev";
    const card = cardWithSynthesis(domain);
    let statusJob = failedJob();
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes("/how-it-wins") && init?.method === "POST") {
        statusJob = {
          ...statusJob,
          id: "20000000-0000-4000-8000-000000000002",
          status: "queued",
          stage: "queued",
          reasonCode: null,
          canRetry: false,
          updatedAt: "2026-09-14T20:01:00.000Z"
        };
        return jsonResponse({ job: statusJob }, { status: 202 });
      }
      if (String(url).includes("/how-it-wins")) return jsonResponse({ job: statusJob });
      if (String(url).includes("/api/extension/bootstrap")) return jsonResponse(bootstrap(domain, card));
      throw new Error(`unexpected request: ${String(url)}`);
    });
    const { container, unmount } = await renderSidePanel({ domain, fetchMock });
    const retry = interactiveControls(container).find((button) => button.textContent === "Try again");

    await act(async () => {
      retry?.click();
      retry?.click();
    });
    await flushPromises();

    const retryCalls = fetchMock.mock.calls.filter(([url, init]) =>
      String(url).includes("/how-it-wins") && (init as RequestInit | undefined)?.method === "POST"
    );
    expect(retryCalls).toHaveLength(1);
    expect(JSON.parse(String(retryCalls[0]?.[1]?.body))).toMatchObject({ jobId: failedJob().id });
    expect(generateCalls(fetchMock)).toHaveLength(0);
    expect(container.textContent).toContain("Reading how it wins");
    expect(container.textContent).not.toContain("Reading how it wins...");
    await unmount();
  });

  it("keeps a valid saved read when the latest job failed", async () => {
    const domain = "warp.dev";
    const card = cardWithSynthesis(domain);
    if (!card.synthesis) throw new Error("fixture must carry synthesis");
    card.synthesis.howItWins = filedHowItWins();
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/how-it-wins")) {
        return jsonResponse({ job: failedJob({ canRetry: false }) });
      }
      if (String(url).includes("/api/extension/bootstrap")) return jsonResponse(bootstrap(domain, card));
      throw new Error(`unexpected request: ${String(url)}`);
    });
    const { container, unmount } = await renderSidePanel({ domain, fetchMock });

    expect(container.querySelector(".cs-how-it-wins-sentence")?.textContent)
      .toBe("It wins by combining two rare skills, and by sitting where two labs must pass through it.");
    expect(container.textContent).toContain("The update couldn't finish.");
    expect(container.textContent).toContain("The company has a supported wedge");
    await unmount();
  });
});
