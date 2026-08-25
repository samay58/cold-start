export const HOW_IT_WINS_BET_MAP_PROMPT = `Identify the company's material strategic bet or bets before considering strategy labels.

Use only the supplied evidence. A bet must explain consequential product, customer, economic, and operating choices. Remove the most vivid fact and check whether the bet still explains the company. Split the company only when combining activities would conceal a material difference in how they expect to win.

Return structured data only. Cite supplied evidence handles. Return each bet's meaning, scope, support, and split reasons. Do not create identifiers. Do not name or choose any strategy.`;

export const HOW_IT_WINS_GROUP_SCOUT_PROMPT = `Evaluate every supplied strategy in the assigned scope against the frozen bet map and evidence.

Positive support must show the mechanism, not a proxy. Missing evidence is insufficient evidence, never a negative claim. Record the plain mechanism, evidence IDs, close sibling candidates, the deciding distinction, and disqualifying evidence. Sibling rubric rows supplied with the request are part of the comparison, including siblings outside this scope. A scout may challenge the bet map when evidence does not fit it.

Return structured data only. Use canonical strategy IDs and inline evidence handles. Do not create claim or bet identifiers. Do not rank a company-wide current set.`;

export const HOW_IT_WINS_MONOLITH_PROMPT = `Produce the complete structured all-80 judgment in one call.

First identify the company's material bet or bets without using strategy labels. Then evaluate every canonical strategy against that frozen bet map. Every strategy receives exactly one disposition. There is no strategy-count target or cap. Apply the supplied authoritative standard and strategy rubric exactly. Absence of data is never analysis. Treat the unusual pair as secondary and optional.

Return the complete semantic judgment only. State supporting facts and inferences inline. Refer to returned bets by their one-based local position. Code assigns every durable identifier.`;

export const HOW_IT_WINS_GLOBAL_JUDGE_PROMPT = `Judge the complete all-80 audit against the company's material bet or bets.

Every canonical strategy receives exactly one disposition. There is no strategy-count target or cap. A current strategy needs positive evidence, materiality, present relevance, sibling resolution, independence, and explanatory value. Order current strategies mainly by centrality. Absence of data is never analysis. Historical evidence needs a present bridge. Not yet needs an observed precursor, causal path, missing condition, promotion evidence, and a plausible 12-to-24-month horizon.

An unusual pair is secondary and optional. It cannot change the selected strategies or their order. Record every scout override with cited reasons. State supporting facts and inferences inline. Use the supplied one-based local bet references. Code assigns every durable identifier. Return the complete semantic judgment only.`;

export const HOW_IT_WINS_CRITIC_PROMPT = `Attack the structured judgment for a missed bet, missed strategy, unsupported selection, duplicated mechanism, unresolved sibling, stale historical claim, speculative not-yet claim, weak pair, or broken evidence reference.

Mark a finding material only when correcting it could change the bet, a strategy disposition, the current ordering, a not-yet disposition, or the overall wrong condition. Return structured findings only. Do not rewrite the verdict.`;

export const HOW_IT_WINS_ADJUDICATION_PROMPT = `Resolve only the material disputes supplied with the request.

Use the frozen evidence, canonical vocabulary, and settled judgment rules. Do not reopen undisputed decisions. Return a complete semantic judgment so validation can prove that no unrelated decision changed. State supporting facts and inferences inline, use one-based local bet references, and create no durable identifiers. Record every change and its cited reason.`;

export const HOW_IT_WINS_FROZEN_WRITER_PROMPT = `Render the approved structured judgment in plain English, at the same bar as the rest of the Investor Lens.

You are not choosing labels. Copy every current, not-yet, and in-question strategy ID exactly and in the supplied order. Do not add, remove, replace, or reorder a label. Do not infer a new pair. Canonical meanings are rendered by code, not written by you. If the approved current list has five items, current has five items. Display caps are applied in code, never by you. Use only supplied evidence IDs. Every current and not-yet note must include at least one evidence handle in [id] form.

Write like a seasoned investor memo. Name the company, the buyer or user, and the specific mechanism. Put the load-bearing fact in the sentence. Put the mechanism and the cited proof in each current note. Distinguish what is observed from what is inferred. A note that could sit on any company in the category has failed.

When a strategy is in question, say what is unresolved and what evidence would settle it. Do not write it as if it were current. A not-yet note names the precursor that exists today and the condition that is still missing.

Status follows the approved current list. Two or more current strategies: status is "read" and current copies that list exactly. Fewer than two: status is "nothing_stands_out", current is an empty array, and in_question still copies the approved in-question list. Do not set nothing_stands_out to skip a hard sentence. Do not mention strategy counts, display caps, or that a current set needs two entries.

Complete the thought. No slogans, no antithesis templates, no certainty tags, no em dashes, no reference to the input, the evidence packet, the profile, or the card. "On the card" is banned. Strip filler.

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
