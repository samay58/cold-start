// One-shot repair for cards generated before signal corroboration clustering: re-clusters
// card.signals in stored card_json and re-derives the traction research section from the
// clustered card. Deep LLM-authored traction rows (runId set) are left alone. Writes go through
// the repository layer, the same path production writers use.
//
// Usage:
//   set -a; source .env.production.migrate.local; set +a
//   npm run repair:signal-clusters                       # dry run, all cards
//   npm run repair:signal-clusters -- --slug granola     # dry run, one card
//   npm run repair:signal-clusters -- --apply            # write repairs
import {
  clusterSignals,
  coldStartCardSchema,
  deriveLegacyResearchSectionsFromCard,
  type ColdStartCard,
  type ResearchSection
} from "@cold-start/core";
import {
  cards,
  createDb,
  researchSections,
  upsertCard,
  upsertResearchSection
} from "@cold-start/db";

type Finding = {
  slug: string;
  signalsBefore: number;
  signalsAfter: number;
  tractionAction: "rewrite_derived" | "keep_deep";
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
  const cardRows = await db.select({ slug: cards.slug, cardJson: cards.cardJson }).from(cards);
  const sectionRows = await db
    .select({ slug: researchSections.slug, sectionId: researchSections.sectionId, runId: researchSections.runId })
    .from(researchSections);
  const tractionRunIdBySlug = new Map(
    sectionRows.filter((row) => row.sectionId === "traction").map((row) => [row.slug, row.runId])
  );

  const findings: Finding[] = [];
  const onlySlug = slugFilter();
  const scannedRows = onlySlug ? cardRows.filter((row) => row.slug === onlySlug) : cardRows;

  for (const row of scannedRows) {
    const parsed = coldStartCardSchema.safeParse(row.cardJson);
    if (!parsed.success) {
      console.warn(`skip ${row.slug}: stored card_json does not parse`);
      continue;
    }

    const card = parsed.data;
    const clustered = clusterSignals(card.signals, {
      companyDomain: card.domain,
      companyName: card.identity.name.value
    });
    if (JSON.stringify(clustered) === JSON.stringify(card.signals)) {
      continue;
    }

    const repairedCard: ColdStartCard = coldStartCardSchema.parse({ ...card, signals: clustered });
    const tractionRunId = tractionRunIdBySlug.get(card.slug);
    const tractionAction = typeof tractionRunId === "string" && tractionRunId.length > 0
      ? "keep_deep" as const
      : "rewrite_derived" as const;
    findings.push({
      slug: card.slug,
      signalsBefore: card.signals.length,
      signalsAfter: clustered.length,
      tractionAction
    });

    if (!applyMode()) {
      continue;
    }

    await upsertCard(db, repairedCard);

    if (tractionAction === "rewrite_derived") {
      const derivedTraction = deriveLegacyResearchSectionsFromCard(repairedCard).find(
        (section): section is ResearchSection => section.sectionId === "traction"
      );
      if (derivedTraction) {
        await upsertResearchSection(db, derivedTraction);
      }
    }
  }

  console.log(JSON.stringify({
    mode: applyMode() ? "apply" : "dry-run",
    cardsScanned: scannedRows.length,
    cardsNeedingRepair: findings.length,
    findings
  }, null, 2));
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error);
  process.exit(1);
});
