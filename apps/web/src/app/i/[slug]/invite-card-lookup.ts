import { findAlphaInviteCardBySlug, type ColdStartDb } from "@cold-start/db";

type AlphaInviteCard = Awaited<ReturnType<typeof findAlphaInviteCardBySlug>>;

// Slugs select personalized preview art, but they are not invitation credentials. Keep page
// traffic out of the low-entropy token breaker's global tally so crawlers cannot disable
// inspect and redeem for legitimate testers.
export async function lookupAlphaInviteCardForSlug(
  db: ColdStartDb,
  slug: string
): Promise<AlphaInviteCard> {
  return findAlphaInviteCardBySlug(db, slug);
}
