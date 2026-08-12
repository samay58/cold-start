# Profile Re-file and Filing History

Drafted 2026-08-11 during the design conversation. Status: fully approved by Samay 2026-08-11 (system half and experience half). This document is the design record; decisions below are dated.

## The problem

Old profiles go stale and there is no way to refresh them. Cursor's card reads like June because it is June. The public site serves stale cards forever by design. The extension shows a saved profile with no way to re-run it. The API already accepts a `forceRefresh` flag (credential plus explicit confirm required); nothing in the UI calls it.

Second, bigger: the card is one row, overwritten on every write. History does not exist. Once we can re-file, every re-file destroys the old edition unless we save it. Saved editions become a timeline of how a company's profile evolved, which nothing on the market has.

## Decisions locked (2026-08-11, Samay)

1. **Re-file is a full fresh run.** New discovery, new extraction, new gates. No merge, no top-up. A re-file produces a clean new edition with one date.
2. **Refresh ships first, the timeline second.** The archive table ships with refresh so editions accrue silently from day one. The timeline UI is release two.
3. **Old sources augment, never replace.** The re-run always performs its full fresh discovery. The prior card's source URLs ride along as extra fetch candidates so proven sources get re-read. If fresh discovery itself fails (provider outage), the run fails honestly; we never file an old-sources-only card as a new edition.
4. **The Investor Lens read re-runs on demand,** not automatically after a re-file. Re-file costs one profile run, legibly. The lens re-runs at its normal price when next opened. Nothing stale survives either way; the read is not-yet-run, not old.
5. **The control is hold-to-refile.** Verb is "Re-file". Press and hold; the seal inks up; release past the threshold fires; early release drains back. Confirmation is physical, zero persuasion copy.
6. **The changes view is mechanical, never narrated.** Computed from the typed schema in the card's own flat voice ("Headcount 300 → 1,200"). No LLM prose in the loop.

## System design (approved 2026-08-11)

### Archive table

New table `card_revisions`. One row per superseded edition:

