import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  HOW_IT_WINS_STRATEGIES,
  coldStartCardSchema,
  howItWinsJudgmentSchema,
  howItWinsStrategyIdForName,
  type HowItWinsEvidenceItem,
  type HowItWinsJudgeCallTrace,
  type HowItWinsJudgment,
  type HowItWinsStrategyId
} from "@cold-start/core";
import {
  cardForHowItWinsPrompt,
  hashHowItWinsJudgeValue,
  howItWinsFourBundleScopes,
  howItWinsGroupScopes,
  type HowItWinsJudgeRules,
  type HowItWinsJudgeScope
} from "@cold-start/llm";

export type HowItWinsJudgeTopology = "monolith" | "four_bundles" | "thirteen_groups";

export function scopesForTopology(topology: HowItWinsJudgeTopology): HowItWinsJudgeScope[] {
  if (topology === "monolith") return [];
  if (topology === "four_bundles") return howItWinsFourBundleScopes();
  return howItWinsGroupScopes();
}

export const CLOSED_HOW_IT_WINS_CARDS = [
  { slug: "suki", name: "Suki" },
  { slug: "nekohealth", name: "Neko Health" },
  { slug: "deepinfra", name: "DeepInfra" },
  { slug: "cognition", name: "Cognition" },
  { slug: "notion", name: "Notion" },
  { slug: "doppel", name: "Doppel" },
  { slug: "profluent", name: "Profluent" },
  { slug: "bland", name: "Bland" },
  { slug: "hebbia", name: "Hebbia" },
  { slug: "august", name: "August" }
] as const;

export type ClosedHowItWinsSlug = (typeof CLOSED_HOW_IT_WINS_CARDS)[number]["slug"];

export const PILOT_SLUGS: readonly ClosedHowItWinsSlug[] = ["cognition", "bland"];
export const ORDER_PERTURBATION_SLUGS: readonly ClosedHowItWinsSlug[] = [
  "cognition",
  "deepinfra",
  "nekohealth"
];
export const FROZEN_REPEAT_RULE = {
  materialDivergenceAdditionalRunsPerTopology: 2,
  seededAgreementControls: 2,
  agreementControlAdditionalRunsPerTopology: 2,
  tuningAfterResults: false
} as const;
export const BENCHMARK_TOPOLOGIES: readonly HowItWinsJudgeTopology[] = [
  "monolith",
  "four_bundles",
  "thirteen_groups"
];

const MINIMUM_CALL_COUNTS: Record<HowItWinsJudgeTopology, number> = {
  monolith: 2,
  four_bundles: 7,
  thirteen_groups: 16
};

function canonicalHash(value: unknown) {
  return hashHowItWinsJudgeValue(value);
}

function seededOrder<T>(values: readonly T[], seed: string) {
  return [...values].sort((left, right) => {
    const leftHash = canonicalHash([seed, left]);
    const rightHash = canonicalHash([seed, right]);
    return leftHash.localeCompare(rightHash);
  });
}

export async function verifyClosedBenchmarkCards(input: {
  ledgerPath: string;
  notesPath: string;
  requestedSlugs?: readonly string[];
}) {
  const [ledgerText, notes] = await Promise.all([
    readFile(input.ledgerPath, "utf8"),
    readFile(input.notesPath, "utf8")
  ]);
  const records = ledgerText
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { kind?: unknown });
  const closedCount = records.filter((record) => record.kind === "how-it-wins").length;
  if (closedCount !== CLOSED_HOW_IT_WINS_CARDS.length) {
    throw new Error(`closed ledger count is ${closedCount}; expected ${CLOSED_HOW_IT_WINS_CARDS.length}`);
  }
  if (!notes.includes("How it wins blind read (closed 2026-08-21, 10 of 10)")) {
    throw new Error("the sitting note does not prove the ten-card read is closed");
  }
  CLOSED_HOW_IT_WINS_CARDS.forEach((card, index) => {
    if (!notes.includes(`## Card ${index + 1}: ${card.name}.`)) {
      throw new Error(`the sitting note does not prove closed card ${index + 1}`);
    }
  });

  const allowlist = new Map(CLOSED_HOW_IT_WINS_CARDS.map((card) => [card.slug, card]));
  const requested = input.requestedSlugs ?? CLOSED_HOW_IT_WINS_CARDS.map((card) => card.slug);
  return requested.map((slug) => {
    const card = allowlist.get(slug as ClosedHowItWinsSlug);
    if (!card) throw new Error(`${slug} is not in the closed benchmark allowlist`);
    return card;
  });
}

