# How it wins framework-mapping prompt for ChatGPT

Use this conversation to turn the closed sitting into a systematic mapping method for Steph Ango's Moats framework. It does not authorize model runs, holdout reads, or judge implementation.

## Prompt

I am building “How it wins,” a company-analysis system that maps sourced evidence about a company to Steph Ango’s Moats framework: 80 strategies across 13 groups.

The goal is not to invent a new moat framework, rename Steph’s strategies, or produce polished company copy. The goal is to develop a structured, systematic, repeatable way to map real company evidence to the existing framework with good judgment.

I will give you:

- Steph Ango’s complete list of 80 strategies and their definitions
- notes from a blind evaluation of model-generated company reads
- examples where the mapping worked or failed
- a draft judgment standard

Work with me interactively. Challenge weak rules and ask focused questions when a choice is genuinely mine. Do not silently invent doctrine or collapse overlapping strategies because they seem similar.

The method needs to solve these problems:

- Identify the company’s actual strategic bet before choosing labels. The most dramatic fact is not always the center of the company.
- Start with the mechanism in plain English, then map it to the nearest strategy in Steph’s framework.
- Set an evidence threshold for choosing a strategy. Absence of data is never analysis.
- Distinguish observed facts, reasonable inference, judgment, and open questions without adding certainty labels to the prose.
- Explain why sibling strategies differ. Examples include Alliance versus Symbiosis and Usership versus Reliability.
- Require Prestige to affect a buyer’s decision. A top-tier cap table alone is not Prestige.
- Require Iteration to show a feedback loop. A release count or fundraising history alone is not Iteration.
- Decide when two strategies form an unusual pair. A pair has to exclude something before it counts as unusual, and the interaction needs to be hard for a competitor to copy.
- Define when weak evidence should become a “not yet” strategy, an open question, or nothing at all.
- Create a clear stop rule. When nothing stands out, the system should say nothing stands out.
- Avoid habitual labels that appear across too many companies simply because they are broadly applicable.

The deliverables from our conversation are:

1. A step-by-step decision procedure that moves from sourced evidence to:
   - the company’s actual bet
   - candidate mechanisms in plain English
   - two to four current strategies from Steph’s framework
   - zero or one unusual pair
   - zero to two “not yet” strategies
   - a plain world condition that would make the conclusion wrong
   - “nothing stands out” when the threshold is not met

2. A mapping rubric for all 80 strategies. For each strategy, define:
   - positive evidence that supports it
   - common false positives
   - the nearest sibling strategies
   - the deciding question that separates it from those siblings
   - evidence that should disqualify it

3. A pair-selection standard that explains:
   - what a pair must exclude
   - what makes the interaction unusual for the category
   - what makes the combined mechanism harder to copy than either strategy alone
   - when no pair should be selected

4. An evidence and certainty standard covering:
   - observed fact
   - reasonable inference
   - judgment
   - open question
   - insufficient evidence
   - the difference between “not yet” and unsupported speculation

5. A structured output format that a model can return before any prose is written. It should preserve evidence IDs and make every strategy choice auditable.

6. A test plan for evaluating the method on unseen companies. Include specific failure checks for label habits, dramatic-fact anchoring, missed company bets, sibling confusion, weak pairs, and failure to say nothing stands out.

7. A short list of unresolved judgment calls that require my decision. Do not fill these gaps for me.

Start by restating the problem in plain English, identifying the three hardest judgment problems, and asking me the smallest set of questions needed before we draft the decision procedure.

## Downstream ingestion

- Save the unedited response beside this file as `2026-08-21-how-it-wins-framework-mapping-chatgpt-output.md`.
- Treat that response as source material, not as the standard.
- Move only rules Samay approves into the judgment-standard draft.
- Keep unresolved judgment calls unresolved.
- Do not begin the judge build until Samay has written the load-bearing lines.
