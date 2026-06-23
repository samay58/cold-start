# First Read artifact contract

Date: 2026-06-23
Status: proposed
Scope: product and technical spec, not an implementation plan

## Recommendation

Keep the first-payoff job, but stop treating First Read as a mini-card inferred from partial card fragments. Cold Start should have an explicit `firstPayoff` artifact owned by the backend and rendered by the extension. The visible experience should be two-stage: show an Evidence Receipt as soon as real source progress exists, then upgrade to First Read only when a concrete cited claim clears strict gates. Do not add a provider lane yet. Do not weaken `hasUsablePublicProfile`. Measure the current seed path first, then implement this contract behind a flag.

## Product Job

First Read exists to earn the user's next 45 seconds. It should tell a busy investor that Cold Start has reached the right company, found real evidence, and can already say one useful thing without pretending the full profile is done.

The first payoff has three valid outcomes:

- `receipt`: useful source-backed progress, but no claim yet.
- `substantive_first_read`: one incremental cited read plus evidence and the next missing proof.
- `withheld`: the system should not show First Read because the artifact is too thin, too duplicative, or not entity-safe.

Withholding First Read is a high-trust outcome. A weak read is worse than a receipt.

## Non-Goals

- Do not create a second company overview.
- Do not stream uncited prose.
- Do not show investor synthesis, bull/bear, timing, or recommendation language.
- Do not add a paid fast provider lane until measurement proves the normal source path misses the target for source timing.
- Do not lower the full public-card quality gate.
- Do not keep First Read as a large permanent block after the full card arrives.

## Design Principle

The UI should feel like a clean research desk, not a loading toy.

The side panel should open immediately, show that Cold Start is working with real sources, and then either produce a small cited read or stay honest about what is missing. Motion should clarify the state handoff. It should not entertain. The receipt and First Read should use the Catalogue Card language: warm plate surface, small source marks, precise copy, sentence-case labels, and quiet filing behavior.

## User-Visible States

```ts
type FirstPayoffStatus =
  | "shell"
  | "receipt"
  | "substantive_first_read"
  | "withheld"
  | "full_card_ready";
```

| State | When it appears | User meaning | Primary UI |
|---|---|---|---|
| `shell` | Side panel has the domain but no source event yet. | Cold Start is attached to this tab. | Company/domain shell and calm reading copy. |
| `receipt` | First real source/crawl event arrives. | Sources are being checked. No insight claim yet. | Evidence Receipt with source classes and still-checking line. |
| `substantive_first_read` | A cited, incremental claim passes gates. | Cold Start can safely say one useful thing now. | Compact First Read slip. |
| `withheld` | Source progress exists but no claim passes gates. | The system is intentionally not showing weak prose. | Keep Evidence Receipt. Optionally expose suppression reason in debug/trace only. |
| `full_card_ready` | Full basics profile is usable. | The final card replaces the temporary first-payoff surface. | Receipt collapses into source trail or filed stamp. |

## Ideal UX Sequence

At click:

```text
Cold Start
Reading acme.example...
```

After first source event:

```text
Evidence arriving
Reached company site. Checking funding, news, and people sources.

Company site / External coverage pending / People pending
```

After a claim clears gates:

```text
First Read
Acme's site describes software for automating invoice review for finance teams.

Evidence so far
Company site / Careers page

Still checking
Independent funding or customer proof.
```

After full basics:

```text
Sources checked: company site, funding coverage, people source, news.
```

The final card takes over. First Read should not compete with the final overview.

## Backend Artifact

Create a backend-owned first-payoff artifact. The frontend should not infer product meaning from `cacheStatus`, partial card fields, source titles, or `card.partial` alone.

