# First Read direction review

Date: 2026-06-23

## Recommendation in one paragraph

Keep the Evidence Receipt model, but do not treat the current implementation as solved. First Read is probably failing because the early artifact contract is muddled: underfilled seed cards are not stored, stored basics snapshots are marked `hit`, and the UI treats `hit` as filed, so the substantive slip can be skipped or collapsed before it has a chance to act as the first payoff. The next move should be a measured artifact-contract pass, not a new provider lane and not more visual polish. First, measure whether `card.partial` is actually fetched and visible before `card.saved`. Then spec a narrow fix that separates "early sourced artifact" from "full usable public profile," improves the seed artifact with structured source-backed proof, and keeps the immediate source receipt visible until First Read has something real to say.

## What First Read is supposed to accomplish

First Read is not a loading state. It is the first useful product moment before the full basics card finishes.

It should answer four things in the side panel:

- What can we already say from sources?
- Which evidence arrived?
- What is still missing?
- Why should the user keep waiting for the full profile?

The target from the existing design work is roughly 10 to 15 seconds on a normal cold run where accepted sources return. The standard is not "something appears." The standard is "I learned something that was not already in the company header."

The right shape is already named in the repo: source-backed Evidence Receipt. It should preserve the Catalogue Card language: warm, filed, precise, small evidence marks, no fake dashboard chrome, no uncited preview claims.

## What is happening now

The repo has most of the pieces, but the pieces do not yet guarantee payoff.

The backend builds a deterministic seed card after source fetch, tries to store it, emits `card.partial` if stored, and writes `seedCardMs` plus `firstUsableCardMs`. The extension polls generation status, treats `card.partial`, `card.saved`, `card.enriched`, and `generation.complete` as card-ready events, fetches the card after those events, and returns from the generating view once the fetched card passes `hasUsablePublicProfile`.

The First Read UI renders only inside the success profile view. It computes a read from the current card and source summaries, then shows the full slip only when all of these are true:

- The run is still meaningfully in progress.
- The card is not considered filed.
- The read is substantive.

That gate is sensible by itself. It prevents filler. The problem is the upstream state model. The current storage path only saves a basics snapshot if it already passes `hasUsablePublicProfile`; when it does pass, `prepareCardSnapshotForStorage` marks it as `cacheStatus: "hit"`. The panel then treats any `cacheStatus: "hit"` card as filed, even if the event that caused the fetch was `card.partial`. So the seed path can fall into two bad states:

- If the seed is thin, it is not saved and `card.partial` never arrives.
- If the seed is strong enough to save, it may be marked `hit` and collapse into `First read filed` instead of showing the live First Read slip.

There is also a content gap. `buildSeedProfileCard` mostly creates identity, website, one-liner, and at least one citation from the best seed source. It does not deterministically create `identity.description.serves` or `signals[]`. That means the early slip often has no source-backed buyer read and no structured proof read. The current client-side source-title proof fallback is doing real work during the seed window, but it is a brittle bridge rather than a product contract.

## Root-cause hypotheses, ranked

