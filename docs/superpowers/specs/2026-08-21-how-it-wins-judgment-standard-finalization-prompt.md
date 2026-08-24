<task>
Finalize Cold Start's judgment standard for mapping company evidence to Steph Ango's 80-strategy Moats framework.

Repo: `/Users/samaydhawan/Projects/active/cold-start`

This is a judgment-documentation sitting. It is not a judge implementation, model evaluation, or product-release sitting.

Samay owns every load-bearing judgment line. Your job is to structure his decisions, test them for contradictions, correct source-definition errors, and turn the approved method into a compact authoritative standard. Do not author a new thesis for him.
</task>

<mandatory_skills>
Read and follow these before acting:

- `/Users/samaydhawan/.agents/skills/fable-judgment/SKILL.md`
- `/Users/samaydhawan/.agents/skills/fable-execution/SKILL.md`
- `/Users/samaydhawan/.agents/skills/fable-verification/SKILL.md`
- `.agents/skills/verify-cold-start/SKILL.md`

State the done-definition before editing.
</mandatory_skills>

<hard_boundaries>
- Do not open `/eval/how-it-wins`. It would serve the unread holdout.
- Do not name, list, inspect, or infer the holdout cards.
- Do not run models, create cards, start a tournament, start a golden eval, or perform a blind read.
- Do not implement the judge split, change schemas, or edit runtime prompts.
- Do not change production environment variables. `HOW_IT_WINS_ENABLED` remains false. Do not set `LLM_HOW_IT_WINS_MODEL`.
- Do not use subagents.
- Beads is disabled.
- Preserve the dirty worktree and all user-owned changes. Do not stage, commit, stash, rebase, branch-switch, or clean unrelated files.
- Use `apply_patch` for edits.
- Do not broaden the task after the standard is complete.
</hard_boundaries>

<read_order>
Read these fully, in order. The round-two response is large, so read it in chunks until EOF rather than relying on grep snippets.

1. `docs/superpowers/specs/2026-08-21-how-it-wins-judgment-standard-draft.md`
2. `docs/superpowers/specs/2026-08-21-how-it-wins-framework-mapping-round-2-ingestion.md`
3. `docs/superpowers/specs/2026-08-21-how-it-wins-framework-mapping-round-2-output.md`
4. `packages/core/src/how-it-wins.ts`
5. Steph Ango's primary source: `https://stephango.com/moats`
6. `docs/superpowers/specs/2026-08-21-how-it-wins-judge-architecture-draft.md`
7. `docs/superpowers/specs/2026-08-18-moat-read-design.md`, only the current How it wins status and next-steps sections
8. `eval/curation/notes/sitting-2-how-it-wins.md`, only the judgment findings and current work-sitting update. Do not enter any holdout surface.
</read_order>

<decision_gate>
Before editing the standard, ask Samay one question containing the five proposed lines below. Ask him to reply `approve all` or edit any line. Do not split this into several questions. Do not ask for approval of source corrections or document structure.

Proposed line 1, company scope:

> Split a company into multiple strategic bets only when each proposed bet has an independently evidenced win mechanism and consequential commitments, and combining them would conceal a material difference in customer decision, economics, competitive set, operating model, or product architecture. Product count, geography, or organizational structure alone is not enough.

Proposed line 2, judgment dimensions:

> Record evidence strength, centrality, materiality, distinctiveness, and independence as separate categorical judgments for every strategy with positive support; strategies that fail the evidence gate may mark the remaining fields “not reached.” Do not combine the dimensions into a score. Evidence, materiality, independence, and explanatory value are current-selection gates, while centrality and distinctiveness govern ordering and interpretation.

Proposed line 3, unusual-pair evidence:

> An unusual pair requires a sourced reference class of credible substitutes for the same buyer decision and positive evidence that a concrete alternative is the normal category choice. Absence of observed peers using the pair is not evidence. When the reference class or normal choice cannot be established from representative peer or category evidence, record the pair as an open question.

Proposed line 4, historical mechanisms:

> A historical mechanism counts as current only when recent evidence shows that it still operates, or when a present material outcome is demonstrably dependent on the accumulated historical asset. Historical existence alone is insufficient.

Proposed line 5, not-yet horizon:

> A not-yet strategy needs a named condition that could plausibly make the mechanism current within 12 to 24 months. A longer-horizon possibility is an open question, not a not-yet strategy, even when the sector moves slowly.

Once Samay answers, treat his exact wording as authoritative. Do not polish or paraphrase his lines.
</decision_gate>

<source_integrity>
Keep three layers visibly separate:

- Steph Ango's canonical names, meanings, and examples
- Samay's approved judgment rules
- Cold Start's operational tests

Do not present a Cold Start narrowing as Steph's definition. Correct these known round-two conflicts against Steph's primary source without asking Samay another question:

- Union cannot require participants to remain separate because Steph lists mergers and acquisitions as an example. Preservation of independence distinguishes Alliance.
- Unpredictability cannot require an opponent because Steph includes Banksy and Lady Gaga as examples.
- Obscurity cannot treat closed-source software as a false positive because Steph lists it as an example.
- Craftsmanship cannot require human labor. Steph's definition is more time, precision, and attention than competitors.

