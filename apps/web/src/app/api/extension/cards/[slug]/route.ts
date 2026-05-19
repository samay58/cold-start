import { apiJsonWithTiming } from "../../../../../lib/api-response";
import { assertExtensionRequest } from "../../../../../lib/extension-auth";
import { getFullCachedCard } from "../../../../../lib/cards";

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
  const card = await getFullCachedCard(slug);
  const metrics = [
    { name: "db", durationMs: elapsedMs(dbStartedAt) },
    { name: "total", durationMs: elapsedMs(startedAt) }
  ];

  if (!card) {
    return apiJsonWithTiming({ error: "card not found" }, metrics, { status: 404 });
  }

  return apiJsonWithTiming(card, metrics);
}
