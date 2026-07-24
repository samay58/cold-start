# Alpha packaging: the ledgered friend alpha

Date: 2026-07-01
Last verified: 2026-07-23
Status: live ship decision; packaging spine not yet implemented
Owner: Samay

Supersedes the access, invite, and cap decisions in `docs/archive/product/alpha-install-readiness-spec-2026-06-23.md`.

Related:

- `docs/archive/product/unit-economics-trace-analysis-2026-06-23.md`
- `docs/archive/product/contact-enrichment-yield-and-design-2026-07-01.md`
- `docs/archive/plans/2026-06-26-alpha-events-and-invites.md`
- `docs/product/cost-quality-optimization-playbook-2026-06-23.md`

## Decision

Keep the ledgered friend alpha as the target package.

The alpha is free and invite-gated. Fresh profiles and Investor Lens runs have separate server-side allowances. The side panel shows both allowances. Cached reads are free. Failed runs are refunded. Do not build billing.

Use a Chrome Web Store Unlisted item. Do not use a Google Group as the spend gate. Cold Start controls spend at the API.

This decision has not shipped. The current extension uses configured extension IDs plus a shared bearer token. There is no invite identity, allowance ledger, meter, refund path, circuit breaker, invite page, or store item on `main`. Do not describe the current build as a ledgered alpha.

The product changes since July 1 make the recommendation stronger. They reduce duplicate work and make blocked analysis honest. They do not replace the missing packaging spine.

## Current ship state

| Area | State on 2026-07-23 |
|---|---|
| Public facts and gated Lens | Shipped. Public routes strip synthesis, withheld records, emails, and person reads. |
| Profile dispatch | Basics and analysis start inline by default. `GENERATION_DISPATCH=inngest` is the rollback. Section and enrichment jobs still use Inngest. |
| Lens evidence gate | Shipped. Analysis needs an investor-usable profile, then at least 8 citations and one non-enrichment source type. Source diversity, funding evidence, and named team are advisories. |
| Withheld result | Shipped. A blocked or verifier-empty run files a visible withheld receipt. |
| Free withheld re-click | Shipped. Unchanged evidence is compared by content, not timestamps. A standing verdict returns without a paid rerun. `forceRefresh` starts fresh work. |
| Analysis refresh | Production uses `skip-fresh` as of July 22. The code fallback remains `full`. |
| LLM routing | Shipped. Extraction, synthesis, verification, research sections, and person reads can route independently. |
| Contact enrichment | Runs asynchronously after basics. GitHub is first. A default-on StableEnrich pattern fallback may spend up to $0.01 when GitHub misses. Websets and wider paid discovery require an explicit `deepFind` request. |
| Contact-on-Lens package | Not shipped. No production caller requests `deepFind`, and contacts are not attached to the first Lens run. |
| Invite identity and allowances | Not implemented. |
| Allowance meter and refunds | Not implemented. |
| Invite page | Not implemented. There is no `/alpha` route or connect handoff. |
| Chrome Web Store package | Not shipped. The documented install path is still unpacked. |
| Privacy disclosure | Shipped at `/privacy`. The side panel still does not state the public-card behavior before the first run. |

## Product truth

Every alpha surface must say four things plainly.

- Running Cold Start creates or updates a public sourced card at `/c/{slug}`.
- The public card shows facts and sources. It never shows the tester, contacts, person reads, or Investor Lens synthesis.
- Fresh generation costs money. Opening a cached card does not.
- Company domains and public evidence are sent to retrieval and LLM providers. The tester's identity is not.

Basics and Investor Lens are separate product moments. Basics builds the sourced profile. Lens adds the case, timing, and next question. Their allowances stay separate.

## Current operating evidence

These numbers were pulled read-only on July 23.

