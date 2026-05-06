import { NextResponse } from "next/server";

import { assertExtensionRequest } from "../../../../../lib/extension-auth";
import { getFullCachedCard } from "../../../../../lib/cards";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const auth = assertExtensionRequest(request.headers);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { slug } = await params;
  const card = await getFullCachedCard(slug);

  if (!card) {
    return NextResponse.json({ error: "card not found" }, { status: 404 });
  }

  return NextResponse.json(card);
}
