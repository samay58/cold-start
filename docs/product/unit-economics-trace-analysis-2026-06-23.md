# Cold Start unit economics and production trace analysis

Date: 2026-06-23
Scope: evidence-first analysis only. No product changes.

Follow-on operating playbook: `docs/product/research/cost-quality-optimization-playbook-2026-06-23.md`.

## Executive summary in simple English

A fresh public profile costs about **$0.29 in the median recorded-trace case** and **$0.39 at p90** across the recent production basics sample. After correcting Websets to current official billing, the safer planning numbers are **about $0.335 median** and **$0.445 p90** for basics. A full fresh profile, meaning a linkable basics run plus Investor Lens analysis, costs about **$0.435 median** and **$0.574 p90** in recorded traces. With the Websets correction, use **about $0.481 median** and **$0.611 p90** as the safer planning range.

The main cost drivers are **Websets contact enrichment, AgentCash/StableEnrich wallet spend, and provider fan-out**. LLM spend is not the main basics cost anymore. In the 28 complete basics runs, average cost share was roughly **57% Websets**, **35% AgentCash**, **4% LLM**, and **4% Direct Exa** using recorded trace estimates. For analysis runs, Websets was absent in the sample; analysis cost was mostly AgentCash plus one Claude Sonnet synthesis call and one DeepSeek verifier call.

A **$20/month plan is plausible only with run caps and cache reuse**. At a 70% gross-margin target, $20 leaves $6 of COGS. That supports roughly **12 full fresh profiles at the median corrected cost**, **10 at p75**, or **9 at p90**. At an 85% gross-margin target, the same plan supports only **6 median** or **4 p90** full fresh profiles. Unlimited fresh obscure-company generation is not plausible.

The biggest risk is not LLM tokens. It is **silent provider-side spend from contact enrichment and paid source fan-out**, especially when users generate obscure companies or repeatedly retry failed profiles. The next thing to measure is **cache-hit economics and per-user generation behavior**, because generation rows only capture cold work, not cheap cached reads.

Recommendation: keep friend alpha free, but enforce server-side caps. Defer billing UI until after friend-alpha usage data. Price around credits, not unlimited access. Basics and Investor Lens should consume separate credits because they have different cost structures and user intent.

## What data was used

Primary production trace sample:

| Dataset | Source | Coverage | Notes |
|---|---:|---:|---|
| Production generation runs | `generation_runs.trace_json` via `npm run trace:generation -- --limit 100 --json` | 100 latest rows | Read-only production DB export on 2026-06-23. Raw export is local private data under `docs/product/research/private-analysis/`. |
| Complete basics runs | Same export | 28 rows | Used for basics distribution. |
| Complete analysis runs | Same export | 4 rows | Small sample. Treat analysis distribution as directional. |
| Complete section runs | Same export | 65 rows | Useful for per-section cost, not full-profile economics. |
| Failed runs | Same export | 3 rows | Used for paid-failure caveats. |
| Current card snapshots | `cards.card_json`, `citations`, `sources`, `research_sections` for domains in trace sample | 30 of 31 domains | Read-only production query. These are current card snapshots, not immutable per-run outputs. |

Private local artifacts:

| Artifact | Purpose |
|---|---|
| `docs/product/research/private-analysis/generation-runs-2026-06-23.clean.json` | Cleaned production trace export. |
| `docs/product/research/private-analysis/analysis-summary-2026-06-23.json` | Derived distributions, outlier lists, endpoint and LLM aggregates. |
| `docs/product/research/private-analysis/runs-summary-2026-06-23.csv` | Row-level normalized trace summary. |
| `docs/product/research/private-analysis/card-quality-2026-06-23.json` | Current card quality snapshot for traced domains. |

Provenance rule used in this brief:

| Figure type | Provenance |
|---|---|
| Production cost and duration figures | Run ID, company/domain, timestamp, and `trace` field path. |
| Code constants and cost formulas | File path and line number. |
| External pricing | Official provider URL, accessed 2026-06-23. |
| Derived pricing scenarios | Formula shown in appendix. |

## Cost model from code

Cold Start has four practical cost streams in current traces:

| Stream | Trace path | Real or estimated | Code/source |
|---|---|---|---|
| LLM spend | `trace.costUsdAnthropic`, fallback `trace.llm.totalEstimatedCostUsd` | Estimated from provider-reported token usage and pricing tables | Trace schema in `packages/core/src/generation-trace.ts:50-71` and `:160-165`; Anthropic estimator in `packages/llm/src/anthropic.ts:46-84`; non-Anthropic estimator in `packages/llm/src/pricing.ts:20-50`. |
| StableEnrich/AgentCash | `trace.costUsdAgentcash`, fallback `trace.providers.stableenrich.walletDeltaUsd` | Real wallet delta when snapshots succeed | Trace schema in `packages/core/src/generation-trace.ts:130-141` and `:160`; budget ceilings in `apps/web/src/inngest/provider-trace.ts:68-87`. |
| Direct Exa | `trace.providers.directExa.estimatedCostUsd` | Estimated from successful search request count | Trace schema in `packages/core/src/generation-trace.ts:120-129`; `DIRECT_EXA_SEARCH_COST_USD = 0.007` in `packages/providers/src/direct-exa.ts:6-13`. Official Exa pricing says Search is `$7/1k requests` with up to 10 results, matching `$0.007/request`. |
| Websets | `trace.providers.websets.estimatedCostUsd` | Estimated from item count and credit cost | Trace schema in `packages/core/src/generation-trace.ts:142-155`; estimator in `packages/providers/src/websets.ts:7-17`. Current official billing differs from the code assumption; see below. |

