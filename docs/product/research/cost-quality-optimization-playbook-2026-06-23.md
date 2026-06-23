# Cost quality optimization playbook

Captured: 2026-06-23
Scope: research and operating guidance only. No product changes.

## In short

Cold Start can probably lower generation cost without weakening profile quality, but the first lever is not "use a cheaper model everywhere." The production traces say basics LLM work is already cheap because extraction is going through DeepSeek. The expensive default work is paid provider and contact enrichment, especially Websets and StableEnrich fanout. [1][2]

The safe strategy is to spend less before we know a run needs it. Keep the public-profile quality gate, keep citation integrity, and move provider fanout into shadow-tested routing before enforcing skips. Model routing should be tested on frozen evidence bundles, not changed because one invoice line looks annoying. [3][4][5]

Current production routing is partially DeepSeek, not fully DeepSeek. Recent production traces show `extract_full`, `extract_block`, and `verify` on `deepseek-v4-flash`; they show `synthesis` and `research_section` on `claude-sonnet-4-6`. [1]

## Current routing truth

Latest production trace sample checked: 20 recent `generation_runs` exported read-only on 2026-06-23. Raw data is stored under the ignored private-analysis folder. [1]

| Stage | Current traced provider/model | What this means |
| --- | --- | --- |
| Basics extraction, `extract_full` | `deepseek/deepseek-v4-flash` | Basics LLM extraction is already on DeepSeek in the latest traces. |
| Basics extraction, `extract_block` | `deepseek/deepseek-v4-flash` | Extra extraction passes are also DeepSeek. |
| Analysis synthesis, `synthesis` | `anthropic/claude-sonnet-4-6` | Investor Lens judgment is still Claude Sonnet. |
| Analysis verification, `verify` | `deepseek/deepseek-v4-flash` | Support checking is DeepSeek in the latest traces. |
| Standalone research sections, `research_section` | `anthropic/claude-sonnet-4-6` | Section jobs still use Claude Sonnet and can add meaningful aggregate cost. |

Trace examples:

| Run | Company/domain | Timestamp | Trace field evidence |
| --- | --- | --- | --- |
| `08bc39ca-ba13-4438-8e02-f6e0a707adad` | Hippocratic AI, `hippocraticai.com` | `2026-06-23T19:15:38.741Z` | `trace.llm.calls[].stage = extract_full/extract_block`; `provider = deepseek`; `model = deepseek-v4-flash`. |
| `d0737ad8-da22-4a28-b9ab-e24354f120d8` | OpenEvidence, `openevidence.com` | `2026-06-23T19:13:49.401Z` | `trace.llm.calls[].stage = extract_full`; `provider = deepseek`; `model = deepseek-v4-flash`. |
| `bad1424c-207d-4320-a39d-2f81ff334b6c` | Sail Research, `sailresearch.com` | `2026-06-23T19:05:21.382Z` | `trace.llm.calls[].stage = extract_full/extract_block`; `provider = deepseek`; `model = deepseek-v4-flash`. |
| `d64ad75e-5d61-43ce-92bf-f8f4a1f3d30f` | DatologyAI, `datologyai.com` | `2026-06-23T16:29:53.233Z` | `synthesis` uses `anthropic/claude-sonnet-4-6`; `verify` uses `deepseek/deepseek-v4-flash`. |
| `424968a4-a805-43c5-8967-e99eeea3e2c2` | Volley, `volleygames.com` | `2026-06-23T15:58:59.196Z` | `synthesis` uses `anthropic/claude-sonnet-4-6`; `verify` uses `deepseek/deepseek-v4-flash`. |
| `38413f46-e096-4b29-9b39-f6126cfbfaa5` | Hippocratic AI, `hippocraticai.com` | `2026-06-23T19:18:27.174Z` | `research_section` uses `anthropic/claude-sonnet-4-6`. |

Code agrees with this shape. `modelForStage(stage)` resolves stage-specific env vars first, then falls back through Anthropic defaults; prefixed model strings like `deepseek/deepseek-v4-flash` route through the OpenAI-compatible adapter. [6][7]

## Cost facts to keep in mind

Fresh basics cost about `$0.29` median in recorded traces and about `$0.335` median after correcting Websets to current official billing. Full fresh basics plus analysis costs about `$0.435` median recorded and about `$0.481` median with the Websets correction. [2]

