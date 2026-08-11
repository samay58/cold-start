import { createDb } from "@cold-start/db";

import { webEnv } from "../../../../lib/web-env";
import { lookupAlphaInviteCardForPresentation } from "../invite-card-lookup";

// Serves the approved invitation card exactly as stored on the invite row. The runtime
// never renders anything. Cache-Control is private because the art is personalized with a real
// name and ordinal; a shared cache must never retain or re-serve it to another requester.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug: locator } = await params;
  const db = createDb(webEnv().DATABASE_URL);
  const card = await lookupAlphaInviteCardForPresentation(db, locator);
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
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex, nofollow, noarchive"
    }
  });
}