Important code-derived mechanics:

| Mechanic | Evidence |
|---|---|
| Generation rows store `cost_usd` and `trace_json`; cards store `card_json`. | `packages/db/src/schema.ts:31-50` and `:105-120`. |
| Cost summing rounds to 4 decimals and rejects negative or nonfinite lines. | `packages/pipeline/src/cost.ts:1-15`. |
| StableEnrich endpoint budget metadata is attached from the provider registry. | `apps/web/src/inngest/provider-trace.ts:31-51`; endpoint estimates in `packages/providers/src/provider-budget.ts:22-196`. |
| Default AgentCash budget ceiling is `$0.30` for basics and `$0.50` for analysis unless overridden. | `apps/web/src/inngest/provider-trace.ts:68-77`. |
| Section jobs are standalone LLM passes and record section cost separately. | `apps/web/src/inngest/functions.ts:539-643`. |
| Basics runs can save a seed profile, then request async contact enrichment. | `apps/web/src/inngest/functions.ts:713-761`. |
| Analysis can reuse an existing stored card, then run synthesis and verification. | `apps/web/src/inngest/functions.ts:668-679` and `:764-820`. |
| Public profile quality thresholds are 4 structured facts, 2 visible facts, and 3 source-backed citations for investor readiness. | `packages/core/src/card-quality.ts:5-8`, `:128-177`. |

Pricing-table verification:

| Provider | Code assumption | Official source check |
|---|---|---|
| Anthropic Sonnet | `$3/M` input, `$15/M` output, 1h cache write 2x input, cache read 0.1x input | Official Anthropic pricing page, accessed 2026-06-23. Code matches the published Sonnet and cache multipliers. |
| DeepSeek v4 flash | `$0.14/M` cache miss input, `$0.0028/M` cache hit input, `$0.28/M` output | Official DeepSeek Models and Pricing page, accessed 2026-06-23. Code matches. |
| Direct Exa Search | `$0.007/request` | Official Exa pricing and changelog, accessed 2026-06-23. Code matches `$7/1k requests`. |
| Websets | Code uses 12 credits per item at `$49/8,000 credits`, or `$0.0735/item` | Official Websets billing, accessed 2026-06-23, says Starter is `$49/month` for 8,000 credits, 10 credits per matching result, and 5 credits per email or phone number. For people email enrichment this implies 15 credits per item, or `$0.091875/item`, unless the implementation has a reason not visible in traces. Treat recorded Websets cost as likely understated by 25% for email-enriched items. |

Do not blindly trust these fields:

| Field | Issue |
|---|---|
| `generation_runs.cost_usd` | Historically named for LLM/Anthropic spend. It does not include AgentCash, Direct Exa, or Websets. Use component traces instead. |
| StableEnrich endpoint `estimatedCostUsd` | Registry budget, not observed wallet spend. Use `walletDeltaUsd` when present. |
| Websets `estimatedCostUsd` | Code-derived estimate. Current official billing appears to require 15 credits per email item, while code uses 12 credits. |
| Current card quality metrics | Current snapshot, not immutable per-run lineage. Useful directionally, not exact for historical cost-per-fact. |
| Cache-hit economics | Generation rows capture work, not cheap cached reads. Cached reads are under-instrumented for pricing analysis. |

## Production trace distribution

All costs below are USD. “Trace recorded” uses exactly the trace fields stored in production. “Websets corrected” replaces only Websets cost with `itemCount * 15 credits * ($49/8,000 credits)` based on current official Websets billing.

### Basics runs

Complete basics sample: 28 runs.

| Cost basis | n | min | p25 | median | p75 | p90 | p95 | max |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Trace recorded cost | 28 | 0.1602 | 0.2272 | 0.2901 | 0.3191 | 0.3900 | 0.3927 | 0.4590 |
| Websets-corrected cost | 28 | 0.1602 | 0.2639 | 0.3349 | 0.3697 | 0.4451 | 0.4478 | 0.4957 |

Duration distribution for complete basics runs:

| n | min | p25 | median | p75 | p90 | p95 | max |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 28 | 56.5s | 67.2s | 91.0s | 111.6s | 119.2s | 126.1s | 183.1s |

Component distribution for basics:

| Component | min | p25 | median | p75 | p90 | max | Average share of recorded total |
|---|---:|---:|---:|---:|---:|---:|---:|
| LLM | 0.0024 | 0.0076 | 0.0114 | 0.0180 | 0.0207 | 0.0270 | 4.4% |
| AgentCash | 0.0126 | 0.0621 | 0.0965 | 0.1334 | 0.1503 | 0.2746 | 35.2% |
| Direct Exa | 0.0070 | 0.0070 | 0.0070 | 0.0070 | 0.0210 | 0.0210 | 3.5% |
| Websets recorded | 0.0000 | 0.1470 | 0.1470 | 0.2205 | 0.2205 | 0.2205 | 57.0% |

