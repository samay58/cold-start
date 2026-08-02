import { findAlphaInviteCardBySlug, type ColdStartDb } from "@cold-start/db";

import {
  alphaInviteBreakerOpen,
  recordInvalidInviteAttempt
} from "../../api/alpha/invite/invite-service";

export type AlphaInviteCard = Awaited<ReturnType<typeof findAlphaInviteCardBySlug>>;

// Shared by the page and the card image route: both are a slug-guessing surface (lens3 F2 /
// verify-scan-oracle.md Finding B), so both feed the same global breaker invite/inspect and
// invite/redeem already use, rather than a second one. A slug that resolves to no row records
// exactly like a failed inspect. While the breaker is open, this returns null unconditionally
// (never touching the database), so a real invite and a guess answer identically until the
// window drains.
export async function lookupAlphaInviteCardForSlug(
  db: ColdStartDb,
  slug: string
): Promise<AlphaInviteCard> {
  if (await alphaInviteBreakerOpen(db)) {
    return null;
  }
  const card = await findAlphaInviteCardBySlug(db, slug);
  if (!card) {
    await recordInvalidInviteAttempt(db);
    return null;
  }
  return card;
}
