import { createDb, inspectAlphaInvite } from "@cold-start/db";

import { apiJsonWithTiming } from "../../../../../lib/api-response";
import { alphaAccessEnabled } from "../../../../../lib/alpha-config";
import { readBoundedJson } from "../../../../../lib/bounded-json";
import { trustedClientHash } from "../../../../../lib/client-identity";
import { webEnv } from "../../../../../lib/web-env";
import {
  ALPHA_INVITE_REQUEST_MAX_BYTES,
  alphaInviteErrorStatus,
  alphaInviteRequestSchema,
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
  const parsed = alphaInviteRequestSchema.safeParse(body.ok ? body.value : null);
  if (!parsed.success) {
    return respond({ ok: false, code: "invalid_invite" }, { status: 400 });
  }

  const sourceHash = trustedClientHash(request.headers);
  if (!sourceHash) {
    return respond({ ok: false, code: "access_unavailable" }, { status: 503 });
  }
  const db = createDb(webEnv().DATABASE_URL);
  if (!await consumeAlphaInviteQuota(db, sourceHash)) {
    return respond({ error: "too_many_attempts" }, { status: 429 });
  }

  const inspection = await inspectAlphaInvite(db, hashAlphaSecret(parsed.data.inviteToken));
  if (inspection.state !== "ready") {
    return respond(
      { ok: false, code: inspection.state },
      { status: alphaInviteErrorStatus(inspection.state) }
    );
  }

  return respond({
    ok: true,
    state: "ready",
    allowance: {
      profile: inspection.profileLimit,
      lens: inspection.lensLimit
    }
  });
}