```ts
type FirstPayoff = {
  status: "receipt" | "substantive_first_read" | "withheld";
  slug: string;
  domain: string;
  generatedAt: string;
  generatedAtMs: number;
  sourceEventId?: string;
  cardEventId?: string;
  entityConfidence: "high" | "medium" | "needs_check";
  entityConfidenceReason: string;
  evidenceSoFar: FirstPayoffEvidence[];
  stillChecking: FirstPayoffMissingProof;
  whatItDoes?: FirstPayoffClaim;
  whoItSeemsFor?: FirstPayoffClaim;
  proofHeadline?: FirstPayoffClaim;
  suppressionReasons: FirstPayoffSuppressionReason[];
};

type FirstPayoffEvidence = {
  sourceId: string;
  citationId?: string;
  url: string;
  domain: string;
  title: string;
  sourceClass: "company_site" | "docs" | "funding" | "news" | "people" | "registry" | "jobs" | "customer_proof" | "database" | "other";
  quality: "company" | "reported" | "independent" | "source_of_record";
  arrivedAtMs: number;
  entityMatched: boolean;
};

type FirstPayoffClaim = {
  text: string;
  supportingText: string;
  sourceIds: string[];
  citationIds: string[];
  sourceClass: FirstPayoffEvidence["sourceClass"];
  claimKind: "what_it_does" | "who_it_serves" | "proof_headline";
};

type FirstPayoffMissingProof = {
  text: string;
  missingEvidenceClass: "entity" | "funding" | "customer_proof" | "people" | "registry" | "recent_news" | "external_coverage";
};

type FirstPayoffSuppressionReason =
  | "no_sources"
  | "entity_needs_check"
  | "no_incremental_claim"
  | "duplicate_of_header"
  | "claim_missing_citation"
  | "claim_not_source_supported"
  | "wrong_or_ambiguous_entity"
  | "marketing_filler"
  | "investment_language"
  | "too_long"
  | "insufficient_evidence";
```

### Artifact Ownership

`firstPayoff` should be produced in `apps/web/src/inngest/functions.ts` near the existing source and seed-card stages.

The artifact should be written to both places:

- research run event metadata, so the extension can render it during active polling;
- `generation_runs.trace_json`, so QA can inspect it after the run.

Preferred event types are `first_payoff.receipt`, `first_payoff.ready`, and `first_payoff.withheld`. If adding event types is too invasive for the first implementation, existing events can carry typed `firstPayoff` metadata, but the artifact still needs one parser and one shape.

The extension should render `firstPayoff` directly when present. It should not reconstruct this object from source summaries and card fragments.

### Storage Boundary

Do not weaken `hasUsablePublicProfile`.

The full card gate remains responsible for deciding whether a public basics card can be shown, cached, and used for analysis. `firstPayoff` is an extension-side early artifact. It can exist before the full card is usable because it carries its own narrower claim gates and source IDs.

`card.partial` can continue to exist for card snapshots, but First Read should not depend on `card.partial` alone. A partial card can support the first-payoff artifact, but it is not the artifact.

## Claim Selection

Choose at most one primary read.

Priority:

1. `whoItSeemsFor`, only when a source explicitly names user, buyer, customer, team, or use case.
2. `whatItDoes`, when company-site or matched source text clearly says the product/action.
3. `proofHeadline`, when a matched source supports a funding, launch, customer, partnership, filing, or product proof event.
4. No claim. Stay as receipt.

Why this order: a useful buyer/use-case line is the highest-value early read for an investor. A clear product line is next. A proof headline is useful, but can become newsy and brittle if it overpowers what the company actually does.

## Claim Gates

A claim can display only when every gate passes:

- It has at least one `sourceId`.
- It carries `supportingText` copied from the source text or source snippet.
- It has at least one `citationId` when the cited seed/full card exists.
- If the claim is produced before a citation exists, it may temporarily use `sourceIds` plus `supportingText`, but it must be reconciled to citation IDs before the full-card filed state.
- Every supporting source is entity-matched.
- The text is source-supported, not inferred from a title alone.
- The text is not merely the company name, page title, tagline, or header summary.
- The text is not a near duplicate of the visible company header or overview.
- The text is under 220 characters.
- The text does not use investment language such as "attractive," "compelling," "could matter," "bull case," "risk," or "winner."
- The text does not use marketing filler such as "AI-native," "agentic," "next-generation," "transforming," "revolutionizing," "all-in-one," or "end-to-end" unless quoted as source text and still judged useful.
- The text does not assert funding, customers, headcount, regulated status, medical claims, or public-company status without explicit source support.

One wrong-entity claim, uncited claim, or investment-sounding claim fails the release candidate.

## Entity Confidence

Entity confidence should be explicit because wrong-company errors are fatal.

| Confidence | Requirement | UI behavior |
|---|---|---|
| `high` | Current domain, official site, and source text agree on company identity. | Receipt or First Read can show normally. |
| `medium` | Current domain is clear, but external source matching is thin or source titles are noisy. | Receipt can show. First Read can show only if the claim comes from official/company-controlled source text. |
| `needs_check` | Common name, redirects, unclear domain, aggregator mismatch, or source disagreement. | Do not show First Read. Show receipt with entity-check language. |