Cost per citation for basics, using trace recorded total and `trace.extraction.citationCount`:

| n | min | p25 | median | p75 | p90 | p95 | max |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 28 | 0.0115 | 0.0178 | 0.0233 | 0.0312 | 0.0451 | 0.0508 | 0.0560 |

### Analysis runs

Complete analysis sample: 4 runs. This is too small for confident long-term distribution, but enough to see the current shape.

| Cost basis | n | min | p25 | median | p75 | p90 | p95 | max |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Trace recorded cost | 4 | 0.1416 | 0.1532 | 0.2034 | 0.2653 | 0.2933 | 0.3027 | 0.3120 |
| Websets-corrected cost | 4 | 0.1416 | 0.1532 | 0.2034 | 0.2653 | 0.2933 | 0.3027 | 0.3120 |

Analysis duration:

| n | min | median | p75 | max |
|---:|---:|---:|---:|---:|
| 4 | 92.1s | 109.4s | 110.1s | 112.0s |

Analysis component shape:

| Component | median | max | Average share of recorded total |
|---|---:|---:|---:|
| LLM | 0.0498 | 0.0585 | 23.4% |
| AgentCash | 0.1326 | 0.2325 | 66.9% |
| Direct Exa | 0.0210 | 0.0210 | 9.8% |
| Websets | 0.0000 | 0.0000 | 0.0% |

Cost per supported synthesis claim, using `trace.synthesis.claimCountAfterVerify`:

| n | min | p25 | median | p75 | p90 | max |
|---:|---:|---:|---:|---:|---:|---:|
| 4 | 0.0157 | 0.0227 | 0.0298 | 0.0378 | 0.0434 | 0.0472 |

### Linkable basics plus analysis

Only 4 analysis rows linked cleanly to a prior complete basics run for the same domain in this 100-row export. Use as a current example set, not a universal distribution.

| Cost basis | n | min | p25 | median | p75 | p90 | p95 | max |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Trace recorded total | 4 | 0.3360 | 0.3770 | 0.4350 | 0.5132 | 0.5741 | 0.5944 | 0.6147 |
| Websets-corrected total | 4 | 0.3727 | 0.4274 | 0.4809 | 0.5499 | 0.6108 | 0.6311 | 0.6514 |

Linked full-profile examples:

| Domain | Basics run | Analysis run | Trace recorded total | Websets-corrected total |
|---|---|---|---:|---:|
| `datologyai.com` | `49fc8e9d-c05a-4511-ab46-928795ed335c` | `d64ad75e-5d61-43ce-92bf-f8f4a1f3d30f` | 0.3906 | 0.4457 |
| `volleygames.com` | `af128537-483f-4573-8292-a4f4b5cd6397` | `424968a4-a805-43c5-8967-e99eeea3e2c2` | 0.3360 | 0.3727 |
| `vuoriclothing.com` | `95db153c-9af9-4902-bb69-0167689851a7` | `49cdbf79-b508-4afb-9395-78c32df354f0` | 0.4794 | 0.5161 |
| `rillet.com` | `cfcd22dd-a7fc-436b-9470-e3d68015632c` | `ba65587f-fe41-4149-a7e8-615a749ade03` | 0.6147 | 0.6514 |

### Section jobs

Complete section sample: 65 runs.

| n | min | p25 | median | p75 | p90 | p95 | max |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 65 | 0.0048 | 0.0216 | 0.0333 | 0.0384 | 0.0454 | 0.0492 | 0.0529 |

Section jobs are cheap relative to fresh profiles, but they are not free. They are single research-section LLM passes, normally Claude Sonnet, with no provider retrieval in the traced section rows.

### Current card output quality snapshot

This snapshot covers 30 domains from the trace sample. It is current card state, not per-run immutable output.

| Metric | n | min | p25 | median | p75 | max |
|---|---:|---:|---:|---:|---:|---:|
| Structured fact count | 30 | 5 | 8 | 8 | 8 | 8 |
| Visible fact count | 30 | 2 | 5 | 5 | 5 | 5 |
| Citation count | 30 | 1 | 14 | 15 | 16 | 25 |
| Available research sections | 30 | 1 | 5 | 5 | 6 | 9 |

Interpretation: current output quality is generally strong for the domains found in the trace export. The cost problem is not that the product is spending heavily and producing nothing. The bigger issue is deciding how much paid contact/source enrichment should be included by default.

## Cost drivers

### What actually drives high cost

1. **Websets contact enrichment dominates basics variance.** Recorded Websets estimates are usually `$0.147` for 2 items or `$0.2205` for 3 items. With current official billing, those should likely be `$0.1837` and `$0.2756`. In basics, recorded Websets spend is 57% of average total cost.

2. **AgentCash wallet delta is the second largest basics component and the largest analysis component.** Basics AgentCash median is `$0.0965`, p90 `$0.1503`, max `$0.2746`. Analysis AgentCash median is `$0.1326`, max `$0.2325`.

3. **LLM cost is now small for basics because extraction mostly uses DeepSeek v4 flash.** The 34 traced `extract_full` calls across the sample cost `$0.2702` total. Basics LLM median is `$0.0114`; max is `$0.0270`.

4. **Analysis LLM is higher because synthesis uses Claude Sonnet.** In the 4 analysis runs, synthesis cost ranges around `$0.042` to `$0.058`; verify is DeepSeek and costs under one tenth of a cent per run.