| Measure | Current observation |
|---|---|
| First usable, last 14 days | n=25 basics runs. p50 40.2s, p90 1m24s, p95 3m55s. Seed pass 4%. |
| First-usable compute | Fetch p50 7.5s. Generate-card p50 24.0s on seed misses. |
| First-usable overhead | p50 8.0s, p90 44.8s. The 14-day sample mixes dispatch eras, so do not attribute all overhead to today's inline path. |
| Analysis, last 30 days | n=49 complete runs after excluding 2 repair artifacts. Combined p50 1m36s, p90 2m21s. |
| Full-refresh analysis | n=44. p50 1m39s, p90 2m21s. |
| Skip-fresh analysis | n=5. p50 56.1s, p90 1m08s. This cohort is small but directionally better. |
| AgentCash Base balance | $2.0544. The script estimates 6 runs at $0.30 each. Top up before the invite wave. |
| Last 24 hours | 13 production runs: 12 complete, 1 failed. |
| Traced LLM spend, last 24 hours | $0.3736 across 12 runs, or $0.0311 per run. The script label still says Anthropic, but the field aggregates routed LLM calls. |
| StableEnrich failures, last 24 hours | 5 Apollo org-search failures and 5 Apollo people-search failures. |

The July 1 cost sample remains historical, not a current COGS claim:

- Fresh basics with contacts: $0.29 median, $0.40 p90-ish, n=12.
- Fresh basics without the Websets line: $0.04 median, $0.11 p90-ish, same sample.
- Analysis: $0.16 median, $0.24 p90-ish, n=11.
- The modeled 12-profile and 6-Lens allowance was $31 for 10 testers when contacts moved to Lens.

Those figures predate per-stage model routing, inline profile dispatch, skip-fresh analysis, and the current contact path. Keep them dated July 1. Recompute COGS before using the $31 ceiling as a budget.

## Assessment

### Strong and shipped

- The public-card and gated-Lens boundary is enforced in code.
- The visible withheld state replaces silent synthesis refusal.
- The free unchanged-evidence path prevents repeated spend on the same withheld verdict.
- Inline profile execution removes the default dispatcher wait. Transient LLM transport errors get one bounded retry. Semantic failures do not retry.
- Skip-fresh analysis avoids repeating source work on fresh investor-usable cards.
- Per-stage model routing gives cost and quality controls without changing the card contract.
- The privacy page names providers, public cards, and work-email provenance.

### Still weak

- There is no per-tester identity or revocation.
- There are no profile or Lens allowances.
- There is no meter, refund ledger, or abuse circuit breaker.
- The public-card consequence is not shown before the first generation.
- There is no Unlisted store item, invite page, or reviewer flow.
- Operator telemetry is run-centric, not tester-centric. Cache reads and per-tester spend are not recorded.
- Contacts are decoupled from Lens. The July 1 contact rationale no longer supports the Lens allowance.

The ledgered-alpha call still stands. The minimum product is the identity and allowance spine. The current shared-token build is suitable for controlled internal use, not the target friend-alpha package.

## Allowance contract

Default policy remains 12 fresh profiles and 6 Lens runs per tester. Treat these as policy choices until the current COGS model is rerun.

- A fresh basics run consumes one profile allowance when work starts.
- A cached basics response consumes nothing.
- A fresh analysis run consumes one Lens allowance.
- A cached synthesis response consumes nothing.
- The first withheld result consumes one Lens allowance because retrieval, synthesis, or verification work ran.
- A re-click on the same withheld evidence consumes nothing.
- A forced evidence refresh consumes one Lens allowance.
- A failed run is refunded after terminal failure.
- A watchdog-retired silent run is a failed run and is refunded.
- Section jobs are uncounted during the alpha.

Meter decisions happen on the server. Client events are observability only.

When an allowance is empty, the API returns a stable machine-readable reason. Existing cards and filed Lens reads remain available.

## Access and identity

Replace the shared token with per-invite access.

- Store invite status, token hash, expiry, profile limit and count, Lens limit and count, and failure counters.
- Exchange the invite token once. Store a per-tester access token in the extension.
- Keep the master token for Samay and CI.
- Enforce allowances in `/api/generate`.
- Let cached reads and status polls bypass the meter.
- Make revocation per tester and immediate.

