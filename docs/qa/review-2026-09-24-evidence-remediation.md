# Thermos review: evidence and judgment remediation (e43e749..3ca87c0)

Reviewed 2026-09-24. Two read-only reviewers: one for bugs and risk, one for code quality. Neither found a critical issue. Synthesis stays off public routes. Migration 0020 is additive. No new Neon transactions. Prompt-hash pins are updated. 37 core and pipeline tests pass. `check-file-size` passes.

Findings marked (both) were raised by both reviewers. Findings marked (checked) were read in the code during synthesis. Each finding ends with a status line. The fix plan is [the review remediation plan](../superpowers/plans/2026-09-24-review-remediation.md).

Every finding was re-read against the code on September 24, before any fix. The corrections are in each finding under "Re-read".

## Baseline on the 12 rebuilt cards

Measured before any fix with the plan's measure script. The dump stubs every model call, so it costs nothing.

- Person-read evidence: 206 items, 7 fragments. 64 of 68 people have evidence.
- How it wins judge: 253 citations, 29 with a stored tier that differs from the judge's attribution.
- JSON-looking text: 0 in any model input, 0 in card fields.
- Seed card built from stored sources: 0 JSON oneLiners, but also 0 oneLiners at all (see finding 1).
- Source bytes per card: 0.51 MB (casaphq) to 1.63 MB (hebbia). The largest single row is 336 KB (hebbia).

## Fix first

1. **Seed profile writes raw provider JSON into `identity.oneLiner`.** (checked)
   `packages/pipeline/src/seed-profile.ts:360` passes `seedSource.rawText` to `cleanSeedSummary`, which never calls `readableSourceText`. The citation six lines above does. A probe produced the oneLiner `{"id":"x1","title":"Acme builds deploy robots"}`. Basics stores this card, so a reader can see it.
   Fix: `cleanSeedSummary(readableSourceText(seedSource.rawText), domain)`, drop its markdown regex, and add the seed card to `apps/web/tests/model-evidence-readable.test.ts`.
   Re-read: on real data the bug shows differently. A stored Exa record is one line of JSON longer than 180 characters, so `cleanSeedSummary` rejects it and the seed card gets no oneLiner at all: 0 of 12 rebuilt cards get one. JSON reaches the oneLiner only for a short record, as in the probe. The fix restores the page-text line on both paths. `tidy` in `source-text.ts` already removes links, images and heading marks, but not emphasis marks, quote marks or bare URLs, so a narrower cleanup stays. STATUS minor (a), the empty seed snippet, is the same code: `sourceCitation` calls `readableSourceText` without the title, so a record with no page text gets an empty snippet. It is fixed here.
   Status: open

2. **The person-read window cuts people short.** (both, checked)
   `packages/pipeline/src/person-read-evidence.ts:23-38`, `textAboutPerson`.
   - The window ends at the next person's name, even inside the same sentence. "Ivan Zhao and Simon Last founded Notion" gives Ivan `Ivan Zhao and`. On the 12 rebuilt cards, 7 of 206 items are fragments like this, including both Doppel co-founders.
   - The sentence start uses `lastIndexOf(". ")`, the abbreviation bug `sentences.ts` exists to prevent. "Notion Labs Inc. co-founder Ivan Zhao" drops the company.
   - The dedupe at :69 keys on `citationId`, so once a fragment claims a citation, that source's fuller text is never tried.
   Fix: find the sentence start with `splitIntoSentences`, end the window at a sentence boundary rather than mid-sentence at the next name, and add a two-names-in-one-sentence test.
   Re-read: reproduced. The 7 fragments include team-page lines ("Sanjay Wadhwa Jennifer Walsh", "Nikola BorisovFounder and CEO"), not only shared sentences.
   Status: open

