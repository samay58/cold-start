# Provider Cost Assumptions

This file is the source trail for hardcoded provider cost estimates. These numbers are for run telemetry and budget guards, not invoice-grade accounting.

| Surface | Code location | Current assumption | Source |
|---|---|---|---|
| Direct Exa Search | `packages/providers/src/direct-exa.ts` | `$0.007` per successful Search request. Exa lists Search at `$7 / 1k requests`, so `7 / 1,000 = 0.007`. The current Direct Exa requests stay at or under 10 results with text and highlights. | `https://exa.ai/pricing`, `https://exa.ai/docs/changelog` |
| Exa Websets people email | `packages/providers/src/websets.ts` | `15` credits per accepted person item: 10 credits for a matching result plus 5 credits for email or phone enrichment. Default credit price is `$49 / 8,000 = $0.006125`. | `https://websets.exa.ai/websets/billing` |
| StableEnrich via AgentCash | `packages/providers/src/provider-budget.ts` | `$0.01` for search/scrape-style probes and `$0.02` for most org or people enrichment probes. These are budget estimates, not official provider list prices. | Reconcile with AgentCash wallet deltas and endpoint traces before using for pricing decisions. |

Update this file when provider pricing, plan tier, request shape, or budget policy changes.