| Rank | Hypothesis | Why it is likely | What would disprove it |
|---|---|---|---|
| 1 | `card.partial` is not a reliable visible artifact because storage requires full public-profile usability and marks stored basics snapshots as `hit`. | `canStoreCardSnapshot` rejects basics snapshots unless `hasUsablePublicProfile` is true. `prepareCardSnapshotForStorage` then marks usable basics snapshots as `hit`. The UI treats `hit` as filed. | A measured run shows `card.partial` fetched, card `cacheStatus: "partial"`, `showFirstRead=true`, and visible First Read before `card.saved` across most domains. |
| 2 | The seed artifact is too thin to be a First Read even when it arrives early. | `buildSeedProfileCard` can write one citation and fallback identity/one-liner, but not buyer or signals. Prior follow-up docs call `proofReadFromSources` load-bearing for this exact reason. | Seed cards across measured domains consistently contain 3+ useful sources plus either a cited buyer read or a valid proof headline. |
| 3 | The UI is correctly hiding First Read because the current artifact is not substantive. | `firstReadForCard` requires buyer/proof or at least three evidence entries. Tests intentionally hide thin cards. This is good trust discipline, but it means timing alone will not save a thin artifact. | Hidden cases turn out to have strong source-backed reads that are lost only through rendering state. |
| 4 | Polling/event timing adds delay after the artifact exists. | The extension does fetch on new card-ready events, but only after polling status. Delay could still be 350 to 800 ms early, then 1600 ms later, or 5000 ms in hidden tabs. | Comparing event timestamps, card fetch time, and `cold-start-first-read-visible` shows frontend notice delay is negligible versus backend artifact delay. |
| 5 | First Read duplicates the summary rather than adding a delta. | Earlier First Read failed this way. Current code has a near-duplicate guard, so this is less likely as the main failure now. | Screenshots show the visible read is mostly "N sources filed" or missing, not duplicate summary prose. |
| 6 | The first payoff is late because the backend source batch itself is slow. | Direct Exa fundamentals and StableEnrich can take meaningful time. Provider timing may matter, but the repo already tried and removed a dedicated lane because the artifact remained too thin. | Measurement shows seed/source event timing inside target, while UI still misses. Then provider speed is not the bottleneck. |

## Evidence from code/docs

- `AGENTS.md` says `SPEC.md` is the product and technical source of truth, `DESIGN.md` is the visual source of truth, and generation status events are rendered by extension/web progress feeds. It also says public reads derive from `cards.card_json` and extension synthesis is auth-gated.

- `SPEC.md` defines `partial` as intentionally incomplete but useful, not as a full card by another name. It also keeps citation discipline structural: a fact without citation support becomes unknown, and synthesis stays gated.

- `INTENT.md` says the product line is basics first, citations always, judgment only after public facts hold. This rules out uncited preview claims as a speed hack.

- `DESIGN.md` says Cold Start is a kept catalogue card, not a SaaS dashboard or chat answer. Evidence weight should be visible through small repeatable marks, and running source events should be quiet vertical replacements, not decorative progress.

- `docs/product/capture-notes/2026-06-22-prototype-to-product.md` says the current First Read idea has not changed the wait enough; if it cannot provide immediate payoff, kill it or replace it.

- `docs/product/viability-directions-2026-06-23.md` already sets the right bar: First Read earns its place only if it gives a source-backed buyer read, latest proof, or evidence posture before the full card is ready. It asks for measurement across 12 live domains and warns not to add a provider lane before measurement.

- `docs/superpowers/specs/2026-06-21-first-read-fast-payoff-design.md` says the recommended path was to use the existing `card.partial` seed-card path first, then add a provider lane only if timing misses. Its later resolution says the flag-gated first-read lane was built and removed because `buildSeedProfileCard` wrote a single citation, the lane card never cleared the substantive bar, and the extra provider code was unearned.

- `docs/superpowers/specs/2026-06-22-first-read-followups.md` says the seed card has no `serves` and no `signals`, so the source-title proof fallback is load-bearing during the visible seed window. It recommends moving headline/proof classification into server-owned structured data and making seed `signals[]` carry the first useful proof.

- `apps/web/src/inngest/functions.ts` records `source.found`, then builds `seed-profile-card`, stores it with event type `card.partial`, and writes `seedCardMs` plus `firstUsableCardMs` if storage succeeds. The same function later stores `card.saved` and `card.enriched`.

- `apps/web/src/inngest/card-storage.ts` is the strongest root-cause clue. `prepareCardSnapshotForStorage` sets `cacheStatus: "hit"` when `hasUsablePublicProfile(merged)` is true. `canStoreCardSnapshot` returns false for basics unless the card passes `hasUsablePublicProfile`. So current basics "partial" storage is not really allowed to store underfilled partials.

- `packages/core/src/card-quality.ts` sets `hasUsablePublicProfile` at citations, useful name, useful summary, at least four structured facts, and at least two visible facts. That is a full public-profile quality bar, not a first-payoff receipt bar.

