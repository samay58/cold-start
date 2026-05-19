import { apiJsonWithTiming } from "../../../../lib/api-response";
import { getPublicCachedCard } from "../../../../lib/cards";

function elapsedMs(startedAt: number) {
  return performance.now() - startedAt;
}

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const startedAt = performance.now();
  const { slug } = await params;
  const dbStartedAt = performance.now();
  const card = await getPublicCachedCard(slug);
  const metrics = [
    { name: "db", durationMs: elapsedMs(dbStartedAt) },
    { name: "total", durationMs: elapsedMs(startedAt) }
  ];
  const headers = {
    "Cache-Control": "public, s-maxage=15, stale-while-revalidate=60",
    "CDN-Cache-Control": "public, s-maxage=60, stale-while-revalidate=300"
  };

  if (!card) {
    return apiJsonWithTiming({ error: "card not found" }, metrics, { status: 404, headers });
  }

  return apiJsonWithTiming(card, metrics, { headers });
}
