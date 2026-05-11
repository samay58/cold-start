import { apiJson } from "../../../../lib/api-response";
import { getPublicCachedCard } from "../../../../lib/cards";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const card = await getPublicCachedCard(slug);

  if (!card) {
    return apiJson({ error: "card not found" }, { status: 404 });
  }

  return apiJson(card);
}