- `packages/pipeline/src/seed-profile.ts` chooses one best seed source, adds one fallback citation if needed, fills fallback name, website, and one-liner, then finalizes the card. It does not create buyer/use-case fields or seed signals from newsworthy citations.

- `apps/extension/src/sidepanel-network.ts` treats `card.partial`, `card.saved`, `card.enriched`, and `generation.complete` as ready events, then fetches the card. It returns from generation only when the fetched basics card passes `hasUsablePublicProfile`.

- `apps/extension/src/sidepanel.tsx` shows a generating state until `pollGenerationUntilCard` returns a usable card. After that it sets success state with a running `contactRun` and watches basics completion. First Read cannot render before the panel has a usable card.

- `apps/extension/src/ResearchLayerPanel.tsx` computes `firstReadFiled = firstReadIsFiled(events) || card.cacheStatus === "hit"`. It only shows the live First Read slip when `firstReadShouldPayoff && !firstReadFiled && firstRead.substantive`. This makes `cacheStatus: "hit"` decisive even when the latest event is `card.partial`.

- `apps/extension/src/first-read.ts` has good guardrails: filler rejection, duplicate-summary rejection, source-quality marks, entity-matched proof titles, and a substance gate. Evidence-only First Read needs at least three evidence entries. This is why a one-citation seed card will stay hidden.

- `apps/extension/tests/first-read.test.ts` confirms the intended behavior: buyer read wins when cited, citations can build the ledger, proof headlines must name the company, and thin cards are non-substantive.

- Local repo inspection found no useful local First Read timing fixture. `apps/web/.cold-start` is empty, and the available eval run artifacts are provider/eval outputs rather than side-panel visibility traces. Live measurement is still needed.

## Option table with tradeoffs

| Option | Why it might solve the real problem | Risks | Bloat added | What it teaches | Proof it worked | Reject if | Design/trust fit |
|---|---|---|---|---|---|---|---|
| Keep Evidence Receipt, fix timing/data path | Preserves the right product model and targets the status mismatch that likely hides the slip. | Could reveal that the seed card is still too thin after state is fixed. | Low to medium. Mostly artifact contract, storage semantics, fetch/visibility tests. | Whether First Read was blocked by state plumbing rather than product shape. | `card.partial` produces a visible slip before `card.saved` in most measured runs; no uncited claims. | Measurement shows `card.partial` arrives too late or seed data cannot clear substance without a new source path. | Strong fit. Evidence marks and filed receipt are Catalogue Card-native. |
| Improve seed-card artifact | Gives First Read real structured content earlier: buyer when cited, proof headline as seed signal, richer evidence ledger. | Schema/threading churn if `publishedAt` or structured seed signals touch many files. | Medium. Core helper, seed generation, tests, maybe citation schema field. | Whether normal source fetch already contains enough evidence for early payoff. | Seed cards have 3+ source-backed evidence entries or a valid proof/buyer read before full extraction. | It weakens `hasUsablePublicProfile` or invents facts from raw snippets. | Strong fit if every seed field has citation refs. |
| Move headline/proof classification server-side and make seed `signals[]` carry proof | Removes brittle render-path title scraping and turns "Latest proof" into a real card artifact. | Can overfit to funding/news headlines and miss buyer usefulness. | Medium. Core classifier, pipeline seed signal, tests. | Whether the earliest useful read is usually a proof event rather than buyer description. | Client no longer derives proof from raw titles; seed signal renders in the same path as full signals. | The classifier broadens into vague marketing-title matching or produces unmatched-company headlines. | Strong trust fit. Better than client heuristics. |
| Show source/evidence receipt immediately, then upgrade into First Read only when substantive | Prevents blank waiting while respecting the substance gate. Makes early progress artifact-led without claiming more than we know. | Could become another progress component if not tightly scoped. | Low. Mostly staging and copy. | Whether users value evidence arrival even before a full read exists. | User sees categories/domains/source counts early, then a real slip only when buyer/proof/evidence clears bar. | It competes with existing progress panel or repeats source rows in three places. | Good fit if it uses small receipt marks, not loading chrome. |
| Change polling/event fetch behavior | Helps if the artifact exists before UI notices it. | Does nothing if seed is not stored or collapses to filed immediately. | Low. Timing instrumentation and fetch tests. | Whether frontend latency is material. | Delta from `card.partial.createdAt` to fetch and visible mark is under 1 second in foreground. | Backend artifact delay dominates. | Neutral. Safe if it does not change product semantics. |
| Add narrowly scoped fast provider preflight | Could hit 10 to 15 seconds if normal source fetch cannot. | Repeats the removed lane failure unless it writes a rich enough artifact. Adds cost and provider complexity. | High. Provider budget, trace, fallback, storage, tests, QA. | Whether speed is impossible from the normal source batch. | A flag-gated run beats seed path on first visible read latency and carries enough evidence to clear substance. | Measurement has not proven seed path misses, or lane output is one-citation/thin again. | Acceptable only if citation discipline and source ledger survive. |
| Roll back First Read and replace with artifact-led progress receipt | Removes surface that is not paying rent. Honest if First Read cannot clear the bar. | Gives up on the "first useful read" promise and may make the product feel slower. | Low to medium, depending on replacement. | Whether users mainly need confidence that work is happening, not an early read. | First Read fails measurement after artifact-contract fixes, while source receipt is consistently understood. | Any path can deliver useful buyer/proof/evidence before full card. | Good trust fit, weaker product payoff. |
| Do nothing except measurement first | Avoids guessing. Finds actual bottleneck before code. | Leaves a likely state mismatch unfixed longer. | Very low. | Ground truth on timing, visibility, and content. | A 12-domain report shows event timing, fetch timing, visible state, and content classification. | The team treats measurement as a substitute for deciding. | Strong as the immediate next step, not the final direction. |
| Pure visual polish | Could make the current state feel nicer. | Does not solve first payoff. High chance of tasteful bloat. | Medium. | Almost nothing about viability. | Only useful after measurement says the artifact already works. | First Read is hidden, late, or content-thin. | Risky because DESIGN says motion and chrome must explain state, not decorate it. |

