// One-shot repair for cards whose row `domain` column disagrees with the domain stored inside
// their own card_json. cards.ts's cache readers (findCardBySlug, findPublicCardBySlug,
// listPublicCardSummaries) throw `Card domain invariant failed` the moment they hit a row like
// this (the known-bad production `framer` row), so a stray mismatch 500s every read of that card
// until it is repaired. The card_json domain is what extraction actually resolved and is treated
// as the source of truth; the row's `domain` column is a denormalized read-path shortcut. The
// repair only ever rewrites that column, never card_json.
//
// cards.domain is unique, so a blind rewrite can collide with another row that already owns the
// target domain. Any mismatch whose target domain is already owned by a different card (or is the
// repair target for more than one mismatched row in the same run) is reported and skipped rather
// than written, per row.
//
// Usage:
//   set -a; source .env.production.migrate.local; set +a
//   npm run repair:card-domains                       # dry run, all cards
//   npm run repair:card-domains -- --slug framer       # dry run, one card
//   npm run repair:card-domains -- --apply             # write the unambiguous repairs
import { and, eq } from "drizzle-orm";

import { coldStartCardSchema } from "@cold-start/core";
import { cards, createDb } from "@cold-start/db";

type Mismatch = {
  slug: string;
  rowDomain: string;
  cardDomain: string;
  updatedAt: Date;
};

type Resolution = Mismatch & {
  action: "repair" | "skip_collision";
  reason: string | null;
};

function applyMode() {
  return process.argv.includes("--apply");
}

function slugFilter() {
  const index = process.argv.indexOf("--slug");
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  const db = createDb(databaseUrl);
  const rows = await db
    .select({ slug: cards.slug, domain: cards.domain, cardJson: cards.cardJson, updatedAt: cards.updatedAt })
    .from(cards);

  const onlySlug = slugFilter();
  const scannedRows = onlySlug ? rows.filter((row) => row.slug === onlySlug) : rows;

  const mismatches: Mismatch[] = [];
  for (const row of scannedRows) {
    const parsed = coldStartCardSchema.safeParse(row.cardJson);
    if (!parsed.success) {
      console.warn(`skip ${row.slug}: stored card_json does not parse`);
      continue;
    }
    if (parsed.data.domain === row.domain) {
      continue;
    }
    mismatches.push({
      slug: row.slug,
      rowDomain: row.domain,
      cardDomain: parsed.data.domain,
      updatedAt: row.updatedAt
    });
  }

  // Collision surface is checked against the full table, not just the (possibly --slug-scoped)
  // subset being repaired, so a single-slug dry run still reports the real risk.
  const domainOwners = new Map(rows.map((row) => [row.domain, row.slug]));
  const targetCounts = new Map<string, number>();
  for (const mismatch of mismatches) {
    targetCounts.set(mismatch.cardDomain, (targetCounts.get(mismatch.cardDomain) ?? 0) + 1);
  }

  const resolutions: Resolution[] = mismatches.map((mismatch) => {
    const existingOwner = domainOwners.get(mismatch.cardDomain);
    if (existingOwner && existingOwner !== mismatch.slug) {
      return {
        ...mismatch,
        action: "skip_collision",
        reason: `${mismatch.cardDomain} is already the domain of card ${existingOwner}`
      };
    }
    if ((targetCounts.get(mismatch.cardDomain) ?? 0) > 1) {
      return {
        ...mismatch,
        action: "skip_collision",
        reason: `${mismatch.cardDomain} is the repair target for more than one mismatched row in this run`
      };
    }
    return { ...mismatch, action: "repair", reason: null };
  });

  let updated = 0;
  if (applyMode()) {
    for (const resolution of resolutions) {
      if (resolution.action !== "repair") {
        continue;
      }
      const result = await db
        .update(cards)
        .set({ domain: resolution.cardDomain, updatedAt: new Date() })
        .where(and(eq(cards.slug, resolution.slug), eq(cards.updatedAt, resolution.updatedAt)))
        .returning({ slug: cards.slug });
      updated += result.length;
    }
  }

  console.log(
    JSON.stringify(
      {
        mode: applyMode() ? "apply" : "dry-run",
        cardsScanned: scannedRows.length,
        mismatchesFound: mismatches.length,
        toRepair: resolutions.filter((row) => row.action === "repair").length,
        toSkip: resolutions.filter((row) => row.action === "skip_collision").length,
        updated,
        resolutions
      },
      null,
      2
    )
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