- `id`, `card_id`, `slug`, `edition` (1, 2, 3…)
- `card_json`: the complete frozen card, exactly as it stood. Self-contained; citations live inside the card JSON, so normalized source/citation tables keep describing only the live card.
- Envelope metadata, small and flat: `superseded_by_run_id`, `filed_at` (the old card's generatedAt), `frozen_at` (now), `had_synthesis` (boolean), `app_schema_note` (the schema/app version that wrote the snapshot).

Storage rule: **store the raw object plus a thin envelope; derive everything else at read time.** No precomputed diffs, no comparison indexes in the row. Raw snapshots mean old editions can be re-rendered, replayed through evals, and re-diffed forever as the differ improves. Precomputed anything freezes today's bugs into the archive. Postgres compresses large JSONB on its own; at current scale this rounds to nothing. Retention is deliberately deferred; nothing is pruned in v1.

### Comparison keys (why raw snapshots stay comparable)

Citation ids are per-run, so ids never work as identity across editions. The future differ keys on stable content identities instead:

- Sources: URL.
- Signals: the existing cluster key from `clusterSignals`.
- People: name.
- Stats: field position (headcount, valuation, stage, raised, founded).
- Claims: category plus normalized text.

These keys are computed at read time by the differ, never stored. The snapshot's job is to be complete; the differ's job is to be smart.

### Write path

One change, in the card store step: when a re-file run stores its card over an existing one, freeze the old row into `card_revisions` first, in the same `db.batch` as the overwrite, guarded by the existing `cards.version` CAS. A failed re-file never touches the live card because freezing happens only at successful store time.

Editions are cut only by re-files. Background enrichment (contacts, expanded description, sections) keeps mutating the live card and never cuts an edition. The rule is one sentence: an edition exists because someone re-filed.

Guard to design at build time: a late enrichment patch from the superseded run must not land on the new edition. Patch application checks run lineage/card version before writing.

### Refresh flow

Extension sends `forceRefresh: true, confirmStart: true` to the existing generate route. Normal basics run, full pipeline, existing quality gates. Allowance: one profile run through the existing reserve/settle path. In-flight duplicate protection already exists (same slug/mode joins the active run). Watchdog already retires dead runs. No API contract change in v1.

Bedrock seeding (per decision 3): prior card source URLs enter the fetch plan as additional candidates, marked as seeded in the trace so seeded and discovered sources are distinguishable forever. Behind a flag, off-switchable.

New alpha analytics events: `refile.hold_started`, `refile.fired`, `refile.hold_abandoned`.

## Experience design (approved 2026-08-11)

### The age signal

Two states, both surfaces:

- Under 14 days: the filed date stays exactly as today.
- Past 14 days: the date gains one classification dot in an aged tone from the existing token palette, and one step of weight. No copy. The dot and the weight carry it.

Threshold is a constant, tunable. The stamp itself never changes; it is identity, not status. The public card gets the same treatment as pure CSS; no refresh control on the web.

### The control

Lives in the extension profile header, right side, near the Saved line. Renders whenever the profile was served from the archive (any age; the aged dot is separate). Hold mechanics:

- Press starts the seal inking, roughly 700ms to full.
- Release at full fires the re-file; the building arc replays (clippings, seal, whisper) and the new edition lands with a fresh stamp.
- Release early drains the ink back with a damped spring. Nothing fires. No modal, no confirm copy.
- Keyboard: hold Enter/Space, same physics on keydown/keyup. Screen reader label states "hold to confirm".
- Reduced motion: ink fill is essential progress and stays; the drain becomes a fade.

On failure: return to the old profile untouched, one quiet line stating the run failed. The old card surviving is the promise.

### Release two direction (timeline), recorded for later

The filed date becomes the entry point: "3rd filing · Aug 11". Opening it shows the filing history as a stamp column, the library checkout card. Selecting two editions (default latest against previous) shows the changes ledger: flat mechanical rows. Stat moves, signals added, people in and out, sources gained and lost. Public sees fact changes; anything derived from synthesis stays extension-gated. Narration, if ever, is lens-gated and comes later; not in scope.

## Testing (v1)

- Archive repository tests in the real-Postgres suite (`test:cards-db`): freeze-on-overwrite lands in one batch; failed store freezes nothing; editions number correctly.
- Extension hold interaction tests: fire, abort, keyboard, reduced motion.
- Seeded-source trace marking test.
- Gallery states: aged date, holding state, refreshing state.
- `audit:css` covers any new tokens.

## Open items

- Exact aged-tone token chosen at build time within the palette.
- Retention policy for revisions, deliberately deferred.

## Shipped (2026-08-12)

Tasks 1 through 7 and 9 of the implementation plan are on the `refile-editions` branch. Deviations from the plan text, found during the build:

- The branch was rebased onto the loading-screen refinement before Task 5. No conflicts; ReadRegion and the Details toggle stayed deleted.
- Task 5's failure-restore UI test lives in the Task 6 commit. The test needs the real hold control to drive re-file, and that control does not exist until Task 6. Task 5's own commit carries the network-layer forceRefresh tests instead.
- `handleRefile` also clears the section queue, matching its siblings, and strips `contactRun` and any old `refileNotice` from the restore snapshot. The contact watcher dies with the abort, so restoring its marker would show a spinner that never resolves.
- A 202 still-running timeout wins over the restore path. A re-file that is still running server-side is not a failure, so the pending state shows instead of "Re-file failed."
- The refile slot's no-run-active gate includes `contactRun`. That field is how a basics run finishing behind a visible profile is represented in panel state.
- RefileControl decides fire-or-drain on elapsed hold time, not animation progress. Test environments skip animations, and time is the honest source anyway; the ink stays a 700ms linear fill.
- All three gallery fixtures carried frozen months-old dates, so every card would have captured as aged. `plainfield-example` now files itself two days ago dynamically, keeping a not-aged contrast in every gallery run; the catalog order test follows.
- Task 8 (seeded re-reads) was dropped under its own escape clause: the only per-URL fetch path is the StableEnrich firecrawl/scrape probe, hardwired to three fixed URLs with per-probe budget registration, so seeding is new provider work plus a per-re-file cost decision. The finding and the restart point are recorded in the plan file. No `REFILE_SEED_SOURCES` flag exists.

Not in this release, unchanged from the plan: the timeline UI, any revisions read API, TTL-freeze widening, retention, and the production migration (Samay-approved `db:migrate:production`, then deploy).
