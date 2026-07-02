# Source selection review and upgrade path

Date: 2026-07-01. Read-only audit of production traces and cards, plus a full map of the retrieval code path. One slice implemented; the rest is a routing model for future slices.

## What the audit found

Composition of the 364 citations across the 25 most recently updated production cards, classified with `sourceQualityForSource`:

| Tier | Share | Reading |
| --- | --- | --- |
| independent_report | 43.4% | Inflated. Any unranked host with sourceType `news` defaults here, so pulse2.com and tbpndigest.com count the same as Reuters. |
| enrichment | 28.8% | Almost entirely LinkedIn. linkedin.com is the single most cited host in the sample: 105 of 364 citations. |
| primary_company | 19.2% | Mostly homepages. Docs, pricing, customers, and changelog pages are rare. |
| press_release | 5.2% | businesswire, prnewswire. |
| independent_analysis | 3.3% | 12 citations across 25 cards. |
| independent_technical | 0% | Zero. Not one card cites a technical source. |

The zero deserves emphasis. The sample includes Supabase, Replit, TimescaleDB, and Braintrust. All four have large GitHub footprints, public docs, and benchmark coverage; `github.com` does not appear once in the top 30 cited hosts. TimescaleDB is an open-source database whose card carries no repository citation. The source-authority registry knows about semianalysis, arXiv, MLCommons, and the benchmark sites, but nothing upstream ever fetches them, so the classifier has nothing to classify.

The same shape shows up in run health. `supabase.com` analysis kept 2 of 12 synthesis claims after verification. `herdr.dev` and `clawmessenger.com` each failed basics twice on underfilled profiles while accepting 17 to 29 sources; volume was never the problem. `strawberrybrowser.com` and `oasisdevices.com` triggered `high_source_rejection`. The per-endpoint yield table in the June 23 unit-economics doc already showed `exa_competition`, `exa_independent_analysis`, `exa_find_similar`, and the firecrawl secondary pages producing sources but zero applied structured facts.

## Why the recipe is fixed

Three structural facts explain the composition:

The LLM research planner is dead code. Commit `fc7fc92` (May 19, cost cutting) replaced `planCompanyResearch` with `fallbackResearchPlan(domain)` in both workers. Every company on earth gets the archetype "private technology company" and six template queries with the domain spliced in. This predates per-stage provider routing; at DeepSeek prices the planner call would now cost well under a cent.

There was no retrieval intent for customer proof or product proof. The probe set asked for funding, profile, team, signals, comparables, and independent analysis. The product ships a Customer Proof section and an investor lens that wants technical grounding, but nothing upstream ever asked the web for that evidence. Sections build their evidence packets from card citations, so evidence classes that never get fetched can never reach the writing.

Ranking cannot fix missing classes. `budgetEvidenceSources` orders the prompt packet by sourceType alone (filing 50, company_site 30, news 20, enrichment 0), so a pulse2 roundup and a customer case study carry the same weight, and no reranking surfaces a GitHub repo that was never retrieved.

## The taxonomy the system should converge on

Eight buckets, selected for what they can prove, not where they come from:

| Bucket | Proves | Today | Gap |
| --- | --- | --- | --- |
| Company canonical | What the product claims to do | homepage, /about, /team scrapes | docs, pricing, customers, careers, changelog |
| Product proof | The thing works as described | none | GitHub, package registries, docs, benchmarks, model cards |
| Customer proof | Someone pays and deployed | none | case studies, customer blogs, marketplaces, integration pages |
| Funding and ownership | Capital structure and cadence | exa funding + org enrichment + SEC Form D | filings beyond Form D, investor announcements with confidence labels |
| Independent judgment | Whether claims matter | one generic exa query | the authority registry is rich; queries never target its hosts |
| Market structure | Buyer budget and category shape | none directly | pricing pages, procurement signals, incumbent offerings |
| Traction signals | Momentum | exa recent signals | hiring, app rankings, registry download stats, contracts |
| Competitive substitutes | Who competes for the budget | exa competition + find-similar | incumbents and build-it-internally alternatives, named axis of overlap |

