// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  alphaEventRetryDelayMs,
  alphaAnalyticsStorageKeys,
  enqueueAlphaEvent,
  pruneAlphaEventQueue,
  resetAlphaEventQueueBlock,
  startAlphaEventRecovery,
  shouldRetryAlphaEvents
} from "../src/shared/alpha-analytics";
import type { AlphaEvent } from "@cold-start/core";

function queuedEvent(occurredAt: string, sequence: number) {
  return {
    event: {
      eventId: `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`,
      eventName: "panel.opened",
      schemaVersion: 1,
      occurredAt,
      sessionId: "00000000-0000-4000-8000-000000000001",
      sequence,
      context: {
        extensionVersion: "0.1.0",
        browser: "chrome",
        installChannel: "unlisted",
        surface: "side_panel",
        theme: "light",
        reducedMotion: false,
        online: true
      },
      properties: {}
    } satisfies AlphaEvent,
    attempts: 0,
    nextAttemptAt: 0
  };
}

describe("alpha analytics queue policy", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("caps the queue at 200 newest events", () => {
    const now = Date.parse("2026-07-24T12:00:00.000Z");
    const queue = Array.from({ length: 205 }, (_, index) =>
      queuedEvent(new Date(now - index * 1_000).toISOString(), index + 1)
    );
    const result = pruneAlphaEventQueue(queue, now);
    expect(result.queue).toHaveLength(200);
    expect(result.dropped).toBe(5);
  });

  it("clears only the auth-shaped queue block once authentication is proven again", async () => {
    const stored: Record<string, unknown> = {
      [alphaAnalyticsStorageKeys.blocked]: "connection_repair_required"
    };
    vi.stubGlobal("chrome", chromeStub(stored));

    await resetAlphaEventQueueBlock();
    expect(stored[alphaAnalyticsStorageKeys.blocked]).toBeNull();

    stored[alphaAnalyticsStorageKeys.blocked] = "event_payload_rejected";
    await resetAlphaEventQueueBlock();
    expect(stored[alphaAnalyticsStorageKeys.blocked]).toBe("event_payload_rejected");
  });

  it("drops events older than seven days", () => {
    const now = Date.parse("2026-07-24T12:00:00.000Z");
    const result = pruneAlphaEventQueue([
      queuedEvent("2026-07-16T11:59:59.000Z", 1),
      queuedEvent("2026-07-24T11:59:59.000Z", 2)
    ], now);
    expect(result.queue.map((item) => item.event.sequence)).toEqual([2]);
    expect(result.dropped).toBe(1);
  });

  it("retries only transient response classes", () => {
    expect([408, 429, 500, 503].every(shouldRetryAlphaEvents)).toBe(true);
    expect([400, 401, 403, 404].some(shouldRetryAlphaEvents)).toBe(false);
  });

  it("caps exponential jitter at five minutes", () => {
    expect(alphaEventRetryDelayMs(0, 0)).toBe(1_000);
    expect(alphaEventRetryDelayMs(1, 0.5)).toBe(3_000);
    expect(alphaEventRetryDelayMs(20, 1)).toBe(300_000);
  });

  it("persists offline events and flushes them when the browser comes back online", async () => {
    const stored: Record<string, unknown> = { coldStartInstallChannel: "unlisted" };
    vi.stubGlobal("chrome", chromeStub(stored));
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { events: AlphaEvent[] };
      return new Response(JSON.stringify({
        acknowledgedEventIds: body.events.map((event) => event.eventId)
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const settings = { apiOrigin: "https://example.com", apiToken: "alpha-token" };

    await enqueueAlphaEvent(settings, "panel.opened", {});

    expect(fetchMock).not.toHaveBeenCalled();
    expect(stored[alphaAnalyticsStorageKeys.queue]).toHaveLength(1);

    const stopRecovery = startAlphaEventRecovery(settings);
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    window.dispatchEvent(new Event("online"));
    await flushAsyncWork();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(stored[alphaAnalyticsStorageKeys.queue]).toEqual([]);
    stopRecovery();
  });

  it("retries a transient failure without waiting for another event or reopen", async () => {
    vi.useFakeTimers();
    const stored: Record<string, unknown> = { coldStartInstallChannel: "unlisted" };
    vi.stubGlobal("chrome", chromeStub(stored));
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockImplementationOnce(async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as { events: AlphaEvent[] };
        return new Response(JSON.stringify({
          acknowledgedEventIds: body.events.map((event) => event.eventId)
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      });
    vi.stubGlobal("fetch", fetchMock);
    const settings = { apiOrigin: "https://example.com", apiToken: "alpha-token" };

    await enqueueAlphaEvent(settings, "panel.opened", {});
    await flushAsyncWork();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(stored[alphaAnalyticsStorageKeys.queue]).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(5_000);
    await flushAsyncWork();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(stored[alphaAnalyticsStorageKeys.queue]).toEqual([]);
    vi.useRealTimers();
  });

  it("turns bounded queue loss into a privacy-safe error count", async () => {
    const now = Date.now();
    const stored: Record<string, unknown> = {
      coldStartInstallChannel: "unlisted",
      coldStartAlphaEventQueue: Array.from({ length: 200 }, (_, index) =>
        queuedEvent(new Date(now - (200 - index) * 1_000).toISOString(), index + 1)
      )
    };
    vi.stubGlobal("chrome", chromeStub(stored));
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });

    await enqueueAlphaEvent(
      { apiOrigin: "https://example.com", apiToken: "alpha-token" },
      "panel.opened",
      {}
    );

    const queue = stored[alphaAnalyticsStorageKeys.queue] as Array<{ event: AlphaEvent }>;
    const notice = queue.find((item) =>
      item.event.eventName === "client.error_presented"
      && item.event.properties.code === "analytics_queue_dropped"
    );
    expect(queue).toHaveLength(200);
    expect(notice?.event.properties).toEqual({
      code: "analytics_queue_dropped",
      route: "events",
      phase: "analytics",
      status: 0,
      count: 2
    });
    expect(stored[alphaAnalyticsStorageKeys.dropCount]).toBe(2);
  });
});

function chromeStub(stored: Record<string, unknown>) {
  return {
    runtime: {
      id: "extension-test-id",
      getManifest: () => ({ version: "0.2.0" })
    },
    storage: {
      local: {
        get: (keys: string[], callback: (items: Record<string, unknown>) => void) => {
          callback(Object.fromEntries(keys.map((key) => [key, stored[key]])));
        },
        set: (items: Record<string, unknown>, callback?: () => void) => {
          Object.assign(stored, items);
          callback?.();
        }
      }
    }
  };
}

async function flushAsyncWork() {
  for (let index = 0; index < 20; index += 1) {
    await Promise.resolve();
  }
}
