import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// Environment-agnostic builders only: this file runs without the jsdom pragma, so it must not
// import sidepanel-harness.tsx (react-dom/client would load in a non-DOM test run).
import { flushMicrotasks, jsonResponse } from "./test-stubs";

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
            websiteUrl: { value: "https://linear.app/", status: "verified", confidence: "high", citationIds: ["c1"] },
            logoUrl: null,
            oneLiner: { value: "Linear builds issue tracking and product planning software for engineering teams.", status: "verified", confidence: "high", citationIds: ["c1"] },
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
            headcount: { value: { value: 131, asOf: "2026-05-18" }, status: "inferred", confidence: "medium", citationIds: ["c1"] }
          },
          signals: [],
          comparables: [{ name: "Jira", domain: "atlassian.com", oneLiner: "Issue tracking and project management software." }],
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
        lastError: undefined,
        getManifest: () => ({ version: "0.1.0" }),
        onInstalled: { addListener: vi.fn() },
        onMessageExternal: { addListener: vi.fn() }
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
            callback({ coldStartApiOrigin: "http://localhost:3000", coldStartApiToken: "token-123" }),
          set: (_items: Record<string, unknown>, callback?: () => void) => callback?.(),
          setAccessLevel: vi.fn(async () => undefined)
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
    await flushMicrotasks();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const firstFetchCall = fetchMock.mock.calls[0] as unknown as [string, RequestInit?] | undefined;
    expect(String(firstFetchCall?.[0])).toContain("/api/extension/bootstrap?domain=linear.app");
    expect(firstFetchCall?.[1]?.method).toBeUndefined();
    expect(generateCalls(fetchMock)).toHaveLength(0);
    expect(sessionItems.activeDomain).toBe("linear.app");
    expect(Object.keys(sessionItems).some((key) => key.startsWith("coldStartCard:"))).toBe(true);
  });

  it("records the researched tab and window at click time for the Firefox stale-tab hint", async () => {
    let clickListener: ((tab: chrome.tabs.Tab) => void) | undefined;
    const sessionItems: Record<string, unknown> = {};
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({})));
    installChromeStub(() => undefined, {}, vi.fn(async () => undefined), undefined, {
      captureClick: (listener) => {
        clickListener = listener;
      },
      sessionItems
    });

    await import("../src/background");
    clickListener?.({ id: 7, windowId: 3, url: "https://linear.app/docs" } as chrome.tabs.Tab);
    await flushMicrotasks();

    expect(sessionItems.activeDomain).toBe("linear.app");
    expect(sessionItems.lastResearchTabId).toBe(7);
    expect(sessionItems.lastResearchWindowId).toBe(3);
  });
});

