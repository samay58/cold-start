import { createHash } from "node:crypto";

import { findActiveAlphaInviteCardByPresentationTokenHash, type ColdStartDb } from "@cold-start/db";

type AlphaInviteCard = Awaited<ReturnType<typeof findActiveAlphaInviteCardByPresentationTokenHash>>;

const PRESENTATION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export async function lookupAlphaInviteCardForPresentation(
  db: ColdStartDb,
  presentationToken: string,
  now = new Date()
): Promise<AlphaInviteCard> {
  if (!PRESENTATION_TOKEN_PATTERN.test(presentationToken)) return null;
  const tokenHash = createHash("sha256").update(presentationToken).digest("hex");
  return findActiveAlphaInviteCardByPresentationTokenHash(db, tokenHash, now);
}
