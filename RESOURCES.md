# Cold Start Resources

## Knowledge

- [SPEC.md](./SPEC.md)
  Product truth. Use for: why public facts and gated synthesis are separate, what a card must contain, and what trust means in this product.
- [DESIGN.md](./DESIGN.md)
  Visual truth. Use for: how the public card and extension should feel, and why the interface uses catalogue-card language instead of SaaS dashboard language.
- [README.md](./README.md)
  Operator truth. Use for: setup, local generation, extension loading, checks, and the trust contract in plain terms.
- [docs/learn/manifest.yml](./docs/learn/manifest.yml)
  Best first map of the runtime. Use for: following the main write path and public read path.
- [docs/anthropic-llm-call-map.md](./docs/anthropic-llm-call-map.md)
  LLM call map. Use for: stage routing, model flips, telemetry, and where generation spends tokens.
- [docs/qa/generation-trace-and-production-qa.md](./docs/qa/generation-trace-and-production-qa.md)
  Debugging playbook. Use for: slow, incomplete, or inconsistent generated cards.
- [packages/core/src/card.ts](./packages/core/src/card.ts)
  Main card schema. Use for: field shape, citations, synthesis shape, and validation rules.
- [apps/web/src/inngest/functions.ts](./apps/web/src/inngest/functions.ts)
  Generation worker. Use for: orchestration, run events, provider fetches, section jobs, and traces.
- [packages/pipeline/src/generate-card.ts](./packages/pipeline/src/generate-card.ts)
  Generation pipeline. Use for: turning sources into cards, synthesis gating, block enrichment, and verifier drops.
- [packages/db/src/repository.ts](./packages/db/src/repository.ts)
  Storage layer. Use for: cache TTLs, `cards.card_json`, generation runs, research sections, events, and source storage.
- [apps/extension/src/research-layer.ts](./apps/extension/src/research-layer.ts)
  Extension display mapping. Use for: how card data and section rows become reader-facing modules.

## Wisdom (Communities)

- Internal project history in this repo and prior Codex sessions.
  Use for: why choices were made, what failed before, and what constraints are real for this product.

## Gaps

- No external community is needed yet. The first learning goal is repo fluency.