function tableCells(line: string) {
  return line.slice(1, -1).split("|").map((cell) => cell.trim());
}

export function parseHowItWinsJudgeRules(input: { standard: string; rubric: string }): HowItWinsJudgeRules {
  const betStart = input.standard.indexOf("## Find the company's actual bet");
  const betEnd = input.standard.indexOf("## Keep claims separate");
  if (betStart < 0 || betEnd <= betStart) throw new Error("could not isolate the authoritative actual-bet rule");

  const rows = input.rubric
    .split("\n")
    .filter((line) => line.startsWith("| ") && !line.startsWith("| ---") && !line.startsWith("| Strategy |"))
    .map(tableCells)
    .filter((cells) => cells.length === 7)
    .map((cells) => {
      const [name, canonicalMeaning, positiveEvidence, falsePositives, nearestSiblings, decidingQuestion, disqualifyingEvidence] = cells;
      const strategyId = howItWinsStrategyIdForName(name!);
      if (!strategyId) throw new Error(`noncanonical rubric strategy: ${name}`);
      return {
        strategyId,
        name: name!,
        canonicalMeaning: canonicalMeaning!,
        positiveEvidence: positiveEvidence!,
        falsePositives: falsePositives!,
        nearestSiblings: nearestSiblings!
          .split(";")
          .map((value) => value.trim().replace(/\.$/, ""))
          .filter(Boolean),
        decidingQuestion: decidingQuestion!,
        disqualifyingEvidence: disqualifyingEvidence!
      };
    });

  const byId = new Map(rows.map((row) => [row.strategyId, row]));
  if (rows.length !== HOW_IT_WINS_STRATEGIES.length || byId.size !== HOW_IT_WINS_STRATEGIES.length) {
    throw new Error(`strategy rubric has ${rows.length} rows and ${byId.size} unique canonical ids`);
  }
  const ordered = HOW_IT_WINS_STRATEGIES.map((strategy) => {
    const row = byId.get(strategy.id);
    if (!row) throw new Error(`strategy rubric is missing ${strategy.id}`);
    if (row.name !== strategy.name || row.canonicalMeaning !== strategy.meaning) {
      throw new Error(`strategy rubric differs from the canonical source for ${strategy.id}`);
    }
    return row;
  });

  return {
    standard: input.standard.trim(),
    actualBetStandard: input.standard.slice(betStart, betEnd).trim(),
    strategyRubric: ordered
  };
}

export function buildHowItWinsEvidencePacket(cardInput: unknown, options: { orderSeed: string | null }) {
  const card = coldStartCardSchema.parse(cardInput);
  const context = structuredClone(cardForHowItWinsPrompt(card));
  const citations = options.orderSeed
    ? seededOrder(context.citations, `${options.orderSeed}:citations`)
    : context.citations;
  context.citations = citations;
  if (options.orderSeed) {
    context.signals = seededOrder(context.signals, `${options.orderSeed}:signals`);
    context.comparables = seededOrder(context.comparables, `${options.orderSeed}:comparables`);
  }
  const evidence: HowItWinsEvidenceItem[] = citations.map((citation) => ({
    evidenceId: citation.id,
    text: citation.snippet?.trim() || citation.title,
    source: `${citation.title} (${citation.url})`,
    sourceDate: null,
    attribution: citation.sourceQuality?.tier ?? citation.sourceType,
    scope: "company"
  }));
  return {
    cutoff: card.generatedAt,
    evidence,
    context
  };
}

export type BenchmarkRunPlanItem = {
  runId: string;
  slug: ClosedHowItWinsSlug;
  topology: HowItWinsJudgeTopology;
  repeat: number;
  variant: "base" | "divergence" | "control" | "order";
  minimumCallCount: number;
  orderSeed?: string;
};