The big basics cost split is provider-side, not model-side. Across 28 complete basics runs, average recorded cost share was roughly 57 percent Websets, 35 percent AgentCash/StableEnrich, 4 percent LLM, and 4 percent Direct Exa. [2]

Websets accounting is probably understated. The code estimates `10 + 2 = 12` credits per people item, while current official Websets billing says 10 credits per matching result and 5 credits per email or phone number. For email-enriched people results, that implies 15 credits per item unless the implementation has a provider-side discount or behavior not visible in traces. [8][9]

Direct Exa accounting appears aligned with current official pricing. Code uses `$0.007` per search request, and Exa's pricing update says Search with contents is `$7` per 1,000 requests. [10][11]

DeepSeek is extremely cheap for the stages currently routed there, and its context caching is automatic. Official DeepSeek pricing lists low cache-hit input rates for `deepseek-chat`, and DeepSeek says context caching is enabled for all users. [12][13]

Claude Sonnet is still the expensive model for synthesis and research sections, but it is not the biggest full-profile cost driver at current volumes. Official Anthropic pricing lists Claude Sonnet 4.6 at `$3/M` input and `$15/M` output, with prompt caching reducing cache reads to 0.1x base input price. [14]

## DeepSeek-everything economics

The tempting question is whether we should move every remaining Claude stage to DeepSeek, including DeepSeek Pro. The answer from the trace mix is: it helps, but it does not change the basic unit-economics shape unless users run many section jobs.

Basics are already mostly DeepSeek on the LLM side. So moving everything to DeepSeek would not materially reduce fresh basics cost. It would affect `synthesis` and `research_section`, which are currently Claude Sonnet in recent traces. [1]

First-order estimate:

| User path | Current planning cost | If remaining Claude stages moved to DeepSeek Pro | Tangible savings |
| --- | ---: | ---: | ---: |
| Fresh basics only | About `$0.335` corrected median | About `$0.335` | Basically none. |
| Basics plus Investor Lens | About `$0.481` corrected median | About `$0.43-$0.44` | About `4-5 cents`, or roughly `9-10%`. |
| One standalone section | About `$0.033` median | Roughly `$0.002-$0.005` | About `3 cents`. |
| Basics plus Lens plus 3 sections | About `$0.58` | Roughly `$0.44-$0.45` | About `13-14 cents`, or roughly `22-24%`. |

Interpretation: DeepSeek Pro is economically attractive for section jobs. It is not the main answer for fresh profile COGS because Websets, AgentCash/StableEnrich, Direct Exa, and paid failures remain untouched. [2]

Quality posture: test DeepSeek Pro on `research_section` first, using frozen evidence bundles and side-by-side scoring. Keep `synthesis` on Claude until Investor Lens has a rubric proving DeepSeek Pro produces equal or better investor judgment, source posture, and non-generic tension. The savings from moving Lens synthesis are only pennies per run, while the product risk is concentrated in the judgment layer. [4][5][12][14]

## Quality guardrails

Do not lower cost by weakening `hasUsablePublicProfile` or `hasInvestorUsableProfile`. The public profile gate requires citations, a useful name, a useful summary, at least 4 structured profile facts, and at least 2 visible facts. The investor gate also requires a concise overview, at least 3 source-backed citations, and investor evidence. [3]

For cost changes, compare these metrics before and after:

| Quality metric | Why it matters |
| --- | --- |
| Structured fact count | Protects against cheap but thin cards. |
| Visible fact count | Protects the public card from looking empty. |
| Source-backed citation count | Protects against enrichment-only profiles masquerading as sourced research. |
| Citation count and source mix | Protects the evidence posture. |
| Accepted source count | Shows whether retrieval depth collapsed. |
| Verifier survival rate | Protects Investor Lens from unsupported but cheap synthesis. |
| Surviving Lens claims | Measures useful judgment, not just successful completion. |
| Available research sections | Protects the extension from losing real browseable value. |
| Time to seed, first usable, analysis ready | Prevents a cheaper pipeline from feeling worse. |

The existing speed plan has the right rule: cheaper traces do not matter if we lose cited facts, empty sections rise, verifier survival drops, or public card quality falls. [5]

## Cost-reduction ideas, ranked

