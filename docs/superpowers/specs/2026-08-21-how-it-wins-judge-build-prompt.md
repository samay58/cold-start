<task>
Build Cold Start's How it wins judge behind the existing disabled production feature.

Repo: `/Users/samaydhawan/Projects/active/cold-start`

This sitting implements the judge contract, orchestration, frozen-writer boundary, and deterministic tests. It stops before any model benchmark, tournament, blind read, production flip, or real LLM call.

Samay's judgment standard is settled. Do not rewrite its thesis. Translate it into code without adding scoring, label caps, or hidden doctrine.
</task>

<mandatory_skills>
Read and follow before acting:

- `/Users/samaydhawan/.agents/skills/fable-judgment/SKILL.md`
- `/Users/samaydhawan/.agents/skills/fable-execution/SKILL.md`
- `/Users/samaydhawan/.agents/skills/fable-verification/SKILL.md`
- `.agents/skills/verify-cold-start/SKILL.md`

State one machine-checkable done-definition before editing.
</mandatory_skills>

<hard_boundaries>
- Do not open `/eval/how-it-wins`.
- Do not name, list, inspect, infer, or serve unread holdout cards.
- Do not run any real model, provider, benchmark, tournament, golden eval, blind read, or card generation.
- Do not set or change production environment variables. `HOW_IT_WINS_ENABLED` stays false in production. Do not set `LLM_HOW_IT_WINS_MODEL` or new judge-model variables in production.
- Do not choose a production model or call topology before the measured benchmark.
- Do not use 80 independent strategy calls.
- Do not use subagents. Beads is disabled.
- Preserve the dirty worktree and every user-owned change. Do not stage, commit, stash, rebase, branch-switch, or clean unrelated files.
- Use `apply_patch` for edits.
- Do not change public data exposure. The full judgment audit must remain private.
- Do not broaden this sitting into UI polish, writer tournament work, or release work.
</hard_boundaries>

<read_first>
Read these fully before designing:

1. `docs/superpowers/specs/2026-08-21-how-it-wins-judgment-standard.md`
2. `docs/superpowers/specs/2026-08-21-how-it-wins-strategy-rubric.md`
3. `docs/superpowers/specs/2026-08-21-how-it-wins-judge-architecture-draft.md`
4. `packages/core/src/how-it-wins.ts` and `packages/core/tests/how-it-wins.test.ts`
5. `packages/llm/src/how-it-wins.ts`, `packages/llm/src/how-it-wins-prompts.ts`, `packages/llm/tests/how-it-wins.test.ts`, and `packages/llm/src/index.ts`
6. `apps/web/src/inngest/how-it-wins.ts`, the How it wins path in `apps/web/src/inngest/functions.ts`, `apps/web/src/inngest/generation-trace.ts`, and `apps/web/src/inngest/worker-env.ts`
7. The How it wins verification path in `packages/pipeline/src/generate-card.ts` and its tests
8. `packages/core/src/card.ts`, the public-card stripping path, and the extension-card response path before choosing where the private audit lives
9. The current How it wins status and next-step sections in `docs/superpowers/specs/2026-08-18-moat-read-design.md`
10. The work-sitting update in `eval/curation/notes/sitting-2-how-it-wins.md`

Do not enter any holdout surface while following references.
</read_first>

<premise_checks>
Before editing, verify and write down internally:

- where a complete private 80-strategy audit can be retained without entering the public card or bloating the public profile-index cache
- which existing type is reader prose and must remain separate from the new uncapped judgment
- where the current writer is allowed to choose labels, so the frozen-verdict boundary can be enforced rather than described
- how current telemetry records model, tokens, cache use, cost, retries, latency, and thinking state
- which durable Inngest step ids and event names must remain unchanged

Resolve these from live code. Do not guess from this prompt.
</premise_checks>

<implementation_contract>
Implement one deep judge module with a stable public interface. Internal call topology stays hidden and injectable so later benchmarking can compare shapes without changing callers.

Core judgment contract:

- material company bet or bets with supporting evidence IDs and scope reasons
- one and only one disposition for each exact canonical strategy in `HOW_IT_WINS_STRATEGIES`
- dispositions: current, not yet, open question, insufficient evidence, rejected, not applicable
- categorical evidence strength, centrality, materiality, distinctiveness, and independence for every positively supported strategy; allow not reached only after evidence fails
- sibling resolution for positively supported or materially disputed labels
- uncapped ordered current strategy set that exactly matches current dispositions
- zero or one secondary unusual-pair record; its absence never changes strategies or ordering
- not-yet records with precursor, causal path, missing condition, promotion evidence, and 12-to-24-month plausibility
- material open questions and a plain-world condition that would make the overall conclusion wrong
- evidence, prompt, and canonical-vocabulary hashes
- disagreements, overrides, and complete per-call trace data

Enforce invariants in pure core validation, not prompt prose alone:

- exactly 80 unique canonical strategy IDs, no missing or extra IDs
- zero, one, or many current strategies; no numerical cap
- one current strategy must not degrade to nothing stands out
- current set and dispositions agree exactly
- pair legs are distinct and current; pair count is at most one
- pair removal cannot change current dispositions or ordering
- selected or disputed sibling labels carry a discriminating reason
- not-yet entries carry every required field
- unsupported speculation cannot be current or not yet
- all referenced evidence IDs resolve inside the supplied evidence registry

Keep this judgment contract separate from the existing reader projection. Do not force the full audit into the public prose shape.

Judge orchestration:

