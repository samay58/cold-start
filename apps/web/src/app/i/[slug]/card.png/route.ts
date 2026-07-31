import { createDb, findAlphaInviteCardBySlug } from "@cold-start/db";

import { webEnv } from "../../../../lib/web-env";

// Serves the approved invitation card exactly as stored on the invite row. The
// runtime never renders anything; regeneration mints a fresh slug, so the bytes
// behind one slug are immutable and can cache forever.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  if (!/^[a-z0-9-]{1,64}$/.test(slug)) {
    return new Response("not found", { status: 404 });
  }
  const db = createDb(webEnv().DATABASE_URL);
  const card = await findAlphaInviteCardBySlug(db, slug);
  if (!card?.cardPngBase64) {
    return new Response("not found", { status: 404 });
  }
  const bytes = Buffer.from(card.cardPngBase64, "base64");
  // The mint normalizes to PNG, but the image model has returned JPEG under a
  // png data-URL label before; serve whatever the stored bytes actually are.
  const contentType = bytes[0] === 0xff && bytes[1] === 0xd8 ? "image/jpeg" : "image/png";
  return new Response(bytes, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable"
    }
  });
}