export function buildBenchmarkRunPlan(input: { phase: "pilot" | "base"; transportHash: string }): BenchmarkRunPlanItem[] {
  if (!/^[a-f0-9]{64}$/.test(input.transportHash)) throw new Error("invalid benchmark transport hash");
  const transportId = input.transportHash.slice(0, 12);
  const slugs = input.phase === "pilot" ? PILOT_SLUGS : CLOSED_HOW_IT_WINS_CARDS.map((card) => card.slug);
  return slugs.flatMap((slug) => BENCHMARK_TOPOLOGIES.map((topology) => ({
    runId: `${slug}:base:0:${topology}:${transportId}`,
    slug,
    topology,
    repeat: 0,
    variant: "base" as const,
    minimumCallCount: MINIMUM_CALL_COUNTS[topology]
  })));
}

export function selectBenchmarkRunPlan(
  plan: readonly BenchmarkRunPlanItem[],
  selectors: readonly string[]
) {
  if (selectors.length === 0) return [...plan];
  if (new Set(selectors).size !== selectors.length) throw new Error("benchmark run selectors must be unique");
  const bySelector = new Map(plan.map((run) => [`${run.slug}:${run.topology}`, run]));
  for (const selector of selectors) {
    if (!bySelector.has(selector)) throw new Error(`benchmark run selector is outside the frozen plan: ${selector}`);
  }
  return plan.filter((run) => selectors.includes(`${run.slug}:${run.topology}`));
}

export type BenchmarkRunRecord = {
  run: BenchmarkRunPlanItem;
  outcome: "ok" | "failed";
  costUsd: number;
  wallTimeMs: number;
  preCriticJudgment: unknown | null;
  verdict: unknown | null;
  traces: HowItWinsJudgeCallTrace[];
  error: string | null;
};

export type MaterialDivergenceCategory =
  | "material_bet"
  | "current_disposition"
  | "current_ordering"
  | "sibling_decision"
  | "pair_selection"
  | "not_yet_selection"
  | "fail_closed";

const DIVERGENCE_CATEGORY_ORDER: readonly MaterialDivergenceCategory[] = [
  "material_bet",
  "current_disposition",
  "current_ordering",
  "sibling_decision",
  "pair_selection",
  "not_yet_selection",
  "fail_closed"
];

function judgmentSignature(judgment: HowItWinsJudgment) {
  return {
    material_bet: judgment.materialBets.map((bet) => ({
      statement: bet.statement,
      scope: bet.scope,
      supportingEvidenceIds: [...bet.supportingEvidenceIds].sort(),
      scopeReasons: [...bet.scopeReasons]
    })),
    current_disposition: judgment.strategyEvaluations
      .filter((entry) => entry.disposition === "current")
      .map((entry) => entry.strategyId),
    current_ordering: [...judgment.currentStrategyIds],
    sibling_decision: judgment.strategyEvaluations
      .filter((entry) => entry.siblingCandidateIds.length > 0 || entry.siblingResolutions.length > 0)
      .map((entry) => ({
        strategyId: entry.strategyId,
        candidates: [...entry.siblingCandidateIds].sort(),
        resolved: entry.siblingResolutions
          .map((resolution) => ({
            strategyId: resolution.strategyId,
            evidenceIds: [...resolution.evidenceIds].sort()
          }))
          .sort((left, right) => left.strategyId.localeCompare(right.strategyId))
      })),
    pair_selection: judgment.unusualPair
      ? [...judgment.unusualPair.strategyIds].sort()
      : null,
    not_yet_selection: judgment.strategyEvaluations
      .filter((entry) => entry.disposition === "not_yet")
      .map((entry) => entry.strategyId)
  };
}

function allHashesMatch(values: readonly unknown[]) {
  return new Set(values.map(canonicalHash)).size <= 1;
}

export function classifyMaterialDivergence(records: readonly BenchmarkRunRecord[]): MaterialDivergenceCategory[] {
  if (records.length < 2) throw new Error("material divergence needs at least two topology records");
  const slug = records[0]!.run.slug;
  if (records.some((record) => record.run.slug !== slug)) {
    throw new Error("material divergence records must belong to one card");
  }
  const outcomeSignatures = records.map((record) => record.outcome);
  const categories = new Set<MaterialDivergenceCategory>();
  if (!allHashesMatch(outcomeSignatures)) categories.add("fail_closed");

  const successful = records.filter((record) => record.outcome === "ok");
  const parsed = successful.map((record) => howItWinsJudgmentSchema.parse(record.verdict));
  if (parsed.length >= 2) {
    const signatures = parsed.map(judgmentSignature);
    for (const category of DIVERGENCE_CATEGORY_ORDER) {
      if (category === "fail_closed") continue;
      if (!allHashesMatch(signatures.map((signature) => signature[category]))) categories.add(category);
    }
  }
  return DIVERGENCE_CATEGORY_ORDER.filter((category) => categories.has(category));
}

