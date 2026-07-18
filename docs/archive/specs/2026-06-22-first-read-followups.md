# First Read follow-ups: storage dedupe + headline classification

Status: spec for a fresh session
Date: 2026-06-22
Origin: deferred items from the adversarial review of the First Read arc (commits `248b875`..`77bc388`).

Two independent cleanups. They do not depend on each other; do them as separate commits. Both must preserve current behavior and stay behind the repo gate (`npm run check`, minus the known pre-existing `audit:deps` advisory).

---

## Part 1: Extract `storeCardSnapshot()` in the basics/analysis worker

### Problem
`apps/web/src/inngest/functions.ts` contains the same card-storage sequence three times:

- seed card: around lines 728-747 (`upsert-seed-card`, `record-seed-card-evidence`, `record-seed-research-sections`, `record-seed-sources`, event `card.partial`)
- generated card: around lines 856-882 (`upsert-card`, `record-card-evidence`, `record-research-sections`, `record-sources`, event `card.saved`)
- enriched card: around lines 1004-1024 (`upsert-enriched-card`, `record-enriched-card-evidence`, `record-enriched-research-sections`, `record-enriched-sources`, event `card.enriched`)

Each block is: `canStoreCardSnapshot` guard, then four `step.run` writes (upsert, evidence, sections, sources), a `recordEvent`, milestone writes, and `requestContactEnrichmentForStoredCard`; the `else` calls `noteSkippedUnderfilledSnapshot`. That is ~16 near-identical lines x3, and it is exactly where the now-removed first-read lane copied a fourth time and let a dead `record-*-sources` step slip in. One helper removes the duplication and the class of bug.

### Design
Add an inner async closure inside the basics/analysis Inngest function (next to `requestContactEnrichmentForStoredCard`, ~line 460), so it captures `step`, `db`, `trace`, `recordEvent`, `requestedAtMs`, and `requestContactEnrichmentForStoredCard`.

```ts
async function storeCardSnapshot(input: {
  cardToStore: ColdStartCard;            // already passed through prepareCardSnapshotForStorage
  sources: ProviderSource[];
  steps: { upsert: string; evidence: string; sections: string; sources: string };
  event: { stepId: string; type: "card.partial" | "card.saved" | "card.enriched"; message: string };
  skipNoteId: string;
  contactTrigger: string | null;         // null => skip contact enrichment (analysis path)
}): Promise<{ milestoneMs: number } | null> {
  if (!canStoreCardSnapshot(mode, input.cardToStore)) {
    noteSkippedUnderfilledSnapshot(trace, input.skipNoteId, input.cardToStore);
    return null;
  }
  const stored = await step.run(input.steps.upsert, async () => ({
    row: await upsertCard(db, input.cardToStore),
    milestoneMs: generationMilestoneElapsedMs(requestedAtMs)
  }));
  const rowId = stored.row.id;
  await step.run(input.steps.evidence, () => recordCardEvidence(db, rowId, input.cardToStore));
  await step.run(input.steps.sections, () => upsertResearchSections(db, deriveLegacyResearchSectionsFromCard(input.cardToStore)));
  await step.run(input.steps.sources, () => recordSourcesForCard(db, rowId, input.sources));
  await recordEvent(input.event.stepId, input.event.type, input.event.message, {
    citationCount: input.cardToStore.citations.length,
    sourceCount: input.sources.length
  }, null);
  if (input.contactTrigger) {
    await requestContactEnrichmentForStoredCard(input.cardToStore, input.contactTrigger);
  }
  return { milestoneMs: stored.milestoneMs };
}
```

Each call site keeps its own `prepareCardSnapshotForStorage` and its own milestone writes (they differ), and passes the snapshot in:

```ts
// seed
const seedStore = await storeCardSnapshot({
  cardToStore: seedCardToStore,
  sources: acceptedSources,
  steps: { upsert: "upsert-seed-card", evidence: "record-seed-card-evidence", sections: "record-seed-research-sections", sources: "record-seed-sources" },
  event: { stepId: "seed-card-saved", type: "card.partial", message: "Saved first usable company card" },
  skipNoteId: "skip-underfilled-seed-card",
  contactTrigger: "seed-card"
});
if (seedStore) {
  writeGenerationMilestoneValue(trace, "seedCardMs", seedStore.milestoneMs);
  writeGenerationMilestoneValue(trace, "firstUsableCardMs", seedStore.milestoneMs);
}
```

