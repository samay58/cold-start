import {
  HOW_IT_WINS_DISPLAY_IN_QUESTION_MAX,
  HOW_IT_WINS_DISPLAY_RUNNING_MAX,
  howItWinsJudgmentSchema,
  howItWinsSchema,
  howItWinsStrategyById,
  howItWinsStrategyIdSchema,
  type HowItWins,
  type HowItWinsJudgment,
  type HowItWinsStrategyId
} from "@cold-start/core";

import { HOW_IT_WINS_FROZEN_WRITER_PROMPT } from "./how-it-wins-judge-prompts";

const CODE_FENCE_PATTERN = /```(?:json)?\s*([\s\S]*?)```/;

export function parseHowItWinsJson(text: string): { value: unknown } | { error: string } {
  const trimmed = text.trim();
  const fenced = CODE_FENCE_PATTERN.exec(trimmed)?.[1]?.trim();
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  const braced = firstBrace >= 0 && lastBrace > firstBrace ? trimmed.slice(firstBrace, lastBrace + 1) : undefined;

  let firstError = "the response held no JSON object";
  let sawCandidate = false;

  for (const candidate of [trimmed, fenced, braced]) {
    if (!candidate) continue;
    try {
      return { value: JSON.parse(candidate) };
    } catch (error) {
      if (!sawCandidate) {
        firstError = error instanceof Error ? error.message : String(error);
        sawCandidate = true;
      }
    }
  }

  return { error: firstError };
}

type FrozenWriterItem = {
  strategy: HowItWinsStrategyId;
  meaning: string;
  note: string;
  citationIds: string[];
};

export type FrozenHowItWinsWriterRead = {
  status: "read";
  sentence: string;
  current: FrozenWriterItem[];
  pair: null | {
    strategies: [HowItWinsStrategyId, HowItWinsStrategyId];
    note: string;
    wrongIf: string;
    citationIds: string[];
  };
  notYet: FrozenWriterItem[];
  inQuestion: FrozenWriterItem[];
  wrongIf: string;
};

export type FrozenHowItWinsWriterParse =
  | {
      read: FrozenHowItWinsWriterRead | { status: "nothing_stands_out"; sentence: string; inQuestion: FrozenWriterItem[] };
      prompt: string;
      // Slips the writer made on an optional slot, corrected in code instead of a paid retry: a
      // dropped pair, a not-yet or in-question item that did not match its approved position.
      normalizations: string[];
    }
  | { issues: string[] };

