# Cold Start Docs

Start here before adding or editing docs.

## Root sources of truth

- `../SPEC.md`: product and technical source of truth.
- `../DESIGN.md`: current implemented visual system (the Catalogue Card).
- `../INTENT.md`: product intent and non-goals.
- `../README.md`: local setup, smoke tests, and deployed extension setup.
- `../SECURITY.md`: secret handling, extension auth rules, and dependency audit status.
- `../CLAUDE.md` / `../AGENTS.md`: agent operating context; keep the two in sync.

## Living docs

- `deployment.md`: Vercel, Neon, Inngest, and extension deployment runbook.
- `anthropic-llm-call-map.md`: every LLM call in the repo; read before touching provider routing.
- `theme-sources.md`: dark-mode palette sources and token rationale (referenced by DESIGN.md).
- `evo-autoresearch-pilot.md`: the benchmark loop behind the `npm run evo:*` commands.
- `product/cost-quality-optimization-playbook-2026-06-23.md`: cost and quality tuning levers.
- `product/diagnose-iterate-craft-playbook.md`: interaction-craft loop for sidebar work.
- `product/extension-motion-playbook.md`: motion rules for the extension.
- `product/provider-cost-assumptions.md`: cost model behind provider budgets.
- `qa/extension-closed-loop-testing-playbook.md`: manual extension QA loop.
- `qa/extension-interaction-contract.md`: interaction contract the side panel must honor.
- `qa/generation-trace-and-production-qa.md`: generation trace and production QA commands.
- `qa/exa-websets-contact-enrichment-playbook.md`: Websets contact enrichment QA.
- `superpowers/plans/`: active implementation plans only (currently the Firefox port). Shipped plans move to `archive/plans/`.
- `product/research/`: local-only private prompts and analysis dumps, gitignored.

## Design corner

- `brand/source/`: raw visual source assets.
- `brand/archive/`: historical design directions (Signal Ledger, parchment, Ray Gun eras). Not current guidance.
- `motion-references/`: local-only licensed motion prototypes, gitignored.

## Archive

`archive/` holds shipped or superseded process history. Nothing in it is current guidance; all of it stays greppable for context. Mapping from old paths:

- `archive/plans/` was `superpowers/plans/`: shipped implementation plans.
- `archive/specs/` was `superpowers/specs/`: shipped design specs, closed release ledgers, and screenshots.
- `archive/product/` holds the dated direction reviews, shipped product specs, capture notes, and slow-work essays formerly under `product/`.
- `archive/qa/` holds dated QA baselines and the June 2026 Exa sidebar teardown formerly under `qa/`.

Read the relevant archived review before reworking a product surface; the dated filenames carry the era.