Generated card: `steps` = the `*-card`/`record-*` ids above, event `card.saved` / "Saved cited company card", `skipNoteId` `skip-underfilled-generated-card`. `contactTrigger` is `"stored-card"` for basics and `null` for analysis; the caller still does `writeGenerationMilestoneValue(trace, "firstUsableCardMs", ...)` for basics and captures `analysisReadyMs` for analysis. Enriched card: the `*-enriched-*` ids, event `card.enriched`, `skipNoteId` `skip-underfilled-enriched-card`, `contactTrigger` `"enriched-card"`, milestone `firstUsableCardMs`.

### Hard constraints
- **Preserve the exact existing `step.run` ids and the `recordEvent` step ids** (pass them in via `steps` and `event.stepId`). Do not normalize them. Inngest memoizes by step id; changing strings can disrupt runs in flight during a deploy. This is why `steps` is explicit rather than derived from a prefix.
- Preserve event types and copy verbatim (`card.partial` / `card.saved` / `card.enriched`; the three messages).
- Preserve the per-site milestone writes and the analysis-vs-basics enrichment difference (analysis passes `contactTrigger: null`).
- Keep `sourcesToRecord` vs `acceptedSources` per site (seed uses `acceptedSources`; generated/enriched use `sourcesToRecord`).

### Acceptance
- Behavior identical: same step ids, same events, same milestones, same enrichment triggers, same skip notes.
- `npm run typecheck`, `npm test`, `npm run build`, `npm run lint`, `npm run knip` all clean.
- Net line reduction in `functions.ts`; no new exported surface (the helper is an inner closure).

---

## Part 2: Move headline classification out of the render path

### Problem
`apps/extension/src/first-read.ts` carries `newsworthyTitlePattern` (a regex), `titleMentionsCompany`, and `proofReadFromSources`. These scrape citation titles at render time to produce the "Latest proof" read. The review flagged this as brittle heuristic logic in a render path that should live server-side, and explicitly said not to expand the regex.

Important nuance discovered in review: the First Read slip only renders while the card is `partial` (it files to a receipt once the card is `hit`). The `partial`/seed card is built by the deterministic `buildSeedProfileCard` (no LLM), so it has no `serves` and no `signals`. So during the window the slip is visible, `proofReadFromSources` is the only path that yields a real "Latest proof" read. It is currently load-bearing, not dead. Removing it without a server-side replacement regresses the slip back to "N sources filed" during the seed window.

### Goal
Single classifier, owned server-side, consumed as structured data by the client. The render path stops deriving headlines from raw titles.

### Approach (recommended: full version)
1. Move `newsworthyTitlePattern` and a `headlineFromCitations(citations, { name, domain })` helper into `packages/core` (e.g. `packages/core/src/headline.ts`), with the entity-match (`titleMentionsCompany`) folded in. Unit-test it in core.
2. Thread `publishedAt` from `ProviderSource` (direct-exa already sets `publishedDate`) onto the stored citation so a real date is available. This needs `publishedAt?: string` added to the citation schema in `packages/core/src/card.ts` and carried through `sectionsWithSourceCitations` / source storage. (Check the citation-ref invariants still hold.)
3. Have `buildSeedProfileCard` (`packages/pipeline/src/seed-profile.ts`) populate the freshest newsworthy citation as a single seed `signals[]` entry (title, url, date from `publishedAt`, source = domain, category inferred, citationIds). This gives the seed card a real, dated, entity-correct headline as structured data.
4. In the extension, delete `newsworthyTitlePattern`, `titleMentionsCompany`, and `proofReadFromSources`. `proofReadForCard` (signals) now covers both the seed window (seed signal) and the full card (extracted signals). Update `first-read.test.ts` accordingly.

### Fallback (minimum version, if the full version is not worth the schema churn)
If threading `publishedAt` and a seed signal is judged too invasive for the payoff (this is purity, not user-visible value): move only `newsworthyTitlePattern` + `titleMentionsCompany` into a shared, unit-tested `packages/core` util, have the extension import it, and add a test asserting the regex is not broadened. This centralizes the classifier without the schema change. Document that the heuristic still runs client-side and why.

Decide between full and fallback based on how much `publishedAt` threading touches (if it is a clean add, do the full version). State the choice in the commit message.

### Acceptance
- No headline regex in `apps/extension/src` (full version), or a single shared, tested copy in core (fallback).
- The seed-window slip still shows a real "Latest proof" read for a company with a newsworthy source (full version), or unchanged behavior with centralized logic (fallback).
- Entity-match guard preserved: a headline that does not name the company is never surfaced.
- All gates clean.

---

## Out of scope
- Do not re-add the first-read provider lane (removed for cause; see `2026-06-21-first-read-fast-payoff-design.md` resolution).
- Do not change the source-quality tiering in `packages/core/src/source-quality.ts`.
- Keep the First Read UX (Evidence Receipt model, motion, substance gate) as-is.
