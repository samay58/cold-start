# First Read Fast Payoff Design

Status: frontend rebuild shipped (Evidence Receipt model); provider lane built then removed after adversarial review (dead-on-arrival)
Date: 2026-06-21
Related teardown: `docs/qa/exa-sidebar-demo-teardown.md`
Related shipped work: `409c85b` artifact-led research progress

> The draft below is the original design thinking. The First Read that shipped diverged
> from it in one important way: the product sentence was dropped and the module became a
> source-backed Evidence Receipt rather than a product/buyer restatement. See
> [Shipped (2026-06-21)](#shipped-2026-06-21-evidence-receipt-rebuild) and
> [Speed vs quality: the provider lane decision](#speed-vs-quality-the-provider-lane-decision)
> at the end of this file for the current truth.

## Purpose

Cold Start will not beat legacy company-intel products if the first useful payoff takes close to a minute. A busy investor will close the side panel before the product gets to its best work.

This spec changes the first payoff from a late completion checkpoint into an early, source-backed read. The goal is simple: within roughly 10 to 15 seconds on a normal cold run, the user should understand what the company does, who it serves when that is source-backed, what evidence has arrived, and what Cold Start is still checking.

The product should feel faster because it is faster, not because the loading state is better dressed.

## Current Problem

The demo showed a strong workbench, but the first value moment arrived too late. The user saw research progress, then a quiet `Starter profile ready` checkpoint, then a stack of possible cards. The product asked the user to choose a next card before it clearly paid them back for waiting.

The existing code already has a seed-card path:

- `apps/web/src/inngest/functions.ts` builds and stores a `seed-profile-card`.
- The run emits `card.partial` with the copy `Saved first usable company card`.
- The trace records `seedCardMs` and `firstUsableCardMs`.
- The extension polling code can fetch an interim card when a card-ready event appears.

The issue is product staging. We have an early artifact, but the side panel does not make it feel like the first useful read.

## Design Position

The first payoff should be a `First Read`, not a full card, memo, or thesis.

It should say:

```text
What it does
[one useful sentence]

Who it seems for
[one useful sentence, or "not proven yet"]

Evidence so far
[company site] [funding coverage] [news] [people source]

Still checking
[the one most important missing proof point]
```

This is intentionally modest. It gives the user a useful read without pretending the product has finished diligence. The first screen should not use VC-flavored overclaiming. It should feel like a careful analyst saying, "Here is what I can say already, and here is what I am still verifying."

## Approaches Considered

### Better Late Payoff

Improve the `Starter profile ready` moment after the full basics card finishes.

Tradeoff: this would make the late checkpoint more useful, but it does not solve the core problem. Users can still leave before the payoff arrives.

Decision: reject as the primary fix. Keep any useful copy ideas for the full-profile transition.

### First Read From The Existing Seed Card

Use the existing `card.partial` seed-card path as the first visible product payoff. Render a compact `First Read` when the extension sees `card.partial` and can fetch the seed card.

Tradeoff: this depends on the current seed-card timing. It may not hit the target for all companies, but it is the fastest reliable path because the backend already stores and emits the artifact.

Decision: recommended first implementation.

### Dedicated First-Read Provider Lane

Add a new provider step before the normal source batch finishes. Use Exa `instant` and `fast` calls with highlights, plus cached homepage contents when available.

Tradeoff: this gives us the strongest timing control, but it adds provider code, cost tracking, and a new quality gate. It should be justified by timing evidence, not added because it sounds faster.

Decision: second implementation only if the seed-card path misses timing.

### Deep Search Or Exa Agent First

Use Exa `deep`, `deep-reasoning`, or Exa Agent to produce a stronger first answer.

Tradeoff: better synthesis, worse first-payoff timing. This moves the product toward the exact wait we are trying to escape.

Decision: reject for first payoff. Consider for later research cards.

## Recommended Path

Ship a two-lane generation experience.

### Fast Lane: First Read

The fast lane is the first-payoff path. It uses the earliest reliable evidence and renders before full basics extraction or enrichment is complete.

Inputs:

- Existing cached card if available.
- `card.partial` seed card from `buildSeedProfileCard`.
- Direct Exa `instant` company/category search for product and identity.
- Direct Exa `fast` news or funding search when it returns within the first source batch.
- Exa `/contents` for the company homepage only when cached or fast enough.

Output:

- A compact `First Read` module pinned under the company header.
- The first useful `Product` sentence.
- A provisional `Who it seems for` sentence only when grounded in the seed card description fields.
- Evidence marks using the existing catalogue language.
- A clear missing-proof line.

Timing target:

- Show shell immediately.
- Show the first source/evidence mark as soon as events arrive.
- Show `First Read` when `card.partial` becomes fetchable.
- Do not wait for contact enrichment, comparables, full analysis, or all public-profile fields.

### Deep Lane: Full Research

The deep lane keeps the current richer work:

- Full card extraction.
- Contact enrichment.
- Research sections.
- Synthesis and verifier.
- Evidence-weight improvements.
- Later product cards such as `Timing`, `Proof`, and `The case`.

This lane can take longer. The user will tolerate it after the first read has earned trust.

## Provider Strategy

Use provider speed tiers deliberately.

Exa's current docs describe `instant` at roughly 250 ms, `fast` at roughly 450 ms, `auto` around 1 second, `deep-lite` around 4 seconds, `deep` around 4 to 15 seconds, and `deep-reasoning` around 12 to 40 seconds. They also describe `outputSchema` on `/search`, `/answer` with citations, and Exa Agent for async deep research and enrichment workflows. Sources:

- [Exa Search API guide](https://exa.ai/docs/reference/search-api-guide)
- [Exa Search reference](https://exa.ai/docs/reference/search)
- [Exa Answer reference](https://exa.ai/docs/reference/answer)
- [Exa Agent guide](https://exa.ai/docs/reference/agent-api-guide)
- [Exa Contents reference](https://exa.ai/docs/reference/get-contents)
- [Exa content freshness](https://exa.ai/docs/reference/livecrawling-contents)

Recommendation:

- Use `instant` and `fast` for the first-payoff lane.
- Use `highlights` rather than full text for first-read extraction.
- Prefer cached content freshness for the homepage, with a short timeout if live content is needed.
- Avoid Exa Agent for first payoff. It is the wrong shape for a 10-second promise because it is async and high-compute by design.
- Consider Exa `deep-lite`, `deep`, or Exa Agent later for specific research cards where deeper web reasoning is worth the wait.
- Do not add another provider unless it beats Exa on either first-read latency or company-specific structured evidence in testing.

This keeps the first screen fast and lets the deeper lane become smarter over time.

## UX Shape

### Placement

The `First Read` sits directly under the pinned company header and above the research stack. It replaces the emotional role currently played by `Starter profile ready`.

The order should be:

```text
Company header
First Read
Research in progress receipt
Research stack
```

Before full basics finish, `First Read` stays expanded and pinned. It is the first useful product surface.

After `card.saved` or `card.enriched`, the temporary `First Read` is absorbed into the company context. The product meaning is: the quick read did its job, and the stronger profile is now ready.

The end state is a compact receipt inside the company context:

```text
First read filed
Product / buyer / 12 sources
```

The full company profile and research stack then own the surface. `First Read` should not remain as another large card competing with the company summary.

### Copy

Use plain, careful language.

Good:

```text
First read
Exa builds search and research infrastructure for AI products.

Who it seems for
Likely AI product teams and developers. Customer proof is still being checked.
```

Avoid:

```text
AI-native research infrastructure platform powering the next generation of agentic workflows.
```

The first version is useful. The second version sounds generated and hides uncertainty.

### Evidence

The module should show source categories, not a raw count alone:

```text
Evidence so far
company site / funding coverage / news
```

If the product has not found buyer proof yet, it should say so:

```text
Still checking
Named customers and budget owner.
```

Absence is a product signal. Do not hide it behind progress copy.

### Motion

The first read should arrive like a filed slip, not a modal or toast.

Motion rules:

- The shell appears immediately with a quiet placeholder.
- Evidence marks replace one another in place as sources arrive.
- The first read crossfades into the placeholder when `card.partial` is fetched.
- Use one short stagger: headline, product line, buyer line, evidence marks.
- No bounce, no confetti, no dramatic progress rings.

This should feel like the panel becoming useful, not like the app celebrating itself.

### Absorption Motion

The temporary first read should have one signature exit when the stronger profile is ready.

Intent:

- Teach that the quick read was not discarded. It was filed into the canonical company record.
- Clear space for the full profile and research stack.
- Give the product one memorable, high-craft transition without making the side panel feel like a toy.

Motion shape:

- The `First Read` card confirms readiness with a subtle seal-hairline pass.
- The card compresses into a narrow receipt strip.
- The strip travels upward toward the company header, scaling slightly as it moves.
- The company logo or call-number area briefly behaves like the filing slot.
- The receipt settles into the header as `First read filed`.

Timing:

- Total motion should land around 450 to 650 ms.
- Compression and travel should use transform and opacity, not layout-heavy animation.
- The exit should be interruptible if new data arrives or the user interacts.
- Reduced motion should use a short crossfade from expanded card to compact receipt.

Taste guardrails:

- Do not make the logo glow, pulse, or swallow the card literally.
- Do not use bounce, elastic easing, particles, confetti, or portal effects.
- Do not hide useful content before the full profile is actually ready.
- The metaphor is filed into the record, not magic AI absorption.

## Product Rules

### What Can Appear In First Read

Allowed:

- Company name, domain, and website.
- One product sentence from `identity.description.shortDescription`, `oneLiner`, `concept`, or `mechanism`.
- One buyer sentence from `identity.description.serves` when cited or source-backed.
- Source categories from accepted sources.
- A missing-proof line derived from absent fields or low-confidence facts.

Not allowed:

- Bull case.
- Bear case.
- Investment recommendation.
- Uncited customer claims.
- Valuation claims unless directly supported by an accepted source.
- Anything that reads like full synthesis.

### Confidence Language

Use bounded wording:

- `What it does`
- `Who it seems for`
- `Still checking`
- `Not found yet`
- `Source-backed`

Avoid hedge soup:

- `may be`
- `appears to`
- `likely positioned as`
- `emerging leader`
- `AI-native platform`

The UI can be honest without sounding unsure.

## Data Flow

The first implementation should reuse the existing seed-card path before adding new provider machinery.

Flow:

```text
User starts basics
  -> generation event stream begins
  -> direct Exa and StableEnrich fast sources run
  -> seed profile card is built
  -> backend stores seed card
  -> backend emits card.partial
  -> extension sees card.partial
  -> extension fetches card
  -> extension renders First Read
  -> backend continues full basics extraction and enrichment
  -> extension upgrades full profile when card.saved or card.enriched arrives
```

New frontend helper:

```text
firstReadForCard(card, sources, events)
```

It returns:

```text
{
  productLine,
  buyerLine,
  evidenceCategories,
  missingProofLine,
  status
}
```

The helper should be deterministic. It should not call an LLM.

New backend work should be optional in the first pass. If timing tests show the existing seed card is still too slow, add a true `first-read` provider step before `fetchInitialSourcesForGeneration` completes.

## Provider Expansion Option

If the existing seed-card path cannot reliably hit the timing target, add a dedicated first-read provider step.

Candidate request set:

- Exa `/search` with `type: "instant"`, `category: "company"`, `numResults: 3`, `contents.highlights`.
- Exa `/search` with `type: "fast"`, query focused on buyer/use case, `numResults: 3`, `contents.highlights`.
- Exa `/contents` for `https://{domain}` with cached-first freshness and short timeout.
- Optional Exa `/answer` with `outputSchema` only if structured first-read quality beats deterministic extraction in tests.

Do not use:

- Exa Agent for first read.
- `deep` or `deep-reasoning` before the first payoff.
- livecrawl with long timeout before the first payoff.

The first read should be cheap, bounded, and cancellable.

## Visual Direction

The module should feel native to the Catalogue Card system.

Domain concepts:

- filed slip
- source receipt
- catalogue card
- evidence marks
- first read
- proof gap

Color world:

- parchment paper
- manila folder
- dusty-lilac seal
- green verified mark
- reported blue mark
- company amber mark

Signature:

The signature element is a compact `First Read` receipt with a seal hairline and source-category marks. It should look like the first filed slip in the company's folder.

Defaults to avoid:

- A generic loading skeleton.
- A dashboard stat card.
- A chat answer bubble.
- A big AI summary panel.
- Green success banners.
- Purple gradient progress blocks.

## Success Criteria

Behavioral:

- A cold run can show a meaningful first read before full basics completion.
- The user can understand the company without opening the research stack.
- The user can see what remains unproven.
- The research stack becomes a next-step surface after value has arrived, not the first payoff itself.

Timing:

- Record `firstReadVisibleMs` in extension performance marks.
- Compare it to `seedCardMs` and `firstUsableCardMs`.
- Target p50 under 10 seconds and p95 under 15 seconds for companies where direct Exa returns accepted sources.
- If this misses, provider strategy must be revisited before polishing the UI.

Quality:

- No uncited claims appear in the first read.
- Missing buyer or proof evidence is named plainly.
- The first read never uses synthesis-only fields.
- The full profile can replace or enrich the first read without layout jank.

## Testing Plan

Unit tests:

- `firstReadForCard` chooses the best product line from structured description fields.
- It only shows buyer copy when `serves` has usable value and citations.
- It falls back to `not proven yet` when buyer evidence is missing.
- It maps source categories into stable evidence marks.
- It does not output empty strings or marketing filler.

Extension tests:

- A mocked `card.partial` event causes the side panel to fetch and render `First Read`.
- `First Read` appears before full completion when `waitForRunCompletion` is false.
- The module collapses or upgrades when `card.saved` arrives.
- The absorption motion leaves behind a compact `First read filed` receipt in the company context.
- The research stack stays below `First Read` while basics are running, so the user is not asked to choose a card before receiving value.
- Reduced motion keeps the state legible.

Backend tests:

- Existing seed-card trace continues to write `seedCardMs` and `firstUsableCardMs`.
- If a dedicated first-read provider step is added, it records cost, latency, and source categories separately.
- Failed first-read provider calls do not fail the full basics run.

Manual QA:

- Run Exa, Toma, Convey, and one obscure startup.
- Capture time to first visible read.
- Confirm the copy is useful in the first viewport.
- Confirm the user is not asked to choose a research card before receiving value.

## Risks

### Risk: Fast but Thin

The first read could become a weak one-liner with a fancy wrapper.

Guardrail: it must include product line, buyer or missing-buyer line, evidence marks, and still-checking line.

### Risk: Faster Slop

The product could show generic AI phrasing earlier.

Guardrail: deterministic helper first. LLM only if evals prove better quality and latency.

### Risk: Duplicate Surfaces

The side panel could end up with company summary, first read, progress receipt, and research stack all saying similar things.

Guardrail: `First Read` owns early understanding. Progress owns work evidence. Research stack owns next actions.

### Risk: Provider Creep

Adding Exa Agent or deep search too early could make the first payoff slower.

Guardrail: deep provider calls are forbidden before first read unless an explicit timing test proves otherwise.

## Recommendation

Implement this in two steps.

First, ship the frontend and polling change that makes the existing `card.partial` seed card visible as `First Read`. This is the lowest-risk path because the backend already emits the right event and stores a seed card.

Second, run timing QA. If `card.partial` is not consistently early enough, add a dedicated first-read provider step using Exa `instant` and `fast` search with highlights. Do not jump to Exa Agent for the first payoff.

This is the highest-quality path because it improves the product promise without muddying the trust model. The user gets value sooner, the app stays honest, and the deeper research system remains intact.

## Shipped (2026-06-21): Evidence Receipt rebuild

The first version of First Read was rebuilt because it failed its own promise. It repeated the company overview and read as low-craft.

### Why the first version failed

The company header summary and the First Read product line both drew from `identity.description.shortDescription`/`oneLiner` in the same priority order, so the "Product" line was usually the exact sentence sitting right above it. The only genuinely new line was `serves`, and the evidence was rendered as generic category names ("company site", "news") rather than the sources actually pulled. The card also carried a left border ribbon and uppercase tracked labels, both on the project's anti-slop list.

### What shipped instead

First Read is now a source-backed Evidence Receipt: the delta over the overview, never a restatement of it.

```text
First read                          Still filing
Who it's for
[buyer read, source-backed, never the summary sentence]

Filed so far                        1 of 5 independent
techcrunch.com                      independent
docs.exa.ai                         docs
exa.ai                              company
github.com                          code
+1 more filed

Not yet proven
[the most important named gap]
```

Content model (`firstReadForCard`, deterministic, no LLM):

- `read` plus `readKind`/`readLabel`: one grounded line chosen by priority and guarded against the summary. Buyer (`serves`, when cited and not filler) first, then the freshest dated signal headline as proof, then an evidence posture line ("3 sources filed, 1 independent"). `isNearDuplicate` demotes any candidate that echoes the company summary.
- `evidence`: the real sources as a small ledger. Each entry is a domain plus a classification mark (`independent`, `company`, `docs`, `code`, `filing`, `database`, `reported`), deduped to its strongest mark per domain, ranked independent then company then reported, capped at four with a "+N more filed" overflow.
- `independentCount` and `sourceCount`: the trust signal shown as "M of N independent".
- `gap`: derived from real card state. No buyer proof gives "Who it's for and who pays"; no funding gives "Funding terms and backers"; otherwise "Named customers and budget owner".

Safeguards added: the product sentence is forbidden; the dedup guard blocks summary echoes; the filler and boilerplate guards are kept; empty output degrades to an honest "Filing the first sources" rather than blank chips.

Visual: the left ribbon is gone, replaced by a single seal hairline and a status dot. Prose labels are sentence case in the seal color. The At Textual face is used only for the small classification marks, which is its sanctioned role. Class dots reuse the existing signal palette (`--color-verified` for independent, `--color-company` for company, `--color-reported` for the rest).

Files: `apps/extension/src/first-read.ts`, the `FirstReadSlip` and `FirstReadFiledReceipt` components in `apps/extension/src/ResearchLayerPanel.tsx`, the `.cs-first-read*` rules in `apps/extension/src/styles.css`, and the tests in `apps/extension/tests/first-read.test.ts` and `apps/extension/tests/research-layer-panel.test.tsx`.

### Visual inspection (2026-06-21)

The three states (pending with buyer read, pending with buyer unproven, filed receipt) were rendered through the real panel with real fonts at side-panel width and inspected with Reduce Motion off. One correctness fix came out of it: the filed receipt no longer shows an independent count, because its total comes from the saved run while the count came from the live source array, and the two sets can disagree. The independent count stays in the live slip, where both numbers come from the same source set.

## Speed vs quality: the provider lane decision

A natural assumption is that adding the Exa `instant`/`fast` lane is how First Read gets "better results". That is only half right, and the distinction matters.

The instant/fast lane buys **speed to first read, not a better read.** It is the fastest Exa tier and its job is to put grounded evidence on screen inside the 10 to 15 second promise. A pure instant/fast result is thinner than the seed card we already build, not deeper. Depth and accuracy are the deep lane's job: full extraction, more sources, `deep`/`deep-reasoning` search, the verifier, and synthesis. Asking the fast lane for better answers is asking the wrong tier.

For the First Read specifically, the lane helps in exactly one way: it gets more named sources, and a funding or launch headline, into the evidence ledger and the proof line **sooner**. The shipped read is deterministic, so it does not get smarter from a faster provider. It gets earlier and fuller. That is a real win for the early-payoff promise, but it is a latency win, not a quality win.

### The decision gate

Adding a paid provider step before the source batch finishes is the exact "provider creep" risk this spec warns about, and it bills real Exa and AgentCash spend per run. So the order is measure, then build.

1. Measure the existing seed-card path. The extension already emits `cold-start-first-read-visible-ms` and the trace records `seedCardMs` and `firstUsableCardMs`. Compare `firstReadVisibleMs` against the p50 under 10s and p95 under 15s targets across Exa, Toma, Convey, and one obscure startup.
2. If the seed card already lands inside target, the instant/fast lane adds cost without moving the promise. Do not build it.
3. If it misses, add the dedicated first-read lane from the "Provider Expansion Option" section above, flag-gated and off in production until QA confirms it beats the seed card on first-read latency without thinning the evidence.

The guardrail holds: deep providers stay forbidden before first read, and no new provider ships unless a timing test proves it earns its cost.

### Resolution (2026-06-22): lane built, then removed

The flag-gated lane was built (`FIRST_READ_LANE_ENABLED`, a bounded Exa instant/fast fetch, a separate trace milestone, and an early seed-card store). An adversarial review then found it dead-on-arrival: `buildSeedProfileCard` writes a single citation, so the lane card never cleared the `substantive` bar and First Read stayed hidden during the lane phase. It was off by default, unproven, and carried byte-for-byte provider duplication plus a dead source-write step.

It was removed in full rather than patched. The user-visible First Read renders off the normal seed card and is unaffected. If the seed card is later shown to miss the timing target, rebuild the lane from the "Provider Expansion Option" section, but route its stored card through `sectionsWithSourceCitations` so it actually carries the evidence trail.