| Rank | Lever | Expected savings | Quality risk | Validation method |
| ---: | --- | --- | --- | --- |
| 1 | Make contact enrichment explicit, capped, delayed, or tiered | High | Low to medium | Compare cards with and without Websets contact enrichment. Measure whether first-read usefulness changes, not whether emails are present. |
| 2 | Fix Websets cost accounting and trace real credit use | Medium as measurement, high for pricing trust | Low | Update accounting only after verifying actual Websets item billing. Recompute unit economics and plan caps. |
| 3 | Add provider-yield routing in shadow mode | High | Medium | For at least 20 comparable runs, record which paid endpoints would have been skipped and whether applied facts, citations, and investor readiness would have changed. |
| 4 | Route paid provider calls against missing facts, not a fixed recipe | Medium to high | Medium | Before calling an endpoint, inspect known gaps: HQ, funding, people, headcount, signals, source scarcity. Spend only where the card needs help. |
| 5 | Add ambiguity and failure gates before paid fanout | Medium | Low | Detect weak domain/company identity, ambiguous acronyms, and repeated failed runs. Avoid spending on known-bad or unresolved identities. |
| 6 | Compress evidence packets for LLM stages | Low to medium cost savings, medium latency savings | Medium | Shadow prompt packets against full evidence. Require citation preservation and no drop in extracted facts. |
| 7 | Model-route research sections through a frozen-evidence eval matrix | Medium | Medium to high | Use provider bundles and matrix evals before changing production. Research sections are cheap individually but numerous. |
| 8 | Keep synthesis on Claude for now, then test alternatives later | Low immediate savings | High if rushed | Only test after Lens quality rubric exists. Synthesis is small cost but high product leverage. |
| 9 | Instrument cache-read economics | Unknown, likely important for margins | Low | Add read-side telemetry so pricing can distinguish fresh generation from cached public card reuse. |
| 10 | Stabilize prompt prefixes for cache hits | Low to medium | Low | Keep large reusable prompt blocks stable, but do not contort prompts if quality suffers. |

## What to do first

### Contact enrichment should become a deliberate product choice

Websets contact enrichment is too large a share of basics cost to remain invisible default work forever. It is useful for an investor workflow, but it may not be required for the first public company read. [2][8][9]

Safer product options:

| Option | Product shape | Why it helps |
| --- | --- | --- |
| Delay contacts until Investor Lens | Basics stays focused on sourced company facts; Lens can spend on people and email context when the user shows investor intent. | Reduces default public-card COGS while preserving high-intent enrichment. |
| Separate "Find contacts" credit | User explicitly spends a contact credit after seeing the profile. | Makes paid third-party spend legible and prevents silent overuse. |
| Cap contacts to 1 person by default | Find one likely useful person first, then expand if needed. | Keeps some value while cutting Websets item count. |
| Use contacts only when people evidence is missing | Skip Websets if founders or executives are already sourced well enough. | Pays to close a quality gap, not to duplicate existing evidence. |

The quality risk is that contacts may be part of the perceived magic. Test this with an A/B-style trace review: ask whether the user would miss contact data on the first card, and whether the Lens still feels serious if contacts appear later.

### Fix measurement before enforcing routing

The Websets mismatch matters because pricing decisions compound small errors. If the product thinks a 3-person Websets call costs `$0.2205` but official billing implies `$0.2756`, every plan cap is slightly too generous. The fix is not necessarily to change behavior first. The first step is to make the trace match the actual bill. [2][8][9]

Minimum instrumentation:

| Field | Needed because |
| --- | --- |
| Websets credit count by operation | Current estimate may not match official email enrichment pricing. |
| Websets item type and enrichment type | Matching results, email enrichment, phone enrichment, preview, and recall estimation have different credit costs. |
| Provider endpoint applied-fact count | We need to know which paid calls survive into the card. |
| Failed paid attempt cost | Failed runs should count against caps and pricing models. |
| Cache hit/read source | Pricing needs to separate fresh generation from cached reads. |

### Provider-yield routing is the right main engineering bet

The shape should be shadow first:

| Mode | Behavior |
| --- | --- |
| `off` | Current behavior. |
| `shadow` | Make all calls, but record which calls would have been skipped and whether any applied facts would have been lost. |
| `enforce` | Skip paid calls only after shadow evidence proves quality is preserved. |

Good skip candidates:

