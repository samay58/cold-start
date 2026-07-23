# Fresh test queue: five never-tested companies (2026-07-23)

Five companies verified absent from every tested surface in this repo as of 2026-07-23: the 50-company golden seed, the 12 provider-matrix fixtures, all eval runs, and the test suites. Samay tests these in a fresh session.

| Company | What it is | Why it earns a test slot |
|---|---|---|
| Watershed | Enterprise climate/carbon-accounting SaaS (SF, growth stage) | Customer-proof extraction: real evidence scattered across case studies and procurement announcements |
| Mews | Hospitality property-management SaaS (Amsterdam-born unicorn) | Non-AI, non-US vertical software; tests European company + funding-trail coverage |
| Antimetal | Cloud-cost/infrastructure startup (NYC, seed/A) | Deliberate sparse-evidence stress case; where the thin-honest-read bias holds or breaks |
| Castelion | Hypersonic strike systems (El Segundo, SpaceX-alumni founders) | Hardware + government buyers; evidence lives in defense trades, not tech press |
| Function Health | Consumer health memberships / lab testing | Dense hype plus a genuine bear case (clinical-utility skepticism); tests bull/bear verification |

Spread: five sectors, three stages, two continents, one sparse-evidence case, zero AI-model companies (the tested universe is saturated with those).

Cut during selection: Polymarket and Kalshi (already in `packages/core/tests/funding-evidence.test.ts`), Saronic (already in `apps/web/tests/evo-generation-benchmark.test.ts`).

Known blind spot: ad-hoc prod browses save `/c/{slug}` pages in the prod database only, not in git. If any of the five was ever browsed in prod, swap it and pull a verified replacement (check candidates with a repo-wide grep excluding node_modules before locking).

Company facts above are as of the selection date; stages may have moved. Irrelevant to the test itself since Cold Start does its own research.
