# Model input audit, September 2026

Task 1 of `docs/superpowers/plans/2026-09-23-evidence-and-judgment-remediation.md`. It covers what every model stage actually receives, and where good model output is thrown away.

## How this was done

`scripts/dump-model-inputs.ts` runs each stage's production function against a stored card with a stub client. The stub records the exact request and stops it before anything is sent. No model was called. The dump covers extraction, synthesis, the verifier, research sections, person reads, the expanded description, the emphasis read, the Jev screen and the How it wins judge.

Three companies were read in full: Notion, DeepInfra and casaphq (the thin file). Seven read-only agents on Sonnet 5 split the reading by stage and by code pattern. I checked every finding below against the payloads, the code or production data before writing it down. Reach counts come from the 373-card corpus (`eval/curation/corpus/cards`) or from production tables, read-only.

"Verified" means I read the payload or the data and the code that causes it. "Likely" means the mechanism is confirmed but the effect on reads is not yet measured.

Two known gaps in the dump: person reads also use provider fact candidates that are never stored, and the emphasis read adds a fresh founder-voice fetch that costs money. Both are left out.

## Findings, ranked by effect on what a reader sees

### 1. Eight paid searches never ask for page text (verified cause, likely link)

The stableenrich Exa searches in `packages/providers/src/stableenrich/core.ts:188-258` send a query and a result count, but no `contents` field. These are funding history, company profile, management team, recent signals, competition, independent analysis, customer proof and product proof. The find-similar call (`core.ts:261-263`) asks for no text either. Exa then returns only an id, title, URL, author and sometimes a date. The one stableenrich search that does ask for text is `discovery.ts:51`.

- Reach: 5,175 of 13,808 stored sources in production hold no page text of any kind (37%). Since August 1 it is 873 of 2,689 (32%). Notion has 33 such sources out of 47, DeepInfra 29 of 41.
- Many are easy pages on the company's own site, such as poolside.ai blog posts and pages on lovable.dev, merge.dev and exa.ai.
- Cost of fixing: a live price check on `https://stableenrich.dev/api/exa/search` with `contents: { text, highlights }` quotes $0.01 per search, the same as today.
- Effect: no builder can turn these sources into evidence, however it is fixed. The JSON fix in finding 2 alone would leave about a third of sources as bare titles.
- Proposed fix: request page text in these eight searches, with the same `contents` setting `direct-exa.ts:69-72` already uses. Evidence plumbing, so it belongs in Task 2.
- Why "likely link": the stored rows don't record which search produced them. The rows with no text have exactly the fields a search without `contents` returns.

### 2. Stored page text is JSON, and every stage reads it as text (verified)

12,530 of 13,808 stored sources (91%) keep `rawText` as serialized JSON (`direct-exa.ts:369,384` and the stableenrich mappers). Every builder then cuts that JSON by character count.

| Stage | What it reads | Reach |
| --- | --- | --- |
| How it wins judge | Citation snippets; an empty one falls back to the title (`how-it-wins-judge-rules.ts:90`) | Corpus: 1,784 of 5,938 items are JSON (30%), 493 more are bare titles (8%) |
| Jev screen and How it wins writer | The whole card, including the same snippets (`cardForHowItWinsPrompt`) | Same as the judge |
| Synthesis and verifier | Citation snippets | Notion 11 of 32 JSON, DeepInfra 7 of 18 |
| Emphasis read | First two sentences of each snippet (`core/src/emphasis-read.ts:74`) | Notion 7 JSON and 6 empty of 28, DeepInfra 7 JSON and 1 empty of 18 |
| Person reads | The first 700 characters of the snippet or `rawText` (`person-read-evidence.ts:50,63,76`) | 55 of 61 evidence items are JSON across the three companies. casaphq: 24 of 24 |
| Extraction | `rawText` cut at 2,200 characters (`extraction.ts:287`) | 8% to 24% of each source's budget goes to keys, URLs and image links before any prose |
| Evidence ledger | Sentences split out of the JSON string (`evidence-ledger.ts:113-133`) | Notion 41 of 47 first snippets start with `{` |
| Research sections, expanded description | `rawText`, then the snippet (`research-section-generation.ts:54`, `expanded-description-evidence.ts:32`) | JSON text in every source that has one |

