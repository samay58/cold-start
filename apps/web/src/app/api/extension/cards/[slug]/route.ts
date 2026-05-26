import { apiJsonWithTiming, setProviderFailureHeaders } from "../../../../../lib/api-response";
import { assertExtensionRequest } from "../../../../../lib/extension-auth";
import { getFullCachedCard, getLatestProviderFailureSummary } from "../../../../../lib/cards";

function elapsedMs(startedAt: number) {
  return performance.now() - startedAt;
}

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const startedAt = performance.now();
  const auth = assertExtensionRequest(request.headers);
  if (!auth.ok) {
    return apiJsonWithTiming({ error: auth.error }, [{ name: "total", durationMs: elapsedMs(startedAt) }], { status: auth.status });
  }

  const { slug } = await params;
  const dbStartedAt = performance.now();
  // See public route for rationale: provider failure summary is best-effort observability.
  const [card, providerSummary] = await Promise.all([
    getFullCachedCard(slug),
    getLatestProviderFailureSummary(slug).catch(() => null)
  ]);
  const metrics = [
    { name: "db", durationMs: elapsedMs(dbStartedAt) },
    { name: "total", durationMs: elapsedMs(startedAt) }
  ];

  if (!card) {
    const response = apiJsonWithTiming({ error: "card not found" }, metrics, { status: 404 });
    setProviderFailureHeaders(response, providerSummary);
    return response;
  }

  const response = apiJsonWithTiming(card, metrics);
  setProviderFailureHeaders(response, providerSummary);
  return response;
}
