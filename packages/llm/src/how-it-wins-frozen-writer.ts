import {
  HOW_IT_WINS_DISPLAY_IN_QUESTION_MAX,
  howItWinsJudgmentSchema,
  howItWinsSchema,
  howItWinsStrategyById,
  howItWinsStrategyIdSchema,
  type HowItWins,
  type HowItWinsJudgment,
  type HowItWinsStrategyId
} from "@cold-start/core";

import { HOW_IT_WINS_FROZEN_WRITER_PROMPT } from "./how-it-wins-judge-prompts";

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
  | { read: FrozenHowItWinsWriterRead | { status: "nothing_stands_out"; sentence: string; inQuestion: FrozenWriterItem[] }; prompt: string }
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
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    return { issues: [`writer output is not JSON: ${error instanceof Error ? error.message : String(error)}`] };
  }
  const draft = record(raw);
  if (!draft) return { issues: ["writer output must be a JSON object"] };

  if (judgment.currentStrategyIds.length === 0) {
    if (writerItems(draft.current).length > 0 || writerItems(draft.not_yet).length > 0 || record(draft.pair)) {
      return { issues: ["writer added a strategy or pair to a zero-strategy verdict"] };
    }
    if (draft.status !== "nothing_stands_out" || typeof draft.sentence !== "string" || !draft.sentence.trim()) {
      return { issues: ["a zero-strategy verdict must remain nothing_stands_out"] };
    }
    const inQuestionIds = openQuestionIdsFrom(judgment);
    const inQuestionItems = writerItems(draft.in_question);
    const writtenInQuestion = inQuestionItems.map((entry) => entry.strategy).filter((value): value is string => typeof value === "string");
    if (!sameStrings(writtenInQuestion, inQuestionIds)) {
      return { issues: ["writer changed the approved in-question strategy labels or their order"] };
    }
    const parsedInQuestion = parseWriterItems(inQuestionItems, inQuestionIds, new Set(judgment.evidenceRegistry.map((entry) => entry.evidenceId)), { requireCitations: false });
    if (parsedInQuestion.issues.length > 0) return { issues: parsedInQuestion.issues };
    return {
      read: { status: "nothing_stands_out", sentence: draft.sentence, inQuestion: parsedInQuestion.parsed },
      prompt: HOW_IT_WINS_FROZEN_WRITER_PROMPT
    };
  }

  if (draft.status !== "read") return { issues: ["a supported verdict cannot become nothing_stands_out"] };
  const currentItems = writerItems(draft.current);
  const writtenCurrent = currentItems.map((entry) => entry.strategy).filter((value): value is string => typeof value === "string");
  if (!sameStrings(writtenCurrent, judgment.currentStrategyIds)) {
    return { issues: ["writer changed the approved current strategy labels or their order"] };
  }
  const notYetIds = judgment.strategyEvaluations
    .filter((entry) => entry.disposition === "not_yet")
    .map((entry) => entry.strategyId);
  const notYetItems = writerItems(draft.not_yet);
  const writtenNotYet = notYetItems.map((entry) => entry.strategy).filter((value): value is string => typeof value === "string");
  if (!sameStrings(writtenNotYet, notYetIds)) {
    return { issues: ["writer changed the approved not-yet strategy labels or their order"] };
  }

  const validEvidenceIds = new Set(judgment.evidenceRegistry.map((entry) => entry.evidenceId));
  const inQuestionIds = openQuestionIdsFrom(judgment);
  const inQuestionItems = writerItems(draft.in_question);
  const writtenInQuestion = inQuestionItems.map((entry) => entry.strategy).filter((value): value is string => typeof value === "string");
  if (!sameStrings(writtenInQuestion, inQuestionIds)) {
    return { issues: ["writer changed the approved in-question strategy labels or their order"] };
  }

  const current = parseWriterItems(currentItems, judgment.currentStrategyIds, validEvidenceIds, { requireCitations: true });
  const notYet = parseWriterItems(notYetItems, notYetIds, validEvidenceIds, { requireCitations: true });
  const inQuestion = parseWriterItems(inQuestionItems, inQuestionIds, validEvidenceIds, { requireCitations: false });
  const issues = [...current.issues, ...notYet.issues, ...inQuestion.issues];
  const sentence = typeof draft.sentence === "string" ? draft.sentence : "";
  const wrongIf = typeof draft.wrong_if === "string" ? draft.wrong_if : "";
  if (!sentence.trim()) issues.push("writer needs a sentence");
  if (!wrongIf.trim()) issues.push("writer needs wrong_if");

  let pair: FrozenHowItWinsWriterRead["pair"] = null;
  const pairRaw = record(draft.pair);
  if (judgment.unusualPair) {
    if (!pairRaw) {
      issues.push("writer removed the approved unusual pair");
    } else {
      const strategies = Array.isArray(pairRaw.strategies)
        ? pairRaw.strategies.filter((value): value is HowItWinsStrategyId => howItWinsStrategyIdSchema.safeParse(value).success)
        : [];
      if (!sameStrings(strategies, judgment.unusualPair.strategyIds)) issues.push("writer changed the approved unusual pair");
      const note = typeof pairRaw.note === "string" ? pairRaw.note : "";
      const pairWrongIf = typeof pairRaw.wrong_if === "string" ? pairRaw.wrong_if : "";
      const citationIds = writerCitationIds(note);
      if (!note || !pairWrongIf || citationIds.length === 0) issues.push("writer pair needs its note, wrong_if, and cited evidence");
      for (const id of citationIds) if (!validEvidenceIds.has(id)) issues.push(`writer pair cites unknown evidence ${id}`);
      if (strategies.length === 2) {
        pair = { strategies: [strategies[0]!, strategies[1]!], note, wrongIf: pairWrongIf, citationIds };
      }
    }
  } else if (pairRaw) {
    issues.push("writer added an unusual pair that was not approved");
  }

  if (issues.length > 0) return { issues: Array.from(new Set(issues)) };
  return {
    read: {
      status: "read",
      sentence,
      current: current.parsed,
      pair,
      notYet: notYet.parsed,
      inQuestion: inQuestion.parsed,
      wrongIf
    },
    prompt: HOW_IT_WINS_FROZEN_WRITER_PROMPT
  };
}

export const HOW_IT_WINS_DISPLAY_RUNNING_MAX = 4;

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
  if (running.length < 2) {
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
