# Investor Lens: Emphasis Read (sixth category)

Designed 2026-08-11 in session with Samay. Approach, inference depth, empty states, and evidence lanes approved. The card label is still Samay's pick.

## What this is

One new gated Lens category. It reads what a company and its founders are loud about, what never appears in the filed record, and what that asymmetry means. It never claims a company lacks something. Absence on the web is not knowable. The read is built from what they did publish, which is all citable.

## The read's shape

Four parts:

- Loud: what their own publishing leads with. Cited.
- Quiet: what never appears in the filed record. Stated as "nothing filed shows...". Scoped to the file, so no citations are possible or needed.
- Read: the smallest specific inference the observed pattern supports. Cited to the facts it uses. Stage is a plain fact the inference may use, never a benchmark yardstick.
- Would change if: the rebuttal condition. Plain string.

Two empty states:

- thin_file: not enough source material to read emphasis. Decided in code before any model call, so it costs nothing. Example trigger: almost no sources, or zero company-authored ones.
- nothing_notable: material exists but no honest asymmetry survives. Model-decided. Also the fallback when the verifier kills a read.

Empty-state copy is a few flat words each, in the direction of "Not enough filed." and "Nothing notable." Samay approves the final strings.

## Label

The slot reads "Pay attention to" (Samay's pick, 2026-08-11). Backups he also likes if it wears badly in the real UI: "What's gone unsaid" and "Keep an eye on". The code name is `emphasisRead` regardless of the label.

## Where it runs

A new memoized step in the analysis run, after `synthesize-card` and before `verify-synthesis`. Its claims append to the existing verify call (`applyVerifierResults` already takes an index offset). Progress events are additive; step ids freeze once shipped. The API contract version bumps and the extension rebuilds.

## Evidence lanes

The step sees the card plus a per-source digest: source class, headline, what each source leads with. Founder voice gets its own source class (`founder-authored`) next to company-authored, reporting, and independent. Lanes, each registered in the provider budget:

1. Hacker News by author (Algolia API). Free, no auth. Live-tested 2026-08-11.
2. GitHub author activity (READMEs, commits, issue prose). Free with the existing token.
3. Exa general web for blogs, Substack, and interviews. Already paid. Its tweet coverage is dead: changelog says removed, and a live probe returned zero x.com results.
4. Bluesky author feed. Free, unauthenticated, single call. Coverage per founder unproven; probe and accept empties.
5. xAI `x_search`: posts by the founder and company handles plus posts about the company. It is a server-side tool attached to a grok chat call, not a model. Docs: https://docs.x.ai/developers/tools/x-search (handle filter `allowed_x_handles`, date range). Roughly $0.02 to $0.08 per run. The key lives in `.env.local` as `XAI_API_KEY` (verified working 2026-08-11) and goes into Vercel env at ship. xAI deprecated the predecessor surface in January 2026, so the client is one wrapped module that can be swapped without touching callers.

## Prompt spine

- The proof ladder, re-derived in the product's own words: paying customers > demand > working product > real problem > team > idea. Used to name where their loudest proof sits.
- No stage-benchmark tables. The inference comes from the observed communication itself: what they publish, what it leads with, who the writing is aimed at.
- Quiet statements only ever describe the filed record.
- The tone is loud and quiet, never accusation.
- The bar for a read is a specific cited asymmetry. If the line could be pasted onto any startup, emit nothing_notable instead. Emitting nothing is never penalized.
- One fact, one job. When the gap is the decision hinge, the open question picks it up and cites it. No duplication with the bear case.

## Verifier rules

- Loud and Read verify like any other claim. Drops stay dropped.
- Quiet gets a contradiction-only check: if any cited source contains the supposedly missing thing, the whole read dies. The card then shows nothing_notable and the drop reason lands in the run trace.

## Display

Sixth slot in the Lens memo, always present, rendered like the other five filing cards. Both empty states are designed and fixture-covered.

## Gates and rollback

- `EMPHASIS_READ_ENABLED`, default on, same pattern as `PERSON_READS_ENABLED`.
- The field lives inside `synthesis`, which public routes already strip. No new gate work.
- The lens eval scorer extends its generic-phrase checks to this field, so template slop fails a gate instead of shipping.

## Cost

Under $0.10 added per analysis run, almost all of it the xAI call. Four of the five lanes are free.

## Not in v1, named so nothing is silently dropped

- Podcast and YouTube transcripts. Transcription costs 10 to 20 cents per episode and cloud scraping of YouTube is blocked by design. Later upgrade.
- Reddit API. Application-gated, and Reddit's own docs say the data API is not the avenue for research use.
- LinkedIn and Threads (closed to third parties). Scraper vendors (break every few weeks by their own admission).
- Per-sector proof-hierarchy tables. Tune after real output exists.
- A jobs and hiring-signals lane. It spiked well as emphasis evidence and is a natural follow-on.

## Tests

- Schema: legacy cards without the field parse unchanged.
- The code-decided thin_file gate has unit tests.
- Prompt-parse fixtures for a full read and for nothing_notable.
- Verifier kill case: a quiet claim contradicted by a source drops the whole read.
- Display: sixth slot in all three states.
- Eval gate: a pasted-anywhere generic line fails the scorer.

## Evidence behind this design

- Spike, 2026-08-11, two multi-source research runs (scratchpad only). The loud case (Cartesia) yielded founder posts with engagement, a competitor attack tweet, hiring signals, and a distinct docs register. The quiet case (Glean) collapsed to the company's own docs plus job posts, which is the thin_file shape.
- Provider verification, 2026-08-11, against live docs and live API calls: xAI route confirmed with a working key; Exa x.com coverage empirically zero; the Hacker News API tested end to end; official X API priced out; general search APIs cannot return tweets.