Entity confidence belongs in the artifact and trace. The UI should not invent this from text matching.

## Evidence Receipt

Evidence Receipt is the default first-payoff surface.

It can show when:

- at least one source or crawl event exists; or
- source fetching fails in a way the user should understand.

It should show:

- one plain status line;
- two to four source classes;
- one still-checking or blocked line.

It should not show:

- a company claim;
- a source count without source classes;
- "researching..." copy with no concrete artifact;
- generic "checking more sources" if the system knows which source class is missing.

### Receipt Copy Examples

Good:

```text
Reached company site. Checking funding, news, and people sources.
```

Good:

```text
Company site and docs found. Still checking independent coverage.
```

Good blocked state:

```text
Company site blocked. Checking external coverage before showing a read.
```

Bad:

```text
Gathering signal from 4 sources.
```

Bad:

```text
Analyzing market relevance.
```

## Missing-Proof Logic

`stillChecking` should be specific and ordered by consequence.

Priority:

1. entity confirmation, if ambiguous;
2. funding or source-of-capital, when relevant to a private company;
3. customer proof;
4. people/team source;
5. registry, filing, or source-of-record for regulated or public-ish companies;
6. recent news or launch evidence;
7. external coverage.

Avoid generic "still checking more sources." The missing line should explain what kind of proof would change the read.

## UI Contract

The side panel should render one compact first-payoff surface.

Rules:

- Show shell immediately.
- Show Evidence Receipt as soon as `firstPayoff.status === "receipt"` or source-event fallback exists.
- Show the First Read label only for `substantive_first_read`.
- For `withheld`, keep receipt visible and do not show the First Read label.
- Collapse the receipt into a source trail or filed stamp when full basics become usable.
- Do not keep First Read above the final overview after `card.saved` or `card.enriched`.
- Respect reduced motion.
- Keep transition under 300 ms, using opacity/transform only.
- Use source chips or small marks, not large tinted cards.
- Do not add another persistent panel section.

### Layout

Target side-panel shape:

```text
Evidence arriving / First Read
[one compact read line, only if substantive]
[source chips or two-column mini ledger]
Still checking: [specific missing proof]
```

Maximum content:

- one title line;
- one read sentence;
- up to four source chips or marks;
- one missing-proof line.

If content does not fit, cut content. Do not expand into a second card.

## Event Model

Recommended events:

| Event | Meaning | Required metadata |
|---|---|---|
| `first_payoff.receipt` | Source progress is real but no claim is ready. | `firstPayoff.status`, evidence, stillChecking, entityConfidence. |
| `first_payoff.ready` | A substantive First Read claim is ready. | Full `firstPayoff` with one primary claim. |
| `first_payoff.withheld` | The system intentionally withheld First Read. | suppressionReasons, evidence, stillChecking. |
| `card.partial` | Existing early card snapshot, if stored. | Existing card metadata plus optional firstPayoff reference. |
| `card.saved` | Full cited basics card saved. | Existing card metadata. |
| `card.enriched` | Late enrichment saved. | Existing card metadata. |

If adding new event types creates too much API surface for the first pass, use existing events with typed `firstPayoff` metadata. The contract still matters.

## Implementation Defaults

Use these defaults unless implementation review uncovers a concrete blocker:

- Store `firstPayoff` in both event metadata and generation trace.
- Allow source IDs plus `supportingText` before a seed citation exists, then reconcile to citation IDs before the full-card filed state.
- Keep `proofHeadline` in `firstPayoff` first. Do not force it into seed `signals[]` unless the schema touch is clean.
- Use `Sources checked` as the final collapsed label. `First read filed` should remain available only if user testing prefers it.
- Land receipt and artifact behind the same feature flag, with `receipt_only` and `first_payoff_artifact` variants for measurement.

## Instrumentation

Add or preserve these measurements:

```text
panel_shell_visible_ms
evidence_receipt_visible_ms
first_read_visible_ms
first_read_suppressed_reason
full_basics_visible_ms
```

Connect them to existing backend trace fields:

```text
seedCardMs
firstUsableCardMs
card.partial
card.saved
card.enriched
```

For every measured run, record:

- time to shell;
- time to first source event;
- time to Evidence Receipt;
- time to substantive First Read, or not shown;
- time to full basics;
- source classes;
- entity confidence;
- primary claim kind;
- suppression reason;
- duplicate score against header/overview;
- citation validity;
- screenshot at first payoff.

