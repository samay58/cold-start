import { createDb, getAlphaAllowanceSnapshot } from "@cold-start/db";

import { apiJsonWithTiming } from "../../../../../lib/api-response";
import { alphaGenerationEnabled } from "../../../../../lib/alpha-config";
import { authenticateExtensionRequest } from "../../../../../lib/extension-auth";
import { webEnv } from "../../../../../lib/web-env";
import { alphaClientCompatibility } from "../invite-service";

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
  const db = createDb(webEnv().DATABASE_URL);
  const auth = await authenticateExtensionRequest(request.headers, db);
  if (!auth.ok) {
    return respond(
      {
        ok: false,
        code: auth.code === "access_disabled" ? "access_disabled" : "connection_lost"
      },
      { status: auth.status }
    );
  }
  if (
    auth.principal.kind !== "alpha" ||
    !auth.principal.inviteId ||
    !auth.principal.installationId
  ) {
    return respond({ ok: false, code: "connection_lost" }, { status: 403 });
  }

  const compatibility = alphaClientCompatibility(request.headers);
  if (compatibility === "update_required") {
    return respond({ ok: false, code: "update_required" }, { status: 426 });
  }

  const allowance = await getAlphaAllowanceSnapshot(db, auth.principal.inviteId);
  if (!allowance) {
    return respond({ ok: false, code: "connection_lost" }, { status: 409 });
  }

  return respond({
    ok: true,
    state: "connected",
    installationSuffix: auth.principal.installationId.slice(-6),
    compatibility,
    generationEnabled: alphaGenerationEnabled(),
    allowance: {
      profile: {
        limit: allowance.profile.limit,
        remaining: allowance.profile.remaining
      },
      lens: {
        limit: allowance.lens.limit,
        remaining: allowance.lens.remaining
      }
    }
  });
}
