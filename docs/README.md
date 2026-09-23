# Cold Start Docs

Start here before adding or editing docs.

## Root sources of truth

- `../SPEC.md`: product and technical source of truth.
- `../DESIGN.md`: current implemented visual system (the Catalogue Card).
- `../INTENT.md`: product intent and non-goals.
- `../README.md`: local setup, smoke tests, and deployed extension setup.
- `../SECURITY.md`: secret handling, extension auth rules, and dependency audit status.
- `../AGENTS.md`: the agent guide. `../CLAUDE.md` imports it, so edit guidance in `AGENTS.md` only.

## Living docs

- `STATUS.md`: what is in flight, what is next, and what recently shipped. Update it when a plan closes.
- `commands.md`: every npm script and the env file it needs.
- `code-map.md`: file-level detail behind the agent guide's layout, flags, and where-to-look entries.
- `deployment.md`: Vercel, Neon, Inngest, and extension deployment runbook.
- `anthropic-llm-call-map.md`: every LLM call in the repo; read before touching provider routing.
- `theme-sources.md`: dark-mode palette sources and token rationale (referenced by DESIGN.md).
- `evo-autoresearch-pilot.md`: the benchmark loop behind the `npm run evo:*` commands.

## Product

- `product/alpha-production-readiness-2026-07-24.md`: single source for current alpha evidence, blockers, and release order.
- `product/alpha-packaging-spec-2026-07-01.md`: ledgered friend-alpha package contract and product truth.
- `product/chrome-web-store-alpha/`: Chrome Web Store release records, the compatibility matrix, and listing assets.
- `product/cost-quality-optimization-playbook-2026-06-23.md`: cost and quality tuning levers.
- `product/provider-cost-assumptions.md`: cost model behind provider budgets.
- `product/diagnose-iterate-craft-playbook.md`: interaction-craft loop for sidebar work.
- `product/extension-motion-playbook.md`: motion rules for the extension.
- `product/gold-standard-references.md`: design references gathered for the investor lens overhaul.
- `product/positioning-vs-pitchbook.md`: investor-facing differentiation and the side-by-side demo shape; re-run the evo benchmark before quoting its cost figures.
- `product/strategy/resonance-audience-and-10x.md`: resonance verdict, core audience, tagline, and ranked 10x opportunities (2026-08-11 research pass); iterate or challenge it there.
- `product/design/`: dated design direction folders (record exhibit, moat read, clippings receipts, early read line) with mockups and critiques.
- `product/capture-notes/`: raw feedback captures from blind reads and the first Firefox tester.
- `product/research/`: the Kimi K3 judgment-matrix verdict. Private prompts and analysis dumps under it are gitignored.

## QA

- `qa/fresh-test-queue.md`: the living list of fresh companies to run, checked against production.
- `qa/extension-closed-loop-testing-playbook.md`: manual extension QA loop.
- `qa/extension-interaction-contract.md`: interaction contract the side panel must honor.
- `qa/generation-trace-and-production-qa.md`: generation trace and production QA commands.
- `qa/analysis-run-observations.md`: dated log of notable analysis runs and the attack list they feed.
- `qa/exa-websets-contact-enrichment-playbook.md`: Websets contact enrichment QA.
- `qa/how-it-wins-repair-2026-08-25.md`: the How it wins production repair, its before-and-after measurements, and the handoff commands.
- `qa/how-it-wins-latency-2026-09-11.md`: first production How it wins runs, the judge's per-call latency and cost split, and the levers.
- `qa/column-how-it-wins-diagnosis-2026-09-14.md`, `qa/how-it-wins-recovery-2026-09-14.md`, `qa/column-funding-repair-2026-09-14.md`, `qa/extraction-tolerance-2026-09-14.md`, `qa/profile-timeout-recovery-2026-09-14.md`, and `qa/consolidation-2026-09-14.md`: the September 14 repair wave, one verification record per repair.
- `qa/review-remediation-2026-09-15.md`: the September 15 review remediation and its gate.

## Plans, specs, and prompts

- `superpowers/plans/`: active implementation plans, currently the friend-alpha production-readiness build and the 2026-09-22 polish pass. Shipped plans move to `archive/plans/`.
- `superpowers/specs/`: live specs. The two How it wins rubric files (`2026-08-21-how-it-wins-judgment-standard.md` and `2026-08-21-how-it-wins-strategy-rubric.md`) are read by code and stay here. The layered screen spec, the How it wins recovery spec and its prompt, and the profile re-file design (its timeline is release two) are also live. Shipped specs move to `archive/specs/`.
- `superpowers/prompts/`: execution prompts saved for fresh sessions.

## Design corner

- `brand/source/`: raw visual source assets.
- `brand/archive/`: historical design directions (Signal Ledger, parchment, Ray Gun eras). Not current guidance.
- `design/mockups/`: Claude Design mockups for the first ninety seconds, the landing page, and the public catalogue card.
- `motion-references/`: local-only licensed motion prototypes, gitignored.

## Archive

`archive/` holds shipped or superseded process history. Nothing in it is current guidance; all of it stays greppable for context. Mapping from old paths:

- `archive/plans/` was `superpowers/plans/`: shipped implementation plans. Plans and specs archived on 2026-09-22 open with a `Status: shipped` line naming the commit.
- `archive/specs/` was `superpowers/specs/`: shipped design specs, closed release ledgers, and screenshots.
- `archive/product/` holds the dated direction reviews, shipped product specs, capture notes, and slow-work essays formerly under `product/`, including the How it wins adversarial review and its 2026-08-26 port record (`2026-08-25-how-it-wins-adversarial-review.md`).
- `archive/qa/` holds dated QA baselines and the June 2026 Exa sidebar teardown formerly under `qa/`.

Read the relevant archived review before reworking a product surface; the dated filenames carry the era.
