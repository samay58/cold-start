import { createDb } from "@cold-start/db";

import { apiJsonWithTiming } from "../../../../../lib/api-response";
import {
  authenticateExtensionRequest,
  principalHasScope
} from "../../../../../lib/extension-auth";
import { cachedCardGetResponse } from "../../../../../lib/card-route";
import { webEnv } from "../../../../../lib/web-env";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const startedAt = performance.now();
  const auth = await authenticateExtensionRequest(
    request.headers,
    () => createDb(webEnv().DATABASE_URL)
  );
  if (!auth.ok) {
    const legacyError =
      auth.error === "extension connection required"
        ? "extension token required"
        : auth.error === "extension connection needs repair"
          ? "extension token invalid"
          : auth.error;
    return apiJsonWithTiming(
      { error: legacyError },
      [{ name: "total", durationMs: performance.now() - startedAt }],
      { status: auth.status }
    );
  }
  if (!principalHasScope(auth.principal, "cards:read")) {
    return apiJsonWithTiming(
      { error: "card access is not allowed for this installation", code: "authorization" },
      [{ name: "total", durationMs: performance.now() - startedAt }],
      { status: 403 }
    );
  }

  const { slug } = await params;
  return cachedCardGetResponse({ slug, variant: "extension", startedAt });
}