| Candidate | Why it might be safe |
| --- | --- |
| Organization enrichment after enough source-backed identity and funding facts exist | The card may already have the relevant facts from public sources. |
| People enrichment when founders/key executives are already sourced | Contacts may duplicate known team facts. |
| Extra Exa searches after accepted-source and citation thresholds are met | More sources can add latency and token load without improving visible card quality. |
| Repeated paid calls on ambiguous identities | Spending before disambiguation can create low-quality, high-cost failures. |

Bad skip candidates:

| Candidate | Why it is risky |
| --- | --- |
| Skipping retrieval just because the homepage exists | Homepage-only cards can be polished and weak. |
| Skipping independent sources when company-authored sources dominate | Source posture would weaken. |
| Skipping verification | This is trust infrastructure, not optional polish. |
| Skipping synthesis quality checks to save Claude cost | The Lens is the product judgment layer. |

## Implementation sequence when we are ready

Do not implement these in this analysis pass. When approved, the work should land in measured stages.

### Measurement stage

Add trace fields and script output for:

| Field | Purpose |
| --- | --- |
| Endpoint candidate facts | Shows what each paid endpoint produced. |
| Endpoint applied facts | Shows what survived into the card. |
| Endpoint skip shadow decision | Lets us test routing without changing behavior. |
| Websets credit operation details | Makes trace cost match billing. |
| Cache read or fresh generation | Makes unit economics honest. |
| Failed run paid cost | Prevents retry abuse from hiding. |

### First behavior stage

Start with contact enrichment because it has the best savings-to-risk profile.

Recommended first experiment:

| Flag | Behavior |
| --- | --- |
| `CONTACT_ENRICHMENT_MODE=default` | Current behavior. |
| `CONTACT_ENRICHMENT_MODE=defer` | Basics skips or minimizes Websets contacts; Lens can request contacts later. |
| `CONTACT_ENRICHMENT_MODE=shadow` | Run current behavior, but record whether the card would still pass quality without contacts. |

Do not ship `defer` broadly until trace review confirms first-read quality is intact.

### Second behavior stage

Add provider-yield routing behind the existing speed plan shape. Use the proposed `PROVIDER_YIELD_ROUTER_MODE=shadow|enforce` style, with enforcement only after comparable-run evidence. [5]

### Model-routing stage

Run model experiments on frozen evidence, not live paid retrieval:

| Stage | Recommended stance |
| --- | --- |
| `extract_full` and `extract_block` | Already DeepSeek in latest traces. Keep measuring quality. |
| `verify` | Already DeepSeek in latest traces. Keep measuring verifier survival and false support risk. |
| `research_section` | Test DeepSeek v4 pro/flash or another provider against Claude Sonnet on frozen bundles. Do not switch live without rubric wins. |
| `synthesis` | Leave Claude Sonnet until Lens quality is product-solid. Test alternatives later if cost or latency still matters. |

## Verification plan

Use current repo commands and production-trace style evidence:

| Command | Use |
| --- | --- |
| `npm run trace:generation` | Inspect individual traces, LLM calls, providers, costs, and milestones. |
| `npm run qa:generation` | Run controlled generation suites against known domains. This may hit paid paths, so get approval before live provider use. |
| `npm run eval:providers:bundles` | Freeze production evidence fixtures from read-only DB for model/provider comparisons. |
| `npm run eval:providers:matrix` | Replay stages across providers on frozen evidence. |
| `npm run evo:generation-benchmark` | Compare cost, latency, and quality metrics across modes. |

Promotion rule:

| Requirement | Bar |
| --- | --- |
| Comparable runs | At least 20 before enforcing provider skips. |
| Public profile quality | No regression in `hasUsablePublicProfile` pass rate. |
| Investor readiness | No regression in `hasInvestorUsableProfile` pass rate on companies that should qualify. |
| Citations | No material drop in source-backed citation count. |
| Facts | No material drop in structured or visible facts. |
| Lens | No drop in surviving verified claims or top-question usefulness. |
| Failures | No hidden paid failures or silent retries. |

## Things not to do

Do not weaken the public-card or investor-card quality gates to make costs look better. Cheap empty cards are not a business.

Do not silently run every analysis surface as a full Lens. That hides cost and user intent.

Do not route synthesis away from Claude solely because Claude is pricier. Synthesis is a small part of full-profile cost and a large part of product value.

Do not optimize only on unit tests with mocks. Analytical output has to be validated against real traces, frozen evidence, and production card quality.