The cuts often land inside a field, so the model gets broken JSON, for example a snippet ending `"image":"https:/`.

- Proposed fix: one helper that turns a stored record into readable text (text, then summary, then highlights, then title), used by every builder. Plus one shared snippet length, cut at a sentence with `packages/core/src/sentences.ts`. Already Task 2.

### 3. The verifier cuts half of all drafted claims, and probably true ones (likely)

Production analysis runs, from `generation_runs.trace_json`:

| Month | Runs | Claims drafted | Claims kept | Runs with no bull or bear read |
| --- | --- | --- | --- | --- |
| May | 66 | 468 | 379 | 0 |
| June | 25 | 232 | 120 | 5 |
| July | 49 | 464 | 236 | 10 |
| August | 59 | 649 | 423 | 1 |
| September | 42 | 444 | 222 | 8 |

In September, 222 claims were cut. 18 of those came from the keyword gate in finding 9; the verifier cut the other 204.

Why it is probably cutting true claims: across corpus cards with synthesis, 36% of citations have an empty or JSON snippet. Claims that survived cite such a source only 12% of the time (160 of 1,366 cited ids). The verifier instruction "Mark a claim unsupported when it ... relies on a missing premise" (`verifier.ts:139`) turns "I could not read the source" into "unsupported".

One real rescue exists. `verificationFactsForClaims` (`generate-card.ts:154`) passes structured card facts, and it saved 3 of 7 hollow Notion claims and 1 of 9 on DeepInfra. For signals, the fact it passes is the same headline, so the rescue is weak there.

- What is not known: the trace stores only counts, not which claims were cut. The writer may also avoid hollow sources, which would explain part of the gap. Task 2 Step 11 (rerun the verifier on rebuilt cards) is where this gets confirmed.
- Correction to the plan: the production verifier is `deepseek-v4-flash` (33 calls in the last 14 days), not Sonnet 4.6. Task 2 Step 11 should rerun that model.

### 4. Person reads read JSON, about the wrong person, and read some people twice (verified)

- 55 of 61 evidence items across the three companies are JSON. Notion's CEO, Ivan Zhao, has one evidence item, and it is JSON from a people database.
- `mentionsName` checks the whole snippet for the person's name, but the model receives only the first 700 characters (`person-read-evidence.ts:19-25,50`). 31 of 61 items never name the person within the text the model sees. casaphq: 18 of 24.
- `peopleFromSections` (`apps/web/src/inngest/contact-enrichment.ts:145`) joins founders and executives without removing duplicates. 111 of 373 corpus cards list the same person in both.
- The thin-evidence guard only fires at zero items, so noise passes as evidence.
- Proposed fix: readable text from finding 2, a window around the name rather than the first 700 characters, and removing duplicate people by name. Evidence plumbing, so Task 2.

### 5. The evidence leans toward funding by design, in four places (verified)

- The searches ask for it. The default Exa queries in `stableenrich/core.ts` add funding words to searches about other things. The company profile query ends "investor profile". Recent signals includes "funding". Independent analysis ends "revenue funding traction customers".
  - Correction, Task 2 A4: production never ran those `core.ts` defaults. Every run passes `fallbackResearchPlan(domain)` (`research-plan.ts`), whose own queries win. In that live set only recent signals carried funding words ("funding ... traction"). Both sets are now one, `defaultSourceSearchQueries` in `packages/core/src/search-queries.ts`.
- The ledger ranks funding sources first (`evidence-ledger.ts:108`, a +1 bonus for the funding intent) and picks each source's snippet as the first sentence holding any of ten keywords. Six of the ten are funding words (`evidence-ledger.ts:113-133`).
- The extraction model writes the snippet for each source it cites (`extraction.ts:170`), and its instructions center on the funding round ledger. Notion's snippets read "Notion raised $50 million from Index Ventures..." while its product page gets "The AI workspace that works for you."
- Research sections and the expanded description take evidence with no regard to topic. Notion's "Who pays" section gets 8 funding items out of 18. The expanded description takes the first 12 citations in card order (`expanded-description-evidence.ts:21-43`): 7 of 12 for Notion are funding items.

