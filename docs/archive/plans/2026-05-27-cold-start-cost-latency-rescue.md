# Cold Start Cost And Latency Rescue Plan

Status: draft for Codex handoff. Written by Claude after read-only investigation against the production `generation_runs` traces on 2026-05-27. No code changes were made in the planning session.

Owner of execution: Codex. Read this end-to-end first, then `AGENTS.md`, then `SPEC.md` for product context. Do not start with code.

## 0. Operating rules for Codex

Pin these before opening files. They override convenience.

- Do not run paid live provider or LLM calls without checking with the operator first. The cheapest live spend in this plan is the Modal-class basics run; treat that as ~$2 of AgentCash plus ~$0.18 of Anthropic per run when reasoning about budgets.
- Public `/api/cards/{slug}` must not return `synthesis`. Extension `/api/extension/cards/{slug}` is the only synthesis path. Do not weaken `apps/web/src/lib/extension-auth.ts`.
- Verifier drops stay dropped. Synthesis bullCase and bearCase are 0-3 supported claims after verification. Do not relax the verifier to reduce `zero_analysis_evidence` failures.
- Citations are load-bearing. Every non-null citation-bearing fact needs `citationIds` resolving to top-level `citations[]`. Cuts must not erase citations.
- Keep `.evo/` and benchmark artifacts out of `main` unless an explicit winning diff is promoted by a human.
- If deploy work follows this plan, upgrade Vercel CLI first (`npm i -g vercel@latest`). The current local CLI was 54.4.1 at planning time.

## 1. Plain-English diagnosis

Generation is expensive and slow for one main reason: the basics path runs a long, paid, mostly-blind people-and-email enrichment chain (Apollo people search and enrich, Minerva, Clado, Hunter email verifier) in series with first-card delivery, even when nothing in the request needed verified work emails. That single block accounts for the majority of AgentCash spend and the majority of wall-clock time before useful content appears. A secondary reason is that the same Exa fan-out is paid twice: once through the StableEnrich-wrapped AgentCash gateway, and once cheaply through the user's direct Exa key, with no policy that lets the cheap source pre-empt the paid one when it returns equivalent evidence. A third reason is that the telemetry that should tell us "time to first useful card" is broken under Inngest's replay model, so the Evo benchmark already in the repo grades cost and latency on full run duration instead of first-useful time, hiding most of the gains a fix would produce.

There is no quality problem worth destroying to make this cheaper. Recent cards (modal.com, recursion.com, latch.bio) produce 21-37 citations and 9-20 applied provider facts. The fix is to stop blocking on the expensive enrichment chain, prefer the cheap source first when it works, gate analysis synthesis when the underlying card is too thin to support claims, and make the existing benchmark grade what it claims to grade.

## 2. Evidence

All evidence below is from `generation_runs.trace_json` on the production Postgres pulled at 2026-05-27 via `npm run trace:generation` against `.env.production.migrate.local`. No live generation was run in this planning session.

### 2.1 modal.com basics run (most recent, status complete)

Run id `5655036d-bf22-41f6-92ab-c429020a9446`, started 2026-05-27 20:08:33 UTC, duration 6m 54s, status complete. Applied 9 of 18 provider fact candidates. 21 citations. LLM cost from `generation_runs.cost_usd`: $0.1798. StableEnrich budgeted cost (sum of per-endpoint `estimatedCostUsd`): $0.92. Actual AgentCash wallet spend is not captured anywhere in traces; the operator-reported figure of $2-$3 per Modal-class run is consistent with the 70 paid calls observed.

Stableenrich endpoint distribution in that single run:

| endpoint                       | calls | facts | budgeted $ |
| ------------------------------ | ----- | ----- | ---------- |
| hunter_email_verifier          | 36    | 2     | $0.36      |
| apollo_people_enrich           | 8     | 2     | $0.16      |
| minerva_enrich                 | 6     | 0     | $0.12      |
| clado_contacts_enrich          | 4     | 0     | $0.08      |
| apollo_people_search           | 2     | 0     | $0.04      |
| apollo_org_search              | 1     | 0     | $0.02      |
| org_enrichment                 | 1     | 9     | $0.02      |
| exa_funding_history            | 1     | 0     | $0.01      |
| exa_company_profile            | 1     | 0     | $0.01      |
| exa_management_team            | 1     | 0     | $0.01      |
| exa_recent_signals             | 1     | 5     | $0.01      |
| exa_competition                | 1     | 0     | $0.01      |
| exa_independent_analysis       | 1     | 0     | $0.01      |
| exa_find_similar               | 1     | 0     | $0.01      |
| exa_email_search               | 1     | 0     | $0.01      |
| exa_leader_discovery           | 1     | 0     | $0.01      |
| firecrawl_homepage             | 1     | 0     | $0.01      |
| firecrawl_about                | 1     | 0     | $0.01      |
| firecrawl_team                 | 1     | 0     | $0.01      |
| total                          | 70    | 18    | $0.92      |