Check the remaining 76 rows for the same class of problem. A source conflict is not a stylistic issue. Correct it or mark the Cold Start rule explicitly as an added operational restriction.
</source_integrity>

<artifact_contract>
Produce no more than two authoritative artifacts:

1. `docs/superpowers/specs/2026-08-21-how-it-wins-judgment-standard.md`
2. `docs/superpowers/specs/2026-08-21-how-it-wins-strategy-rubric.md`

The judgment standard should contain only load-bearing doctrine:

- the actual-bet test and company-splitting rule
- evidence taxonomy and claim discipline
- positive threshold for a current strategy
- uncapped all-80 selection rule
- categorical judgment dimensions with no composite score
- sibling-resolution rule
- historical-current rule
- not-yet rule
- unusual-pair rule
- open-question, insufficient-evidence, rejection, and nothing-stands-out rules
- compact pre-prose audit contract
- unseen-company test requirements

The strategy rubric should contain all 80 exact canonical labels. For every strategy, retain only:

- Steph's canonical meaning
- positive operational evidence
- common false positives
- nearest siblings
- deciding question
- disqualifying evidence

Do not copy the round-two response mechanically. Remove repetition, repair source conflicts, and preserve substantive distinctions. Every operational rule must earn its space.

Do not serialize the enormous proposed YAML schema as doctrine. Convert it into a compact normative contract. The future runtime must retain one disposition for all 80 strategies, but rows that fail the evidence gate do not need empty prose fields. Detailed reasoning is required only for positively supported or materially disputed strategies.

Turn the existing draft into a short pointer to the final standard or clearly mark it superseded. Do not leave two competing standards.
</artifact_contract>

<quality_bar>
- Plain English. Precise verbs. Short paragraphs.
- No em dashes.
- No throat-clearing, motivational framing, fake certainty, vague intensifiers, or repeated summaries.
- Follow the repository's full AI-slop kill list. Use unnumbered section headings.
- Do not turn Samay's plain lines into polished hooks.
- Avoid uniform sentence length and templated three-part prose.
- Prefer tables only where exact repeated fields are easier to compare.
- Preserve useful disagreement and boundary cases. Do not make the method look cleaner than the evidence allows.
- “Absence of data is never analysis” must remain literal doctrine throughout the taxonomy and dispositions.
- The writer must never be allowed to add, remove, or swap a strategy after judgment is frozen.
</quality_bar>

<grounding_rules>
Ground every strategy name and canonical meaning in `packages/core/src/how-it-wins.ts` and Steph's primary page.

Ground every judgment rule in one of:

- Samay's eight approved sitting lines
- Samay's answer to the five-line decision gate
- an explicitly labeled Cold Start operational definition required to apply those lines

Do not invent new doctrine. If a missing rule is genuinely necessary for internal consistency, surface it as one concise unresolved question rather than silently deciding it.
</grounding_rules>

<default_follow_through_policy>
After Samay answers the single decision gate, complete the artifacts without asking routine questions. Resolve reversible document-structure choices yourself. If two rules conflict, preserve Samay's exact line and explain the conflict briefly before choosing any supporting operational wording.
</default_follow_through_policy>

<verification_loop>
Before reporting completion:

- programmatically compare the rubric's strategy names and count against `HOW_IT_WINS_STRATEGIES`
- confirm all 80 exact names appear once, with no missing, duplicate, or noncanonical labels
- verify the known four source conflicts are corrected
- check that every approved Samay line appears verbatim
- verify every local Markdown link resolves
- run `git diff --check`
- run `python3 ~/.claude/scripts/slopcheck.py` on every self-authored artifact
- read back every changed file
- verify no code, production configuration, holdout data, cards, or model outputs were touched

Do not run `npm run check`; it contains a prohibited golden-eval dry run and this sitting is documentation-only.

If verification finds a problem, make one focused repair pass and rerun the failed check. Then stop.
</verification_loop>

<state_updates>
Update `docs/superpowers/specs/2026-08-18-moat-read-design.md`, `eval/curation/notes/sitting-2-how-it-wins.md`, and the existing Phoenix task `task-cold-start-how-it-wins-blind-read` only after the final standard passes verification.

The Phoenix task stays open. Its next action should become the judge build. The remaining queue must still name the measured topology benchmark, parity record, writer tournament, and only then the unread holdout against the revised pipeline.
</state_updates>

<done_definition>
Done means Samay's five decisions are recorded in his exact words; one authoritative judgment standard exists; the all-80 rubric is exact, source-corrected, and compact; the evidence taxonomy, audit contract, pair rules, and unseen-company tests are complete; all documentation checks pass; `HOW_IT_WINS_ENABLED` remains untouched; the holdout remains unread; and the next sitting is clearly the judge build.

Then stop. No implementation plan, no judge code, no model run, and no extra roadmap.
</done_definition>

<compact_output_contract>
Report only:

- what became authoritative
- what was verified
- the next action

Keep the final answer in plain English and under 150 words. No em dashes.
</compact_output_contract>
