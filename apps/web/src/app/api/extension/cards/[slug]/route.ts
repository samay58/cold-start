import { apiJsonWithTiming } from "../../../../../lib/api-response";
import { assertExtensionRequest } from "../../../../../lib/extension-auth";
import { cachedCardGetResponse } from "../../../../../lib/card-route";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const startedAt = performance.now();
  const auth = assertExtensionRequest(request.headers);
  if (!auth.ok) {
    return apiJsonWithTiming({ error: auth.error }, [{ name: "total", durationMs: performance.now() - startedAt }], { status: auth.status });
  }

  const { slug } = await params;
  return cachedCardGetResponse({ slug, variant: "extension", startedAt });
}