`apollo_people_search` shows up twice because it runs once as a probe in `buildStableenrichRequests` (packages/providers/src/stableenrich.ts:196) and again inside `runApolloPeopleDiscovery` for the contact-sources phase (packages/providers/src/stableenrich.ts:749). The plan treats this duplication as a bug.

Direct Exa fundamentals contributed 19 sources at zero AgentCash cost in the same run (`providers.directExa.sourceCount: 19, failureCount: 1`). The 8 StableEnrich-wrapped Exa probes (`exa_funding_history` through `exa_leader_discovery`) added 9 paid Exa search-equivalent calls covering overlapping intents at ~$0.10 of budgeted spend, contributing 5 of 18 facts. The overlap is real and concretely measurable.

Steps timing for modal.com:

| step                       | duration |
| -------------------------- | -------- |
| plan-research              | 0ms      |
| fetch-sources              | 18.3s    |
| seed-profile-card          | 4ms      |
| fetch-contact-sources      | 251.8s   |
| enrich-contacts            | 2ms      |
| merge-contacts-into-card   | 1ms      |
| generate-card              | 66.7s    |
| fetch-enrichment-sources   | 24.2s    |
| enrich-card                | 20.4s    |

`fetch-contact-sources` is 251.8 seconds, more than 60 percent of wall-clock time, entirely AgentCash-paid. `generate-card` is 66.7 seconds, the LLM extraction stage. The two together are 318.5 seconds, against a total of 6m 54s. Compress those two and the run shape changes.

Reported milestones in the same trace are `firstUsableCardMs: 2` and `contactsReadyMs: 3`. These are wrong: nothing happens in 2 milliseconds. The cause is that `inngest/functions.ts:683` records `functionStartedAt = Date.now()` once at function entry, but each Inngest `step.run` replay re-enters the function from scratch, so `Date.now() - functionStartedAt` measured deep inside a memoized step records the time since the replay started, not since the operator's request. This silently breaks the Evo benchmark, which falls back to full run duration when milestone reads are useless (`scripts/evo-generation-benchmark.ts:250`).

### 2.2 The pattern holds across other recent basics runs

Comparable patterns on the same prod DB:

- `recursion.com` basics 2026-05-27, 5m 50s, 70 stableenrich calls, $0.92 budgeted, 36 Hunter calls (15 facts that round produced 5 verified emails — high-yield outlier; the cost shape is identical), 20/28 facts applied, $0.1679 Anthropic.
- `latch.bio` basics 2026-05-27, 3m 53s, 19/26 facts applied, $0.2181 Anthropic.
- `llamaindex.ai` basics 2026-05-26, 2m 29s, 7/16 facts applied (44% application rate), $0.1951 Anthropic.
- `perceptic.com` basics 2026-05-26, 4m 23s, 3/11 facts applied (27% application rate), $0.1896 Anthropic.

Application rate across recent basics: median around 50 percent. Roughly half the facts we paid AgentCash to fetch never enter the card.

### 2.3 Analysis-mode waste

`zero_analysis_evidence` runs (`oboe.com`, `perceptic.com`, `daytona.io`, `substack.com`, `lumalabs.ai` — multiple runs each across 2026-05-21 through 2026-05-26) all completed synthesis (12-13 claims produced) and full verification (0-1 claims surviving), then failed. The Anthropic spend for synthesis + verify against a card that does not have enough cited substance for the verifier to anchor anything is pure waste. The fix is gating: do not enter synthesis when the existing public card lacks the structured signal density to produce verifiable claims.

### 2.4 Hard caps that should be smaller

In `packages/providers/src/stableenrich.ts`:

- `MAX_LEADERS_FOR_ENRICHMENT = 8` (line 703). Drives the Apollo people enrich fan-out. Target cap: **3**. The operator does not need verified emails for the long tail of executives; founders + CEO is the goal, not a full org chart.
- `MAX_FALLBACK_LEADERS = 6` (line 704). Drives Minerva and Clado fan-out. Target cap: **2**.
- `MAX_HUNTER_CANDIDATES = 36` (line 705). Drives Hunter verification cap. Observed yield on modal.com: 2 of 36 calls produced facts. Observed yield on recursion.com: 15 of 36 calls. Yield variance is high enough that the cap is the binding constraint on cost, not the floor. Target cap: **6**.

### 2.5 Anthropic side

`packages/llm/src/anthropic.ts:61` attaches `cache_control: { type: "ephemeral", ttl: "1h" }` to the stable system prompts in extraction, block extraction, synthesis, verifier, and research-section. The traced helper attaches the `anthropic-beta: extended-cache-ttl-2025-04-11` header automatically when TTL resolves to 1h. Verification script `scripts/verify-cache-ttl.ts` exists. There is no `ANTHROPIC_*_MODEL` per-stage override set in `.env.local` at planning time — only `ANTHROPIC_MODEL` — so every stage uses the same model. There is no `ANTHROPIC_CACHE_TTL` override either, so 1h is in force. This is the right shape; do not change it without a measured reason. The `extract_full` call (`packages/llm/src/extraction.ts:724`) sends `max_tokens: 4000` against an evidence payload that can include up to 57 accepted sources. That is the largest single Anthropic cost in a basics run.