function sameStrings(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function writerCitationIds(note: string) {
  return Array.from(new Set(Array.from(note.matchAll(/\[([A-Za-z0-9_-]+)\]/g), (match) => match[1]!)));
}

function writerItems(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.flatMap((entry) => record(entry) ? [record(entry)!] : []) : [];
}

function openQuestionIdsFrom(judgment: HowItWinsJudgment): HowItWinsStrategyId[] {
  return judgment.strategyEvaluations
    .filter((entry) => entry.disposition === "open_question")
    .map((entry) => entry.strategyId);
}

function parseWriterItems(
  items: Array<Record<string, unknown>>,
  expected: readonly HowItWinsStrategyId[],
  validEvidenceIds: Set<string>,
  options: { requireCitations: boolean }
) {
  const parsed: FrozenWriterItem[] = [];
  const issues: string[] = [];
  items.forEach((entry, index) => {
    const strategy = howItWinsStrategyIdSchema.safeParse(entry.strategy);
    const note = typeof entry.note === "string" ? entry.note : "";
    const citationIds = writerCitationIds(note);
    if (!strategy.success || strategy.data !== expected[index]) issues.push(`item ${index + 1} changed its strategy`);
    if (!note.trim()) issues.push(`item ${index + 1} needs a note`);
    if (options.requireCitations && citationIds.length === 0) issues.push(`item ${index + 1} needs cited evidence`);
    for (const id of citationIds) if (!validEvidenceIds.has(id)) issues.push(`item ${index + 1} cites unknown evidence ${id}`);
    if (strategy.success) {
      parsed.push({ strategy: strategy.data, meaning: howItWinsStrategyById(strategy.data).meaning, note, citationIds });
    }
  });
  return { parsed, issues };
}

// The pair, not-yet, and in-question slots are secondary and optional by the judgment standard.
// A writer slip on one of them costs that item, not the whole read: match each returned item
// against the approved list at its own position, keep what matches, and name what got dropped.
function reconcileOptionalWriterItems(
  items: Array<Record<string, unknown>>,
  expected: readonly HowItWinsStrategyId[],
  validEvidenceIds: Set<string>,
  options: { requireCitations: boolean; label: string }
): { parsed: FrozenWriterItem[]; issues: string[]; normalizations: string[] } {
  const normalizations: string[] = [];
  // Match by strategy id, not by position: a writer that skips one approved item must not take
  // the items after it down with it. Survivors keep the approved order; anything the writer sent
  // outside the approved list, or twice, is dropped with a note.
  const byStrategy = new Map<HowItWinsStrategyId, Record<string, unknown>>();
  items.forEach((entry, index) => {
    const strategy = howItWinsStrategyIdSchema.safeParse(entry.strategy);
    const got = strategy.success ? strategy.data : typeof entry.strategy === "string" ? entry.strategy : "an unnamed strategy";
    if (strategy.success && expected.includes(strategy.data) && !byStrategy.has(strategy.data)) {
      byStrategy.set(strategy.data, entry);
      return;
    }
    normalizations.push(`dropped ${options.label} item ${index + 1}: "${got}" is not an approved ${options.label} strategy`);
  });
  for (const expectedId of expected) {
    if (!byStrategy.has(expectedId)) {
      normalizations.push(`the writer omitted the approved ${options.label} strategy "${expectedId}"`);
    }
  }
  const matchedExpected = expected.filter((expectedId) => byStrategy.has(expectedId));
  const matchedEntries = matchedExpected.map((expectedId) => byStrategy.get(expectedId)!);

  const { parsed, issues } = parseWriterItems(matchedEntries, matchedExpected, validEvidenceIds, {
    requireCitations: options.requireCitations
  });
  return { parsed, issues, normalizations };
}

function rawPairStrategyNames(pairRaw: Record<string, unknown>): string {
  const raw = Array.isArray(pairRaw.strategies) ? pairRaw.strategies : [];
  if (raw.length === 0) return "no strategies";
  return raw.map((value) => (typeof value === "string" ? value : JSON.stringify(value))).join(" and ");
}

export function frozenHowItWinsWriterRequest(judgment: HowItWinsJudgment) {
  const frozen = howItWinsJudgmentSchema.parse(judgment);
  const evaluationById = new Map(frozen.strategyEvaluations.map((entry) => [entry.strategyId, entry]));
  const item = (strategyId: HowItWinsStrategyId) => {
    const evaluation = evaluationById.get(strategyId)!;
    return {
      strategy: strategyId,
      meaning: howItWinsStrategyById(strategyId).meaning,
      mechanism: evaluation.mechanism,
      evidenceIds: evaluation.evidenceIds,
      dispositionReason: evaluation.dispositionReason
    };
  };

  return {
    prompt: HOW_IT_WINS_FROZEN_WRITER_PROMPT,
    payload: {
      materialBets: frozen.materialBets,
      current: frozen.currentStrategyIds.map(item),
      unusualPair: frozen.unusualPair,
      notYet: frozen.strategyEvaluations
        .filter((entry) => entry.disposition === "not_yet")
        .map((entry) => ({ ...item(entry.strategyId), notYet: entry.notYet })),
      inQuestion: frozen.strategyEvaluations
        .filter((entry) => entry.disposition === "open_question")
        .map((entry) => item(entry.strategyId)),
      openQuestions: frozen.openQuestions,
      evidenceRegistry: frozen.evidenceRegistry,
      overallWrongCondition: frozen.overallWrongCondition
    }
  };
}

export function parseFrozenHowItWinsWriterDraft(
  text: string,
  judgment: HowItWinsJudgment
): FrozenHowItWinsWriterParse {
  const parsedJson = parseHowItWinsJson(text);
  if ("error" in parsedJson) {
    return { issues: [`writer output is not JSON: ${parsedJson.error}`] };
  }
  const draft = record(parsedJson.value);
  if (!draft) return { issues: ["writer output must be a JSON object"] };

  const validEvidenceIds = new Set(judgment.evidenceRegistry.map((entry) => entry.evidenceId));

  if (draft.status === "nothing_stands_out") {
    if (judgment.currentStrategyIds.length >= 1) {
      return { issues: ["a supported verdict cannot become nothing_stands_out"] };
    }
    // A zero-current verdict has nothing for the writer to add. When it adds a strategy or a pair
    // anyway, the verdict is not in doubt, only the writer's discipline, so the extras are
    // dropped and recorded rather than costing the whole paid read (Boom Supersonic, 2026-08-26:
    // $1.32 lost to exactly this).
    const strayNormalizations: string[] = [];
    const strayCurrent = writerItems(draft.current).length;
    const strayNotYet = writerItems(draft.not_yet).length;
    if (strayCurrent > 0) {
      strayNormalizations.push(`dropped ${strayCurrent} current item(s) the writer added to a nothing_stands_out read`);
    }
    if (strayNotYet > 0) {
      strayNormalizations.push(`dropped ${strayNotYet} not-yet item(s) the writer added to a nothing_stands_out read`);
    }
    if (record(draft.pair)) {
      strayNormalizations.push("dropped a pair the writer added to a nothing_stands_out read");
    }
    if (typeof draft.sentence !== "string" || !draft.sentence.trim()) {
      return { issues: ["a nothing_stands_out read needs a sentence"] };
    }
    const inQuestionIds = openQuestionIdsFrom(judgment);
    const inQuestionItems = writerItems(draft.in_question);
    const inQuestionResult = reconcileOptionalWriterItems(inQuestionItems, inQuestionIds, validEvidenceIds, {
      requireCitations: false,
      label: "in-question"
    });
    if (inQuestionResult.issues.length > 0) return { issues: inQuestionResult.issues };
    return {
      read: { status: "nothing_stands_out", sentence: draft.sentence, inQuestion: inQuestionResult.parsed },
      prompt: HOW_IT_WINS_FROZEN_WRITER_PROMPT,
      normalizations: [...strayNormalizations, ...inQuestionResult.normalizations]
    };
  }

  if (judgment.currentStrategyIds.length === 0) {
    return { issues: ["a zero-strategy verdict must remain nothing_stands_out"] };
  }

  if (draft.status !== "read") return { issues: ["writer used an unknown status"] };
  const currentItems = writerItems(draft.current);
  const writtenCurrent = currentItems.map((entry) => entry.strategy).filter((value): value is string => typeof value === "string");
  if (!sameStrings(writtenCurrent, judgment.currentStrategyIds)) {
    return { issues: [`writer changed the approved current strategy labels or their order (got ${writtenCurrent.join(", ") || "none"}; expected ${judgment.currentStrategyIds.join(", ")})`] };
  }

  const notYetIds = judgment.strategyEvaluations
    .filter((entry) => entry.disposition === "not_yet")
    .map((entry) => entry.strategyId);
  const notYetResult = reconcileOptionalWriterItems(writerItems(draft.not_yet), notYetIds, validEvidenceIds, {
    requireCitations: true,
    label: "not-yet"
  });

  const inQuestionIds = openQuestionIdsFrom(judgment);
  const inQuestionResult = reconcileOptionalWriterItems(writerItems(draft.in_question), inQuestionIds, validEvidenceIds, {
    requireCitations: false,
    label: "in-question"
  });

  const current = parseWriterItems(currentItems, judgment.currentStrategyIds, validEvidenceIds, { requireCitations: true });
  const issues = [...current.issues, ...notYetResult.issues, ...inQuestionResult.issues];
  const sentence = typeof draft.sentence === "string" ? draft.sentence : "";
  const wrongIf = typeof draft.wrong_if === "string" ? draft.wrong_if : "";
  if (!sentence.trim()) issues.push("writer needs a sentence");
  if (!wrongIf.trim()) issues.push("writer needs wrong_if");

  const normalizations = [...notYetResult.normalizations, ...inQuestionResult.normalizations];

  // The pair is secondary and optional by the judgment standard: any problem with it (a strategy
  // mismatch, an unapproved pair, a missing note or citation) costs the pair, not the read.
  let pair: FrozenHowItWinsWriterRead["pair"] = null;
  const pairRaw = record(draft.pair);
  if (judgment.unusualPair) {
    if (!pairRaw) {
      normalizations.push("the writer omitted the approved unusual pair");
    } else {
      const strategies = Array.isArray(pairRaw.strategies)
        ? pairRaw.strategies.filter((value): value is HowItWinsStrategyId => howItWinsStrategyIdSchema.safeParse(value).success)
        : [];
      const note = typeof pairRaw.note === "string" ? pairRaw.note : "";
      const pairWrongIf = typeof pairRaw.wrong_if === "string" ? pairRaw.wrong_if : "";
      const citationIds = writerCitationIds(note);
      const wellFormed =
        strategies.length === 2 &&
        sameStrings(strategies, judgment.unusualPair.strategyIds) &&
        note.trim().length > 0 &&
        pairWrongIf.trim().length > 0 &&
        citationIds.length > 0 &&
        citationIds.every((id) => validEvidenceIds.has(id));
      if (wellFormed) {
        pair = { strategies: [strategies[0]!, strategies[1]!], note, wrongIf: pairWrongIf, citationIds };
      } else {
        normalizations.push(`dropped the writer's pair (${rawPairStrategyNames(pairRaw)}); it did not match the approved unusual pair`);
      }
    }
  } else if (pairRaw) {
    normalizations.push(`dropped the writer's pair (${rawPairStrategyNames(pairRaw)}); no unusual pair was approved`);
  }

  if (issues.length > 0) return { issues: Array.from(new Set(issues)) };
  return {
    read: {
      status: "read",
      sentence,
      current: current.parsed,
      pair,
      notYet: notYetResult.parsed,
      inQuestion: inQuestionResult.parsed,
      wrongIf
    },
    prompt: HOW_IT_WINS_FROZEN_WRITER_PROMPT,
    normalizations
  };
}

function filedInQuestion(items: FrozenWriterItem[], runningIds: Set<HowItWinsStrategyId>) {
  return items
    .filter((entry) => !runningIds.has(entry.strategy))
    .slice(0, HOW_IT_WINS_DISPLAY_IN_QUESTION_MAX)
    .map((entry) => ({ strategy: entry.strategy, note: entry.note, citationIds: entry.citationIds }));
}

export function howItWinsFromFrozenWriter(
  read: FrozenHowItWinsWriterRead | { status: "nothing_stands_out"; sentence: string; inQuestion: FrozenWriterItem[] }
): HowItWins {
  if (read.status !== "read") {
    return howItWinsSchema.parse({
      status: "nothing_stands_out",
      sentence: read.sentence,
      inQuestion: filedInQuestion(read.inQuestion, new Set())
    });
  }
  const running = read.current.slice(0, HOW_IT_WINS_DISPLAY_RUNNING_MAX);
  const runningIds = new Set(running.map((entry) => entry.strategy));
  const inQuestion = filedInQuestion(read.inQuestion, runningIds);
  if (running.length < 1) {
    return howItWinsSchema.parse({
      status: "nothing_stands_out",
      ...(read.sentence.trim() ? { sentence: read.sentence } : {}),
      inQuestion
    });
  }
  const pair = read.pair && read.pair.strategies.every((leg) => runningIds.has(leg))
    ? read.pair
    : null;
  const next = read.notYet
    .filter((entry) => !runningIds.has(entry.strategy))
    .slice(0, 2)
    .map((entry) => ({ strategy: entry.strategy, note: entry.note, citationIds: entry.citationIds }));
  return howItWinsSchema.parse({
    status: "read",
    sentence: read.sentence,
    running,
    pair,
    next,
    inQuestion,
    wrongIf: read.wrongIf
  });
}
