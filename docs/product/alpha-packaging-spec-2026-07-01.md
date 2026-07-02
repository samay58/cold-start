# Alpha packaging spec: the ledgered friend alpha

Date: 2026-07-01
Status: proposed
Owner: Samay
Supersedes: the caps, invite, and access-gate sections of `docs/product/alpha-install-readiness-spec-2026-06-23.md`. The Chrome packaging mechanics of that spec stay valid except where this document changes the call (visibility, check count, token model).
Relates to: `docs/product/unit-economics-trace-analysis-2026-06-23.md`, `docs/superpowers/plans/2026-06-26-alpha-events-and-invites.md`, `docs/product/research/cost-quality-optimization-playbook-2026-06-23.md`.

## Decision

Run the friend alpha as a **ledgered alpha**: free, invite-gated, with hard server-side caps that are *visible in the product as a plain allowance meter*. Publish the extension as **Chrome Web Store Unlisted**, not Private. Move contact enrichment out of default basics and attach it to the first Investor Lens run per company. Do not build billing.

The one-sentence version: the alpha should look like a confident product being opened to a small group, and the allowance meter is how the product tells the truth about what runs cost without asking anyone to pay yet.

This packaging is itself the pricing experiment. It ships the *language* of the future credit model (two meters: fresh profiles and Lens runs) without shipping a store, so the alpha measures whether metered language kills trial value before any dollar is attached.

## What packaging must tell the truth about

Four facts define honest Cold Start packaging. Every surface (invite page, store listing, side panel, privacy page) must carry them without burying them in caveats.