function adaptiveRun(input: {
  slug: ClosedHowItWinsSlug;
  topology: HowItWinsJudgeTopology;
  repeat: number;
  variant: "divergence" | "control" | "order";
  transportHash: string;
  orderSeed?: string;
}): BenchmarkRunPlanItem {
  return {
    runId: `${input.slug}:${input.variant}:${input.repeat}:${input.topology}:${input.transportHash.slice(0, 12)}`,
    slug: input.slug,
    topology: input.topology,
    repeat: input.repeat,
    variant: input.variant,
    minimumCallCount: MINIMUM_CALL_COUNTS[input.topology],
    ...(input.orderSeed ? { orderSeed: input.orderSeed } : {})
  };
}

function assertCompleteBaseRecords(records: readonly BenchmarkRunRecord[]) {
  const expected = CLOSED_HOW_IT_WINS_CARDS.flatMap((card) =>
    BENCHMARK_TOPOLOGIES.map((topology) => `${card.slug}:${topology}`)
  );
  const actual = records.map((record) => `${record.run.slug}:${record.run.topology}`);
  if (records.length !== 30 || new Set(actual).size !== 30 || new Set(expected).size !== 30) {
    throw new Error("adaptive planning needs exactly 30 unique base records");
  }
  for (const key of expected) if (!actual.includes(key)) throw new Error(`adaptive planning is missing ${key}`);
  if (records.some((record) => record.run.variant !== "base" || record.run.repeat !== 0)) {
    throw new Error("adaptive planning accepts base records only");
  }
}

export function buildAdaptiveBenchmarkRunPlan(input: {
  baseRecords: readonly BenchmarkRunRecord[];
  seed: string;
  transportHash: string;
}) {
  if (!/^[a-f0-9]{64}$/.test(input.transportHash)) throw new Error("invalid benchmark transport hash");
  assertCompleteBaseRecords(input.baseRecords);
  const bySlug = new Map<ClosedHowItWinsSlug, BenchmarkRunRecord[]>();
  for (const record of input.baseRecords) {
    const current = bySlug.get(record.run.slug) ?? [];
    current.push(record);
    bySlug.set(record.run.slug, current);
  }
  const divergenceBySlug = Object.fromEntries(CLOSED_HOW_IT_WINS_CARDS.map((card) => [
    card.slug,
    classifyMaterialDivergence(bySlug.get(card.slug) ?? [])
  ])) as Record<ClosedHowItWinsSlug, MaterialDivergenceCategory[]>;
  const divergentSlugs = CLOSED_HOW_IT_WINS_CARDS
    .map((card) => card.slug)
    .filter((slug) => divergenceBySlug[slug].length > 0);
  const agreementCandidates = CLOSED_HOW_IT_WINS_CARDS
    .map((card) => card.slug)
    .filter((slug) => {
      const records = bySlug.get(slug) ?? [];
      return divergenceBySlug[slug].length === 0 && records.every((record) => record.outcome === "ok");
    });
  const agreementControlSlugs = seededOrder(agreementCandidates, `${input.seed}:agreement-controls`).slice(0, 2);
  const runsFor = (
    slugs: readonly ClosedHowItWinsSlug[],
    variant: "divergence" | "control"
  ) => slugs.flatMap((slug) => BENCHMARK_TOPOLOGIES.flatMap((topology) => [1, 2].map((repeat) =>
    adaptiveRun({ slug, topology, repeat, variant, transportHash: input.transportHash })
  )));
  const orderRuns = ORDER_PERTURBATION_SLUGS.flatMap((slug) => BENCHMARK_TOPOLOGIES.map((topology) =>
    adaptiveRun({
      slug,
      topology,
      repeat: 0,
      variant: "order",
      transportHash: input.transportHash,
      orderSeed: `${input.seed}:order:${slug}`
    })
  ));
  return {
    divergenceBySlug,
    divergentSlugs,
    agreementControlSlugs,
    controlShortage: 2 - agreementControlSlugs.length,
    divergenceRuns: runsFor(divergentSlugs, "divergence"),
    controlRuns: runsFor(agreementControlSlugs, "control"),
    orderRuns
  };
}

