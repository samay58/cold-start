import { apiJsonWithTiming, setProviderFailureHeaders } from "./api-response";
import { getFullCachedCard, getLatestProviderFailureSummary, getPublicCachedCard } from "./cards";

const PUBLIC_CARD_CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=15, stale-while-revalidate=60",
  "CDN-Cache-Control": "public, s-maxage=60, stale-while-revalidate=300"
};

// Shared GET choreography for the public and extension card routes. The variant decides the read:
// "public" goes through getPublicCachedCard (synthesis stripped at the DB read, never returned)
// and carries CDN cache headers; "extension" goes through getFullCachedCard (synthesis included)
// after the route has already authenticated the request. Auth stays in the extension route.
export async function cachedCardGetResponse(input: {
  slug: string;
  variant: "public" | "extension";
  startedAt: number;
}) {
  const dbStartedAt = performance.now();
  // Fetch the card and the most recent provider failure summary in parallel; the summary is
  // best-effort observability and must never delay or fail the card response.
  const [card, providerSummary] = await Promise.all([
    input.variant === "public" ? getPublicCachedCard(input.slug) : getFullCachedCard(input.slug),
    getLatestProviderFailureSummary(input.slug).catch(() => null)
  ]);
  const metrics = [
    { name: "db", durationMs: performance.now() - dbStartedAt },
    { name: "total", durationMs: performance.now() - input.startedAt }
  ];
  const headers = input.variant === "public" ? { headers: PUBLIC_CARD_CACHE_HEADERS } : {};

  const response = card
    ? apiJsonWithTiming(card, metrics, { ...headers })
    : apiJsonWithTiming({ error: "card not found" }, metrics, { status: 404, ...headers });
  setProviderFailureHeaders(response, providerSummary);
  return response;
}