## Recommended path

Do a two-part pass.

First, measure the existing path without new paid work by pulling recent generation traces if production DB access is available, and by using a local or already-approved QA run only if traces are insufficient. The measurement should answer whether `card.partial` is produced, whether it is fetchable, what cache status the fetched card has, whether `showFirstRead` would be true, and whether the read is useful.

Second, assuming the measurement confirms the current shape, write and implement a narrow "First Read artifact contract" spec. The likely spec should do three things:

- Preserve the source receipt immediately from `source.found`, using real domains/categories and event metadata.
- Make the seed/partial artifact semantically distinct from a filed full profile, so `card.partial` can render a live First Read instead of being collapsed by `cacheStatus: "hit"`.
- Improve the seed artifact with structured source-backed proof, preferably server-side `headlineFromCitations` plus seed `signals[]`, so the early read is not dependent on client-side source-title scraping.

The guardrail: do not weaken `hasUsablePublicProfile` for the full public card. The fix should not turn partial into a public-card quality bypass. It should define a smaller, honest artifact for the extension's early read and keep the full profile gate intact.

## Measurement plan

Do not run new paid/provider work automatically. Use this sequence.

Pull recent traces, read-only:

- Source env only if approved for DB access: `set -a; source .env.local; set +a`.
- Query recent basics generation runs with `trace_json.milestones.seedCardMs`, `trace_json.milestones.firstUsableCardMs`, status, started/completed timestamps, `skip-underfilled-seed-card`, `seed-profile-card`, source counts, citation counts, and event sequence.
- For each run, classify whether `card.partial` existed, whether `skip-underfilled-seed-card` occurred, whether `card.saved` arrived before any useful partial, and whether `firstUsableCardMs` came from seed or later generated/enriched storage.

Instrument or manually inspect UI behavior, non-destructive:

