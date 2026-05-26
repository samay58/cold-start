import { hasUsablePublicProfile, materializeFundingFromCitations, mergeStoredResearchSectionsWithLegacy } from "@cold-start/core";
import {
  createDb,
  findCardBySlug,
  findPublicCardBySlug,
  latestProviderFailureSummary,
  listPublicCardSummaries,
  type ProviderFailureSummary,
  type PublicCardSummary
} from "@cold-start/db";

import { webEnv } from "./env";

export async function getPublicCachedCard(slug: string) {
  const db = createDb(webEnv().DATABASE_URL);
  const card = await findPublicCardBySlug(db, slug, { allowStale: true });
  return card && hasUsablePublicProfile(card) ? materializeFundingFromCitations(card) : null;
}

export async function getFullCachedCard(slug: string) {
  const db = createDb(webEnv().DATABASE_URL);
  const card = await findCardBySlug(db, slug, { allowStale: true });
  return card && hasUsablePublicProfile(card) ? materializeFundingFromCitations(card) : null;
}

// Lightweight read for surfacing why a card is thin. Safe to call alongside the card fetch; it
// reads one row from generation_runs and parses its trace_json once.
export async function getLatestProviderFailureSummary(slug: string): Promise<ProviderFailureSummary> {
  const db = createDb(webEnv().DATABASE_URL);
  return latestProviderFailureSummary(db, slug);
}

export async function getPublicProfileIndex(): Promise<PublicCardSummary[]> {
  const db = createDb(webEnv().DATABASE_URL);
  const summaries = await listPublicCardSummaries(db);

  return summaries.map((summary) => {
    const card = materializeFundingFromCitations(summary.card);

    return {
      ...summary,
      totalRaisedUsd: card.funding.totalRaisedUsd.value,
      lastRoundName: card.funding.lastRound.value?.name ?? null,
      headcount: card.team.headcount.value?.value ?? null,
      card,
      sections: mergeStoredResearchSectionsWithLegacy({
        card,
        storedSections: summary.sections,
        includeGated: false
      })
    };
  });
}