3. **The judge sees two trust labels for one citation.** (both, checked)
   `packages/llm/src/how-it-wins-judge-rules.ts:96` recomputes `attribution`. `:104` strips only `snippet` from `context.citations`, so the stored `sourceQuality` still reaches the judge. On the 12 cards, 29 of 228 citations disagree. The recompute is not always better (Sacra moved from independent_analysis to independent_report). Every other surface prefers the stored tier (`packages/core/src/trust.ts:138`), so the lens and the judge disagree about the same page.
   Fix: decide once where the tier is owned (recompute on read in `sanitizeCardTrust`, or stop persisting it). At minimum strip `sourceQuality` from the judge context. Note that changing it moves the evidence hash (see 8).
   Re-read: the count is 29 of 253 citations. The stored tier cannot simply stop being persisted: `founder_authored` is stamped by the founder-voice fetcher and cannot be derived from a URL, and `publicCard` filters on it. The Sacra case comes from the classifier: `sacra.com` is listed as a funding database, so it ranks as a report, while `sacrainsights.com` is listed as analysis.
   Status: open

4. **Stored source rows never gain page text or a publish date.** (checked)
   `packages/db/src/repositories/sources.ts:120` uses `onConflictDoNothing` on `(card_id, url)`, and re-files keep the card id. So the 32-37% of existing rows without page text stay that way when the same URL is fetched again. Enrichment `load-sources`, research sections and analysis runs that reuse stored sources read those rows. This undercuts the STATUS reasoning that a re-file makes a backfill unnecessary.
   Fix: a single-statement `onConflictDoUpdate` that fills `raw_text` and `published_at` when the stored row has no readable text. It works on Neon HTTP.
   Status: open

5. **Page text has no size cap.** (checked)
   `packages/providers/src/exa-contents.ts` sends `text: true` with no `maxCharacters`. Rebuilt source sets are 0.5 to 1.7 MB per card; one row is 331 KB. Card and contact enrichment return every stored source from their Inngest `load-sources` step (`card-enrichment.ts:283-285`), and rows accumulate across refreshes. The Inngest step output limit is 4 MB [UNVERIFIED for the current plan]. Models read at most 2,200 characters per source outside person reads.
   Fix: `text: { maxCharacters: ~15000-20000 }`.
   Re-read: Inngest's limits page gives 4 MiB per step output and 32 MiB per run state, the same on every plan. Exa's `/contents` reference takes `text: { maxCharacters }` (1 to 1,000,000). The same page marks `highlights.highlightsPerUrl` as ignored and `numSentences` as deprecated, so the current highlights setting does nothing it says. The largest row is 336 KB.
   Status: open

## Worth doing

6. **One env var sets two budgets.** (both) `EXTRACTION_EVIDENCE_BUDGET_CHARS` overrides extraction (default 45k) and research sections (24k). If production still carries the old `=24000`, the 45k default never took effect. Vercel hides the value, so a production run trace is the way to check. Split it into two variables.
   Status: open

7. **`packages/llm/src/extraction.ts` is at 999 lines.** The next edit fails `check:file-size`. Split tool schemas, prompt building, and parsing.
   Status: open

8. **Memoized judge verdicts depend on live code.** The evidence hash now runs through `readableSourceText` and live `sourceQualityForSource`. Any edit to either re-keys every memoized verdict (about $1.70 each) and marks in-flight jobs `stale_evidence`. The prompt hash has a pin test; the evidence hash has none. Add one.
   Status: open

9. **Snippet helpers must be composed by hand.** `sourceSnippet(readableSourceText(rawText))` is written at five sites; `sourceSnippet(rawText)` type-checks and ships JSON. Add one `snippetFromStoredSource` entry point.
   Status: open

10. **Evidence-ledger shape is left over.** `EvidenceLedgerEntry.rawText` now holds readable text, `supportingSnippets` always has 0 or 1 entries, `seed-profile.ts:142` has an unreachable fallback, and each prioritized source's lead goes to extraction twice. Collapse to `snippet?: string`.
   Status: open