function roundCost(value: number) {
  return Number(value.toFixed(6));
}

function median(values: readonly number[]) {
  if (values.length === 0) return null;
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 0
    ? (ordered[middle - 1]! + ordered[middle]!) / 2
    : ordered[middle]!;
}

export function aggregateBenchmarkRuns(records: readonly BenchmarkRunRecord[]) {
  const rows = records.map((record) => {
    if (record.outcome === "ok") howItWinsJudgmentSchema.parse(record.verdict);
    if (record.outcome === "failed" && record.verdict !== null) {
      throw new Error(`${record.run.runId} failed closed but retained a verdict`);
    }
    return {
      ...record,
      retries: record.traces.filter((trace) => trace.retryCount > 0).length,
      criticCalls: record.traces.filter((trace) => trace.stage === "critic").length,
      adjudicationCalls: record.traces.filter((trace) => trace.stage === "adjudication").length
    };
  });
  const summarize = (subset: typeof rows) => ({
    arms: subset.length,
    valid: subset.filter((record) => record.outcome === "ok").length,
    failedClosed: subset.filter((record) => record.outcome === "failed").length,
    costUsd: roundCost(subset.reduce((sum, record) => sum + record.costUsd, 0)),
    wallTimeMs: subset.reduce((sum, record) => sum + record.wallTimeMs, 0),
    retries: subset.reduce((sum, record) => sum + record.retries, 0),
    criticCalls: subset.reduce((sum, record) => sum + record.criticCalls, 0),
    adjudicationCalls: subset.reduce((sum, record) => sum + record.adjudicationCalls, 0)
  });
  const grouped = <T>(items: readonly T[], keyFor: (item: T) => string) => {
    const groups = new Map<string, T[]>();
    for (const item of items) {
      const key = keyFor(item);
      const group = groups.get(key) ?? [];
      group.push(item);
      groups.set(key, group);
    }
    return groups;
  };
  const stability = (subset: BenchmarkRunRecord[]) => {
    const categories = classifyMaterialDivergence(subset);
    const valid = subset.filter((record) => record.outcome === "ok").length;
    return {
      runs: subset.length,
      valid,
      failedClosed: subset.length - valid,
      categories,
      status: categories.length > 0
        ? "unstable"
        : valid === subset.length
          ? "stable"
          : "consistently_failed"
    };
  };
  const baseRows = records.filter((record) => record.run.variant === "base");
  const baseGroups = grouped(baseRows, (record) => record.run.slug);
  const repeatedRows = records.filter((record) =>
    record.run.variant === "base" || record.run.variant === "divergence" || record.run.variant === "control"
  );
  const repeatGroups = grouped(repeatedRows, (record) => `${record.run.slug}:${record.run.topology}`);
  const orderRows = records.filter((record) => record.run.variant === "order");
  const orderComparisons = orderRows.map((order) => {
    const base = baseRows.find((record) =>
      record.run.slug === order.run.slug && record.run.topology === order.run.topology
    );
    if (!base) throw new Error(`order perturbation has no base run for ${order.run.runId}`);
    return {
      slug: order.run.slug,
      topology: order.run.topology,
      ...stability([base, order])
    };
  });
  return {
    version: 1 as const,
    totals: summarize(rows),
    byTopology: Object.fromEntries(BENCHMARK_TOPOLOGIES.map((topology) => {
      const subset = rows.filter((record) => record.run.topology === topology);
      const latencies = subset.map((record) => record.wallTimeMs);
      return [topology, {
        ...summarize(subset),
        latencyMs: {
          median: median(latencies),
          minimum: latencies.length > 0 ? Math.min(...latencies) : null,
          maximum: latencies.length > 0 ? Math.max(...latencies) : null
        }
      }];
    })),
    byVariant: Object.fromEntries(["base", "divergence", "control", "order"].map((variant) => [
      variant,
      summarize(rows.filter((record) => record.run.variant === variant))
    ])),
    baseDivergence: Array.from(baseGroups.entries()).map(([slug, group]) => ({
      slug,
      categories: classifyMaterialDivergence(group)
    })),
    repeatStability: Array.from(repeatGroups.entries())
      .filter(([, group]) => group.length > 1)
      .map(([key, group]) => ({ key, ...stability(group) })),
    orderStability: orderComparisons
  };
}

