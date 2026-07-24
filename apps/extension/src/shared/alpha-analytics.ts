import {
  ALPHA_EVENT_BATCH_MAX_EVENTS,
  alphaEventBatchSchema,
  alphaEventSchema,
  type AlphaEvent,
  type AlphaEventName,
  type AlphaEventPropertiesByName,
  type AlphaSurface
} from "@cold-start/core";
import {
  COLD_START_API_CONTRACT_VERSION,
  COLD_START_CLIENT_CONTRACT_HEADER
} from "@cold-start/core";
import type { Settings } from "./extension-config";

const QUEUE_KEY = "coldStartAlphaEventQueue";
const BLOCKED_KEY = "coldStartAlphaEventQueueBlocked";
const DROP_COUNT_KEY = "coldStartAlphaEventDropCount";
const INSTALL_CHANNEL_KEY = "coldStartInstallChannel";
const MAX_QUEUE_EVENTS = 200;
const MAX_EVENT_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_RETRY_MS = 5 * 60 * 1000;

type QueuedEvent = {
  event: AlphaEvent;
  attempts: number;
  nextAttemptAt: number;
};

type QueueState = {
  [QUEUE_KEY]?: QueuedEvent[];
  [BLOCKED_KEY]?: string | null;
  [DROP_COUNT_KEY]?: number;
  [INSTALL_CHANNEL_KEY]?: "unlisted" | "unpacked" | "unknown";
};

const sessionId = crypto.randomUUID();
let sequence = 0;
let queueOperation = Promise.resolve();
let retryTimer: number | null = null;
let retryAt = Number.POSITIVE_INFINITY;

function storageGet(keys: string[]): Promise<QueueState> {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (items) => resolve(items as QueueState));
  });
}

function storageSet(items: QueueState): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set(items, () => resolve());
  });
}

function withQueueLock<T>(operation: () => Promise<T>): Promise<T> {
  const result = queueOperation.then(operation, operation);
  queueOperation = result.then(() => undefined, () => undefined);
  return result;
}

function browserName(): "chrome" | "firefox" {
  return chrome.runtime.id.includes("@") ? "firefox" : "chrome";
}

function extensionVersion() {
  return chrome.runtime.getManifest().version || "unknown";
}

function resolvedTheme(): "light" | "dark" {
  return typeof document !== "undefined" && document.documentElement.dataset.theme === "dark"
    ? "dark"
    : "light";
}

function reducedMotion() {
  return typeof window !== "undefined"
    ? window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
    : false;
}