5. **Provider fan-out increases both cost and latency.** Top-cost basics runs averaged 3.9 StableEnrich endpoint traces versus 2.46 across all basics; they also averaged 2.1 LLM calls versus 1.89 across all basics.

6. **Failures still spend money.** `usb.club` failed twice after provider and LLM work; each failed run spent about `$0.0909` trace-recorded cost and saved no usable profile.

7. **Source availability can reduce marginal model cost but increase provider cost.** More accepted sources and citations correlate with useful cards, but the expensive part is often paid retrieval and contact enrichment, not the final extractor.

### Endpoint-level yield

StableEnrich endpoint totals across the 100-row export:

| Endpoint | Calls | Success | Failed | Skipped | Budgeted cost | Facts | Applied facts |
|---|---:|---:|---:|---:|---:|---:|---:|
| `org_enrichment` | 13 | 9 | 4 | 0 | 0.2600 | 75 | 55 |
| `apollo_org_search` | 12 | 8 | 4 | 0 | 0.2400 | 0 | 0 |
| `apollo_people_search` | 12 | 8 | 4 | 0 | 0.2400 | 0 | 0 |
| `firecrawl_homepage` | 13 | 13 | 0 | 0 | 0.1300 | 0 | 0 |
| `firecrawl_about` | 10 | 9 | 1 | 0 | 0.1000 | 0 | 0 |
| `firecrawl_team` | 10 | 8 | 2 | 0 | 0.1000 | 0 | 0 |
| `exa_recent_signals` | 7 | 7 | 0 | 0 | 0.0700 | 35 | 26 |
| `exa_competition` | 8 | 8 | 0 | 0 | 0.0800 | 0 | 0 |
| `exa_independent_analysis` | 8 | 8 | 0 | 0 | 0.0800 | 0 | 0 |
| `exa_find_similar` | 8 | 8 | 0 | 0 | 0.0800 | 0 | 0 |

Interpretation: `org_enrichment` and `exa_recent_signals` produce applied facts. Several other endpoints frequently produce sources but no applied structured facts. That does not mean they are useless, because source text can still help extraction and citations, but “endpoint facts applied” is the wrong sole yield metric. The missing metric is marginal card-quality lift per endpoint.

### LLM stage totals

| Provider/model/stage | Calls | Total estimated cost | Input tokens | Output tokens | Cache-read tokens | Cache-create tokens |
|---|---:|---:|---:|---:|---:|---:|
| Anthropic `claude-sonnet-4-6` `research_section` | 65 | 1.9402 | 387,171 | 38,104 | 64,974 | 37,316 |
| DeepSeek `deepseek-v4-flash` `extract_full` | 34 | 0.2702 | 1,718,508 | 103,288 | 262,528 | 0 |
| Anthropic `claude-sonnet-4-6` `synthesis` | 4 | 0.1981 | 22,428 | 6,038 | 2,201 | 6,603 |
| DeepSeek `deepseek-v4-flash` `extract_block` | 27 | 0.1019 | 691,269 | 17,864 | 51,712 | 0 |
| DeepSeek `deepseek-v4-flash` `verify` | 4 | 0.0029 | 10,898 | 4,732 | 0 | 0 |

## Outlier case studies

### Most expensive basics run: `etched.com`

Run: `b15c35a2-24ac-41f0-ad2a-f55ca31a4f17`, started `2026-06-22T14:40:21.737Z`, job `basics`, status `complete`.

| Component | Field path | Cost |
|---|---|---:|
| DeepSeek extraction and block enrichment | `trace.costUsdAnthropic` / `trace.llm.calls[]` | 0.0164 |
| AgentCash wallet delta | `trace.costUsdAgentcash` | 0.2746 |
| Direct Exa | `trace.providers.directExa.estimatedCostUsd` | 0.0210 |
| Websets recorded | `trace.providers.websets.estimatedCostUsd` | 0.1470 |
| Total recorded | sum | 0.4590 |
| Total Websets-corrected | inferred | 0.4957 |

What happened: the run accepted 17 sources, produced 15 citations, and current card state shows 8 structured facts, 5 visible facts, and 6 available research sections. It ran 3 LLM calls: two `extract_full` attempts and one `extract_block` for team. It also ran Websets over 2 people and had a high AgentCash wallet delta.

Judgment: the output was useful, but the expensive part was not the model. Cost reduction should start with contact enrichment policy and AgentCash fan-out, not with shaving DeepSeek extraction tokens.

### Most expensive analysis run: `rillet.com`

Run: `ba65587f-fe41-4149-a7e8-615a749ade03`, started `2026-06-22T14:42:33.058Z`, job `analysis`, status `complete`.

| Component | Field path | Cost |
|---|---|---:|
| Claude synthesis plus DeepSeek verify | `trace.costUsdAnthropic` / `trace.llm.calls[]` | 0.0585 |
| AgentCash wallet delta | `trace.costUsdAgentcash` | 0.2325 |
| Direct Exa | `trace.providers.directExa.estimatedCostUsd` | 0.0210 |
| Total | sum | 0.3120 |

