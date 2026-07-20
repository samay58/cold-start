import { cachedCardGetResponse } from "../../../../lib/card-route";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const startedAt = performance.now();
  const { slug } = await params;
  return cachedCardGetResponse({ slug, variant: "public", startedAt });
}
