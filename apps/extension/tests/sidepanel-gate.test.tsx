// @vitest-environment jsdom

import { COLD_START_API_CONTRACT_VERSION } from "@cold-start/core";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  registerSidePanelHooks,
  settings,
  cardForDomain,
  jsonResponse,
  missingCardResponse,
  flushPromises,
  renderSidePanel,
  generateCalls,
} from "./sidepanel-harness";

describe("SidePanel generation gate", () => {
  registerSidePanelHooks();

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
    // The intake status slot renders empty; there is no "No profile" chip to earn its space.
    expect(container.textContent).not.toContain("No profile");
    // The scope statement appears once, from the intake note; the module pile no longer
    // restates it in different words.
    expect(container.textContent).toContain("Build a cited profile from public sources: identity, funding, people, and proof.");
    // The intake previews the real research modules and the sealed Investor Lens, not
    // marketing copy or invented card names.
    expect(container.textContent).not.toContain("Get up to speed");
    expect(container.textContent).toContain("Who pays");
    expect(container.textContent).toContain("Proof");
    expect(container.textContent).toContain("Investor Lens");
    expect(container.textContent).toContain("Opens when the cited profile is filed.");
    const generateButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Begin research"
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
  }, 10_000);

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
        "Hanover Park is an automated fund administrator for private equity and venture capital firms. It combines fund accounting, portfolio management, LP portals, analytics, modelling, security workflows, client support, capital calls, distributions, and full-service accounting into one platform.",
      status: "verified",
      confidence: "high",
      citationIds: ["c1"]
    };

    const fetchMock = vi.fn(async () => jsonResponse(card));
    const { container, unmount } = await renderSidePanel({ domain: "hanoverpark.com", fetchMock });
    const visibleSummary = container.querySelector(".cs-company-summary");

    expect(visibleSummary?.textContent).toContain("Hanover Park is an automated fund administrator for private equity and venture capital firms.");
    expect(visibleSummary?.textContent).not.toContain("full-service accounting into one platform");
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
    const { defaultApiOrigin, storedApiOriginOrDefault } = await import("../src/shared/extension-config");
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

  it("renders a durable local card before network revalidation", async () => {
    const { defaultApiOrigin, storedApiOriginOrDefault } = await import("../src/shared/extension-config");
    const cachedCard = cardForDomain("linear.app");
    cachedCard.identity.name.value = "Cached Linear";
    const serverCard = cardForDomain("linear.app");
    serverCard.identity.name.value = "Server Linear";
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
      storedLocal: {
        [cacheKey]: {
          apiOrigin: resolvedApiOrigin,
          card: cachedCard,
          contractVersion: COLD_START_API_CONTRACT_VERSION,
          domain: "linear.app",
          storedAt: Date.now()
        }
      }
    });

    expect(container.textContent).toContain("Cached Linear");
    expect(container.textContent).not.toContain("Server Linear");
    resolveBootstrap?.(jsonResponse({
      domain: "linear.app",
      slug: "linear",
      card: serverCard,
      runs: {
        basics: { slug: "linear", domain: "linear.app", mode: "basics", status: "complete" },
        analysis: { slug: "linear", domain: "linear.app", mode: "analysis", status: "idle" }
      }
    }));
    await flushPromises();

    expect(container.textContent).toContain("Server Linear");
    await unmount();
  });

  it("keeps a durable local card visible when bootstrap revalidation fails", async () => {
    const { defaultApiOrigin, storedApiOriginOrDefault } = await import("../src/shared/extension-config");
    const cachedCard = cardForDomain("linear.app");
    cachedCard.identity.name.value = "Cached Linear";
    const resolvedApiOrigin = storedApiOriginOrDefault(
      settings.coldStartApiOrigin,
      defaultApiOrigin(import.meta.env)
    );
    const cacheKey = `coldStartCard:${encodeURIComponent(resolvedApiOrigin)}:${encodeURIComponent("linear.app")}`;
    const fetchMock = vi.fn(async () => {
      throw new Error("bootstrap unavailable");
    });
    const { container, unmount } = await renderSidePanel({
      domain: "linear.app",
      fetchMock,
      storedLocal: {
        [cacheKey]: {
          apiOrigin: resolvedApiOrigin,
          card: cachedCard,
          contractVersion: COLD_START_API_CONTRACT_VERSION,
          domain: "linear.app",
          storedAt: Date.now()
        }
      }
    });

    expect(container.textContent).toContain("Cached Linear");
    expect(container.textContent).toContain("Could not check for a fresher profile");
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
    const generateButton = Array.from(panel.container.querySelectorAll("button")).find(
      (button) => button.textContent === "Begin research"
    );
    expect(generateButton).toBeTruthy();
    expect(panel.container.textContent).toContain("Linear");
    await panel.unmount();
  });
});