function disputedStrategyIds(judgments: readonly HowItWinsJudgment[]) {
  const byStrategy = new Map<HowItWinsStrategyId, Set<string>>();
  for (const judgment of judgments) {
    for (const evaluation of judgment.strategyEvaluations) {
      const signatures = byStrategy.get(evaluation.strategyId) ?? new Set<string>();
      signatures.add(canonicalHash({
        disposition: evaluation.disposition,
        siblingCandidateIds: [...evaluation.siblingCandidateIds].sort(),
        siblingResolutions: evaluation.siblingResolutions.map((entry) => entry.strategyId).sort()
      }));
      byStrategy.set(evaluation.strategyId, signatures);
    }
  }
  return HOW_IT_WINS_STRATEGIES
    .map((strategy) => strategy.id)
    .filter((strategyId) => (byStrategy.get(strategyId)?.size ?? 0) > 1);
}

export function buildBlindBenchmarkReview(input: {
  records: readonly BenchmarkRunRecord[];
  seed: string;
}) {
  const aliasOrder = seededOrder(BENCHMARK_TOPOLOGIES, `${input.seed}:blind-alias`);
  const aliasToTopology = Object.fromEntries(aliasOrder.map((topology, index) => [
    `Arm ${String.fromCharCode(65 + index)}`,
    topology
  ])) as Record<string, HowItWinsJudgeTopology>;
  const topologyToAlias = Object.fromEntries(Object.entries(aliasToTopology).map(([alias, topology]) => [topology, alias])) as Record<HowItWinsJudgeTopology, string>;
  const bySlug = new Map<ClosedHowItWinsSlug, BenchmarkRunRecord[]>();
  for (const record of input.records) {
    const rows = bySlug.get(record.run.slug) ?? [];
    rows.push(record);
    bySlug.set(record.run.slug, rows);
  }
  const items = CLOSED_HOW_IT_WINS_CARDS.flatMap((card) => {
    const records = bySlug.get(card.slug) ?? [];
    if (records.length < 2) return [];
    const categories = classifyMaterialDivergence(records);
    if (categories.length === 0) return [];
    const judgments = records
      .filter((record) => record.outcome === "ok")
      .map((record) => howItWinsJudgmentSchema.parse(record.verdict));
    const disputed = disputedStrategyIds(judgments);
    return [{
      reviewId: canonicalHash([input.seed, card.slug, categories]).slice(0, 16),
      categories,
      arms: records.map((record) => {
        const alias = topologyToAlias[record.run.topology];
        const runLabel = `${record.run.variant}:${record.run.repeat}`;
        if (record.outcome === "failed") return { alias, runLabel, outcome: "failed_closed" as const };
        const judgment = howItWinsJudgmentSchema.parse(record.verdict);
        return {
          alias,
          runLabel,
          outcome: "valid" as const,
          materialBets: judgment.materialBets.map((bet) => ({
            statement: bet.statement,
            scope: bet.scope,
            evidenceIds: bet.supportingEvidenceIds
          })),
          currentStrategyIds: judgment.currentStrategyIds,
          disputedStrategies: judgment.strategyEvaluations
            .filter((entry) => disputed.includes(entry.strategyId))
            .map((entry) => ({
              strategyId: entry.strategyId,
              disposition: entry.disposition,
              evidenceIds: entry.evidenceIds,
              siblingReasons: entry.siblingResolutions.map((resolution) => ({
                siblingStrategyId: resolution.strategyId,
                reason: resolution.reason,
                evidenceIds: resolution.evidenceIds
              }))
            })),
          unusualPairStrategyIds: judgment.unusualPair?.strategyIds ?? null,
          notYetStrategyIds: judgment.strategyEvaluations
            .filter((entry) => entry.disposition === "not_yet")
            .map((entry) => entry.strategyId)
        };
      }),
      question: "Which arm best matches the material bet and the evidence-backed strategy decisions?"
    }];
  });
  return {
    packet: { version: 1 as const, seedHash: canonicalHash(input.seed), items },
    metadata: { version: 1 as const, aliasToTopology }
  };
}

const RESERVATION_ORDER: Record<HowItWinsJudgeTopology, number> = {
  monolith: 2,
  four_bundles: 2.5,
  thirteen_groups: 3.5
};

