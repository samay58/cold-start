export const HOW_IT_WINS_BET_MAP_PROMPT = `Identify the company's material strategic bet or bets before considering strategy labels.

Use only the supplied evidence. A bet must explain consequential product, customer, economic, and operating choices. Remove the most vivid fact and check whether the bet still explains the company. Split the company only when combining activities would conceal a material difference in how they expect to win.

Return structured data only. Cite supplied evidence handles. Return each bet's meaning, scope, support, and split reasons. Do not create identifiers. Do not name or choose any strategy.`;

export const HOW_IT_WINS_GROUP_SCOUT_PROMPT = `Evaluate every supplied strategy in the assigned scope against the frozen bet map and evidence.

Positive support must show the mechanism, not a proxy. Missing evidence is insufficient evidence, never a negative claim. Record the plain mechanism, evidence IDs, close sibling candidates, the deciding distinction, and disqualifying evidence. Sibling rubric rows supplied with the request are part of the comparison, including siblings outside this scope. A scout may challenge the bet map when evidence does not fit it.

Return structured data only. Use canonical strategy IDs and inline evidence handles. Do not create claim or bet identifiers. Do not rank a company-wide current set.`;

export const HOW_IT_WINS_MONOLITH_PROMPT = `Produce the complete structured all-80 judgment in one call.

First identify the company's material bet or bets without using strategy labels. Then evaluate every canonical strategy against that frozen bet map. Every strategy receives exactly one disposition. There is no strategy-count target or cap. Apply the supplied authoritative standard and strategy rubric exactly. Absence of data is never analysis. Treat the unusual pair as secondary and optional. A current strategy passes every current gate it reports: evidence gate pass, material, independent, present relevance current, and a present outcome or bridge. A not-yet strategy carries a complete not-yet record and its present relevance is never current. The current list names exactly the strategies whose disposition is current, in centrality order.

Return the complete semantic judgment only. State supporting facts and inferences inline. Refer to returned bets by their one-based local position. Code assigns every durable identifier. Spend words on the current, not-yet, and open-question strategies; a rejected or inapplicable strategy gets one clause, and every reason is one short sentence.`;

export const HOW_IT_WINS_GLOBAL_JUDGE_PROMPT = `Judge the complete all-80 audit against the company's material bet or bets.

Every canonical strategy receives exactly one disposition. There is no strategy-count target or cap. A current strategy needs positive evidence, materiality, present relevance, sibling resolution, independence, and explanatory value. Order current strategies mainly by centrality. Absence of data is never analysis. Historical evidence needs a present bridge. Not yet needs an observed precursor, causal path, missing condition, promotion evidence, and a plausible 12-to-24-month horizon.

An unusual pair is secondary and optional. It cannot change the selected strategies or their order. Record every scout override with cited reasons. State supporting facts and inferences inline. Use the supplied one-based local bet references. Code assigns every durable identifier. Return the complete semantic judgment only. Spend words on the current, not-yet, and open-question strategies; a rejected or inapplicable strategy gets one clause, and every reason is one short sentence.`;

export const HOW_IT_WINS_CRITIC_PROMPT = `Attack the structured judgment for a missed bet, missed strategy, unsupported selection, duplicated mechanism, unresolved sibling, stale historical claim, speculative not-yet claim, weak pair, or broken evidence reference.

Mark a finding material only when correcting it could change the bet, a strategy disposition, the current ordering, a not-yet disposition, or the overall wrong condition. Return structured findings only. Do not rewrite the verdict.`;

export const HOW_IT_WINS_ADJUDICATION_PROMPT = `Resolve only the material disputes supplied with the request.

Use the frozen evidence, canonical vocabulary, and settled judgment rules. Do not reopen an undisputed decision. Return a patch over the settled judgment, not a new judgment: one row for each disputed strategy id, the complete ordered current list, and an override for each thing you changed. Code carries every undisputed row forward unchanged, so a row for anything else is dropped. State supporting facts and inferences inline, use one-based local bet references, and create no durable identifiers. Every reason is one short sentence.`;

export const HOW_IT_WINS_FROZEN_WRITER_PROMPT = `Render the approved structured judgment in plain English at the bar of a seasoned investor memo.

You are not choosing labels. Copy every current, not-yet, and in-question strategy ID exactly and in the supplied order. Do not add, remove, replace, or reorder a label. Do not infer a new pair. Canonical meanings are rendered by code, not written by you. If the approved current list has five items, current has five items. Use only supplied evidence IDs. Every current and not-yet note carries at least one evidence handle in [id] form, placed at the end of the clause it supports, and no note carries more than four.

The sentence: one sentence, under 40 words. Name the company, who buys, and the mechanism that wins. Lead with the company and the mechanism; a named customer is proof, never the opening. One load-bearing fact, not a list. No semicolon chains.

A current note, 40 to 80 words: the mechanism in plain words first, then the single strongest proof with its citation, then, if it matters, what that proof does not show. Say what the source said in the verb: the partner chose, the filing reports, the founder says. Never describe the evidence as evidence. Do not restate the strategy's meaning; code prints it. Claim only what the cited source states; an inference is one clause and reads as one.

A not-yet note, 30 to 60 words: the precursor that exists today, the condition still missing, and what would show it arrived.

An in-question note, 25 to 50 words: what is unresolved, then the one thing that would settle it. Do not write it as if it were current. Do not open two notes the same way, and do not reuse a closing formula; each note finds its own shape.

wrong_if: one plain conditional about the world, under 30 words. No strategy labels, no reference to the read or the selection.

Status follows the approved current list. One or more current strategies: status is "read" and current copies that list exactly. None: status is "nothing_stands_out", current is an empty array, and in_question still copies the approved in-question list. Do not set nothing_stands_out to skip a hard sentence. Do not mention strategy counts or display caps.

Vary sentence length. Complete every thought. No slogans, no antithesis templates, no certainty tags, no em dashes, no reference to the input, the evidence packet, the profile, or the card. "On the card", "the record", "the evidence shows", "bears this out", "is consistent with", "what is unresolved is whether", and "would settle it" are banned. Strip filler.

Return structured JSON only with keys status, sentence, current, pair, not_yet, in_question, wrong_if.`;

export const HOW_IT_WINS_JUDGE_PROMPTS = {
  betMap: HOW_IT_WINS_BET_MAP_PROMPT,
  scout: HOW_IT_WINS_GROUP_SCOUT_PROMPT,
  monolith: HOW_IT_WINS_MONOLITH_PROMPT,
  globalJudge: HOW_IT_WINS_GLOBAL_JUDGE_PROMPT,
  critic: HOW_IT_WINS_CRITIC_PROMPT,
  adjudication: HOW_IT_WINS_ADJUDICATION_PROMPT,
  frozenWriter: HOW_IT_WINS_FROZEN_WRITER_PROMPT
} as const;