describe("background alpha invitation bridge", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects untrusted senders before reading the message", async () => {
    let externalListener: ExternalListener | undefined;
    installChromeStub((listener) => {
      externalListener = listener;
    });
    vi.stubGlobal("fetch", vi.fn());

    await import("../src/background");
    const sendResponse = vi.fn();
    const keepAlive = externalListener?.(
      {
        type: "cold-start.alpha.connect",
        version: 1,
        inviteToken: "a".repeat(32),
        consent: true,
        storeVisited: false,
        reducedMotion: false,
        theme: "light"
      },
      { url: "https://cold-start.semitechie.vc.evil.example/alpha" },
      sendResponse
    );

    expect(keepAlive).toBe(false);
    expect(sendResponse).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reports an installed but unconnected extension without a network request", async () => {
    let externalListener: ExternalListener | undefined;
    installChromeStub((listener) => {
      externalListener = listener;
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await import("../src/background");
    const response = await invokeExternal(externalListener, {
      type: "cold-start.alpha.status",
      version: 1
    });

    expect(response).toEqual({
      ok: true,
      state: "not_connected",
      extensionVersion: "0.1.0"
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stores the per-install credential in trusted extension storage and never returns it to the page", async () => {
    let externalListener: ExternalListener | undefined;
    const storageItems: Record<string, unknown> = {};
    const setAccessLevel = vi.fn(async () => undefined);
    installChromeStub((listener) => {
      externalListener = listener;
    }, storageItems, setAccessLevel);
    const accessToken = "connection-secret-never-returned";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      state: "connected",
      accessToken,
      installationSuffix: "a1b2c3",
      compatibility: "current",
      generationEnabled: true,
      allowance: {
        profile: { limit: 12, remaining: 12 },
        lens: { limit: 6, remaining: 6 }
      }
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    })));

    await import("../src/background");
    const response = await invokeExternal(externalListener, {
      type: "cold-start.alpha.connect",
      version: 1,
      inviteToken: "a".repeat(32),
      consent: true,
      storeVisited: true,
      reducedMotion: true,
      theme: "dark"
    });

    expect(setAccessLevel).toHaveBeenCalledWith({ accessLevel: "TRUSTED_CONTEXTS" });
    expect(storageItems.coldStartApiToken).toBe(accessToken);
    expect(storageItems.coldStartAlphaInstallationSuffix).toBe("a1b2c3");
    expect(storageItems.coldStartInstallChannel).toBe("unlisted");
    expect(response).toMatchObject({
      ok: true,
      state: "connected",
      extensionVersion: "0.1.0",
      installationSuffix: "a1b2c3"
    });
    expect(JSON.stringify(response)).not.toContain(accessToken);
    const redeemCall = vi.mocked(fetch).mock.calls[0];
    expect(JSON.parse(String(redeemCall?.[1]?.body))).toMatchObject({
      consent: true,
      storeVisited: true,
      reducedMotion: true,
      theme: "dark"
    });
  });

  it("does not redeem a message without affirmative consent", async () => {
    let externalListener: ExternalListener | undefined;
    installChromeStub((listener) => {
      externalListener = listener;
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await import("../src/background");
    const response = await invokeExternal(externalListener, {
      type: "cold-start.alpha.connect",
      version: 1,
      inviteToken: "a".repeat(32),
      consent: false,
      storeVisited: true,
      reducedMotion: false,
      theme: "light"
    });

    expect(response).toMatchObject({ ok: false, code: "unknown" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("retains the install event until an invitation credential exists", async () => {
    let installedListener: ((details: chrome.runtime.InstalledDetails) => void) | undefined;
    const storageItems: Record<string, unknown> = {};
    installChromeStub(
      () => undefined,
      storageItems,
      vi.fn(async () => undefined),
      (listener) => {
        installedListener = listener;
      }
    );
    vi.stubGlobal("fetch", vi.fn());

    await import("../src/background");
    installedListener?.({ reason: "install" } as chrome.runtime.InstalledDetails);
    await flushMicrotasks();

    expect(storageItems.coldStartPendingLifecycleEvents).toEqual([
      { eventName: "extension.installed" }
    ]);
    expect(fetch).not.toHaveBeenCalled();
  });
});

type ExternalListener = (
  message: unknown,
  sender: { url?: string },
  sendResponse: (response: unknown) => void
) => boolean | undefined;

function installChromeStub(
  captureExternal: (listener: ExternalListener) => void,
  storageItems: Record<string, unknown> = {},
  setAccessLevel = vi.fn(async () => undefined),
  captureInstalled?: (listener: (details: chrome.runtime.InstalledDetails) => void) => void,
  options?: {
    captureClick?: (listener: (tab: chrome.tabs.Tab) => void) => void;
    sessionItems?: Record<string, unknown>;
  }
) {
  const sessionItems = options?.sessionItems ?? {};
  vi.stubGlobal("chrome", {
    runtime: {
      id: "extension-test-id",
      lastError: undefined,
      getManifest: () => ({ version: "0.1.0" }),
      onInstalled: {
        addListener: (listener: (details: chrome.runtime.InstalledDetails) => void) => {
          captureInstalled?.(listener);
        }
      },
      onMessageExternal: {
        addListener: (listener: ExternalListener) => captureExternal(listener)
      }
    },
    action: {
      onClicked: {
        addListener: (listener: (tab: chrome.tabs.Tab) => void) => {
          options?.captureClick?.(listener);
        }
      }
    },
    sidePanel: {
      open: vi.fn(),
      setPanelBehavior: vi.fn()
    },
    storage: {
      local: {
        get: (keys: readonly string[], callback: (items: Record<string, unknown>) => void) => {
          callback(Object.fromEntries(keys.map((key) => [key, storageItems[key]])));
        },
        set: (items: Record<string, unknown>, callback?: () => void) => {
          Object.assign(storageItems, items);
          callback?.();
        },
        setAccessLevel
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
}

async function invokeExternal(listener: ExternalListener | undefined, message: unknown) {
  return new Promise<unknown>((resolve, reject) => {
    if (!listener) {
      reject(new Error("external listener was not registered"));
      return;
    }
    const keepAlive = listener(
      message,
      { url: "https://cold-start.semitechie.vc/alpha" },
      resolve
    );
    if (keepAlive === false) {
      reject(new Error("external listener did not keep the response channel open"));
    }
  });
}

function generateCalls(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.filter(([url, init]) => {
    return String(url).endsWith("/api/generate") && (init as RequestInit | undefined)?.method === "POST";
  });
}