1. **Running Cold Start on a company creates or updates a public page.** `/c/{slug}` is a sourced public artifact. It shows facts and sources, never synthesis, never contact emails, and never who asked. For the target user (an investor researching a company) this is the single most consequential behavior, and today no product surface says it before the first run.
2. **Basics and Investor Lens are different products moments with different costs.** Basics builds the sourced public card. Lens adds gated judgment (why care, the case, timing, next question). They should be counted, capped, and explained separately.
3. **Fresh generation costs real money; cached reads do not.** A fresh profile is paid provider work. Opening an existing card is a database read. Packaging that treats these the same is economically incoherent.
4. **Generation queries third-party providers.** Exa, Firecrawl, Apollo-class enrichment, and LLM providers receive the company domain being researched (not the tester's identity). The privacy story has to say this plainly.

## The economics underneath

### Fresh trace sample (2026-07-01 pull, read-only production)

Complete basics runs, June 24 to 30, n=12. Component sums from `trace_json` (`costUsdAnthropic` + `costUsdAgentcash` + `providers.directExa.estimatedCostUsd` + `providers.websets.estimatedCostUsd`), with pre-June-25 Websets rows normalized to the corrected 15-credit rate.

| Unit | Median | p90-ish | Notes |
|---|---:|---:|---|
| Fresh basics, contacts included | $0.29 | $0.40 | Websets fired on 10 of 12 runs (1 to 3 items) |
| Fresh basics, Websets line removed | $0.04 | $0.11 | Same 12 runs minus the contact-enrichment component |
| Investor Lens (analysis run), n=11 since June 23 | $0.16 | $0.24 | Mostly AgentCash + one Sonnet synthesis call |
| Section job | $0.01 to $0.05 | | Single LLM pass |
| Failed basics attempt | $0.22 to $0.27 | | $0.11 to $0.13 per run, and failures ran twice (retry) in both recent cases |

The June 23 planning anchors ($0.335 median / $0.445 p90 basics, $0.481 median full profile, Websets-corrected) remain the conservative numbers for pricing math. The fresh sample is slightly better, not worse, so the anchors are safe.

### What actually drives cost

Contact enrichment is the product-shaped cost. It is the difference between a $0.29 basics and a $0.04 basics. It also consumes a hard non-dollar budget: Websets Starter is 8,000 credits/month, and a 3-contact basics run burns 45 credits, so contacts-on-every-basics caps the whole system at ~178 fresh basics/month regardless of dollars.

Failed attempts are the abuse-model hole. The recent failures (`herdr.dev`, `clawmessenger.com`) each cost roughly a full successful basics run, doubled by retry, and returned nothing. The failure cause was Cold Start's own quality gate ("underfilled public profile"), which is the right gate; but it means the user paid cap-wise for our quality bar unless policy says otherwise. Policy below.

Wallet exposure splits across three bills: AgentCash wallet (currently $34.61 on Base), the Exa account (Direct Exa + Websets credits), and Anthropic. Per fresh basics, AgentCash is only ~$0.01 to $0.12; the larger line is Websets on the Exa side. `wallet:status` watches only AgentCash.

### Alpha exposure math

Per-tester allowance of 12 fresh profiles + 6 Lens runs, 10 testers, everything fresh (no cache reuse, worst case):

| Contact policy | Per-tester COGS | 10-tester worst case | Websets credits (10 testers) |
|---|---:|---:|---:|
| Contacts bundled in basics (today) | 12 × $0.29 + 6 × $0.16 = $4.44 | $44 | ~5,400 (68% of monthly plan) |
| Contacts attached to first Lens run | 12 × $0.04 + 6 × $0.44 = $3.12 | $31 | ~2,700 |
| Contacts fully off | 12 × $0.04 + 6 × $0.16 = $1.44 | $14 | 0 |

All three are affordable for an alpha. The middle row is the recommendation: it keeps contact value where investor intent is proven and halves both dollar and credit exposure. Real exposure will be lower than worst case because caches exist and testers will open cached cards.

## Assessment of the current packaging direction

### Strong

- The two-gate model in the install-readiness spec (Chrome install gate vs Cold Start entitlement gate) is exactly right. Chrome answers "can you install"; Cold Start must answer "can you spend".
- The permission posture is genuinely good: `sidePanel`, `activeTab`, `storage`, explicit backend hosts, no `<all_urls>`. This is rare and worth protecting through review.
- The public-artifact / gated-Lens split is coherent, enforced in code, and is the honest trust story.
- The unit-economics work is rigorous and its conclusions hold up against fresh traces.
- The June 26 events/invites implementation plan is well scoped and correctly refuses third-party analytics.

### Weak or incoherent

- **It is all spec, no product.** No invite table, no `/alpha` page, no run caps, no per-tester identity exists in code. The actual alpha gate today is "Samay hand-builds you an extension with the shared token". Revocation means rotating everyone.
- **The invite page is too ops-like.** Seven live setup-check rows read like a CI dashboard. The spec's own wargame flagged this and kept all seven anyway. Three checks is the right number: right browser, extension connected, ready on a company site. Diagnostics stay one click away, not on the front page.
- **Private + Google Group optimizes the wrong gate.** The expensive thing is generation, not installation, and the backend entitlement already controls generation. Private's cost is the top predicted support failure (wrong Google account); its only benefit is listing invisibility. With a real entitlement gate, a leaked Unlisted link can install but cannot spend. The June 26 plan already quietly drifted to Unlisted; make that the explicit call.
- **Caps are denominated in the wrong currency in the old spec.** "10 profile runs" ignores that a contacts-on run costs 7x a contacts-off run. Either unbundle contacts (chosen) or denominate caps in something cost-shaped.
- **Failed attempts have no policy anywhere in the product**, while being roughly as expensive as successes and doubled by retries.
- **Nothing tells the tester the card is public.** This is the most important honesty gap, and it is also a trust *feature* when said plainly: "the public card shows the facts, not who asked."
- **Spend visibility is operator-blind too.** No per-tester counts, no cache-read telemetry, no Websets line in the human trace table, no alert when the wallet drains.

### Is it trustworthy? Nickel-and-dimed? Clear?

The underlying product earns trust structurally (citations, verifier drops, public/gated split). The packaging currently neither earns nor spends that trust because it does not exist as product surface. The credit-model sketch in the economics doc (five separate credit events including fractional section credits) would tip into toy-economy territory; two meters is the ceiling for comprehension. Friction today is accidentally perfect for cost control (nobody can install it) and fatal for learning.

## Packaging models considered

### Model A: plain friend alpha

Small invite list, free, hard server-side caps, diagnostics, no billing, caps invisible until hit.

- Comprehension: trivial, nothing to explain. But when a silent cap blocks a tester mid-flow, the product suddenly looks broken.
- Trust: fine until the invisible wall; then bad.
- Cost control: good once entitlement exists.
- Conversion signal: none. Teaches usage shape only.
- Support burden: low, rising at cap-hit moments.
- Chrome Web Store fit: clean.
- Unit-economics fit: bounded (~$44 worst case as configured above).
- Missing data before choosing: none to start; it just measures less than D at the same cost.

### Model B: credit packaging

Basics, Lens, contacts, sections, cached reads as distinct credit events; buy credits.

- Comprehension: the five-event version fails the taste bar; nobody should need a rate card for a side panel. A two-meter version (fresh profile credit, Lens credit) is comprehensible.
- Trust: honest mapping of credits to real work is a strength; credits burned on failed runs would be rage-inducing, so the failure policy is load-bearing.
- Cost control: excellent by construction.
- Conversion: plausibly the right long-term shape because investor research is bursty; deal-flow weeks and quiet weeks fit credits better than a monthly plan.
- Support burden: medium ("why did that cost 2 credits").
- Chrome Web Store fit: payments must live on the website, which is fine.
- Unit-economics fit: works if a full fresh profile retails around $1.25 to $1.50 (70% margin over the $0.48 planning anchor). Feels expensive when stated per-unit; bundles soften it.
- Missing data: willingness to pay, cache-hit rate, actual monthly per-user volume. All unknowable before the alpha.

### Model C: membership

$20/month, included fresh work, cache reuse free, overage guardrails.

- Comprehension: highest; everyone understands a subscription.
- Trust: dies in the fine print. "Included runs" plus soft-lock overage is where members feel nickel-and-dimed.
- Cost control: fine with hard included-run caps (8 to 10 full fresh profiles at 70% margin per the June 23 math).
- Conversion: unknown; bursty usage plus a monthly fee is a churn risk profile.
- Support burden: lowest.
- Chrome Web Store fit: clean.
- Unit-economics fit: plausible only with high cache reuse and contact unbundling, both unmeasured.
- Missing data: the per-user monthly usage distribution, which is exactly what the alpha exists to measure. Choosing C now is premature by definition.

### Model D: ledgered friend alpha (chosen)

Model A's economics with Model B's language, minus money. Free, per-tester entitlement, hard caps expressed as a visible two-meter allowance, contacts unbundled, failure amnesty, cached reads free and instrumented.

- Comprehension: tested, not assumed; the meter is the experiment.
- Trust: high. The meter tells the truth; failures visibly do not count; cached reads visibly stay free.
- Cost control: identical to A.
- Conversion signal: measures the mechanism (do meters change behavior? do testers ration Lens runs?) even though it cannot measure price.
- Support burden: lowest of all four; the meter pre-answers "why is it blocked", and diagnostics handle the rest.
- Chrome Web Store fit: identical to A.
- Unit-economics fit: $31 worst case at 10 testers with the chosen contact policy.
- Missing data before choosing: none. Everything it needs exists or is in the June 26 plan.

Decision: build Model D. It is strictly more informative than A at the same cost and risk, it road-tests B's comprehension question before any dollar exists, and it defers the B-vs-C choice to the moment there is data to make it. Current lean for post-alpha, stated so it can be falsified: credits-first (Model B, two meters only, bundle-priced), because usage is bursty and the meter language will already be familiar; a membership wrapper can come later for heavy users.

## The chosen product

### Access and identity

Replace "one shared bearer token for everyone" with per-invite entitlement, using the June 26 plan's `alpha_invites` table as the spine.

- Each invite carries a token; the extension exchanges the invite token once (connect step) and stores a per-tester access token. The invite page hands the token to the extension via `externally_connectable` scoped to Cold Start origins, per the install-readiness spec.
- `assertExtensionRequest` accepts either the master `EXTENSION_API_TOKEN` (Samay, CI) or a valid per-invite token (hash lookup against `alpha_invites`, status `accepted`, not revoked or expired). Revocation becomes per-tester and instant.
- `/api/generate` POST resolves the invite from the token and enforces meters before queueing fresh work. Cached responses and GET status checks never touch meters.
- Amendment to the June 26 schema: split the single `run_limit`/`run_count` pair into `profile_limit`/`profile_count` and `lens_limit`/`lens_count`. Counting happens server-side at queue time, keyed by `jobKind` (`basics` vs `analysis`); section jobs stay uncounted for the alpha. Client-emitted `alpha_events` remain observability, never enforcement.

### Caps and meters

- Default allowance: **12 fresh profiles and 6 Lens runs per tester**. Ten testers worst-case $31 COGS at the chosen contact policy; comfortably inside one Websets month.
- A fresh profile decrements only when a run is actually queued (not on cache hits, not on status polls). Re-generating a company the tester already generated (forceRefresh) counts as a fresh profile; the UI should say so before doing it.
- Lens runs decrement per analysis run queued.
- When a meter is empty, `/api/generate` returns 409 with a stable machine-readable reason (`alpha_profile_allowance_exhausted`, `alpha_lens_allowance_exhausted`); the side panel renders the blocked state with the copy below. Cached cards and existing Lens content remain fully readable forever.
- Raising a tester's allowance is an operator action (SQL or a tiny script), deliberately manual during the alpha.

### Failed-run policy

Failures get amnesty at the user meter and accounting at an internal circuit breaker.

- A run that ends `failed` refunds its meter decrement. The tester sees it plainly ("That one's on us; failed runs don't count against your allowance").
- Internally, every failed run's cost is real, so track `failed_run_count` and failed-run cost per invite. Trip a per-invite circuit breaker at **3 consecutive failures on the same domain** or **6 failed runs per day**: further fresh generation for that domain (or invite, for the daily trip) is blocked until reviewed, with copy that blames the domain, not the tester ("Cold Start could not build a reliable card for this domain; retrying will not help. Samay has been notified.").
- This preserves the abuse model (failures cannot be a free infinite loop) without billing testers, in cap currency, for Cold Start's own quality gate.
- Separately, fix or bound the silent Inngest retry on quality-gate failures: an "underfilled profile" failure is deterministic on retry minutes later and currently doubles COGS for zero yield. A quality-gate failure should be terminal, not retried.

### Contact enrichment policy

> Update 2026-07-01: superseded in part by `docs/product/contact-enrichment-yield-and-design-2026-07-01.md`. A yield proof showed ~74% of target companies expose a real human `@domain` email in public GitHub commits, which gives the domain email pattern for free. The default contact path should become that free GitHub pattern layer; the Websets move below becomes the *explicit user-triggered deep-find* for the ~26% miss, not the default enrichment. The rest of this section stands as the fallback if the free layer is not built.

Move Websets contact enrichment from default basics to the **first Lens run per company**.

- Rationale: it is 85% of basics COGS, it burns a hard monthly credit budget, and the cost-quality playbook already ranked making it deliberate as lever #1. Lens is the moment investor intent is proven, and contacts (who to reach, work email) are investor-workflow value, not first-read value.
- Mechanics: the existing flags do most of the work (`CONTACT_ENRICHMENT_ENABLED`, `EXA_WEBSETS_CONTACTS_ENABLED`, `CONTACT_ENRICHMENT_TIER=named-only`); the change is the trigger point, moving the contact-enrichment dispatch from the basics completion path to the analysis path in the Inngest workers.
- The Lens receipt line should own it: "Lens filed · 3 claims · 4 questions · 2 contacts found".
- Falsifiability: if alpha feedback shows contacts were part of the perceived first-read magic (testers asking "where are the people?" on basics cards), revisit; the trade is $0.25 median per basics and it must earn that.

### Cached reads

Free, uncounted, and instrumented. Add a cache-read event (`alpha.card_cache_read` server-side, recorded on extension bootstrap/card reads that hit a stored card) so the cache-hit ratio per tester exists before any pricing decision. This is the highest-priority missing number in the economics work: cache reuse is the whole case for a viable $20 plan.

### Invite flow, revised

Keep the install-readiness spec's three surfaces (invite page, store listing, side panel) and its connect mechanics. Change these calls:

- **Unlisted, not Private.** The entitlement gate makes link forwarding harmless (installing without an invite yields a panel that says "Cold Start is in a closed alpha" with no spend possible). Wrong-Google-account support disappears as a failure class.
- **Three checks, not seven**: desktop Chrome; extension installed and connected; ready on a company site. Anything else lives behind a "Copy diagnostics" action shown only on failure.
- The invite page states the allowance up front, as a feature of being early, not a limitation: "Your alpha access includes 12 fresh company profiles and 6 Investor Lens runs. Opening existing cards is always free."
- The invite page carries the public-artifact truth before first run (copy contract below).

### Chrome Web Store posture

- Unlisted item named `Cold Start Alpha`, clearly labeled alpha in the description, separate from any future public item.
- Permissions stay exactly `sidePanel`, `activeTab`, `storage`, plus the two live backend host permissions. The legacy `coldstart.semitechie.vc` host permission is dead (the extension config maps that origin back to the default) and is removed from the manifest as part of this spec; one fewer host permission is one less review question.
- Privacy fields point at `/privacy`, rewritten (this spec) to name provider sharing, storage, and the public-card behavior plainly.
- Reviewer test instructions include a working invite token pointed at a reviewer-safe allowance.

### Copy contract

These strings are product surface, not decoration. Plain, specific, no hedging, no legalese. They may be reworded in Samay's voice but each fact must survive.

Side panel, first-run state (before the tester's first generation ever):

> **Get up to speed**
> Builds a sourced profile from public sources in about a minute.
> Saves a public fact card at cold-start.semitechie.vc. The card shows the facts and sources, not who asked.
> Alpha allowance: 12 fresh profiles · 6 Lens runs. Opening existing cards is free.
> [Begin research]

Allowance meter (persistent, quiet, in the panel footer or settings):

> 9 fresh profiles left · 5 Lens runs left

Lens action, first run on a company:

> Run investor lens
> Adds the case, timing, and open questions. First Lens run on a company also pulls team contacts.

Meter exhausted:

> You have used your 12 fresh profiles for this alpha.
> Every card you built stays open, free. Want more runs? Text Samay.

Failed run:

> Cold Start could not build a reliable card for {domain}. Not enough cited public evidence survived.
> That one's on us. Failed runs don't count against your allowance.

Repeated failure (circuit breaker):

> This domain keeps failing the evidence bar; retrying will not help. Samay has been notified.

Store listing short summary (unchanged from install spec, it is good):

> Create sourced company context cards from the company site you are viewing.

Store listing description gains one sentence after the public/private explanation:

> Running Cold Start on a company saves a public fact card; it shows sourced facts, never your identity or the private investor lens.

### Support posture

- Primary: copy-diagnostics payload (redacted, per the install-readiness spec's schema) plus a direct line to Samay. No ticketing, no SLA language.
- The meter and the failure copy are the first line of support; they pre-answer the two predictable questions ("why is it blocked", "did that failure use up a run").
- Operator side: extend the human `trace:generation` table with the Websets component and per-invite counts so "who is stuck, where, and what did it cost" is one command. A wallet floor alert (AgentCash below $10, Websets credits below 1,500) is a cron-and-email problem, not a dashboard.

### Instrumentation deltas to the June 26 plan

The plan stands. Amendments:

1. Split `run_limit`/`run_count` into profile and Lens pairs (schema change before migration 0008 lands, not after).
2. Add `alpha.card_cache_read` to the first-pass event list, recorded server-side.
3. Record failed-run refunds and circuit-breaker trips as events (`alpha.profile_refunded`, `alpha.generation_blocked`).
4. Generation entitlement is enforced at `/api/generate` via the per-invite token, never via client-emitted events.

## Build order

1. **Alpha data spine** (June 26 plan, with the amendments above): schema, repositories, events route. This is already fully specified.
2. **Entitlement in auth and generate**: per-invite token acceptance in `extension-auth.ts`; meter enforcement plus failure refunds in `/api/generate` and the generation workers.
3. **Contact-enrichment trigger move**: basics completion path stops dispatching contacts; first Lens run per company dispatches it.
4. **Side panel ledger surfaces**: first-run truth copy, allowance meter, blocked and failure states. Small rendering work; all states come from API responses.
5. **Invite page** `/alpha/[token]` with three checks and connect handoff.
6. **Chrome Web Store Unlisted submission**: listing copy, screenshots, privacy fields, reviewer instructions, one clean-profile install drill.

Items 1 and 2 are the product; nothing else matters until a second person can be granted and revoked spend. Item 6 can proceed in parallel once 4 exists for screenshots.

## Deferred and killed

Deferred (right ideas, wrong time): billing and Stripe, plans page, account management, credit purchase flow, overage pricing, public card gallery, BYO keys.

Killed from the current direction:

- Private + Google Group as the primary install path (Unlisted + entitlement replaces it; Private remains a fallback if Unlisted review somehow fails).
- The seven-row setup console (three checks).
- The shared single token as the permanent alpha auth model.
- Fractional section credits and any credit taxonomy beyond two meters.
- Silent retry of deterministic quality-gate failures.

## What would change this recommendation

- **Testers hate the meter** (feedback that the allowance made them afraid to run it): keep server caps, hide the numbers until 80% consumed, and treat that as strong evidence against Model B later.
- **Cache-hit rate comes back high** (say, >50% of card opens are cached): the membership model gets much stronger, because "most of what you do is free to us" is the subsidy engine a flat plan needs.
- **Testers ask for contacts on basics**: revisit the contact policy; the honest version is then a visible third meter or a Lens-bundled framing, priced accordingly.
- **Analysis cost drifts up** (bigger synthesis models, more section fanout per Lens): re-run the exposure math; the 6-run Lens allowance is calibrated to ~$0.44 including contacts.
- **Websets pricing or plan tier changes**: recompute; the credit ceiling (8,000/month) binds before dollars do at alpha scale.
- **A second Inngest retry class appears** (transient provider failures that succeed on retry): keep retries there; the no-retry rule is only for deterministic quality-gate failures.

## Data integrity notes

Confirmed from production traces (read-only, 2026-07-01): the fresh basics/Lens/failure numbers in the economics section, from `npm run trace:generation -- --limit 60 --json` component sums; first-usable p50 49.6s / p90 1m22s and 24% seed-pass rate from `npm run measure:first-usable`; AgentCash balance $34.61 from `npm run wallet:status`.

Confirmed from code: Websets 15 credits/item at $0.006125 default (`packages/providers/src/websets.ts`); Direct Exa $0.007/search (`packages/providers/src/direct-exa.ts`); StableEnrich endpoint budgets $0.01 to $0.02 (`packages/providers/src/provider-budget.ts`); AgentCash ceilings $0.30 basics / $0.50 analysis (`apps/web/src/inngest/provider-trace.ts`); single shared bearer token and no caps (`apps/web/src/lib/extension-auth.ts`, `apps/web/src/app/api/generate/route.ts`); contact enrichment env flags (`apps/web/src/lib/env.ts`).

External pricing: Websets Starter $49/8,000 credits, 10 credits/result + 5/email (accessed 2026-06-23 in the unit-economics doc; re-verify before the alpha invite wave).

Assumptions: contacts-at-Lens cost modeled as basics Websets component moving to the Lens moment unchanged (~$0.28 at 3 items); 10 testers; zero cache reuse in worst-case math; tester behavior otherwise unknown, which is the point of the alpha.