- Use an already cached or local fixture card where possible.
- For a live QA run only after approval, use the viability doc's 12-domain set: obvious AI infra, obscure AI infra, healthcare, consumer, public-ish company, bad website, no funding, noisy common name, seed-stage startup, recently funded startup, old company, and one broken source case.
- Record `generation.started`, `source.found`, `card.partial`, first successful card fetch, `cold-start-first-read-visible`, `card.saved`, `card.enriched`, and final completion.
- Screenshot the side panel at first payoff and final basics.
- Classify each run as useful, duplicate, too late, too vague, hidden correctly, or broken.

Add a small local diagnostic before changing product behavior:

- A unit or harness-level check that feeds `ResearchLayerPanel` a `card.partial` event plus a fetched card with `cacheStatus: "hit"` and confirms whether the live slip is suppressed.
- A companion check with `cacheStatus: "partial"` and the same event to show the intended slip state.
- A seed-card fixture check that reports `publicProfileQuality`, citation count, `firstRead.substantive`, `readKind`, and evidence count.

Success threshold:

- At least 8 of 12 approved runs show a useful first payoff before full basics.
- Zero runs show generic AI filler.
- Zero proof headlines fail the company-name/entity guard.
- Foreground UI delay from a ready event to card fetch to visible mark is under 1 second unless the backend artifact does not exist yet.

## Rejected paths

Do not re-add the dedicated provider lane now. It was already built and removed for cause. A faster lane that still writes one thin citation is just a faster way to hide First Read.

Do not polish the First Read card visually before fixing the artifact contract. The current UI guardrails are mostly good. The risk is not that the receipt lacks taste; it is that it lacks a reliable useful artifact at the right moment.

Do not weaken `hasUsablePublicProfile` to make the extension return earlier. That gate protects the public card and analysis-readiness contract. If First Read needs a smaller early artifact, define it explicitly instead of lowering the full-profile bar.

Do not make First Read a mini overview again. The prior version failed because it duplicated the header. The user feedback is clear: polished prose is not enough.

Do not move trust into copy. "Still checking" language is useful only when tied to real events, sources, and missing fields.

Do not run deep search, Exa Agent, or synthesis before first read. That inverts the latency shape and turns the early payoff into the same wait problem.

## Open questions

- Is `cacheStatus: "hit"` on a seed-stored `card.partial` actually happening in production traces, or does some route-level logic mask it before the extension sees the card?
- Should the early artifact be a stored partial card, a separate run artifact, or an extension-only receipt built from events plus source summaries?
- Can `source.found` include enough source detail for a useful immediate receipt without fetching a card?
- Does `recordSourcesForCard` make source summaries available quickly enough to build the evidence ledger before full extraction?
- How many recent normal runs skip `upsert-seed-card` because the seed fails `hasUsablePublicProfile`?
- If seed `signals[]` are added, do they belong in public card JSON immediately or only as a First Read artifact until full extraction verifies them?
- Is `publishedAt` threading worth the schema churn, or is a source-title proof without date enough for the first measurement pass?
- Should the filed receipt appear only after `card.saved`/`card.enriched`, rather than any `cacheStatus: "hit"`?

## Exact next spec to write if we proceed

Write `docs/superpowers/specs/2026-06-23-first-read-artifact-contract.md`.

The spec should be short and mechanical:

- Define the early artifact states: `source receipt`, `first read pending`, `first read filed`, and `full profile ready`.
- Define the data contract for each state: required event, required card/source fields, citation requirements, and explicit hide conditions.
- Decide whether `card.partial` may store a basics card that does not pass `hasUsablePublicProfile`, or whether First Read should use a separate extension-only artifact.
- Decide how to represent cache/filed status so a `card.partial` fetch cannot be treated as filed only because the merged card is `hit`.
- Move proof classification toward server-owned structure: `headlineFromCitations`, optional `publishedAt`, and seed `signals[]` if the schema touch is contained.
- Add acceptance tests for event ordering, cache status, substance gating, and source receipt fallback.
- Include the 12-domain measurement table as the launch gate before any provider lane is reconsidered.
