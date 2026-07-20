// @vitest-environment jsdom

import { act } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  registerSidePanelHooks,
  cardForDomain,
  jsonResponse,
  missingCardResponse,
  flushPromises,
  renderSidePanel,
  generateCalls,
  interactiveControls,
} from "./sidepanel-harness";

describe("SidePanel research cards", () => {
  registerSidePanelHooks();

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
});