`trace.llm` is populated correctly in the inngest path through `recordLlmCall` (`apps/web/src/inngest/functions.ts:281`). For section runs (`section:risks`, `section:why_it_matters`), the `cost_usd` column shows `$0.0000` in the table view but the section path also calls `synthesizeResearchSection` with telemetry wired. The `$0` is a display artifact of how those rows render in `trace-generation.ts`, not evidence that those calls are free.

### 2.6 What we cannot see

We cannot reconcile the user-reported "$2-3 of AgentCash credits per Modal run" to traces because nothing in `generation_runs.trace_json` carries the actual wallet delta. The `agentcashJson` wrapper (`packages/providers/src/agentcash.ts:60`) parses only the `data` envelope from the CLI's JSON output and discards any price or balance metadata. The provider budget table is a static estimate, not an observation. Two consequences:

- Every cost number in this plan derived from the budget table is a lower bound. Real per-call AgentCash spend appears to be ~2-3x the budget table.
- Any optimization shipped without first capturing real wallet deltas is unmeasurable in dollars.

`scripts/wallet-status.ts` already calls the AgentCash CLI `accounts` endpoint and reports per-network balances. The cheapest reliable way to capture actual run cost is to snapshot the wallet before and after a run and store the delta in the trace.

## 3. Cost map

By provider for one Modal-class basics run, derived from the modal.com trace and consistent with recursion.com and latch.bio:

- AgentCash (StableEnrich): $0.92 budgeted, ~$1.50-$3.00 real (operator-reported). 70 paid calls. Of those, the contact-enrichment chain (Apollo people search + enrich, Minerva, Clado, Hunter) accounts for 54 calls and ~$0.78 of budgeted spend.
- Anthropic: $0.18 per basics run, almost entirely `extract_full` and `extract_block` calls. Synthesis and verify only fire in analysis mode. `extract_full` evidence payload is the largest contributor.
- Direct Exa: ~$0 marginal cost per call (operator's own API key with adequate balance), 19 sources contributed in the modal.com run for free.
- Other (SEC EDGAR, public scrape): $0.

By mode:

- Basics: ~$1.50-$3.00 wallet + $0.18 Anthropic ≈ ~$1.70-$3.20 per run. Application rate ~50 percent — half that AgentCash spend is unused facts.
- Analysis: $0.04-$0.08 Anthropic when reusing existing card (most successful analysis runs), 0 paid providers in that branch. Failed analysis runs that did re-fetch (older 2026-05-21 era) added another $0.50-$1.00 of AgentCash before failing the verifier.

By stage (Modal basics):

| stage                          | wallet $ | anthropic $ | seconds |
| ------------------------------ | -------- | ----------- | ------- |
| plan-research                  | 0        | 0           | 0       |
| fetch-sources (Exa + fast)     | ~$0.14   | 0           | 18      |
| seed-profile-card              | 0        | 0           | 0       |
| fetch-contact-sources          | ~$0.78   | 0           | 252     |
| extract (generate-card)        | 0        | ~$0.13      | 67      |
| fetch-enrichment-sources       | ~$0.00   | 0           | 24      |
| enrich-card (block extraction) | 0        | ~$0.05      | 20      |

Total ~$0.92 budgeted wallet + $0.18 Anthropic. Real wallet is 2-3x higher.

## 4. Latency map

For a modal.com-class basics run as observed:

- Time to first usable card: invisible in traces (milestone broken), but structurally `plan-research + fetch-sources + seed-profile-card + upsertCard` is ~18.3s if Direct Exa returns. The seed card writes happen right after `fetch-sources`, before any extraction. If the seed card has enough cited identity for `hasUsablePublicProfile`, it is stored and exposed at that point.
- Time to first LLM-extracted card: `fetch-sources + generate-card` = 18.3s + 66.7s = ~85s, again before contact enrichment lands.
- Time before contact enrichment finishes: ~270s total (`fetch-sources + fetch-contact-sources + enrich-contacts`).
- Time to terminal enriched card: ~414s = 6m 54s.

The current code already saves a seed card after `seed-profile-card` (apps/web/src/inngest/functions.ts:1044) and re-saves after contacts via `upsert-contact-card`. The blocker for first usable content reaching the extension is therefore not the pipeline order but two things: the seed card only saves when `hasUsablePublicProfile(seedCard)` is true (which depends on `org_enrichment` having returned facts), and the basics path then continues to block on `fetch-contact-sources` for 4+ minutes before the next visible update because `generate-card` runs only after contacts complete. The extension sees the seed save, then nothing useful for 4 minutes, then another save.

## 5. Recommended approach

One recommended path. Two alternatives noted for completeness but not chosen.

### 5.1 Recommended path: cheap-first sources, deferred enrichment, real telemetry

In order:

1. Fix the telemetry that grades everything else: actual time-to-first-usable-card per run, actual AgentCash spend per run.
2. Move the entire Apollo→Minerva→Clado→Hunter contact-enrichment chain out of the visible basics critical path. Keep it as a deferred background enrichment that updates the stored card when it finishes, and stops as soon as evidence-of-leaders is sufficient.
3. In the visible basics path, prefer Direct Exa to StableEnrich-wrapped Exa when both cover the same intent and Direct Exa returns usable sources. Remove the redundant `apollo_people_search` double-call. Tighten leader / Hunter caps hard: enrich at most 3 management team members per run, fall back on at most 2, verify at most 6 Hunter candidates total. Skip Apollo people search/enrich entirely when cheap sources already named ≥3 leaders.
4. Gate analysis synthesis on a minimum cited-evidence threshold so the verifier never gets called with material it cannot verify.
5. Keep all citation, verifier, and public/private boundaries exactly where they are. Do not change card schema.
6. Only after 1-4 produce a stable measured cost and latency improvement, allow Evo to optimize the remaining knobs against the now-honest benchmark.

This path matches the user-stated bias: basics cheap and fast; analysis deeper and slower; paid enrichment must earn its place; show something reliable quickly. It also matches the existing Evo benchmark's scoring function — first usable time has 30 weight against 12 each for cost and contacts, so honest first-usable telemetry plus deferred contacts produces the largest improvement in the score that already exists.

### 5.2 Alternative paths considered and rejected

**Alt A: rip out StableEnrich entirely and rely on Direct Exa + Apollo direct + Hunter direct.** Rejected for this plan. It is plausible long-term but it is a provider rewrite, not a rescue. It also throws away the SEC EDGAR + org_enrichment fact paths that are currently the highest-yield calls in the run. Revisit after Phase 1 lands.

**Alt B: route everything through Anthropic with extended prompt caching and tools, do less retrieval up front.** Rejected. Provider facts with citations are how this product works. Trading them for an LLM-only summarization path destroys the citation contract.

## 6. Non-goals

The plan does not do these. Codex should refuse scope-creep requests that ask for them:

- Lowering verifier strictness.
- Removing or weakening the public-card synthesis exclusion.
- Removing citations or relaxing the `card.ts` resolved-fact requirements.
- Broad style / copy / DESIGN.md cleanup.
- Replacing the AgentCash retry policy with blind retries on AgentCash failures (the current "AgentCash calls do not retry" rule exists for cost reasons and stays).
- Lowering AgentCash wallet exhaustion guard (`apps/web/src/inngest/functions.ts:945`).
- Changing the schema in `packages/core/src/card.ts` to make cards cheaper to fill. The schema is correct; the pipeline around it is what needs fixing.
- Touching `experiments/` or anything under `docs/brand/archive/`.
- Bumping `packages/core/api-contract.json` without a matching extension build.

## 7. Step-by-step implementation tasks for Codex

The order matters. Earlier tasks make later tasks measurable.

### Task 1: fix milestone telemetry under Inngest replay

Why: every other change in this plan is graded by `firstUsableCardMs` and `contactsReadyMs`. The current code records `Date.now() - functionStartedAt` inside Inngest `step.run` callbacks, where `functionStartedAt` is captured at the top of each replay. The Inngest model invokes the function from the top on every step, so the captured start time resets each replay and the milestone numbers (`firstUsableCardMs: 2`, `contactsReadyMs: 3`) are nonsense.

What:

- Pass the `event.ts` timestamp from the Inngest event (or a `requestedAt` placed in `event.data` by `/api/generate`) down to where milestones are written, and compute `milestoneMs = Date.now() - requestedAt`.
- Confirm `event.ts` is durable across replays in the Inngest function context (it should be; `event` is part of the event envelope, not a per-replay local).
- Add a new milestone `seedCardMs` distinct from `firstUsableCardMs` so we can grade "minimal usable identity in DB" separately from "card ready for extension". Save it inside the `upsert-seed-card` step when `canStoreCardSnapshot` is true.
- Add `analysisReadyMs` write only inside the analysis branch (it exists but pin its meaning to "stored synthesized card committed").

Files: `apps/web/src/inngest/functions.ts`, possibly `packages/core/src/generation-trace.ts` if you add a new milestone field.

Acceptance: After one successful basics run on a fixture company, `trace.milestones.firstUsableCardMs` is in the thousands-to-tens-of-thousands range, monotonically increases vs `seedCardMs`, and equals approximately the wall-clock between request submission and seed card save. The Evo benchmark percentile reads use the new values without falling back to `runDurationMs`.

### Task 2: capture real AgentCash spend per run

Why: every "cost" number we publish today is a budget estimate; real wallet spend is invisible. The operator-reported $2-3 burn for Modal is unreconcilable to the $0.92 budget figure without this.

What:

- Add a one-shot wallet balance read at the very start of the generation function (before `mark-generation-running`) and another at the very end (before `mark-generation-complete` / `mark-generation-failed`). Reuse the AgentCash account call that `scripts/wallet-status.ts` already makes.
- Store `walletSnapshotBeforeUsd`, `walletSnapshotAfterUsd`, and `walletDeltaUsd` on `trace.providers.stableenrich` (extend `generation-trace.ts` schema with optional fields; the schema's `safeParse` will accept extra optionals).
- Add `costUsdAgentcash` and `costUsdAnthropic` derived fields to the trace and update `markdownSummary` / `trace-generation.ts` table to surface both.
- If the AgentCash CLI rate-limits or fails the balance call, log a structured warn and proceed; balance read failure must not fail the run.

Files: `apps/web/src/inngest/functions.ts`, `packages/providers/src/agentcash.ts` (add `agentcashWalletSnapshot` helper that wraps the CLI call), `packages/core/src/generation-trace.ts`, `scripts/trace-generation.ts`.

Acceptance: A basics run on `modal.com` populates `trace.providers.stableenrich.walletDeltaUsd` with a number > 0 and within an order of magnitude of $0.92-$3.00. The `--detail` view of `trace-generation.ts` prints budget vs actual side by side.

### Task 3: defer the contact-enrichment chain off the visible basics path

Why: 252 seconds and ~$0.78 of budgeted spend in one critical path step that the user does not need before seeing the company card.

What:

- Move `fetch-contact-sources` → `enrich-contacts` → `merge-contacts-into-card` to run as a **separate Inngest function** triggered by `card/contact-enrichment.requested`, fanned out from `generate-card` after `upsert-seed-card` succeeds. Keep the current event-driven model.
- After the new `card/contact-enrichment.requested` finishes, it writes back to the same card row, sets `trace.milestones.contactsReadyMs`, and emits `card.contacts_enriched`.
- The main `generate-card` flow then proceeds to `extract_full` → block enrichment → `upsert-card` on the basics path without waiting for contacts.
- Public card / extension read paths already do not require emails; verify nothing in `apps/web/src/lib/extension-auth.ts` or `/api/cards/*` depends on email presence.
- Gate the contact-enrichment dispatch behind a config flag (`CONTACT_ENRICHMENT_ENABLED`, default true) so it can be turned off without redeploy if the wallet is exhausted.
- Inside the new function: if leaders found from `org_enrichment` + Direct Exa people + SEC EDGAR already cover ≥2 founders with sourceUrl, **do not** call Apollo people search / enrich. Skip directly to Hunter only for the named people, and only if the user has a verifying-email use case (gate by `CONTACT_ENRICHMENT_TIER`, default "named-only").

Files: `apps/web/src/inngest/functions.ts`, possibly add `apps/web/src/inngest/contact-enrichment.ts`, register in `apps/web/src/app/api/inngest/route.ts`.

Acceptance:

- Modal-class basics runs report `firstUsableCardMs` ≤ 90s (vs the 200+ seconds it would be on the new honest telemetry today).
- `contactsReadyMs` lands later, asynchronously, without blocking `card.saved`.
- Modal wallet delta per basics run drops below ~$0.50 budgeted (since most of the $0.78 was the contact chain).
- No regression in citation count or applied fact count.

### Task 4: cheap-first source policy in `fetch-sources`

Why: Direct Exa is essentially free per call (operator's own API key) and already returned 19 sources for modal.com. The 8 StableEnrich-wrapped Exa probes covered overlapping intents at ~$0.10 of paid spend for 5 fact contributions.

What:

- Make `fetchDirectExaFundamentalsSources` the primary search path in `fetch-sources`.
- After Direct Exa returns, evaluate per-intent coverage (`company_profile`, `funding`, `management_team`, `recent_signals`). For each intent that already has ≥1 accepted source from Direct Exa, **skip** the corresponding StableEnrich Exa probe (`exa_company_profile`, `exa_funding_history`, `exa_management_team`, `exa_recent_signals`). Keep `firecrawl_homepage`, `firecrawl_about`, `org_enrichment` running unconditionally — they cover orthogonal intents.
- Keep `exa_competition` and `exa_find_similar` running because Direct Exa fundamentals does not currently cover comparables. (Codex: before changing the Direct Exa request set, read current Exa `/search` API docs at https://docs.exa.ai for `category`, `type`, `useAutoprompt`, `contents.highlights`, and `livecrawl` semantics. The plan does not pre-commit to a specific Exa query shape; pick the cheapest shape that returns comparable-quality sources.)
- Remove the duplicate `apollo_people_search` probe (`packages/providers/src/stableenrich.ts:196`). The discovery phase calls it again. The probe-list version is a leak from earlier code.
- Register a per-endpoint cost ceiling in `packages/providers/src/provider-budget.ts` (`maxCallsPerRun`, `maxStageCallsUsd`) and enforce it in `runStableenrichPeopleFollowups` and elsewhere. Initial caps (operator-stated, non-negotiable for v1):
  - `MAX_LEADERS_FOR_ENRICHMENT = 3` (down from 8). We do not need verified emails for the long tail of executives. Founders plus CEO is the target, not a full org chart.
  - `MAX_FALLBACK_LEADERS = 2` (down from 6).
  - `MAX_HUNTER_CANDIDATES = 6` (down from 36).
- Skip Apollo `people_search` and `people_enrich` **entirely** when ≥3 named leaders with `sourceUrl` are already in hand from `org_enrichment`, SEC EDGAR, or Direct Exa people probes. Apollo only runs when cheaper sources did not name enough leaders. Hunter still verifies known candidates from the cheap-source leaders in that case; it does not guess.
- Add a hard per-run AgentCash budget ceiling (`PER_RUN_AGENTCASH_BUDGET_USD`, default $0.30 for basics, $0.50 for analysis). Track running budget through the `costLines` thread (extend `cost.ts` with provider tags). Stop dispatching new AgentCash calls when the ceiling is reached. Log a structured warn with `budgetCeilingHit: true` in the trace.

Files: `apps/web/src/inngest/functions.ts`, `packages/providers/src/stableenrich.ts`, `packages/providers/src/provider-budget.ts`, `packages/pipeline/src/cost.ts`.

Acceptance:

- Modal-class basics run stops at ≤30 stableenrich calls (vs 70 today).
- Stableenrich budgeted spend per basics run ≤ $0.30.
- Direct Exa source counts per run remain at or above current baseline; no regression in citation count or applied fact count.
- The duplicate `apollo_people_search` call no longer appears in traces.

### Task 5: per-endpoint yield telemetry

Why: today `endpoint.factCount` is "facts produced by this endpoint" — but many of those facts are then dropped during merge. We need "facts that landed on the final card from this endpoint."

What:

- Tag each provider fact candidate with its `provider` and `endpoint` (already mostly there in `ProviderFactCandidate`). Propagate the tag into `extraction.providerFactPaths` so we can see which endpoint's fact actually made it onto the card.
- Emit a per-endpoint `factsAppliedCount` alongside `factCount` in `trace.providers.stableenrich.endpoints[]`.
- Surface low-yield endpoints (`factCount > 0` but `factsAppliedCount = 0`) in the `--detail` view of `trace-generation.ts`.

Files: `packages/core/src/generation-trace.ts`, `packages/pipeline/src/provider-facts.ts`, `packages/pipeline/src/seed-profile.ts`, `apps/web/src/inngest/functions.ts`, `scripts/trace-generation.ts`.

Acceptance: After one basics run on `modal.com`, each endpoint row in the detail view shows both produced-facts and applied-facts counts. Provider endpoints that produce zero applied facts across the golden set become candidates for the next cull pass.

### Task 6: pre-synthesis evidence gate for analysis mode

Why: 7+ recent analysis runs (`oboe.com`, `daytona.io`, `substack.com`, `perceptic.com`, `lumalabs.ai`) entered synthesis and verify on cards that did not have enough cited substance, then failed `zero_analysis_evidence`. Each one paid full synthesis + verify cost for nothing.

What:

- Before invoking `synthesizeCard`, compute a minimum-substance check on the input card: at least N citations (target: 8) from at least two distinct `sourceType`s (`company_site`, `news`, `filing`, `independent_analysis`), and at least one of (`funding.totalRaisedUsd`, `funding.lastRound`) populated with citations, and at least one named person on the team.
- If the check fails, do not call `synthesizeCard`. Mark the synthesis trace with `produced: false, claimCountBeforeVerify: 0, claimCountAfterVerify: 0, gateMessage: "insufficient evidence for synthesis"` and surface that explicitly to the caller. The current path treats absence of synthesis as a fatal failure for analysis mode; this should now be a soft failure with the public card returned and `synthesis: undefined`.
- Add a separate config `ANALYSIS_SYNTHESIS_MIN_CITATIONS` (default 8) so the threshold can be tuned without code change.

Files: `packages/pipeline/src/generate-card.ts` (the `hasSynthesisDeps` branch and `verifiedSynthesisForCard`), `apps/web/src/inngest/functions.ts`, `packages/core/src/card.ts` only if the synthesis trace shape needs an additional field for the gate result.

Acceptance:

- Re-running the failed `oboe.com` / `daytona.io` analysis runs against the gate produces zero LLM calls for the synthesis and verify stages on weak cards, recorded in `trace.synthesis.gateMessage`.
- No regression in successful analysis runs that previously passed verify on strong cards.
- `synthesis_required` callers receive a clear non-fatal "insufficient evidence" path and surface it in the extension UI as "synthesis not yet available" rather than as a generation failure.

### Task 7: tighten the Anthropic extract evidence payload

Why: `extract_full` is the largest single Anthropic call in a basics run. Evidence payloads include up to 57 accepted sources for modal.com. Truncating low-signal sources before sending to extraction cuts input tokens directly.

What:

- In `evidenceForExtractionPrompt` (`packages/llm/src/extraction.ts`), already truncates raw text per source. Add a source-level budget: cap total prompt evidence at, e.g., 24,000 characters total across all sources, biased to high-trust source types (`filing` > `independent_analysis` > `company_site` > `news` > `enrichment`).
- Confirm with `npm run verify:cache-ttl` after the change that cache hit rates do not regress (system prompt still cached, message body still variable).
- Do not change the system prompt; the cached prefix matters more than the variable body for cost on a repeat run.

Files: `packages/llm/src/extraction.ts`, `packages/llm/src/research-section.ts` (apply the same budget there).

Acceptance: `extract_full` input tokens per modal.com basics run drop by ≥20 percent; `cacheReadInputTokens` ratio across runs does not regress; citation count per card does not regress.

### Task 8: documentation and benchmark hygiene

Why: this plan ships measurement changes. The QA docs need to mirror them.

What:

- Update `docs/qa/generation-trace-and-production-qa.md` with the new milestone fields and the new wallet-delta fields. Add a one-paragraph "how to read this trace" for the new schema.
- Add a `docs/qa/post-cost-cuts-test-guide.md` follow-up note (the file exists) covering the new acceptance gates from this plan.
- Document the new env knobs: `CONTACT_ENRICHMENT_ENABLED`, `CONTACT_ENRICHMENT_TIER`, `PER_RUN_AGENTCASH_BUDGET_USD`, `ANALYSIS_SYNTHESIS_MIN_CITATIONS` — in `README.md` env section and in `apps/web/src/lib/env.ts` if there's a validated env loader (there is; mirror them).

Acceptance: `npm run check` passes including any new tests. New env vars are read once at startup and not re-read per call.

## 8. Tests and verification commands

After implementing each task, run:

```bash
npm run typecheck
npm run lint
npm run secrets:check
npm test
npm run knip
```

Targeted tests per task:

- Task 1: add a vitest case in `apps/web` (or `@cold-start/pipeline`) that asserts `trace.milestones.firstUsableCardMs` is greater than `seedCardMs` and both are at least `1`. Add a test that simulates Inngest replay by invoking the milestone-writing code twice with the same event timestamp.
- Task 2: add a unit test that `agentcashWalletSnapshot` returns a number and that snapshot-around-noop is zero, mocking the CLI.
- Task 3: add a vitest that asserts when `CONTACT_ENRICHMENT_ENABLED=false`, the main generate function never dispatches `card/contact-enrichment.requested`. Add a test that the main generate function returns a saved card before the contact-enrichment function would have completed.
- Task 4: extend `packages/providers/provider-budget` tests to assert the new `maxCallsPerRun` and per-stage budget fields. Add a unit test that the duplicate `apollo_people_search` no longer appears in `buildStableenrichRequests`.
- Task 5: add a pipeline test that exposes `factsAppliedCount` per endpoint after a synthetic fact merge.
- Task 6: add a `verifiedSynthesisForCard` test where the input card has 3 citations and the gate prevents synthesis dispatch.
- Task 7: add a snapshot/character-count test for `evidenceForExtractionPrompt` against a fixture with many sources.

End-to-end verification (no paid live calls, runs against stored traces and golden seed):

```bash
npm run trace:generation -- --limit 20 --quality
npm run trace:generation -- --domain modal.com --detail --quality
npm run eval:golden -- --dry-run --limit 12
npm run evo:generation-benchmark -- --env-file ./.env.production.migrate.local --limit 12 --json
```

Paid live re-baseline (only with operator approval, on a single domain like `modal.com`):

```bash
set -a; source .env.production.migrate.local; set +a
npm run qa:generation
```

Acceptance for the whole plan:

- Modal-class basics run wall-clock < 2 minutes to `firstUsableCardMs`, < 5 minutes to `card.enriched`.
- AgentCash actual wallet delta per basics run < $1.00 on a representative golden subset.
- Anthropic per-basics cost ≤ $0.18 (unchanged) and per-analysis cost ≤ $0.10 on reuseExisting path.
- No regression in median citations (target ≥ baseline of recent good runs, e.g., ≥ 20 for modal.com basics).
- No regression in `publicProfileQuality` checks; `hasUsablePublicProfile` rate at or above baseline across golden set.
- No public synthesis leak (covered by existing tests).
- Zero increase in provider failure counts attributable to this work.
- `npm run check` passes.

## 9. Evo recommendation

Use Evo, but only after Tasks 1 and 2 land. The existing `evo:generation-benchmark` is the right benchmark; it is just blind right now because `firstUsableCardMs` is broken. Once Tasks 1-2 land:

- Benchmark command: `npm --prefix {worktree} run evo:generation-benchmark -- --env-file /Users/samaydhawan/Projects/active/cold-start/.env.production.migrate.local --limit 12 --json`
- Metric direction: max.
- Score formula: lives in `scripts/evo-generation-benchmark.ts:score`. Do not change the weights in this plan. Once we have honest first-usable telemetry and real wallet deltas, the existing weights (30 first-usable, 18 budgeted-no-fact timeout, 12 cost, 12 contacts, 10 wasted, 15 coverage, 8 citations, 8 budgeted-no-fact cost, 5 reliability) are reasonable. Re-evaluate after first Evo round.
- Required gates for promoted winners:
  - `npm run check`
  - `npm run eval:golden -- --dry-run --limit 12`
  - `npm test -w @cold-start/core -- generation-quality`
  - `npm test -w @cold-start/providers -- provider-budget`
  - `npm test -w @cold-start/pipeline -- cost`
  - `npm test -w @cold-start/web -- generate-route extension-bootstrap-route`
  - `npm run evo:generation-benchmark -- --env-file .env.production.migrate.local --limit 12 --min-score <baseline + 5>` (`baseline` measured after Tasks 1-7 land).
- Files Evo is allowed to touch: `packages/providers/src/stableenrich.ts` (caps, ordering), `packages/providers/src/provider-budget.ts`, `packages/providers/src/direct-exa.ts` (query shapes only), `packages/pipeline/src/seed-profile.ts`, `apps/web/src/inngest/functions.ts` (only the orchestration around dispatch ordering and budgets), and `packages/llm/src/extraction.ts` evidence-payload budgets. Evo is **not** allowed to touch `packages/core/src/card.ts`, the verifier, `apps/web/src/lib/extension-auth.ts`, or any synthesis system prompt.
- Artifacts that must stay out of `main`: `.evo/`, worktree directories, benchmark JSON dumps. Promoted diffs require a human-reviewed PR.
- Human review required when: any diff touches `provider-budget.ts` (cost ceilings), any diff changes the public/private boundary in extraction or synthesis output, any diff changes `hasUsablePublicProfile` thresholds.

Do not run Evo in this planning session. Do not run Evo as the first Codex task. Run Evo after Tasks 1-7 are in `main` and traces show the new telemetry working.

## 10. Risks and rollback

Risks:

- **R1 (high):** Deferring contact enrichment can produce a card that visibly lacks emails for a window of seconds-to-minutes. Users may file this as a regression. Mitigation: show a small "contacts loading" state in the extension when the card row exists but `contactsReadyMs` milestone is unset. Mitigation 2: keep the wallet-exhaustion abort behavior intact so we never produce a card with permanently-missing contacts due to budget.
- **R2 (medium):** Lowering caps (`MAX_HUNTER_CANDIDATES` from 36 to 6) may miss verified emails for noisy companies. Mitigation: keep the named-people-first Hunter path; if `org_enrichment` and Direct Exa already named the founders, Hunter just verifies known candidates rather than guessing.
- **R3 (medium):** Skipping StableEnrich Exa probes when Direct Exa returns can reduce fact recall for the few cases where the wrapped probes had a quirky boost (date weighting, livecrawl tuning). Mitigation: ship the cheap-first policy behind a config flag (`CHEAP_FIRST_EXA_ENABLED`, default true) and roll back via env if recall regresses on the golden set.
- **R4 (low):** The pre-synthesis gate may refuse synthesis on cards that would have eventually produced a single supportable claim. Mitigation: threshold is configurable; failure path is "synthesis not yet available" rather than full run failure, so the operator's experience improves rather than worsens.
- **R5 (low):** Wallet-balance snapshot adds two AgentCash CLI calls per run. These are read-only and free, but they add ~1-2 seconds. Mitigation: snapshot is non-blocking from the user-visible-card perspective because it runs around the existing `mark-generation-running` and `mark-generation-complete` steps.

Rollback strategy:

- Every behavioral change in Tasks 3-6 is gated by an env flag (`CONTACT_ENRICHMENT_ENABLED`, `PER_RUN_AGENTCASH_BUDGET_USD`, `CHEAP_FIRST_EXA_ENABLED`, `ANALYSIS_SYNTHESIS_MIN_CITATIONS`). Setting each to the "old" value reverts behavior without redeploy.
- Tasks 1, 2, and 5 are observation-only changes (new fields on traces). Rollback is safe because nothing reads the new fields except the trace viewer and the Evo benchmark. The benchmark already falls back when fields are absent.
- Task 7 (Anthropic evidence budget) can be reverted by setting `EXTRACTION_EVIDENCE_BUDGET_CHARS` very high (e.g., 1,000,000), effectively disabling the budget.

## 11. Where to start

The first thing Codex should do, in order:

1. Read this plan top to bottom.
2. Read `AGENTS.md`, `SECURITY.md`, `apps/web/src/inngest/functions.ts`, `packages/providers/src/stableenrich.ts`, `packages/pipeline/src/generate-card.ts`, `packages/providers/src/agentcash.ts`, and `scripts/evo-generation-benchmark.ts`.
3. Re-pull recent traces with `npm run trace:generation -- --limit 20 --quality` and `npm run trace:generation -- --domain modal.com --detail` to confirm the current state matches Section 2.
4. Implement Task 1. Open a PR. Land it.
5. Implement Task 2. Open a PR. Land it.
6. Re-pull traces, confirm new milestones and wallet deltas populate.
7. Continue with Tasks 3-7 in order. Tasks 5 and 6 can be parallelized with Task 4 if needed.
8. Only after Tasks 1-7 ship and the benchmark shows real improvement, plan a single Evo round per Section 9.

End of plan.