function isOnline() {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

function clearScheduledRetry() {
  if (retryTimer !== null && typeof window !== "undefined") {
    window.clearTimeout(retryTimer);
  }
  retryTimer = null;
  retryAt = Number.POSITIVE_INFINITY;
}

function scheduleRetry(settings: Settings, nextAttemptAt: number | null) {
  if (typeof window === "undefined" || nextAttemptAt === null) {
    clearScheduledRetry();
    return;
  }
  if (retryTimer !== null && retryAt <= nextAttemptAt) {
    return;
  }

  clearScheduledRetry();
  retryAt = nextAttemptAt;
  retryTimer = window.setTimeout(() => {
    retryTimer = null;
    retryAt = Number.POSITIVE_INFINITY;
    void flushAlphaEvents(settings);
  }, Math.max(0, nextAttemptAt - Date.now()));
}

function nextQueuedAttemptAt(queue: QueuedEvent[]) {
  return queue.length > 0
    ? Math.min(...queue.map((item) => item.nextAttemptAt))
    : null;
}

function isQueueDropNotice(item: QueuedEvent) {
  return item.event.eventName === "client.error_presented"
    && item.event.properties.code === "analytics_queue_dropped";
}

function queueWithDropNotice(
  queue: QueuedEvent[],
  dropped: number,
  contextEvent: AlphaEvent
) {
  if (dropped === 0) {
    return { queue, dropped: 0 };
  }

  const pendingNotice = queue.find(isQueueDropNotice);
  const priorCount = pendingNotice?.event.eventName === "client.error_presented"
    ? pendingNotice.event.properties.count ?? 1
    : 0;
  const withoutNotice = queue.filter((item) => !isQueueDropNotice(item));
  const overflow = Math.max(0, withoutNotice.length + 1 - MAX_QUEUE_EVENTS);
  sequence += 1;
  const notice: QueuedEvent = {
    event: alphaEventSchema.parse({
      ...contextEvent,
      eventId: crypto.randomUUID(),
      eventName: "client.error_presented",
      occurredAt: new Date().toISOString(),
      sequence,
      interactionId: undefined,
      properties: {
        code: "analytics_queue_dropped",
        route: "events",
        phase: "analytics",
        status: 0,
        count: Math.min(MAX_QUEUE_EVENTS, priorCount + dropped + overflow)
      }
    }),
    attempts: 0,
    nextAttemptAt: 0
  };

  return {
    queue: [...withoutNotice.slice(-(MAX_QUEUE_EVENTS - 1)), notice],
    dropped: dropped + overflow
  };
}

export function pruneAlphaEventQueue(queue: QueuedEvent[], now = Date.now()) {
  const fresh = queue.filter((item) => {
    const occurredAt = Date.parse(item.event.occurredAt);
    return Number.isFinite(occurredAt) && now - occurredAt <= MAX_EVENT_AGE_MS;
  });
  return {
    queue: fresh.slice(-MAX_QUEUE_EVENTS),
    dropped: queue.length - Math.min(fresh.length, MAX_QUEUE_EVENTS)
  };
}

export function alphaEventRetryDelayMs(attempts: number, random = Math.random()) {
  const base = Math.min(MAX_RETRY_MS, 1_000 * 2 ** Math.min(Math.max(0, attempts), 8));
  return Math.min(MAX_RETRY_MS, base + Math.floor(base * Math.max(0, Math.min(1, random))));
}

export function shouldRetryAlphaEvents(status: number) {
  return status === 408 || status === 429 || status >= 500;
}

export async function enqueueAlphaEvent<Name extends AlphaEventName>(
  settings: Settings,
  eventName: Name,
  properties: AlphaEventPropertiesByName[Name],
  surface: AlphaSurface = "side_panel",
  interactionId?: string
) {
  if (!settings.apiToken) {
    return;
  }

  const state = await storageGet([INSTALL_CHANNEL_KEY]);
  sequence += 1;
  const event = alphaEventSchema.parse({
    eventId: crypto.randomUUID(),
    eventName,
    schemaVersion: 1,
    occurredAt: new Date().toISOString(),
    sessionId,
    sequence,
    ...(interactionId ? { interactionId } : {}),
    context: {
      extensionVersion: extensionVersion(),
      browser: browserName(),
      installChannel: state[INSTALL_CHANNEL_KEY] ?? "unknown",
      surface,
      theme: resolvedTheme(),
      reducedMotion: reducedMotion(),
      online: isOnline()
    },
    properties
  });

  await withQueueLock(async () => {
    const stored = await storageGet([QUEUE_KEY, DROP_COUNT_KEY]);
    const pruned = pruneAlphaEventQueue([
      ...(Array.isArray(stored[QUEUE_KEY]) ? stored[QUEUE_KEY] : []),
      { event, attempts: 0, nextAttemptAt: 0 }
    ]);
    const recorded = queueWithDropNotice(pruned.queue, pruned.dropped, event);
    await storageSet({
      [QUEUE_KEY]: recorded.queue,
      [DROP_COUNT_KEY]: (stored[DROP_COUNT_KEY] ?? 0) + recorded.dropped
    });
  });

  void flushAlphaEvents(settings);
}

async function flushAlphaEvents(settings: Settings) {
  if (!settings.apiToken || !isOnline()) {
    return;
  }

  await withQueueLock(async () => {
    const now = Date.now();
    const stored = await storageGet([QUEUE_KEY, BLOCKED_KEY, DROP_COUNT_KEY]);
    if (stored[BLOCKED_KEY]) {
      clearScheduledRetry();
      return;
    }

    const pruned = pruneAlphaEventQueue(Array.isArray(stored[QUEUE_KEY]) ? stored[QUEUE_KEY] : [], now);
    const ready = pruned.queue.filter((item) => item.nextAttemptAt <= now);
    if (ready.length === 0) {
      if (pruned.dropped > 0) {
        await storageSet({
          [QUEUE_KEY]: pruned.queue,
          [DROP_COUNT_KEY]: (stored[DROP_COUNT_KEY] ?? 0) + pruned.dropped
        });
      }
      scheduleRetry(settings, nextQueuedAttemptAt(pruned.queue));
      return;
    }

    const batchItems: QueuedEvent[] = [];
    for (const item of ready.slice(0, ALPHA_EVENT_BATCH_MAX_EVENTS)) {
      const candidate = [...batchItems, item];
      if (!alphaEventBatchSchema.safeParse({ events: candidate.map((entry) => entry.event) }).success) {
        break;
      }
      batchItems.push(item);
    }
    if (batchItems.length === 0) {
      await storageSet({ [BLOCKED_KEY]: "invalid_event_batch" });
      return;
    }

    let response: Response;
    try {
      response = await fetch(`${settings.apiOrigin}/api/alpha/events`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${settings.apiToken}`,
          "Content-Type": "application/json",
          "X-Cold-Start-Extension-Id": chrome.runtime.id,
          "X-Cold-Start-Extension-Version": extensionVersion(),
          [COLD_START_CLIENT_CONTRACT_HEADER]: COLD_START_API_CONTRACT_VERSION
        },
        body: JSON.stringify({ events: batchItems.map((item) => item.event) })
      });
    } catch {
      response = new Response(null, { status: 503 });
    }

    if (response.ok) {
      const body = await response.json().catch(() => null) as { acknowledgedEventIds?: unknown } | null;
      const acknowledged = new Set(
        Array.isArray(body?.acknowledgedEventIds)
          ? body.acknowledgedEventIds.filter((value): value is string => typeof value === "string")
          : []
      );
      await storageSet({
        [QUEUE_KEY]: pruned.queue.filter((item) => !acknowledged.has(item.event.eventId)),
        [DROP_COUNT_KEY]: (stored[DROP_COUNT_KEY] ?? 0) + pruned.dropped
      });
      scheduleRetry(
        settings,
        nextQueuedAttemptAt(pruned.queue.filter((item) => !acknowledged.has(item.event.eventId)))
      );
      return;
    }

    if (!shouldRetryAlphaEvents(response.status)) {
      await storageSet({
        [QUEUE_KEY]: pruned.queue,
        [BLOCKED_KEY]: response.status === 401 || response.status === 403
          ? "connection_repair_required"
          : "event_payload_rejected"
      });
      clearScheduledRetry();
      return;
    }

    const attemptedIds = new Set(batchItems.map((item) => item.event.eventId));
    const retryQueue = pruned.queue.map((item) => {
        if (!attemptedIds.has(item.event.eventId)) {
          return item;
        }
        const attempts = item.attempts + 1;
        return {
          ...item,
          attempts,
          nextAttemptAt: now + alphaEventRetryDelayMs(attempts)
        };
      });
    await storageSet({
      [QUEUE_KEY]: retryQueue,
      [DROP_COUNT_KEY]: (stored[DROP_COUNT_KEY] ?? 0) + pruned.dropped
    });
    scheduleRetry(settings, nextQueuedAttemptAt(retryQueue));
  });
}

// Only the auth-shaped block clears here: a successful authenticated bootstrap proves the
// connection works again, but a payload-rejection block would just replay the same rejected
// batch and re-block, so those stay until the payload itself is fixed.
export async function resetAlphaEventQueueBlock() {
  const stored = await storageGet([BLOCKED_KEY]);
  if (stored[BLOCKED_KEY] === "connection_repair_required") {
    await storageSet({ [BLOCKED_KEY]: null });
  }
}

export function startAlphaEventRecovery(settings: Settings) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const flush = () => void flushAlphaEvents(settings);
  window.addEventListener("online", flush);
  flush();
  return () => {
    window.removeEventListener("online", flush);
    clearScheduledRetry();
  };
}

export const alphaAnalyticsStorageKeys = {
  blocked: BLOCKED_KEY,
  dropCount: DROP_COUNT_KEY,
  installChannel: INSTALL_CHANNEL_KEY,
  queue: QUEUE_KEY
} as const;