Do not treat failed runs as free. The `usb.club` failures spent money and saved no usable profile. Failed paid attempts need to count toward user caps and abuse models. [2]

Do not bury contact enrichment under "basics" if it becomes the main COGS driver. It should be visible in product packaging or gated by high-intent actions.

## Pricing implications

The cost-down strategy supports the same pricing conclusion as the unit-economics brief: `$20/month` can work only with caps and cache reuse. It does not work as unlimited fresh obscure-company generation. [2]

If contact enrichment is deferred, basics COGS can fall materially, but only if quality stays stable. That would make a cheaper plan easier to support. If contact enrichment stays default and Websets accounting is corrected upward, plan caps should stay conservative. [2][8][9]

Basics and Investor Lens should consume separate credits. They have different intent, cost shape, and product value. Cached public cards should be free or cheap. Fresh generation, contact enrichment, and Lens should consume real credits.

## Open questions

| Question | Why it matters |
| --- | --- |
| Does contact data materially change the first-read user reaction? | If not, it should move behind Lens or a contact action. |
| What does the actual Websets invoice show per operation? | Trace estimates need to match billing before pricing is trusted. |
| Which StableEnrich endpoints produce applied facts versus discarded candidates? | Provider routing needs yield data, not endpoint guesses. |
| How often do users read cached cards versus generate fresh profiles? | Pricing depends on cache reuse, but generation rows do not measure read economics. |
| Can section jobs move off Claude without making sections generic? | Section jobs are numerous and worth testing, but quality risk is real. |
| Should failed paid attempts count fully or partially against user credits? | Abuse control needs a clear policy before alpha usage broadens. |

## References

[1] Production trace export, `docs/product/research/private-analysis/generation-runs-latest-20-2026-06-23.clean.json`, accessed 2026-06-23. Private ignored artifact. Key paths: `trace.llm.calls[].stage`, `trace.llm.calls[].provider`, `trace.llm.calls[].model`, `trace.llm.calls[].estimatedCostUsd`.

[2] Unit-economics brief, `docs/product/unit-economics-trace-analysis-2026-06-23.md`, accessed 2026-06-23.

[3] Quality gates, `packages/core/src/card-quality.ts`, accessed 2026-06-23. Key constants and functions: `MIN_STRUCTURED_PROFILE_FACTS = 4`, `MIN_VISIBLE_PROFILE_FACTS = 2`, `MIN_SOURCE_BACKED_CITATIONS = 3`, `hasUsablePublicProfile`, `hasInvestorUsableProfile`.

[4] Investor Lens direction review, `docs/product/investor-lens-direction-review-2026-06-23.md`, accessed 2026-06-23.

[5] Speed and compression plan, `docs/superpowers/plans/2026-06-07-real-speed-yield-and-compression.md`, accessed 2026-06-23.

[6] LLM model resolver, `packages/llm/src/llm-provider.ts`, accessed 2026-06-23. Key functions: `modelForStage`, provider-prefix resolver.

[7] LLM pricing table and OpenAI-compatible routing, `packages/llm/src/pricing.ts`, `packages/llm/src/openai-compat.ts`, and `packages/llm/src/anthropic.ts`, accessed 2026-06-23.

[8] Websets estimator, `packages/providers/src/websets.ts`, accessed 2026-06-23. Key constants: `WEBSETS_CREDITS_PER_ITEM = 10 + 2`, `DEFAULT_WEBSETS_CREDIT_USD = 0.006125`.

[9] Exa Websets billing docs, `https://websets.exa.ai/websets/billing`, accessed 2026-06-23.

[10] Direct Exa estimator, `packages/providers/src/direct-exa.ts`, accessed 2026-06-23. Key constant: `DIRECT_EXA_SEARCH_COST_USD = 0.007`.

[11] Exa pricing update docs, `https://exa.ai/docs/changelog/pricing-update`, accessed 2026-06-23.

[12] DeepSeek pricing docs, `https://api-docs.deepseek.com/quick_start/pricing`, accessed 2026-06-23.

[13] DeepSeek context caching docs, `https://api-docs.deepseek.com/guides/kv_cache`, accessed 2026-06-23.

[14] Anthropic pricing and prompt caching docs, `https://platform.claude.com/docs/en/about-claude/pricing`, accessed 2026-06-23.