11. **Publish-date parsing lives in four places** with different keys and validation (`direct-exa.ts:375`, `stableenrich/facts.ts:217` and `:380`, `source-text.ts:39-41`). `facts.ts:388` falls back to `fetchedAt` for signal dates, against the new "never a fetch time" rule. An unparseable date is null in `sources` but still reaches the judge through the citation. One core normalizer plus a date refinement on `citationSchema.publishedAt`.
   Status: open

12. **Two search-query catalogs.** `direct-exa.ts:75-115` keeps its own queries next to `core/src/search-queries.ts`, and the research-plan override path is dead in production.
   Re-read: the override is not unreachable. The `plan-research` step passes `fallbackResearchPlan(domain)`, whose queries are `defaultSourceSearchQueries(domain)`, so the merge in `stableenrich/core.ts:186` always replaces the defaults with themselves. Direct Exa is a live lane in production, so moving its queries changes what it fetches.
   Status: open

## Cleanup

13. `scripts/rebuild-card-snippets.ts` is a one-off from the closed remediation and calls an unregistered paid endpoint with a copied price. Delete it, its npm script and its `docs/commands.md` line, as `d3de258` did for the verifier comparison.
    Status: open
14. Both new scripts add another copy of `loadEnvFile`; `scripts/alpha-common.ts:147` already has one. `dump-model-inputs.ts` casts `as never` instead of calling `providerSourcesFromStoredSources`.
    Re-read: the shared loader is at `scripts/alpha-common.ts:223`. Eleven older scripts carry their own copy too; this finding covers the two new ones.
    Status: open
15. `AGENTS.md:79` says the schema makes JSON-slice snippets read as text. Cut-off slices are dropped, so old cards read as titles until re-filed.
    Status: open
16. `evidenceForSection` lives in `apps/web` and is exported for a script; its siblings live in `packages/pipeline`.
    Status: open
17. Comments cite plan tasks ("Task 2 E5", "Task 2B") that rot now the plan is archived.
    Re-read: the span added five: `evidence-ledger.ts:50`, `generate-card.test.ts` (E5), `source-dates.test.ts` (2B), `normal-absences.test.ts` (Task 3) and `how-it-wins-accepted-proof.test.ts` (Task 4). Older task comments elsewhere predate this span and stay out of scope.
    Status: open
18. Two prose-pin tests depend on layout (trailing newline, sentence count). The bootstrap test's expected value calls `sourceSnippet`, so that assertion is circular.
    Re-read: the two pins are `research-sections.test.ts` (`"Say what the source said.\n"`) and `how-it-wins-accepted-proof.test.ts` (`split(sentence)` must have length 3). The circular one is `extension-bootstrap-route.test.ts:410`.
    Status: open
19. People and organization records read as their title only in every model stage, not just person reads. The audit mentions only person reads.
    Status: open
20. The emphasis read's marker guard can no longer fire, because normalization rewrites markers from `citationIds`. This matches synthesis.
    Status: open
21. Exa find-similar pricing with `contents` was never quoted (plan step A1).
    Re-read: exa.ai/pricing lists search at $7 per 1,000 requests and contents at $1 per 1,000 pages for each content type. Find Similar has no line of its own.
    Status: open

## STATUS minors folded in

STATUS listed six deferred minors from the remediation's own review. Two touch code this plan changes:
- (a) An empty seed-profile snippet: fixed with finding 1.
- (e) A future Opus 5.x id inherits Opus 5's thinking switch through substring matching (`llm-provider.ts:224`): fixed as plan item M5, next to the other model-matching code.

The other four stay deferred, because none touches code this plan changes:
- (b) Clipping classification on longer snippets. It is extension display tuning and needs a look at real clippings.
- (c) No runtime guard for a missing migration. It is deploy tooling.
- (d) The judge trace's thinkingState is hardcoded to disabled. It is trace honesty in the adapter.
- (f) An unparseable JSON-looking model note blocks the page-text fallback. It is extraction note handling. Finding 10 changes the ledger, not the model's note.

## Excluded

The untracked `apps/web/src/app/proto/` prototypes and the uncommitted doc and video-share edits. Items STATUS already lists as deferred were not re-raised.