Reach: 1,734 of 3,297 readable e-snippets in the corpus mention funding (53%). On the company's own pages it is 348 of 693 (50%).

Effect: the judge, the verifier and the emphasis read see a company mostly through its funding news, which is the one topic that says least about how it wins.

- Proposed fix: take funding words out of queries that are not about funding, and build snippets from the page text (finding 2), not from a keyword list or the extraction model's summary. Keep funding ranking only where funding extraction needs it. The query wording is a product call. Snippet authorship is decision E below.

### 6. The company's own pages reach the judge labeled as outside sources (verified)

- 229 items from a company's own site, across 96 corpus cards, carry the label `news` or `independent_report`. Notion's own release notes and blog posts (p1, p2, p3, p5) are labeled `independent_report`.
- Cause: some sources are typed `news` when they are stored. The judge packet takes `citation.sourceQuality?.tier ?? citation.sourceType` (`how-it-wins-judge-rules.ts:93`) and never re-checks the host against the card's domain. `sourceQualityForSource` does that check when it is given `targetDomain` (`source-quality.ts:60`).
- A second, smaller issue: 233 own-site items are labeled `company_site` while 774 are labeled `primary_company`. They mean the same thing under two names.
- A newer fix (`5e549b0`, July 21) types some hosts correctly at intake, but stored sources from before it keep the old type.
- Effect: the judge can treat a company's own claims as independent confirmation.
- Proposed fix: compute the label in the packet builder with `targetDomain: card.domain`, and use one vocabulary. Evidence plumbing, Task 2.

### 7. No model ever sees when a source was published (verified)

The date is lost at every step:

1. `direct-exa.ts:377` reads `publishedDate` into `ProviderSource.publishedAt`.
2. Extraction ignores it, and its citation schema has no date field (`extraction.ts:158-172`).
3. `recordSourcesForCard` drops it on save (`source-fetching.ts:52-63`). The `sources` table has no column for it (`packages/db/src/schema.ts`).
4. The `Citation` schema has only `fetchedAt`, the time we fetched it (`packages/core/src/card.ts`).
5. The judge packet sets `sourceDate: null` for every item.

- Reach: 100% of judge evidence items have no date.
- Correction to the plan: Task 2 Step 6 assumes the card carries a publish date. It does not. Passing dates needs an optional `publishedAt` on citations (card JSON, so no migration) and, to survive a rebuild from stored sources, a `sources.published_at` column (a migration). The plan says to stop when a fix needs a schema change. Decision C below.

### 8. The judge reads the whole card, and the Notion "memory" finding was wrong (verified)

- The judge packet has two parts: `evidence` (the citable items) and `context` (the whole card minus synthesis). For Notion, `context` is 26,348 characters and `evidence` is 12,923. Most of `context` repeats the same snippets.
- Correction to the plan's "What we learned" item 4: Opus 5 did not use memory for Notion's composability. The card's description, written by extraction from page text, says "Block-based editor where pages, databases, and views ... are composable primitives", and it sits in `context`. No citable evidence item says "block". Opus 5 used the description, and Opus 5.5 refused a claim with no evidence item behind it. Both behaved reasonably. The real problem is that the page text behind the description never reached the evidence list.
- casaphq: the rules are 80% of the judge prompt, and its 5 evidence items total 2,555 characters.
- `scope` is always `"company"`, even for "alternatives to Notion" roundups (`how-it-wins-judge-rules.ts:95`).
- Proposed fix: none beyond finding 2 for now. Once items carry page text, drop the repeated snippets from `context`. That is a judge prompt change, so it waits for Task 5.

### 9. A keyword filter deletes verified claims (verified)