What happened: 36 sources survived, 21 citations were extracted, 5 of 15 provider fact candidates were applied, and verification dropped 4 of 13 synthesis claims, leaving 9 supported claims. Current card state has synthesis present, 21 citations, 8 structured facts, 5 visible facts, and 7 available sections.

Judgment: this was an expensive but justified analysis run. The paired full profile, including prior basics run `cfcd22dd-a7fc-436b-9470-e3d68015632c`, cost `$0.6147` recorded and `$0.6514` Websets-corrected. That is the right “expensive but acceptable” planning anchor.

### Cheapest useful basics run: `tessl.io`

Run: `a91770c1-bebf-4f03-881d-a4f4b5cd6397`, started `2026-06-22T16:48:05.698Z`, job `basics`, status `complete`.

| Component | Cost |
|---|---:|
| LLM | 0.0069 |
| AgentCash | 0.0226 |
| Direct Exa | 0.0070 |
| Websets recorded | 0.1470 |
| Total recorded | 0.1835 |
| Total Websets-corrected | 0.2202 |

What happened: one DeepSeek extraction call, 26 accepted sources, 16 citations, no rejected sources, 2 Websets email items. Current card state shows 16 citations, 8 structured facts, 5 visible facts, and 5 available sections.

Judgment: this is the good-case product shape. Public evidence was abundant, extraction was cheap, and the profile was strong. Even here, Websets dominates the bill. If contact emails are not part of first-read value, they should be optional or delayed.

### Synthesis/verifier issue: `datologyai.com`

Run: `d64ad75e-5d61-43ce-92bf-f8f4a1f3d30f`, started `2026-06-23T16:29:53.233Z`, job `analysis`, status `complete`.

| Component | Cost |
|---|---:|
| LLM | 0.0428 |
| AgentCash | 0.0778 |
| Direct Exa | 0.0210 |
| Total | 0.1416 |

What happened: 30 accepted sources and 15 citations, but the verifier dropped 9 of 12 synthesis claims, leaving only 3 supported claims. Current card state still has strong public quality: 15 citations, 8 structured facts, 5 visible facts, and 8 available sections.

Judgment: low cost, but low surviving synthesis yield. This is not a pricing problem as much as a Lens-quality problem. The product should not count every analysis run equally if it returns only a thin surviving Lens.

### High source rejection: `vuoriclothing.com`

Run: `49cdbf79-b508-4afb-9395-78c32df354f0`, started `2026-06-22T18:26:58.600Z`, job `analysis`, status `complete`.

| Component | Cost |
|---|---:|
| LLM | 0.0514 |
| AgentCash | 0.1773 |
| Direct Exa | 0.0210 |
| Total | 0.2497 |

What happened: 19 accepted sources, 17 citations, 3 of 15 provider facts applied, 3 verifier drops, 10 supported synthesis claims. The quality flag was `high_source_rejection` because many rejected sources were about similarly named or irrelevant entities.

Judgment: the run was still useful, but same-name ambiguity creates paid retrieval waste. Source disambiguation before enrichment is a cost lever that probably improves quality at the same time.

### Slow but cheap section run: `a24films.com`

Run: `53c2fdf8-615e-4b97-a088-dcaf1335c30c`, started `2026-06-16T22:01:26.013Z`, job `section:why_it_matters`, status `complete`.

Cost: `$0.0139`, all from one Claude Sonnet `research_section` call. Wall time was 90 seconds, while the LLM call itself was about 10 seconds.

Judgment: section jobs show that latency and cost are different problems. Slow section runs can be cheap; optimizing them is a UX/perceived-speed issue, not primarily a gross-margin issue.

### Fast but expensive basics run: `island.io`

Run: `305b49a9-e513-4a24-93bb-053972245dfd`, started `2026-06-16T18:53:34.074Z`, job `basics`, status `complete`.

Cost: `$0.3014` recorded, `$0.3565` Websets-corrected. Duration was 59 seconds. Websets recorded cost was `$0.2205` for 3 items, larger than LLM, AgentCash, and Direct Exa combined.

Judgment: fast does not mean cheap. If contact enrichment runs eagerly, the product can feel efficient while silently burning the margin budget.

### Paid failed runs: `usb.club`

Run: `31b6a054-639f-4897-97ec-01bca9383a4e`, started `2026-06-23T12:40:04.477Z`, job `basics`, status `failed`.

Cost: about `$0.0909` recorded, with `$0.0073` LLM, `$0.0626` AgentCash, and `$0.0210` Direct Exa. The failure was `generated basics underfilled public profile (4/4 structured facts, 1/2 visible facts, 9 citations; missing visible facts)`. A near-identical failed run, `3a93c5e6-45a5-4907-8671-dfade10fc215`, occurred two minutes earlier.

Judgment: retries can spend real money without producing a card. Billing and alpha caps must count failed cold attempts, or at least count repeated failed attempts against an internal abuse budget.

### Recognizable demo company: `exa.ai`

Run: `4f3d292b-0535-42bb-b1d1-070ed9955fcc`, started `2026-06-18T20:44:35.706Z`, job `basics`, status `complete`.

Cost: `$0.3045` recorded, `$0.3596` Websets-corrected. Current card state shows 15 citations, 8 structured facts, 5 visible facts, and 9 available sections.

Judgment: a recognizable, source-rich company still costs in the middle of the basics distribution if contact enrichment runs. The profile was strong, but the email path again dominates marginal spend.

