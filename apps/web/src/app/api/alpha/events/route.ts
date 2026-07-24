import {
  ALPHA_EVENT_BATCH_MAX_BYTES,
  alphaEventBatchSchema
} from "@cold-start/core";
import {
  AlphaEventRateLimitError,
  createDb,
  insertAlphaEvents
} from "@cold-start/db";

import { apiJsonWithTiming } from "../../../../lib/api-response";
import {
  authenticateExtensionRequest,
  principalHasScope
} from "../../../../lib/extension-auth";
import { webEnv } from "../../../../lib/web-env";

export async function POST(request: Request) {
  const startedAt = performance.now();
  const timedJson = (body: unknown, init?: ResponseInit) =>
    apiJsonWithTiming(
      body,
      [{ name: "total", durationMs: performance.now() - startedAt }],
      init
    );
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > ALPHA_EVENT_BATCH_MAX_BYTES) {
    return timedJson({ error: "analytics batch is too large" }, { status: 413 });
  }

  const db = createDb(webEnv().DATABASE_URL);
  const auth = await authenticateExtensionRequest(request.headers, db);
  if (!auth.ok) {
    return timedJson(
      { error: auth.error, code: auth.code },
      { status: auth.status }
    );
  }
  if (
    auth.principal.kind !== "alpha" ||
    !auth.principal.inviteId ||
    !auth.principal.installationId
  ) {
    return timedJson(
      { error: "alpha installation required", code: "authentication" },
      { status: 403 }
    );
  }
  if (!principalHasScope(auth.principal, "events:write")) {
    return timedJson(
      { error: "event access is not allowed for this installation", code: "authorization" },
      { status: 403 }
    );
  }

  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > ALPHA_EVENT_BATCH_MAX_BYTES) {
    return timedJson({ error: "analytics batch is too large" }, { status: 413 });
  }

  let unknownBody: unknown;
  try {
    unknownBody = JSON.parse(rawBody);
  } catch {
    return timedJson({ error: "invalid analytics batch" }, { status: 400 });
  }

  const parsed = alphaEventBatchSchema.safeParse(unknownBody);
  if (!parsed.success) {
    return timedJson({ error: "invalid analytics batch" }, { status: 400 });
  }

  let acknowledgedEventIds: string[];
  try {
    acknowledgedEventIds = await insertAlphaEvents(db, {
      inviteId: auth.principal.inviteId,
      installationId: auth.principal.installationId,
      events: parsed.data.events.map((event) => ({
        eventId: event.eventId,
        eventName: event.eventName,
        schemaVersion: event.schemaVersion,
        occurredAt: new Date(event.occurredAt),
        sessionId: event.sessionId,
        sequence: event.sequence,
        interactionId: event.interactionId ?? null,
        extensionVersion: event.context.extensionVersion,
        browser: event.context.browser,
        installChannel: event.context.installChannel,
        surface: event.context.surface,
        theme: event.context.theme,
        reducedMotion: event.context.reducedMotion,
        online: event.context.online,
        properties: event.properties
      }))
    });
  } catch (error) {
    if (!(error instanceof AlphaEventRateLimitError)) {
      throw error;
    }
    console.warn("[alpha-security]", {
      signal: "event_rate_limited",
      status: 429
    });
    return timedJson(
      { error: "analytics event rate exceeded", code: "rate_limited" },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  return timedJson({ acknowledgedEventIds }, { status: 200 });
}
