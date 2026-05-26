import { apiJsonWithTiming, setProviderFailureHeaders } from "../../../../lib/api-response";
import { getLatestProviderFailureSummary, getPublicCachedCard } from "../../../../lib/cards";

function elapsedMs(startedAt: number) {
  return performance.now() - startedAt;
}

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const startedAt = performance.now();
  const { slug } = await params;
  const dbStartedAt = performance.now();
  // Fetch the card and the most recent provider failure summary in parallel; the summary is
  // best-effort observability and must never delay or fail the card response.
  const [card, providerSummary] = await Promise.all([
    getPublicCachedCard(slug),
    getLatestProviderFailureSummary(slug).catch(() => null)
  ]);
  const metrics = [
    { name: "db", durationMs: elapsedMs(dbStartedAt) },
    { name: "total", durationMs: elapsedMs(startedAt) }
  ];
  const headers = {
    "Cache-Control": "public, s-maxage=15, stale-while-revalidate=60",
    "CDN-Cache-Control": "public, s-maxage=60, stale-while-revalidate=300"
  };

  if (!card) {
    const response = apiJsonWithTiming({ error: "card not found" }, metrics, { status: 404, headers });
    setProviderFailureHeaders(response, providerSummary);
    return response;
  }

  const response = apiJsonWithTiming(card, metrics, { headers });
  setProviderFailureHeaders(response, providerSummary);
  return response;
}
