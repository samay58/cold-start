# How it wins framework-mapping ingestion

## Status

The [raw ChatGPT response](./2026-08-21-how-it-wins-framework-mapping-chatgpt-output.md) is saved unchanged. It is source material, not an approved judgment standard.

The response adds six substantive proposals:

- Split a company into more than one strategic bet when combining the activities would hide a meaningful difference in how they expect to win.
- Evaluate all 80 strategies and select by explanatory value instead of a fixed count.
- Keep evidence strength, centrality, materiality, distinctiveness, and independence separate.
- Define an unusual pair against the narrowest defensible buyer-decision reference class.
- Use history to explain the present, but require the mechanism to remain strategically active.
- Limit not-yet strategies to evidenced paths that could mature in roughly 12 to 24 months.

## Decision recorded from Samay

The current strategy judgment has no numerical cap. Evaluate all 80 strategies and retain every strategy that earns inclusion. A fixed count is an interface convenience, not an analytical rule. The reader presentation may disclose a smaller primary set, but that must not alter the stored judgment.

## Decisions Samay still owns

| Proposal | What it fixes | Pressure test | Line Samay needs to write |
| --- | --- | --- | --- |
| More than one company bet | Stops the system from forcing unrelated businesses into one tidy thesis. | The split can become a product taxonomy. The standard needs a materiality threshold and a rule for relating the bets at company level. | When is a difference large enough to deserve a separate strategic bet? |
| Five separate judgment dimensions | Stops an easy-to-prove but peripheral label from outranking the company's real mechanism. | Five dimensions may create false precision. They also answer a different question from the sitting's 3-of-3 versus 2-of-3 judge agreement. One option is to keep the dimensions as strategy properties and vote agreement as judge consistency. | Which dimensions must be explicit fields, and which remain reasoning checks? |
| Buyer-decision reference class for pairs | Turns “a pair has to exclude something” into an operational test. | The model can invent what competitors normally choose. The standard needs an evidence rule for the reference class and normal category choice. | What evidence is required before the system may state the normal category choice? |
| History with a bias toward now | Stops old communities, partnerships, or prestige from being treated as current by default. | “Recent evidence must establish continued relevance” may be too strict for slow-moving mechanisms whose effects persist without frequent announcements. | What proves that a historical mechanism is still doing strategic work? |
| A 12-to-24-month not-yet horizon | Separates an evidenced trajectory from “could someday.” | The horizon is useful but arbitrary. Some buying cycles and regulated markets move more slowly. | Is 12 to 24 months a hard boundary, a default, or unnecessary if the causal path is testable? |

## Concrete mismatch to correct

The response uses “Community” as if it were a strategy label. The canonical 80 contain no strategy named Community. A developer community may be evidence for Usership, Aggregation, Emergence, Distributed ownership, or another mechanism, but the label must come from the canonical list.

## Deliverable coverage

| Deliverable | State after this response |
| --- | --- |
| Step-by-step decision procedure | Partial. Bet splitting and selection order are proposed, but sibling resolution, evidence thresholds, and stop behavior remain incomplete. |
| Rubric for all 80 strategies | Missing. No strategy-by-strategy positive evidence, false positives, siblings, deciding question, or disqualifier. |
| Pair-selection standard | Strong proposal. It still needs an evidence rule for the reference class and normal category choice. |
| Evidence and certainty standard | Partial. The five dimensions are useful proposals, but observed fact, inference, judgment, open question, and insufficient evidence are not defined. |
| Structured judge output | Missing. The response names fields but does not provide a schema or preserve evidence IDs. |
| Test plan | Missing. No cases or failure assertions are specified. |
| Unresolved judgment calls | Partial. The response makes choices instead of listing the choices Samay still owns. |

## Current implementation conflicts

The live schema currently assumes one company-level read with:

- two to four current strategies
- zero or one pair whose legs are current strategies
- zero to two not-yet strategies
- one reader sentence and one plain-world wrong condition
- automatic degradation to nothing stands out when fewer than two current strategies survive verification

These are implementation facts, not reasons to reject the response. The judgment standard must be settled before changing them.

The two-to-four current-strategy constraint and the fewer-than-two degradation rule now conflict with an explicit Samay decision. They stay unchanged in code until the judgment standard and judge schema are ready to change together.

## Safe ingestion order

1. Samay writes the five remaining decision lines above.
2. Use the [round-two ChatGPT packet](./2026-08-21-how-it-wins-framework-mapping-round-2-prompt.md) to complete the all-80 rubric, evidence taxonomy, structured output, and test plan without deciding those five lines.
3. Samay rewrites the judgment standard in his own words.
4. Only then translate the approved standard into the judge schema, prompts, tests, and evaluation design.
