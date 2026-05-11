import { apiJson } from "../../../../../lib/api-response";
import { assertExtensionRequest } from "../../../../../lib/extension-auth";
import { getFullCachedCard } from "../../../../../lib/cards";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const auth = assertExtensionRequest(request.headers);
  if (!auth.ok) {
    return apiJson({ error: auth.error }, { status: auth.status });
  }

  const { slug } = await params;
  const card = await getFullCachedCard(slug);

  if (!card) {
    return apiJson({ error: "card not found" }, { status: 404 });
  }

  return apiJson(card);
}
