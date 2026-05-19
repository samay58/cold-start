import { COLD_START_API_CONTRACT_HEADER, COLD_START_API_CONTRACT_VERSION } from "@cold-start/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function jsonResponse(body: unknown, init?: ResponseInit) {
  const response = new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    ...init
  });
  response.headers.set(COLD_START_API_CONTRACT_HEADER, COLD_START_API_CONTRACT_VERSION);
  return response;
}

async function flushPromises() {
  for (let index = 0; index < 10; index += 1) {
    await Promise.resolve();
  }
}

describe("background prefetch", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("prefetches bootstrap without starting generation", async () => {
    let clickListener: ((tab: chrome.tabs.Tab) => void) | undefined;
    const sessionItems: Record<string, unknown> = {};
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        domain: "linear.app",
        slug: "linear",
        card: {
          slug: "linear",
          domain: "linear.app",
          generatedAt: "2026-05-18T12:00:00.000Z",
          generationCostUsd: 0,
          cacheStatus: "hit",
          identity: {
            name: { value: "Linear", status: "verified", confidence: "high", citationIds: ["c1"] },
            logoUrl: null,
            oneLiner: { value: "Issue tracker.", status: "verified", confidence: "high", citationIds: ["c1"] },
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
              url: "https://linear.app/",
              title: "Linear",
              fetchedAt: "2026-05-18T12:00:00.000Z",
              sourceType: "company_site"
            }
          ]
        },
        runs: {
          basics: { slug: "linear", domain: "linear.app", mode: "basics", status: "complete" },
          analysis: { slug: "linear", domain: "linear.app", mode: "analysis", status: "idle" }
        }
      })
    );

    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("chrome", {
      runtime: {
        id: "extension-test-id",
        onInstalled: { addListener: vi.fn() }
      },
      action: {
        onClicked: {
          addListener: (listener: (tab: chrome.tabs.Tab) => void) => {
            clickListener = listener;
          }
        }
      },
      sidePanel: {
        open: vi.fn(),
        setPanelBehavior: vi.fn()
      },
      storage: {
        local: {
          get: (_keys: readonly string[], callback: (items: Record<string, unknown>) => void) =>
            callback({ coldStartApiOrigin: "http://localhost:3000", coldStartApiToken: "token-123" })
        },
        session: {
          get: (_keys: string | null, callback: (items: Record<string, unknown>) => void) => callback({ ...sessionItems }),
          set: (items: Record<string, unknown>, callback?: () => void) => {
            Object.assign(sessionItems, items);
            callback?.();
          },
          remove: vi.fn()
        }
      }
    });

    await import("../src/background");
    clickListener?.({ id: 7, url: "https://linear.app/docs" } as chrome.tabs.Tab);
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const firstFetchCall = fetchMock.mock.calls[0] as unknown as [string, RequestInit?] | undefined;
    expect(String(firstFetchCall?.[0])).toContain("/api/extension/bootstrap?domain=linear.app");
    expect(firstFetchCall?.[1]?.method).toBeUndefined();
    expect(generateCalls(fetchMock)).toHaveLength(0);
    expect(sessionItems.activeDomain).toBe("linear.app");
    expect(Object.keys(sessionItems).some((key) => key.startsWith("coldStartCard:"))).toBe(true);
  });
});

function generateCalls(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.filter(([url, init]) => {
    return String(url).endsWith("/api/generate") && (init as RequestInit | undefined)?.method === "POST";
  });
}
