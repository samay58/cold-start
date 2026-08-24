# How it wins framework mapping, round-two ingestion

## Status

The [round-two response](./2026-08-21-how-it-wins-framework-mapping-round-2-output.md) is saved verbatim. It is source material, not an approved judgment standard.

Mechanical checks passed:

- all 80 canonical strategy names appear exactly once as rubric entries
- every strategy has positive evidence, false positives, sibling labels, a deciding question, and disqualifying evidence
- the response includes the requested evidence taxonomy, pre-prose audit, unusual-pair standard, unseen-company test plan, and five-decision brief
- the approved eight judgment lines remain unchanged

No code, judge build, model run, tournament, new card, golden eval, or holdout read occurred.

## Decision

Do not approve the response wholesale. It is a strong candidate operating manual, but it mixes three different things:

- Steph Ango's source definitions and examples
- Samay's approved judgment rules
- ChatGPT's proposed operational interpretations

The final standard must keep those layers separate. An operational rule may narrow a label for Cold Start, but it must say that it is a Cold Start rule rather than presenting the narrowing as Steph's definition.

## Recommended calls on Samay's five decisions

These remain proposals until Samay writes or approves the load-bearing lines.

| Decision | Recommendation | Reason |
| --- | --- | --- |
| Split one company into several bets | Approve the proposed sentence. | It requires an independently evidenced mechanism, consequential commitments, and a material distortion test. Product count alone cannot create a split. |
| Explicit judgment dimensions | Approve the proposed sentence. | Five categorical fields expose the reasoning only when a strategy has positive support. No score can let strength on one dimension erase failure on another. |
| Pair reference class and normal choice | Approve the proposed sentence. | It requires buyer-level substitutes and affirmative category evidence. Absence cannot manufacture unusualness. |
| Historical mechanism still current | Approve the proposed sentence. | It permits cumulative assets to remain current while rejecting history that no longer changes a present outcome. |
| Not-yet horizon | Revise before approval. | A free-form sector exception is an easy loophole for speculation. Keep the 12-to-24-month promotion test firm; longer paths belong in open questions. |

Recommended fifth line for Samay to rewrite:

> A not-yet strategy needs a named condition that could plausibly make the mechanism current within 12 to 24 months. A longer-horizon possibility is an open question, not a not-yet strategy, even when the sector moves slowly.

## Source conflicts to correct

Steph's [source page](https://stephango.com/moats) contains one-line descriptions and examples. The round-two rubric extends those definitions. Four extensions conflict with the source closely enough that they cannot silently enter the standard:

| Strategy | Round-two rubric | Steph's source | Required treatment |
| --- | --- | --- | --- |
| Union | Requires participants to remain separate. | Lists mergers and acquisitions among the examples. | Remove the independence requirement from Union. Use preservation of independence to distinguish Alliance. |
| Unpredictability | Requires strategic usefulness against another actor. | Includes Banksy and Lady Gaga alongside surprise, confusion, and variability. | Do not require an opponent unless Samay explicitly adopts that Cold Start narrowing. |
| Obscurity | Treats closed-source software as a false positive for Secrecy. | Lists closed-source software as an Obscurity example. | Preserve the source example and rewrite the Secrecy distinction. |
| Craftsmanship | Requires more human time and care. | Says more time, precision, and attention than competitors, without limiting the mechanism to human labor. | Remove the unsupported human-only restriction. |

These corrections do not invalidate the rest of the rubric. They show why the all-80 table is a candidate interpretation, not canonical doctrine.

## What is ready

The following are complete enough to use as design inputs after Samay decides the five lines:

- a categorical evidence taxonomy with evidence IDs and explicit inference bridges
- an uncapped all-80 audit with one disposition per canonical strategy
- a positive selection threshold, sibling resolution, and a zero-strategy stop rule
- a pair record that requires current component strategies, a sourced reference class, an excluded alternative, interaction, and copying difficulty
- an unseen-company test plan with perturbations for dramatic facts, names, label order, prose slots, sibling facts, history, and pair evidence

The proposed schema is a reference contract, not a production payload. The runtime should keep all 80 dispositions but avoid emitting empty prose fields for strategies that fail the evidence gate. Detailed reasoning belongs only on positively supported or materially disputed rows. This preserves the audit while controlling token cost.

## One bounded handoff

Samay approves or rewrites the five decision lines. At the same time, the four source conflicts above are corrected. Then the approved lines can replace the open questions in the judgment-standard draft. Judge implementation remains a separate sitting.
