import { publicCard } from "@cold-start/core";
import { NextResponse } from "next/server";
import { getCachedCard } from "../../../../inngest/functions";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const card = await getCachedCard(slug);

  if (!card) {
    return NextResponse.json({ error: "card not found" }, { status: 404 });
  }

  return NextResponse.json(publicCard(card));
}
