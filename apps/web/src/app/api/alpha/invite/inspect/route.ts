import { createDb } from "@cold-start/db";

import { apiJsonWithTiming } from "../../../../../lib/api-response";
import { alphaAccessEnabled } from "../../../../../lib/alpha-config";
import { webEnv } from "../../../../../lib/web-env";
import {
  alphaInviteBreakerOpen,
  alphaInviteErrorStatus,
  alphaInviteRequestSchema,
  hashAlphaSecret,
  inspectAlphaInvite,
  readBoundedJson,
  recordInvalidInviteAttempt
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

  const parsed = alphaInviteRequestSchema.safeParse(await readBoundedJson(request));
  if (!parsed.success) {
    return respond({ ok: false, code: "invalid_invite" }, { status: 400 });
  }

  const db = createDb(webEnv().DATABASE_URL);
  if (await alphaInviteBreakerOpen(db)) {
    return respond({ error: "too_many_attempts" }, { status: 429 });
  }

  const inspection = await inspectAlphaInvite(db, hashAlphaSecret(parsed.data.inviteToken));
  if (inspection.state !== "ready") {
    // Only a token that matches no row counts toward the breaker: expired, used,
    // and revoked are legitimate friends holding real links, not guesses.
    if (inspection.state === "invalid_invite") {
      await recordInvalidInviteAttempt(db);
    }
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