- accept one frozen evidence packet and hash, exact canonical vocabulary, prompt hash, model routing, injected call adapters, and telemetry sink
- identify the company bet before showing or choosing strategy labels
- support the 13 canonical-group scout reference shape without exposing it to callers or hard-wiring it as the production winner
- run group scouts concurrently with bounded fanout
- give scouts the cross-group sibling distinctions they need
- let the global judge compare all 80 dispositions, revise a weak bet map with cited reasons, resolve siblings, and select the uncapped current set
- treat the unusual pair as secondary and optional
- run a different-provider critic through an injected adapter; call targeted strong adjudication only for material disputes
- retry a missing scout once; never convert a missing response into rejection of its group
- after retry failure, let the global judge evaluate the missing group directly or fail the verdict closed
- record every override and reason

No model names, prices, or production routing decisions belong in the judge's public interface.

Frozen writer boundary:

- the writer receives the approved structured verdict and canonical meanings
- the writer may not add, remove, swap, or reorder strategies
- parser or validation rejects strategy drift instead of normalizing it silently
- reader disclosure may collapse supported strategies visually but may not alter the stored judgment
- keep existing writer behavior available only where needed for compatibility while the feature remains disabled; do not let the compatibility path bypass the new boundary once judge output is supplied

Tracing:

- retain model, provider, input and output tokens, cache creation and reads, actual or estimated cost, latency, retries, thinking state, stage, and outcome for every internal call
- retain evidence-packet, prompt, and vocabulary hashes once per verdict
- preserve existing durable step ids and event names unless a verified correctness issue requires a change
</implementation_contract>

<test_contract>
Use test-driven implementation. Reproduce the missing behavior with failing tests, then make the same tests pass.

Add deterministic tests with fake adapters for at least:

- exact all-80 completeness, duplicates, unknown IDs, and missing IDs
- zero, one, and more than four current strategies
- current-set and disposition mismatch
- pair absent, valid pair, noncurrent leg, duplicate leg, and pair removal invariance
- sibling distinction required for supported or disputed close labels
- historical-only evidence not current without a present bridge
- valid not yet versus unsupported speculation and longer-horizon open question
- unresolved evidence IDs
- company bet produced before strategy scouting
- all 13 group scouts launched concurrently under the bound
- scout retry, fallback, and fail-closed behavior
- critic with no material dispute avoids strong adjudication
- material dispute triggers one targeted adjudication
- global-judge override records its reason
- writer rejects added, removed, swapped, or reordered labels
- one supported strategy remains one supported strategy, not nothing stands out
- telemetry contains every required field without calling a provider

Reuse existing fixtures and helpers where they express the current contract. Do not duplicate the canonical 80-name list.
</test_contract>

<grounding_rules>
- Steph's exact strategy names and Cold Start display meanings come only from `HOW_IT_WINS_STRATEGIES`.
- Judgment gates come only from the authoritative standard and rubric.
- Separate observed fact, inference, judgment, open question, insufficient evidence, and unsupported speculation in types and prompts.
- Absence of data is never analysis.
- Do not turn operational tests into claims about Steph's definitions.
- Do not add a composite score, confidence percentage, strategy count target, or pair bonus.
- If live code contradicts the architecture draft, preserve the authoritative judgment standard and report the implementation conflict. The architecture draft is a recommendation, not doctrine.
</grounding_rules>

<action_safety>
- Keep changes inside the judge, its private storage or trace seam, the frozen-writer boundary, required exports, and direct tests.
- Preserve public synthesis stripping and extension auth.
- Avoid database migrations unless live inspection proves no existing private retained surface can hold the audit. If a migration is genuinely required, stop with a concise decision brief before writing it.
- Do not rename Inngest events or steps casually.
- Do not refactor unrelated synthesis or generation code.
</action_safety>

<default_follow_through_policy>
Make reversible implementation choices from live code and keep going. Ask only when correctness requires a new product decision, a migration, public contract change, or production action.
</default_follow_through_policy>

<verification_loop>
Before reporting completion:

- run the exact new or changed tests and observe the intended fail-to-pass transition
- run scoped core, LLM, pipeline, and web tests touched by the change
- run affected workspace typechecks
- run `npm run lint`
- run `git diff --check`
- run `python3 ~/.claude/scripts/slopcheck.py` on every self-authored prompt, spec, or note
- programmatically prove the verdict contains all 80 exact strategy IDs once
- prove the writer-drift tests cover add, remove, swap, and reorder
- read back every changed file
- verify no public route exposes the full audit
- verify no real provider or model call occurred
- verify no production env, holdout data, card, eval answer, or unrelated dirty file was touched

Do not run `npm run check`; it contains a prohibited golden-eval dry run. Do not run any command that generates or reads cards.

If verification fails, make one focused repair pass and rerun the failed checks. Then stop.
</verification_loop>

<state_updates>
Only after the judge build passes verification:

- update the current status and next steps in `docs/superpowers/specs/2026-08-18-moat-read-design.md`
- update only the work-sitting status in `eval/curation/notes/sitting-2-how-it-wins.md`
- update the open Phoenix task `task-cold-start-how-it-wins-blind-read`

Keep the Phoenix task open. Its next action becomes the measured topology benchmark. The remaining order stays parity record, writer tournament, then the unread holdout against the revised pipeline.
</state_updates>

<done_definition>
Done means the repo has a private, validated, uncapped all-80 judgment contract; one injectable deep judge module; deterministic orchestration and failure handling; full per-call trace data; a writer boundary that rejects label drift; relevant tests and typechecks pass; public data remains unchanged; production stays disabled; no model or holdout was touched; and the next sitting is the measured topology benchmark.

Then stop. Do not benchmark, choose models, run cards, open the holdout, or plan extra work.
</done_definition>

<compact_output_contract>
Report only:

- what was built
- what was verified
- what remains disabled or untouched
- next action

Plain English. Under 150 words. No em dashes.
</compact_output_contract>
