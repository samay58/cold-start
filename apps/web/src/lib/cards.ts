import { hasUsablePublicProfile, materializeFundingFromCitations, mergeStoredResearchSectionsWithLegacy } from "@cold-start/core";
import {
  createDb,
  findCardBySlug,
  findPublicCardBySlug,
  findResearchSectionsBySlug,
  latestProviderFailureSummary,
  listPublicCardSummaries,
  type ProviderFailureSummary,
  type PublicCardSummary
} from "@cold-start/db";
import { unstable_cache } from "next/cache";

import { webEnv } from "./web-env";

export async function getPublicCachedCard(slug: string) {
  const db = createDb(webEnv().DATABASE_URL);
  const card = await findPublicCardBySlug(db, slug, { allowStale: true });
  return card && hasUsablePublicProfile(card) ? materializeFundingFromCitations(card) : null;
}

export async function getPublicCachedCardProfile(slug: string) {
  const db = createDb(webEnv().DATABASE_URL);
  const [rawCard, storedSections] = await Promise.all([
    findPublicCardBySlug(db, slug, { allowStale: true }),
    findResearchSectionsBySlug(db, slug)
  ]);
  const card = rawCard && hasUsablePublicProfile(rawCard) ? materializeFundingFromCitations(rawCard) : null;

  if (!card) {
    return null;
  }

  return {
    card,
    sections: mergeStoredResearchSectionsWithLegacy({
      card,
      storedSections: storedSections.filter((section) => section.visibility === "public"),
      includeGated: false
    })
  };
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

async function getPublicProfileIndex(): Promise<PublicCardSummary[]> {
  const db = createDb(webEnv().DATABASE_URL);
  return listPublicCardSummaries(db);
}

export const getCachedPublicProfileIndex = unstable_cache(
  getPublicProfileIndex,
  ["public-profile-index"],
  { revalidate: 30 }
);
