import { NextResponse } from "next/server";
import { getPublicCachedCard } from "../../../../lib/cards";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const card = await getPublicCachedCard(slug);

  if (!card) {
    return NextResponse.json({ error: "card not found" }, { status: 404 });
  }

  return NextResponse.json(card);
}
