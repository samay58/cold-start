import { createDb } from "@cold-start/db";

import { webEnv } from "../../../../lib/web-env";
import { lookupAlphaInviteCardForSlug } from "../invite-card-lookup";

// Serves the approved invitation card exactly as stored on the invite row. The runtime
// never renders anything. Cache-Control is private: the art is personalized (a real name and
// ordinal letterpressed in), so a shared/CDN cache must never retain or re-serve it to a
// second requester or after the invite is revoked (verify-scan-oracle.md Finding B).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  if (!/^[a-z0-9-]{1,64}$/.test(slug)) {
    return new Response("not found", { status: 404 });
  }
  const db = createDb(webEnv().DATABASE_URL);
  const card = await lookupAlphaInviteCardForSlug(db, slug);
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
      "Cache-Control": "private, max-age=3600"
    }
  });
}