export function orderBenchmarkRunsForCap(plan: readonly BenchmarkRunPlanItem[]) {
  return plan
    .map((run, index) => ({ run, index }))
    .sort((left, right) =>
      RESERVATION_ORDER[right.run.topology] - RESERVATION_ORDER[left.run.topology] ||
      left.index - right.index
    )
    .map(({ run }) => run);
}

type StoredResult<T> = { costUsd: number; value: T };

async function readStoredResult<T>(path: string) {
  try {
    return JSON.parse(await readFile(path, "utf8")) as StoredResult<T>;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

let atomicWriteIndex = 0;

async function writeJsonAtomic(path: string, value: unknown) {
  atomicWriteIndex += 1;
  const temporary = `${path}.${process.pid}.${atomicWriteIndex}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  await rename(temporary, path);
}

export function createBenchmarkResultStore(input: { root: string; capUsd: number }) {
  if (!Number.isFinite(input.capUsd) || input.capUsd < 0) throw new Error("approved spend cap must be nonnegative");

  return {
    async readOnce<T>(runId: string) {
      if (!/^[a-z0-9:_-]+$/i.test(runId)) throw new Error("unsafe benchmark run id");
      return readStoredResult<T>(join(input.root, `${runId.replaceAll(":", "__")}.json`));
    },
    async writeOnce<T>(runId: string, result: StoredResult<T>) {
      if (!/^[a-z0-9:_-]+$/i.test(runId)) throw new Error("unsafe benchmark run id");
      await mkdir(input.root, { recursive: true });
      const path = join(input.root, `${runId.replaceAll(":", "__")}.json`);
      const existing = await readStoredResult<T>(path);
      if (existing) return existing;
      await writeFile(path, `${JSON.stringify(result, null, 2)}\n`, { flag: "wx", mode: 0o600 });
      return result;
    }
  };
}

type SpendState = {
  costUsd: number;
  baselineCostUsd: number;
  attemptCosts: Record<string, number>;
};

type StoredAttempt<T> = {
  version: 1;
  attemptId: string;
  identityHash: string;
  maximumCostUsd: number;
  costUsd: number;
  value: T;
};

function safeAttemptName(attemptId: string) {
  if (!/^[a-z0-9:_-]+$/i.test(attemptId)) throw new Error("unsafe benchmark attempt id");
  return `${attemptId.replaceAll(":", "__")}.json`;
}

function validCost(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function createBenchmarkAttemptStore(input: { root: string; capUsd: number }) {
  if (!Number.isFinite(input.capUsd) || input.capUsd < 0) throw new Error("approved spend cap must be nonnegative");
  const attemptRoot = join(input.root, "attempts");
  const spendPath = join(input.root, "spend.json");
  let spendState: SpendState | null = null;
  const reservations = new Map<string, number>();
  let lock = Promise.resolve();

  const exclusive = async <T>(run: () => Promise<T>) => {
    const previous = lock;
    let release = () => undefined;
    lock = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      return await run();
    } finally {
      release();
    }
  };

  const loadSpend = async () => {
    if (spendState) return spendState;
    await mkdir(attemptRoot, { recursive: true, mode: 0o700 });
    let parsed: { costUsd?: unknown; baselineCostUsd?: unknown; attemptCosts?: unknown } = {};
    try {
      parsed = JSON.parse(await readFile(spendPath, "utf8")) as typeof parsed;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const legacyCost = validCost(parsed.costUsd) ? parsed.costUsd : 0;
    const baselineCostUsd = validCost(parsed.baselineCostUsd) ? parsed.baselineCostUsd : legacyCost;
    const attemptCosts = parsed.attemptCosts && typeof parsed.attemptCosts === "object"
      ? Object.fromEntries(Object.entries(parsed.attemptCosts).filter((entry): entry is [string, number] => validCost(entry[1])))
      : {};
    const names = await readdir(attemptRoot);
    for (const name of names.filter((value) => value.endsWith(".json"))) {
      const stored = JSON.parse(await readFile(join(attemptRoot, name), "utf8")) as StoredAttempt<unknown>;
      if (!stored.attemptId || !validCost(stored.costUsd)) throw new Error(`invalid stored benchmark attempt ${name}`);
      const prior = attemptCosts[stored.attemptId];
      if (prior !== undefined && prior !== stored.costUsd) {
        throw new Error(`stored benchmark attempt cost drifted for ${stored.attemptId}`);
      }
      attemptCosts[stored.attemptId] = stored.costUsd;
    }
    const costUsd = Number((baselineCostUsd + Object.values(attemptCosts).reduce((sum, cost) => sum + cost, 0)).toFixed(6));
    spendState = { costUsd, baselineCostUsd, attemptCosts };
    if (costUsd !== legacyCost || !validCost(parsed.baselineCostUsd)) {
      await writeJsonAtomic(spendPath, spendState);
    }
    return spendState;
  };

  const readAttempt = async <T>(attemptId: string) => {
    const path = join(attemptRoot, safeAttemptName(attemptId));
    try {
      return JSON.parse(await readFile(path, "utf8")) as StoredAttempt<T>;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  };

  return {
    async runOnce<T>(
      attempt: { attemptId: string; identity: unknown; maximumCostUsd: number },
      run: () => Promise<StoredResult<T>>
    ) {
      if (!Number.isFinite(attempt.maximumCostUsd) || attempt.maximumCostUsd < 0) {
        throw new Error("benchmark attempt reservation must be nonnegative");
      }
      const identityHash = canonicalHash(attempt.identity);
      const prepared = await exclusive(async () => {
        const state = await loadSpend();
        const stored = await readAttempt<T>(attempt.attemptId);
        if (stored) {
          if (stored.identityHash !== identityHash) {
            throw new Error(`benchmark attempt identity hash drifted for ${attempt.attemptId}`);
          }
          if (stored.maximumCostUsd !== attempt.maximumCostUsd) {
            throw new Error(`benchmark attempt reservation drifted for ${attempt.attemptId}`);
          }
          if (state.attemptCosts[attempt.attemptId] === undefined) {
            state.attemptCosts[attempt.attemptId] = stored.costUsd;
            state.costUsd = Number((state.baselineCostUsd + Object.values(state.attemptCosts)
              .reduce((sum, cost) => sum + cost, 0)).toFixed(6));
            await writeJsonAtomic(spendPath, state);
          }
          if (stored.costUsd > stored.maximumCostUsd) {
            throw new Error("attempt cost exceeded its reserved maximum");
          }
          return { stored, reused: true as const };
        }
        const reservedUsd = Array.from(reservations.values()).reduce((sum, cost) => sum + cost, 0);
        if (state.costUsd + reservedUsd + attempt.maximumCostUsd > input.capUsd) {
          throw new Error(`attempt could exceed the approved spend cap of $${input.capUsd.toFixed(2)}`);
        }
        reservations.set(attempt.attemptId, attempt.maximumCostUsd);
        return null;
      });
      if (prepared) return prepared;

      let result: StoredResult<T>;
      try {
        result = await run();
      } catch (error) {
        await exclusive(async () => { reservations.delete(attempt.attemptId); });
        throw error;
      }
      if (!validCost(result.costUsd)) {
        await exclusive(async () => { reservations.delete(attempt.attemptId); });
        throw new Error("attempt cost is invalid");
      }

      return exclusive(async () => {
        const state = await loadSpend();
        const stored: StoredAttempt<T> = {
          version: 1,
          attemptId: attempt.attemptId,
          identityHash,
          maximumCostUsd: attempt.maximumCostUsd,
          costUsd: result.costUsd,
          value: result.value
        };
        await writeJsonAtomic(join(attemptRoot, safeAttemptName(attempt.attemptId)), stored);
        state.attemptCosts[attempt.attemptId] = result.costUsd;
        state.costUsd = Number((state.baselineCostUsd + Object.values(state.attemptCosts)
          .reduce((sum, cost) => sum + cost, 0)).toFixed(6));
        await writeJsonAtomic(spendPath, state);
        reservations.delete(attempt.attemptId);
        if (result.costUsd > attempt.maximumCostUsd) {
          throw new Error("attempt cost exceeded its reserved maximum");
        }
        return { stored, reused: false as const };
      });
    }
  };
}

export function strategyIdsFromRules(rules: HowItWinsJudgeRules): HowItWinsStrategyId[] {
  return rules.strategyRubric.map((row) => row.strategyId);
}

export { canonicalHash as hashBenchmarkValue };
