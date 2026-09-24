# Review remediation, September 24

Status: shipped. Every item done on branch `review-2026-09-24-remediation` (`6419bfc` through the closing docs commit), fast-forwarded to main and deployed on September 24, 2026. The pre-deploy checks and Samay's decisions are in [the review](../../qa/review-2026-09-24-evidence-remediation.md#pre-deploy-checks-and-decisions).

This plan fixes or closes all 21 findings in [the September 24 review](../../qa/review-2026-09-24-evidence-remediation.md), plus two deferred minors from STATUS. Each item has a done-definition. A finding is done when its status line in the review names a commit or records why it needs no change.

## Rules for this plan

- Reproduce first. Each fix starts with a failing test or a probe against the real module.
- Local work only. A paid call, a production database read or write, a Vercel env change, a deploy, a push and a merge each wait for Samay.
- Real data: `eval/curation/remediation-2026-09/measure.mts` dumps every model stage for the 12 rebuilt cards in `eval/curation/remediation-2026-09/` with a stub client, then counts person-read fragments, judge tier disagreements, JSON-looking text and source bytes. It runs before Step 1 and after Step 3.
- Hash discipline: the evidence-hash pin lands before any change that can move it. Every change that moves it lands in one commit, and that commit updates the pin on purpose.

## Changes that move the How it wins evidence hash

A moved hash means every memoized judge verdict misses once (about $1.70 a company), and jobs in flight when the deploy lands end as `stale_evidence`.

- Finding 3: the judge context no longer carries the stored tier, and the tier comes from one owner. This moves the hash for nearly every card.
- Finding 3: the Sacra host moves from the funding-database list to the analysis list. This moves the hash only for cards citing sacra.com.
- Finding 11: an unparseable `publishedAt` is dropped from the citation. This moves the hash only for cards carrying one.
- Finding 1 changes the seed card's oneLiner and snippet. It moves the hash only for cards that were filed from the seed card and never replaced.

Findings 9 and 10 are refactors and must not move the hash. The pin proves that.

What happened: the pin moved once, in `3d335a1` (finding 3). Findings 9, 10 and 11 left it unchanged; finding 11 moves it only for a card carrying an unparseable date, and none of the 12 does. The branch deploys once, so memoized verdicts miss once.

## Step 1: correctness

| Item | Change | Done when |
| --- | --- | --- |
| 8 | Pin the evidence-packet hash for a fixed card in `packages/llm/tests` | The pin fails on any packet change and says why in its comment |
| 1 | The seed oneLiner reads page text; the seed snippet falls back to the title | The seed card is in `model-evidence-readable.test.ts`; on the 12 cards no oneLiner is JSON and the page-text line appears |
| 2 | The person window uses sentence boundaries, stops at the next line-per-person entry, and a fuller text replaces a fragment for the same citation | Tests for two names in one sentence and "Inc." pass; the team-page test stays green; 0 fragments on the 12 cards |
| 3 | One owner for the tier on every surface; the judge sees one tier per citation | 0 disagreements on the 12 cards; the choice and its reason are written in the review |
| 4 | Re-fetching a URL fills `raw_text` and `published_at` when the stored row has no readable text | A `test:cards-db` case proves it in one statement; the backfill question for Samay has row counts |
| 5 | Exa page text is capped; the dead highlights settings are replaced | The cap is justified by person-read hit rate before and after; per-card bytes are recorded |

## Step 2: structure

| Item | Change | Done when |
| --- | --- | --- |
| 7 | Split `extraction.ts` by reason to change, as a pure move | No behavior change; `extraction.ts` leaves the allowlist or stays under it |
| 6 | Two budget variables, with the old name kept for extraction for one release | Tests cover both names; the Vercel change is drafted for Samay |
| 9 | One `snippetFromStoredSource` entry point | No hand-composed `sourceSnippet(readableSourceText(...))` remains |
| 10 | The ledger entry holds readable text under an honest name and one optional snippet | The unreachable fallback is gone; the lead reaches extraction once |
| 11 | One core date normalizer where provider data enters; `citationSchema.publishedAt` rejects an unparseable date | Four parsers become one; the signal-date fallback decision is recorded |
| 12 | Direct Exa and stableenrich share one query catalog; the override path is removed only if nothing outside tests reaches it | A search proves the override's reach |
| M5 | The Opus 5 thinking switch matches Opus 5 ids exactly | A test proves a future Opus 5.x id does not inherit it |

## Step 3: cleanup

| Item | Change | Done when |
| --- | --- | --- |
| 13 | Delete `rebuild-card-snippets.ts`, its npm script and its docs | No reference remains outside archived records |
| 14 | `dump-model-inputs.ts` uses the shared env loader and `providerSourcesFromStoredSources` | No `as never` cast for sources |
| 15 | Correct the `AGENTS.md` snippet sentence | The sentence says what old cards show |
| 16 | Move `evidenceForSection` into `packages/pipeline` | The script imports it from the package |
| 17 | Replace the five plan-task comments with reasons | None of the five remains |
| 18 | Loosen the two layout pins and make the bootstrap assertion independent | The tests pin wording, not layout |
| 19 | Decide what people and organization records give models | The decision is recorded; if model input changes, before and after on real data |
| 20 | Close the emphasis marker guard with a decision | Recorded |
| 21 | Close the find-similar price with a decision | Recorded; no paid call made |

## Finish

- `measure.mts` after Step 3, with the counts in the review.
- `npm run check` green, exit code read directly.
- An independent review of the whole diff by a fresh reviewer. Confirmed issues fixed, rejected ones recorded with the reason.
- Docs in step: the review's statuses, `AGENTS.md`, `docs/code-map.md`, `docs/commands.md`, `docs/STATUS.md`.