## Pricing scenarios

Use Websets-corrected paired full-profile costs for pricing because they are more conservative and tied to current official billing. Planning anchors:

| Unit | Median | p75 | p90 |
|---|---:|---:|---:|
| Fresh basics only | 0.3349 | 0.3697 | 0.4451 |
| Fresh basics plus analysis | 0.4809 | 0.5499 | 0.6108 |
| Standalone section job | 0.0333 | 0.0384 | 0.0454 |

Formula:

`COGS budget = monthly price * (1 - target gross margin)`

`Included fresh full profiles = floor(COGS budget / observed full-profile cost)`

### Full fresh profiles supported per plan

| Plan | Gross margin target | COGS budget | Median profiles | p75 profiles | p90 profiles |
|---|---:|---:|---:|---:|---:|
| $10/mo | 50% | 5.00 | 10 | 9 | 8 |
| $10/mo | 70% | 3.00 | 6 | 5 | 4 |
| $10/mo | 85% | 1.50 | 3 | 2 | 2 |
| $20/mo | 50% | 10.00 | 20 | 18 | 16 |
| $20/mo | 70% | 6.00 | 12 | 10 | 9 |
| $20/mo | 85% | 3.00 | 6 | 5 | 4 |
| $49/mo | 50% | 24.50 | 50 | 44 | 40 |
| $49/mo | 70% | 14.70 | 30 | 26 | 24 |
| $49/mo | 85% | 7.35 | 15 | 13 | 12 |
| $99/mo | 50% | 49.50 | 102 | 90 | 81 |
| $99/mo | 70% | 29.70 | 61 | 54 | 48 |
| $99/mo | 85% | 14.85 | 30 | 27 | 24 |

### Normal investor case

Assumption: 4 to 8 fresh full profiles per month, with cached reads free or near-free.

| Usage | Median full-profile COGS | p90 full-profile COGS |
|---|---:|---:|
| 4 full profiles/month | 1.92 | 2.44 |
| 8 full profiles/month | 3.85 | 4.89 |
| 12 full profiles/month | 5.77 | 7.33 |

Interpretation: a $20 plan can work for normal investor usage at 70% gross margin if it includes roughly 8 to 10 fresh full profiles and cached cards are cheap. At 85% margin, even 8 all-fresh full profiles is too many unless some runs are basics-only, cached, or contact-light.

### Heavy-user abuse case

Assumption: obscure fresh generations, no useful cache reuse.

| Usage | Basics p90 corrected | Full-profile p90 corrected |
|---|---:|---:|
| 100 fresh/month | 44.51 | 61.08 |
| 200 fresh/month | 89.02 | 122.16 |

Interpretation: unlimited fresh generation breaks every low-price plan. Even a $99 plan at 70% margin has only `$29.70` COGS budget. A 100-run heavy user can exceed that on basics alone.

### Credit packaging

Best current credit model:

| Action | Suggested credit treatment | Why |
|---|---|---|
| Cached public card read | Free or very cheap | No production generation row, DB read only. Instrument before pricing as truly free. |
| Fresh basics generation | 1 credit | Median corrected cost around `$0.335`, p90 around `$0.445`. |
| Investor Lens analysis | 1 additional credit | Analysis has separate user intent and separate COGS, median around `$0.203`, max `$0.312` in small sample. |
| Deep section job | Fractional or bundled small credit | Median section cost around `$0.033`, but many sections can stack. |
| Contact/email enrichment | Separate hidden internal budget or explicit premium path | Websets is the dominant basics cost and may not be needed for first-read value. |

Pricing implication:

| Plan shape | Plausible included fresh work |
|---|---|
| Free friend alpha | 5 to 10 fresh basics, 2 to 4 Investor Lens runs, hard server-side cap. |
| $10 personal | 4 to 6 full profiles or 8 to 10 basics, no unlimited fresh generation. |
| $20 personal | 8 to 10 full profiles or 15 to 18 basics at 70% margin, plus cached reads. |
| $49 pro personal | 24 to 30 full profiles at 70% margin, maybe higher if cache reuse is real. |
| $99 power user | 48 to 60 full profiles at 70% margin, but still needs abuse caps. |

## Recommendation

Do not build billing yet. Run friend alpha with hard server-side caps and better instrumentation.

Product and pricing recommendations:

| Recommendation | Rationale |
|---|---|
| Keep friend alpha free, capped, and monitored. | The unit economics are promising, but usage shape is still unknown. |
| Separate basics and Investor Lens credits. | Basics is provider/contact-heavy. Analysis is synthesis/verify-heavy and lower incremental cost in this sample. |
| Do not include unlimited fresh generations in any low-price plan. | 100 fresh obscure basics at p90 costs roughly `$45` after Websets correction. |
| Make cached public cards free or cheap, but instrument cache reads first. | Cache reuse is essential to a $20 plan, but this trace sample does not measure cache-hit behavior. |
| Treat contact enrichment as optional or delayed unless it is visibly valuable. | Websets dominates basics cost and current billing suggests the trace estimate may understate it. |
| Count failed cold attempts against internal caps. | Failed `usb.club` retries spent about `$0.09` each and produced no usable profile. |
| Optimize provider policy before LLM cost. | LLM cost is already small for basics because extraction runs on DeepSeek v4 flash. |