`applySynthesisUsefulnessGate` (`packages/pipeline/src/synthesis-quality.ts:10-45`) runs regular expressions over bull, bear and market claims after the verifier has passed them. For example, a claim containing "competition" is dropped unless it also contains a word such as "from", "against" or "buyer".

- Reach: 51 claims since May, 18 of them in September. The trace keeps only the count (`usefulnessDroppedClaims`), never the claim.
- This conflicts with the plan's guardrail "No regex filters on model output".
- Proposed fix: remove the gate and let the prompt and the verifier carry quality. Decision D.

### 10. Four workarounds hide the JSON bug (verified)

Each one re-parses or rejects JSON downstream instead of fixing it at the source:

- `apps/extension/src/company/clipping-model.ts:91` (clippings)
- `packages/core/src/prose.ts` (`isReadableProse`, whose comment reads "sources.raw_text, which for most providers is a JSON envelope")
- `packages/core/src/first-payoff.ts:113-141` (the early read)
- `packages/providers/src/founder-voice/exa-web.ts:129-148` (`textFromRawRecord`)

Two reader-facing surfaces also cut JSON: progress-event snippets (`apps/web/src/inngest/generation-helpers.ts:276`, 240 characters) and the extension bootstrap (`apps/web/src/app/api/extension/bootstrap/route.ts:86`, 360 characters).

Snippet cut lengths in use today: 240, 280, 360, 420, 500, 700, 1,000, 1,400, 2,000 and 2,200. None of them uses `sentences.ts`.

- Proposed fix: delete all four workarounds once finding 2 is fixed, and route both surfaces through the shared helper. Task 2 Step 12, widened.

### 11. Smaller findings

- Extraction runs on `google/gemini-2.5-flash` in production. 15 of its 43 calls in the last 14 days timed out after 10 to 18 seconds, and the DeepSeek Flash fallback then succeeded. Normal calls take 15 to 38 seconds. It is documented in `docs/deployment.md:319` and costs time, not quality. (Verified.)
- The How it wins display caps (6 running, 12 in question, `how-it-wins-frozen-writer.ts:386-402`) drop items without a trace entry. In the saved runs the judge named at most 3 current strategies, so this rarely fires. (Verified code, likely rare.)
- Person-read suppression reasons (`thin_evidence`, `no_nonobvious_claim`, `truncated`) are computed but only a count reaches the trace (`contact-enrichment.ts:766`). (Verified.)
- `endpointTraceKey` falls back to `JSON.stringify(endpoint)` as a merge key (`apps/web/src/inngest/generation-trace.ts:146`). Key order could split one endpoint into two rows. No case found. (Likely, low.)

## Decisions for Samay

A. Which findings join the plan. My recommendation: findings 1, 2, 4, 6 and 10 join Task 2, since they are all evidence plumbing. Finding 3 stays as Task 2 Step 11, rerun on DeepSeek Flash. Findings 5, 7 and 9 need your call first. Finding 8 waits for Task 5. Finding 11 is recorded only.

B. Page text for the eight searches (finding 1). Same price per search. Sources get longer, so storage and extraction prompts grow. I recommend yes.

C. Source dates (finding 7). Options: (1) an optional `publishedAt` on citations only, which covers new cards and needs no migration; (2) that plus a `sources.published_at` column, a migration, so rebuilds and backfills keep dates; (3) skip dates for now. I recommend (2), done after the page text fix.

D. The keyword gate (finding 9). Remove it, or keep it. I recommend removing it.

E. Who writes the snippet (finding 5). Today the extraction model often writes it, as a funding-focused summary. I recommend the snippet be the page's own text, cut at a sentence, keeping a model-written snippet only when the source has no text. The funding words in the search queries are the other half of this.

## Reproduce

```bash
npm run qa:model-inputs -- --slug notion   # writes .cold-start/model-inputs/notion/
python3 eval/curation/remediation-2026-09/monitors.py eval/curation/corpus/cards/notion.json
```

The dump reads production with `.env.production.migrate.local` and writes nothing to the database. Its output folder is gitignored because it holds source page text.