## Measurement Gate

Run the 12-company matrix before considering a provider lane.

Company types:

- obvious AI infrastructure;
- obscure AI infrastructure;
- recently funded startup;
- seed-stage startup;
- bad website;
- no funding data;
- noisy/common-name company;
- healthcare or regulated company;
- consumer company;
- old private company;
- public-ish company;
- broken-source case.

Decision rules:

- Keep and improve First Read if at least 9 of 12 company types produce a substantive, cited, incremental First Read by 15 seconds with zero wrong-entity or uncited claims.
- Keep Evidence Receipt but change First Read if receipt timing is good and substantive First Read appears in fewer than 9 of 12 cases.
- Roll back the named First Read module if it duplicates the overview in more than 25 percent of cases or reviewers mark it non-useful in more than 4 of 12 cases.
- Consider a fast provider preflight only if source timing, not UI state or seed extraction, is the measured blocker.
- Invest in seed-card structure if sources arrive quickly but `whatItDoes`, `whoItSeemsFor`, `signals`, or buyer/use-case fields arrive late.

Target:

- Evidence Receipt visible by p75 <= 5 seconds.
- Substantive First Read visible by p75 <= 12 seconds and p90 <= 15 seconds on normal cold runs where sources return.
- Full basics can arrive later. The first payoff should make that wait feel earned.

## Provider-Lane Gate

Do not add a dedicated provider preflight in the first implementation of this spec.

Reconsider only if measurement shows:

- the shell and receipt are fast;
- normal source fetch cannot produce external evidence inside the target;
- one provider reliably returns a cited, entity-matched, incremental proof point within 10 to 15 seconds;
- the provider path writes a rich enough `firstPayoff` artifact, not a one-citation card that fails the substance gate;
- added cost is measured and acceptable.

If rebuilt, the provider lane must route through the same `firstPayoff` contract. It should not have its own mini-pipeline semantics.

## Rollout

Flag the work.

Variants:

- `baseline`: current behavior.
- `receipt_only`: Evidence Receipt appears from source events, no First Read upgrade.
- `first_payoff_artifact`: Evidence Receipt plus backend-owned substantive First Read.

Ship only if `first_payoff_artifact` beats `receipt_only` on reviewer usefulness without trust failures.

## Tests And Review

Unit and component tests:

- Receipt renders for `firstPayoff.status === "receipt"`.
- First Read renders only for `substantive_first_read`.
- `withheld` keeps receipt visible and hides the First Read label.
- A `cacheStatus: "hit"` card fetched after `card.partial` does not by itself mark the first-payoff artifact filed.
- First Read collapses after full basics are ready.
- Duplicate header/overview claim is suppressed.
- Claim without citation IDs is suppressed.
- Wrong-entity headline is suppressed.
- Reduced-motion path stays legible.

Backend tests:

- `firstPayoff` artifact is produced from source events without requiring `hasUsablePublicProfile`.
- The full public-card gate remains unchanged.
- Suppression reasons are recorded when no claim passes gates.
- Seed-card proof, if added, carries source IDs and citation IDs.
- Existing `seedCardMs` and `firstUsableCardMs` semantics are preserved.

Manual QA:

- Run the 12-company matrix.
- Save trace JSON, firstPayoff JSON, final card JSON, source list, first-payoff screenshot, final-card screenshot, and reviewer labels.
- Confirm no external cited claim is retained without source support.

## Rejected Paths

Reject visual polish as the primary fix. The current issue is artifact semantics and timing, not decorative quality.

Reject always-visible First Read. Availability is not usefulness.

Reject streaming prose. Stream source/status events only.

Reject premature investor synthesis. First payoff is not the gated analysis surface.

Reject provider bloat before measurement. The prior lane was removed for cause.

Reject client-only headline heuristics as the long-term source of truth. A title can help form a receipt, but product claims should come from a backend-owned artifact with source support.

Reject public-card gate weakening. A smaller first-payoff artifact is cleaner than a looser card.

## Acceptance Checklist

- User sees a truthful receipt quickly.
- User sees First Read only when it adds a cited, incremental claim.
- The frontend renders a typed artifact instead of guessing from card fragments.
- The full card quality gate stays intact.
- The surface collapses cleanly when the final basics card arrives.
- Measurement can prove timing, usefulness, duplication, citation validity, and suppression reasons.
- Provider preflight remains out unless measurement earns it.