Short answer on the $20 plan: yes, plausible, but only as a capped-credit plan. A safe $20/month version is roughly **8 to 10 full fresh profiles per month at 70% margin**, plus cheap cached reads. If the target is 85% gross margin, cap closer to **4 to 6 full fresh profiles** unless friend-alpha data shows high cache reuse.

## What would change the recommendation

This recommendation would get more aggressive if:

| Change | Effect |
|---|---|
| Cache-hit usage is high. | $20 can include more perceived value because many reads are DB-only. |
| Contact enrichment is deferred or made explicit. | Basics median could fall materially because Websets dominates recent costs. |
| Websets pricing is negotiated or `EXA_WEBSETS_CREDIT_USD` is set to a cheaper tier. | The p75/p90 basics planning cost falls. |
| Analysis sample grows and stays near `$0.20` median. | Investor Lens can be priced as a cheap add-on credit. |
| Per-endpoint yield instrumentation shows certain provider calls add no quality. | Server-side fan-out can shrink without weakening the product. |

This recommendation would get more conservative if:

| Change | Effect |
|---|---|
| Friend alpha users generate obscure companies in bulk. | Heavy usage overwhelms $20 and $49 plans without caps. |
| Websets official billing correction is confirmed and current traces are undercounting. | Basics p90 should use the corrected `$0.445` or higher, not `$0.390`. |
| Failed/retried generations become common. | COGS rises without user-visible value. |
| Analysis runs often need fresh basics rather than stored-card reuse. | Full-profile cost matters more than analysis-only cost. |
| More section jobs are triggered per profile. | The Lens can quietly stack `$0.03` to `$0.05` calls. |

## Missing instrumentation

Highest-priority missing pieces:

| Gap | Why it matters |
|---|---|
| Cache-hit read telemetry by user/session. | Pricing depends on cached-card reuse, but generation traces only measure cold work. |
| User-level monthly run counts. | Subscription viability depends more on behavior distribution than single-run median. |
| Immutable output snapshot per generation run. | Current `cards.card_json` can be overwritten, so exact cost-per-visible-fact by run is not trustworthy. |
| Official Websets cost reconciliation. | Code assumes 12 credits per item; official billing says 15 credits for result plus email. |
| Per-endpoint marginal quality lift. | Endpoint facts applied is incomplete. We need “would the final card have been worse without this endpoint?” |
| Failed-run cost accounting. | Failed cold attempts must be counted in abuse and cap logic. |
| Contact-enrichment value tracking. | Email discovery is expensive; we need to know whether users notice or care. |
| Provider retry and timeout attribution. | Current traces show failures and timeouts, but not always whether the retry policy multiplied paid work. |
| Cost surface visible in admin/debug UI. | Operators need to see per-run components before pricing decisions. |

## Data integrity notes

Confirmed from production traces:

| Figure | Evidence |
|---|---|
| 100 latest production rows exported. | Read-only `trace:generation --limit 100 --json`, local private export. |
| 28 complete basics, 4 complete analysis, 65 complete sections, 3 failed. | `analysis-summary-2026-06-23.json`, derived from production export. |
| Basics recorded median `$0.2901`, p90 `$0.3900`, max `$0.4590`. | Production traces, component sum of `costUsdAnthropic`, `costUsdAgentcash`, `providers.directExa.estimatedCostUsd`, `providers.websets.estimatedCostUsd`. |
| Analysis recorded median `$0.2034`, max `$0.3120`. | Same export. Small sample. |
| Section median `$0.0333`, max `$0.0529`. | Same export. |
| `etched.com` expensive basics run details. | Run `b15c35a2-24ac-41f0-ad2a-f55ca31a4f17`, timestamp `2026-06-22T14:40:21.737Z`, field paths shown in case study. |
| `rillet.com` expensive analysis run details. | Run `ba65587f-fe41-4149-a7e8-615a749ade03`, timestamp `2026-06-22T14:42:33.058Z`. |
| `usb.club` failed-run cost. | Run `31b6a054-639f-4897-97ec-01bca9383a4e`, timestamp `2026-06-23T12:40:04.477Z`. |

Confirmed from code:

| Figure | Evidence |
|---|---|
| Direct Exa `$0.007/request`. | `packages/providers/src/direct-exa.ts:6-13`. |
| StableEnrich endpoint budgets `$0.01` or `$0.02`. | `packages/providers/src/provider-budget.ts:22-196`. |
| AgentCash ceilings `$0.30` basics, `$0.50` analysis. | `apps/web/src/inngest/provider-trace.ts:68-77`. |
| Websets estimator 12 credits/item at `$0.006125/credit`. | `packages/providers/src/websets.ts:7-17`. |
| Anthropic cost estimator and cache multipliers. | `packages/llm/src/anthropic.ts:46-84`. |
| DeepSeek v4 flash pricing table. | `packages/llm/src/pricing.ts:20-50`. |

Confirmed from external official pricing docs:

| Source | Used for |
|---|---|
| Anthropic pricing, accessed 2026-06-23: `https://docs.anthropic.com/en/docs/about-claude/pricing` | Sonnet input/output and cache multiplier verification. |
| DeepSeek Models and Pricing, accessed 2026-06-23: `https://api-docs.deepseek.com/quick_start/pricing` | DeepSeek v4 flash and v4 pro input/output/cache-hit rates. |
| Exa pricing, accessed 2026-06-23: `https://exa.ai/pricing` | Search `$7/1k`, Agent pricing, email enrichment pricing context. |
| Exa changelog pricing update, accessed 2026-06-23: `https://exa.ai/docs/changelog/pricing-update` | Search with contents `$7/1k` confirmation. |
| Websets billing, accessed 2026-06-23: `https://websets.exa.ai/websets/billing` | Starter `$49/month`, 8,000 credits, 10 credits per matching result, 5 credits per email or phone number. |

Estimates and assumptions:

| Item | Treatment |
|---|---|
| Websets corrected cost | Inference: `itemCount * 15 * (49 / 8000)`. Used only as safer planning number, not as confirmed billed amount. |
| Full-profile paired cost | Inference: nearest prior complete basics run for same domain plus analysis run. Small n of 4. |
| Normal investor usage | Assumption: 4 to 8 fresh full profiles per month. |
| Heavy-user abuse | Assumption: 100 or 200 obscure fresh generations per month with no cache reuse. |
| Cached card cost | Assumed near-zero marginal provider/LLM cost, but not measured in this export. |

Unknowns and suspicious fields:

| Item | Concern |
|---|---|
| Websets trace estimates | Likely undercount current official email-enrichment credit cost. |
| `generation_runs.cost_usd` | Not total COGS. Do not use alone. |
| StableEnrich endpoint status and cost | Endpoint budget is not wallet delta; wallet delta is better when present. |
| Card quality by historical run | Current card may reflect later enrichment or analysis. |
| Analysis distribution | Only 4 complete analysis rows in the latest 100. |

## Appendix: formulas and source citations

### Cost formulas

Recorded run cost:

```text
recorded_cost =
  (trace.costUsdAnthropic ?? trace.llm.totalEstimatedCostUsd ?? 0)
+ (trace.costUsdAgentcash ?? trace.providers.stableenrich.walletDeltaUsd ?? 0)
+ (trace.providers.directExa.estimatedCostUsd ?? 0)
+ (trace.providers.websets.estimatedCostUsd ?? 0)
```

Websets-corrected run cost:

```text
official_websets_credit_usd = 49 / 8000 = 0.006125
official_websets_credits_per_email_item = 10 matching-result credits + 5 email credits = 15
official_websets_cost = trace.providers.websets.itemCount * 15 * 0.006125
websets_corrected_cost = recorded_cost - recorded_websets_estimate + official_websets_cost
```

Gross-margin capacity:

```text
COGS budget = monthly price * (1 - gross margin target)
included runs = floor(COGS budget / observed unit cost)
```

Heavy-user abuse:

```text
100-run basics COGS = 100 * basics_p90_websets_corrected
200-run basics COGS = 200 * basics_p90_websets_corrected
100-run full-profile COGS = 100 * paired_full_profile_p90_websets_corrected
200-run full-profile COGS = 200 * paired_full_profile_p90_websets_corrected
```

### Source citations

Local code citations:

| Claim | Source |
|---|---|
| Trace includes provider endpoint, LLM, Direct Exa, StableEnrich, Websets, and top-level cost fields. | `packages/core/src/generation-trace.ts:36-71`, `:105-165`. |
| Direct Exa cost estimate is `$0.007/request`. | `packages/providers/src/direct-exa.ts:6-13`. |
| Websets code estimate is 12 credits per item at `$0.006125/credit`. | `packages/providers/src/websets.ts:7-17`. |
| StableEnrich endpoint budgets are `$0.01` or `$0.02`. | `packages/providers/src/provider-budget.ts:22-196`. |
| AgentCash default ceilings are `$0.30` basics and `$0.50` analysis. | `apps/web/src/inngest/provider-trace.ts:68-77`. |
| Anthropic estimator uses model family pricing and cache multipliers. | `packages/llm/src/anthropic.ts:46-84`. |
| DeepSeek estimator uses provider/model price table. | `packages/llm/src/pricing.ts:20-50`. |
| Stage model routing is provider-aware. | `packages/llm/src/llm-provider.ts:27-52`. |
| DB stores `generation_runs.trace_json` and `cards.card_json`. | `packages/db/src/schema.ts:31-50`, `:105-120`. |
| Trace script reads production rows without provider calls. | `scripts/trace-generation.ts:13-27`, `:94-113`, `:142-174`. |
| Section jobs and analysis generation paths. | `apps/web/src/inngest/functions.ts:539-643`, `:668-820`. |
| Public profile quality metrics. | `packages/core/src/card-quality.ts:5-8`, `:128-177`. |

External pricing citations, accessed 2026-06-23:

| Claim | Source |
|---|---|
| Anthropic Sonnet and cache pricing. | `https://docs.anthropic.com/en/docs/about-claude/pricing` |
| DeepSeek v4 flash and v4 pro rates. | `https://api-docs.deepseek.com/quick_start/pricing` |
| Exa Search `$7/1k requests` and Agent pricing. | `https://exa.ai/pricing` |
| Exa March 2026 pricing update. | `https://exa.ai/docs/changelog/pricing-update` |
| Websets Starter plan and credit costs. | `https://websets.exa.ai/websets/billing` |
