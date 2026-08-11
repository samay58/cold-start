import { randomBytes, randomUUID } from "node:crypto";

import {
  createDb,
  getAlphaAllowanceSnapshot,
  inspectAlphaInvite,
  insertAlphaEvents,
  redeemAlphaInvite
} from "@cold-start/db";

import { apiJsonWithTiming } from "../../../../../lib/api-response";
import {
  alphaAccessEnabled,
  alphaGenerationEnabled
} from "../../../../../lib/alpha-config";
import { webEnv } from "../../../../../lib/web-env";
import { readBoundedJson } from "../../../../../lib/bounded-json";
import { trustedClientHash } from "../../../../../lib/client-identity";
import {
  ALPHA_INVITE_REQUEST_MAX_BYTES,
  alphaClientCompatibility,
  alphaInviteErrorStatus,
  alphaInviteRedeemRequestSchema,
  consumeAlphaInviteQuota,
  hashAlphaSecret
} from "../invite-service";

export async function POST(request: Request) {
  const startedAt = performance.now();
  const respond = (body: unknown, init?: ResponseInit) =>
    apiJsonWithTiming(body, [{ name: "total", durationMs: performance.now() - startedAt }], {
      ...init,
      headers: {
        "Cache-Control": "no-store",
        ...Object.fromEntries(new Headers(init?.headers))
      }
    });

  if (!alphaAccessEnabled()) {
    return respond({ ok: false, code: "access_disabled" }, { status: 503 });
  }

  const body = await readBoundedJson(request, ALPHA_INVITE_REQUEST_MAX_BYTES);
  const parsed = alphaInviteRedeemRequestSchema.safeParse(body.ok ? body.value : null);
  if (!parsed.success) {
    return respond({ ok: false, code: "invalid_invite" }, { status: 400 });
  }

  const compatibility = alphaClientCompatibility(request.headers, parsed.data.clientContract);
  if (compatibility === "update_required") {
    return respond({ ok: false, code: "update_required" }, { status: 426 });
  }

  const accessToken = randomBytes(32).toString("base64url");
  const inviteTokenHash = hashAlphaSecret(parsed.data.inviteToken);
  const sourceHash = trustedClientHash(request.headers);
  if (!sourceHash) {
    return respond({ ok: false, code: "access_unavailable" }, { status: 503 });
  }
  const db = createDb(webEnv().DATABASE_URL);
  if (!await consumeAlphaInviteQuota(db, sourceHash)) {
    return respond({ error: "too_many_attempts" }, { status: 429 });
  }

  const auth = await redeemAlphaInvite(db, {
    tokenHash: inviteTokenHash,
    accessTokenHash: hashAlphaSecret(accessToken),
    browser: parsed.data.browser,
    channel: parsed.data.channel,
    extensionVersion: parsed.data.extensionVersion
  });

  if (!auth) {
    const inspection = await inspectAlphaInvite(db, inviteTokenHash);
    const state = inspection.state === "ready" ? "used" : inspection.state;
    return respond(
      { ok: false, code: state },
      { status: alphaInviteErrorStatus(state) }
    );
  }

  const occurredAt = new Date();
  const sessionId = randomUUID();
  const eventNames = [
    "invite.accepted",
    ...(parsed.data.storeVisited ? ["invite.store_clicked"] as const : []),
    "installation.connected"
  ] as const;
  await insertAlphaEvents(db, {
    inviteId: auth.invite.id,
    installationId: auth.installation.id,
    receivedAt: occurredAt,
    events: eventNames.map((eventName, sequence) => ({
      eventId: randomUUID(),
      eventName,
      schemaVersion: 1,
      occurredAt,
      sessionId,
      sequence,
      extensionVersion: parsed.data.extensionVersion,
      browser: parsed.data.browser,
      installChannel: parsed.data.channel,
      surface: "invite",
      theme: parsed.data.theme,
      reducedMotion: parsed.data.reducedMotion,
      online: true,
      properties: {}
    }))
  }).catch(() => []);

  const allowance = await getAlphaAllowanceSnapshot(db, auth.invite.id).catch(() => null);

  return respond({
    ok: true,
    state: "connected",
    accessToken,
    installationSuffix: auth.installation.id.slice(-6),
    compatibility,
    generationEnabled: alphaGenerationEnabled(),
    ...(allowance
      ? {
          allowance: {
            profile: { limit: allowance.profile.limit, remaining: allowance.profile.remaining },
            lens: { limit: allowance.lens.limit, remaining: allowance.lens.remaining }
          }
        }
      : {})
  });
}