The routing model that goes with it: source selection should be mode-aware first (basics buys identity, analysis buys judgment), gap-aware second (spend only where the card or Lens is missing an evidence class), archetype-aware third (devtools want product proof; vertical SaaS wants customer proof; both routes exist, the planner picks emphasis). The cheap-first skip logic (direct Exa coverage suppressing paid duplicates) already implements a slice of this; the per-intent telemetry added below makes the rest of it measurable before it is enforced.

## The implemented slice

Two curated retrieval intents, `customer_proof` and `product_proof`, wired end to end, plus per-intent yield telemetry at the source gate.

- `packages/providers/src/stableenrich.ts`: probes `exa_customer_proof` and `exa_product_proof`, registered in `provider-budget.ts` at $0.01 each with stop conditions. Both are excluded from the basics fast tier, so first-usable latency and basics cost are untouched.
- Routing: analysis runs include both (inside the existing $0.50 AgentCash ceiling, guarded by `takeAgentcashBudget`). The async block-enrichment worker runs `exa_product_proof` only when the description block is missing and `exa_customer_proof` only when signals are missing, via `stableenrichLateEnrichmentProbesByBlock`.
- `packages/llm/src/research-plan.ts`: `customerProof` and `productProof` query slots in the fallback plan and the planner schema, so reviving the planner later needs no schema change.
- `packages/llm/src/evidence-budget.ts`: the two intents rank 25, above generic news (20) and below company_site (30), so the char budget cannot starve them behind aggregator coverage.
- `packages/pipeline/src/generate-card.ts`: block intent maps route the new sources into description, signals, and comparables enrichment packets.
- `packages/pipeline/src/source-gate.ts` and `packages/core/src/generation-trace.ts`: `sourceGate.acceptedByIntent` and `rejectedByIntent` land in every trace. This is the measurement the cost-quality playbook asks for before routing gets enforced: real-traffic yield per intent, visible in `trace:generation --json`.

Source gating is unchanged. The new sources pass the same relevance, alias, and same-name rules as everything else; nothing was loosened.

Verified by unit tests across providers, pipeline, llm, core, and web (all green, plus workspace-wide typecheck) and a deterministic driver that exercised the real functions with a stubbed fetch: fast tier excludes the probes, analysis includes them, a tight ceiling skips them with `budgetCeilingHit`, block routing selects them only for description and signals gaps, and the gate trace reports per-intent accept and reject counts.

## Cost and latency posture

Basics: zero change. The fast tier is untouched and the seed-card path never sees the new probes. Analysis: at most +$0.02 estimated per run against the $0.50 ceiling, and the ceiling still wins when tight. Late enrichment: at most one extra $0.01 probe per missing block, post-first-usable, inside the remaining-budget guard. No new provider, no new retry surface.

## What to do next, in order

1. Watch `acceptedByIntent` on real analysis traffic for a week or so of runs. If `customer_proof` and `product_proof` accept at reasonable rates and start showing up in citations, the intents earn their $0.02. If they get gate-rejected in bulk, the queries need tuning, not more spend.
2. Revive the planner on a cheap model for analysis runs only. The schema is ready. The value is archetype-shaped query text: "supabase github benchmark" versus "dephy case study fleet deployment". Keep the fallback for basics.
3. Split `independent_report`. Unranked news hosts should not classify alongside Reuters. A `syndicated_aggregator` tier below press_release for unknown low-signal hosts would stop aggregator slop from carrying judgment weight in packets and in the Lens source posture.
4. Cap LinkedIn citations per card. 29% of all citations is profile filler crowding the 12-slot citation injection and the evidence budget.
5. Persist `intent` on stored sources. It dies at the DB boundary today (`recordSource` drops it), which blocks per-section source packets and any citation-level yield attribution.