No API shape change should be made casually. The extension and API contract version must move together if the eventual allowance response changes route shapes.

## Failure policy

Failures get user amnesty and operator accounting.

- Refund the allowance for terminal failure.
- Count the real cost internally.
- Block a domain after 3 consecutive failures.
- Block an invite after 6 failed runs in one day.
- Tell the tester that retrying the blocked domain will not help.

The inline executor already avoids retrying semantic failures. Keep the circuit breaker for repeated user-triggered attempts and provider failures.

## Withheld policy

Withheld is a result, not a failure.

- File the reasons and advisories visibly.
- Charge the first fresh run.
- Return a standing verdict for free while evidence content is unchanged.
- Do not compare timestamps.
- Charge a forced evidence refresh.
- Preserve an existing filed synthesis if a later run is withheld.

## Contact policy

The July 1 call to move contacts to the first Lens run did not ship and no longer matches the product.

Current behavior:

- Basics dispatches contact enrichment asynchronously.
- GitHub public commit emails and domain patterns run first.
- StableEnrich can spend up to $0.01 for a pattern fallback when GitHub has no usable pattern.
- Websets and broader paid contact search require `deepFind: true`.
- No current product control sends `deepFind: true`.

Keep this behavior for the friend alpha. Do not claim that Lens includes contacts. A paid deep-find control is deferred until users ask for it.

## Invite and store path

Use an Unlisted Chrome Web Store item named `Cold Start Alpha`.

The current Chrome manifest requests:

- `sidePanel`
- `activeTab`
- `storage`
- `favicon`
- one configured production API host

The invite page needs three checks:

- Desktop Chrome.
- Extension installed and connected.
- Ready on a company site.

Put diagnostics behind one action. Do not show a setup console by default.

The store listing and invite page must state that running Cold Start saves a public fact card. Reviewer instructions need a working invite with a safe allowance.

## Copy contract

First run:

> Get up to speed
>
> Builds a sourced profile from public sources in about a minute.
>
> Saves a public fact card at cold-start.semitechie.vc. The card shows facts and sources, not who asked.
>
> Alpha allowance: 12 fresh profiles and 6 Investor Lens runs. Opening existing cards is free.

Allowance meter:

> 9 fresh profiles left · 5 Lens runs left

Withheld:

> The evidence did not clear the Lens bar. This run used one Lens allowance. Retry is free until the evidence changes.

Failed:

> Cold Start could not build a reliable result. That one is on us. Failed runs do not count against your allowance.

Exhausted:

> You have used your fresh-profile allowance. Every card you built stays open. Text Samay for more runs.

Store summary:

> Create sourced company context cards from the company site you are viewing.

## Build order

1. Add per-invite identity, profile and Lens counters, refunds, and circuit-breaker fields.
2. Enforce allowances in extension auth and `/api/generate`.
3. Add the quiet two-meter surface and public-card disclosure.
4. Add the invite page and connect handoff.
5. Submit the Unlisted store item with reviewer instructions.

The first two items are the ledgered alpha. Do not let the invite page or store work hide that.

## Deferred

- Billing and Stripe.
- Plans and account management.
- Credit purchases and overages.
- Fractional section credits.
- Paid contact deep-find.
- Public card gallery.
- Bring-your-own keys.

## Data integrity

Verified from code on July 23:

- Inline profile dispatch and the Inngest rollback.
- Floor-plus-advisory synthesis gating.
- Visible withheld records and content-based free re-click.
- `ANALYSIS_SOURCE_REFRESH` behavior.
- Per-stage LLM routing.
- Current contact-enrichment triggers and budgets.
- Shared-token auth and the absence of allowance tables.
- Current Chrome manifest permissions.

Verified from read-only production scripts on July 23:

- `npm run measure:first-usable`
- `npm run measure:analysis-latency`
- `npm run wallet:status`

The July 1 cost sample is date-stamped because current end-to-end COGS was not re-derived in this pass. The Chrome Web Store submission state was checked against repository evidence, not the store console.
