import Anthropic from "@anthropic-ai/sdk";
import { loadEnvFile } from "node:process";
import { appendFileSync as appendPrivateTrace } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  HOW_IT_WINS_STRATEGIES,
  failedStrategyEvaluation,
  howItWinsJudgmentSchema,
  type HowItWinsJudgeCallTrace,
  type HowItWinsJudgmentBody
} from "@cold-start/core";
import {
  HOW_IT_WINS_FOUR_BUNDLES,
  createHowItWinsJudge,
  hashHowItWinsJudgeValue,
  howItWinsJudgePromptHash,
  type HowItWinsJudgeAdapter,
  type HowItWinsJudgeCallRequest,
  type HowItWinsJudgeRules
} from "@cold-start/llm";

import {
  benchmarkStageReservationUsd,
  benchmarkTransportHash,
  createBenchmarkModelAdapter
} from "./how-it-wins-topology-benchmark-adapter";
import {
  BENCHMARK_TOPOLOGIES,
  CLOSED_HOW_IT_WINS_CARDS,
  FROZEN_REPEAT_RULE,
  ORDER_PERTURBATION_SLUGS,
  PILOT_SLUGS,
  aggregateBenchmarkRuns,
  buildAdaptiveBenchmarkRunPlan,
  buildBenchmarkRunPlan,
  buildBlindBenchmarkReview,
  buildHowItWinsEvidencePacket,
  createBenchmarkAttemptStore,
  createBenchmarkResultStore,
  hashBenchmarkValue,
  orderBenchmarkRunsForCap,
  parseHowItWinsJudgeRules,
  renderBlindBenchmarkReviewHtml,
  scopesForTopology,
  selectBenchmarkRunPlan,
  verifyClosedBenchmarkCards,
  type HowItWinsJudgeTopology,
  type BenchmarkRunRecord,
  type BenchmarkRunPlanItem
} from "./how-it-wins-topology-benchmark-lib";

const ROOT = process.cwd();
const MANIFEST_PATH = resolve(ROOT, "eval/curation/ledger/how-it-wins-topology-benchmark-manifest.json");
const LEDGER_PATH = resolve(ROOT, "eval/curation/ledger/picks.jsonl");
const NOTES_PATH = resolve(ROOT, "eval/curation/notes/sitting-2-how-it-wins.md");
const STANDARD_PATH = resolve(ROOT, "docs/superpowers/specs/2026-08-21-how-it-wins-judgment-standard.md");
const RUBRIC_PATH = resolve(ROOT, "docs/superpowers/specs/2026-08-21-how-it-wins-strategy-rubric.md");

type Manifest = {
  benchmarkId: string;
  seed: string;
  safeCards: Array<{ slug: string; evidenceHash: string }>;
  promptHash: string;
  vocabularyHash: string;
  transportHash: string;
  topologies: HowItWinsJudgeTopology[];
  fourBundles: Array<{ id: string; groupIds: string[]; strategyCount: number }>;
  pilotSlugs: string[];
  orderPerturbationSlugs: string[];
  repeatRule: typeof FROZEN_REPEAT_RULE;
  routing: { strong: string; scout: string; critic: string };
  costGate: { pilotCapUsd: number; fullBatchRequiresApproval: boolean };
  rawResultRoot: string;
  environmentSource: string;
};

type PrivateRunResult = {
  run: BenchmarkRunPlanItem;
  outcome: "ok" | "failed";
  startedAt: string;
  wallTimeMs: number;
  preCriticJudgment: unknown | null;
  verdict: unknown | null;
  traces: HowItWinsJudgeCallTrace[];
  error: string | null;
};

function parseArgs(argv: string[]) {
  const selectedModes = ["--pilot", "--base", "--full", "--repeats"].filter((flag) => argv.includes(flag));
  if (selectedModes.length > 1) throw new Error("choose only one benchmark mode");
  const mode = argv.includes("--pilot")
    ? "pilot"
    : argv.includes("--repeats")
      ? "repeats"
      : argv.includes("--base") || argv.includes("--full")
        ? "base"
        : "dry-run";
  const capIndex = argv.indexOf("--cap");
  const cap = capIndex >= 0 ? Number(argv[capIndex + 1]) : null;
  if (cap !== null && (!Number.isFinite(cap) || cap <= 0)) throw new Error("--cap must be a positive number");
  const onlyIndex = argv.indexOf("--only");
  const only = onlyIndex >= 0 ? (argv[onlyIndex + 1] ?? "").split(",").filter(Boolean) : [];
  if (onlyIndex >= 0 && only.length === 0) throw new Error("--only needs frozen slug:topology selectors");
  if (only.length > 0 && mode !== "pilot") throw new Error("--only is available for a pilot only");
  return { mode, cap, only } as const;
}

async function loadRules() {
  const [standard, rubric] = await Promise.all([
    readFile(STANDARD_PATH, "utf8"),
    readFile(RUBRIC_PATH, "utf8")
  ]);
  return parseHowItWinsJudgeRules({ standard, rubric });
}

async function loadAndVerifyManifest() {
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, "utf8")) as Manifest;
  const rules = await loadRules();
  const closedCards = await verifyClosedBenchmarkCards({ ledgerPath: LEDGER_PATH, notesPath: NOTES_PATH });
  if (hashHowItWinsJudgeValue(HOW_IT_WINS_STRATEGIES) !== manifest.vocabularyHash) {
    throw new Error("manifest vocabulary hash drifted");
  }
  if (howItWinsJudgePromptHash(rules) !== manifest.promptHash) throw new Error("manifest prompt hash drifted");
  if (benchmarkTransportHash() !== manifest.transportHash) throw new Error("manifest transport hash drifted");
  if (hashBenchmarkValue(manifest.topologies) !== hashBenchmarkValue(BENCHMARK_TOPOLOGIES)) {
    throw new Error("manifest topology list drifted");
  }
  const liveBundles = HOW_IT_WINS_FOUR_BUNDLES.map((bundle) => ({
    id: bundle.id,
    groupIds: [...bundle.groupIds],
    strategyCount: bundle.strategies.length
  }));
  if (hashBenchmarkValue(liveBundles) !== hashBenchmarkValue(manifest.fourBundles)) {
    throw new Error("manifest four-bundle map drifted");
  }
  if (hashBenchmarkValue(manifest.pilotSlugs) !== hashBenchmarkValue(PILOT_SLUGS)) {
    throw new Error("manifest pilot cards drifted");
  }
  if (hashBenchmarkValue(manifest.orderPerturbationSlugs) !== hashBenchmarkValue(ORDER_PERTURBATION_SLUGS)) {
    throw new Error("manifest order-perturbation cards drifted");
  }
  if (hashBenchmarkValue(manifest.repeatRule) !== hashBenchmarkValue(FROZEN_REPEAT_RULE)) {
    throw new Error("manifest repeat rule drifted");
  }
  if (closedCards.length !== manifest.safeCards.length) throw new Error("manifest safe-card count drifted");

  const packets = new Map<string, ReturnType<typeof buildHowItWinsEvidencePacket>>();
  const cards = new Map<string, unknown>();
  for (const [index, card] of closedCards.entries()) {
    const frozen = manifest.safeCards[index];
    if (!frozen || card.slug !== frozen.slug) throw new Error(`manifest safe-card order drifted at ${index}`);
    const exactPath = resolve(ROOT, `eval/curation/corpus/cards/${card.slug}.json`);
    const raw = JSON.parse(await readFile(exactPath, "utf8")) as { card: unknown };
    const packet = buildHowItWinsEvidencePacket(raw.card, { orderSeed: null });
    if (hashBenchmarkValue(packet) !== frozen.evidenceHash) throw new Error(`evidence hash drifted for ${card.slug}`);
    packets.set(card.slug, packet);
    cards.set(card.slug, raw.card);
  }
  return { manifest, rules, packets, cards };
}

function blankJudgment(packet: ReturnType<typeof buildHowItWinsEvidencePacket>): HowItWinsJudgmentBody {
  const firstEvidence = packet.evidence[0]!;
  return {
    evidenceCutoff: packet.cutoff,
    evidenceRegistry: packet.evidence,
    claims: [{
      claimId: "dry-c1",
      type: "observed_fact",
      text: firstEvidence.text,
      evidenceIds: [firstEvidence.evidenceId]
    }],
    materialBets: [{
      betId: "dry-b1",
      statement: "The dry run proves orchestration without making a company judgment.",
      scope: "company",
      supportingEvidenceIds: [firstEvidence.evidenceId],
      scopeReasons: ["This is deterministic fixture data."]
    }],
    strategyEvaluations: HOW_IT_WINS_STRATEGIES.map((strategy) =>
      failedStrategyEvaluation(strategy.id, "The dry run does not make substantive judgments.")
    ),
    currentStrategyIds: [],
    unusualPair: null,
    openQuestions: [],
    overallWrongCondition: { condition: "The deterministic fixture contract changes.", evidenceIds: [] },
    disagreements: [],
    overrides: []
  };
}

function fakeTrace(request: HowItWinsJudgeCallRequest, provider: string): HowItWinsJudgeCallTrace {
  return {
    callId: request.callId,
    stage: request.stage,
    ...(request.groupId ? { groupId: request.groupId } : {}),
    ...(request.bundleId ? { bundleId: request.bundleId } : {}),
    provider,
    model: `${provider}-fixture`,
    inputTokens: 1,
    outputTokens: 1,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
    actualCostUsd: null,
    estimatedCostUsd: 0,
    latencyMs: 0,
    retryCount: request.attempt - 1,
    thinkingState: "disabled",
    outcome: "ok"
  };
}

function fakeAdapters(packet: ReturnType<typeof buildHowItWinsEvidencePacket>) {
  const body = blankJudgment(packet);
  const semanticMaterialBets = body.materialBets.map(({ betId: _betId, ...bet }) => bet);
  const semanticJudgment = (includeMaterialBets: boolean) => ({
    ...(includeMaterialBets ? { materialBets: semanticMaterialBets } : {}),
    strategyEvaluations: body.strategyEvaluations.map((entry) => ({
      strategyId: entry.strategyId,
      disposition: entry.disposition,
      evidenceGate: entry.evidenceGate,
      dispositionReason: entry.dispositionReason
    })),
    currentStrategyIds: [],
    unusualPair: null,
    openQuestions: [],
    overallWrongCondition: body.overallWrongCondition,
    disagreements: [],
    overrides: []
  });
  const strong: HowItWinsJudgeAdapter = async (request) => {
    if (request.stage === "bet_map") {
      return { ok: true, output: { materialBets: semanticMaterialBets }, trace: fakeTrace(request, "fake-strong") };
    }
    if (request.stage === "global_judge") {
      const payload = request.payload as { betMap: unknown };
      return {
        ok: true,
        output: semanticJudgment(payload.betMap === null),
        trace: fakeTrace(request, "fake-strong")
      };
    }
    throw new Error(`unexpected fake strong stage ${request.stage}`);
  };
  const scout: HowItWinsJudgeAdapter = async (request) => {
    const payload = request.payload as { strategies: typeof HOW_IT_WINS_STRATEGIES };
    return {
      ok: true,
      output: {
        scopeId: request.groupId ?? request.bundleId,
        evaluations: payload.strategies.map((strategy) => ({
          strategyId: strategy.id,
          recommendation: "rejected",
          mechanism: null,
          evidenceIds: [],
          siblingCandidateIds: [],
          siblingResolutions: [],
          reason: "The dry run makes no judgment."
        })),
        betChallenges: []
      },
      trace: fakeTrace(request, "fake-scout")
    };
  };
  const critic: HowItWinsJudgeAdapter = async (request) => ({
    ok: true,
    output: { findings: [] },
    trace: fakeTrace(request, "fake-critic")
  });
  return { strong, scout, critic };
}

function judgeInput(packet: ReturnType<typeof buildHowItWinsEvidencePacket>, rules: HowItWinsJudgeRules) {
  return {
    evidencePacket: packet,
    evidencePacketHash: hashHowItWinsJudgeValue(packet),
    vocabulary: HOW_IT_WINS_STRATEGIES,
    vocabularyHash: hashHowItWinsJudgeValue(HOW_IT_WINS_STRATEGIES),
    promptHash: howItWinsJudgePromptHash(rules)
  };
}

async function runDry(input: Awaited<ReturnType<typeof loadAndVerifyManifest>>) {
  let arms = 0;
  let calls = 0;
  for (const run of buildBenchmarkRunPlan({
    phase: "base",
    transportHash: input.manifest.transportHash
  })) {
    const packet = input.packets.get(run.slug)!;
    const verdict = await createHowItWinsJudge({
      adapters: fakeAdapters(packet),
      rules: input.rules,
      scopes: scopesForTopology(run.topology),
      maxScoutConcurrency: run.topology === "thirteen_groups" ? 4 : undefined
    })(judgeInput(packet, input.rules));
    howItWinsJudgmentSchema.parse(verdict);
    if (verdict.calls.length !== run.minimumCallCount) throw new Error(`dry call count failed for ${run.runId}`);
    arms += 1;
    calls += verdict.calls.length;
  }
  const packet = input.packets.get("cognition")!;
  const invalid = judgeInput(packet, input.rules);
  invalid.evidencePacketHash = "0".repeat(64);
  await createHowItWinsJudge({ adapters: fakeAdapters(packet), rules: input.rules })(invalid)
    .then(() => { throw new Error("hash mismatch did not fail closed"); })
    .catch((error) => {
      if (!/failed closed/.test(String(error))) throw error;
    });
  process.stdout.write(JSON.stringify({ mode: "dry-run", arms, calls, providersCalled: 0, status: "passed" }) + "\n");
}

function privateLine(path: string, value: unknown) {
  appendPrivateTrace(path, `${JSON.stringify(value)}\n`, { encoding: "utf8", mode: 0o600 });
}

async function privateTraceIndex(path: string) {
  const rawOutputIds = new Set<string>();
  const rawToolOutputIds = new Set<string>();
  const traceIds = new Set<string>();
  try {
    const lines = (await readFile(path, "utf8")).split("\n").filter(Boolean);
    for (const line of lines) {
      const entry = JSON.parse(line) as { type?: unknown; callId?: unknown; trace?: { callId?: unknown } };
      if (entry.type === "raw_output" && typeof entry.callId === "string") rawOutputIds.add(entry.callId);
      if (entry.type === "raw_tool_output" && typeof entry.callId === "string") rawToolOutputIds.add(entry.callId);
      if (entry.type === "trace" && typeof entry.trace?.callId === "string") traceIds.add(entry.trace.callId);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return { rawOutputIds, rawToolOutputIds, traceIds };
}

async function executePaidRun(input: {
  run: BenchmarkRunPlanItem;
  packet: ReturnType<typeof buildHowItWinsEvidencePacket>;
  rules: HowItWinsJudgeRules;
  manifest: Manifest;
  tracePath: string;
  attemptStore: ReturnType<typeof createBenchmarkAttemptStore>;
}) {
  const traces: HowItWinsJudgeCallTrace[] = [];
  let preCriticJudgment: unknown | null = null;
  const traceIndex = await privateTraceIndex(input.tracePath);
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 0 });
  const outputObserver = (request: HowItWinsJudgeCallRequest, output: unknown) => {
    if (!traceIndex.rawOutputIds.has(request.callId)) {
      privateLine(input.tracePath, { type: "raw_output", callId: request.callId, stage: request.stage, output });
      traceIndex.rawOutputIds.add(request.callId);
    }
    if (request.stage === "global_judge") {
      preCriticJudgment = output;
    }
  };
  const rawOutputObserver = (request: HowItWinsJudgeCallRequest, output: unknown) => {
    if (!traceIndex.rawToolOutputIds.has(request.callId)) {
      privateLine(input.tracePath, { type: "raw_tool_output", callId: request.callId, stage: request.stage, output });
      traceIndex.rawToolOutputIds.add(request.callId);
    }
  };
  const checkpointed = (adapter: HowItWinsJudgeAdapter, model: string): HowItWinsJudgeAdapter => async (request) => {
    const checked = await input.attemptStore.runOnce({
      attemptId: `${input.run.runId}:${request.callId}`,
      identity: {
        run: input.run,
        evidenceHash: hashBenchmarkValue(input.packet),
        promptHash: input.manifest.promptHash,
        vocabularyHash: input.manifest.vocabularyHash,
        transportHash: input.manifest.transportHash,
        topology: input.run.topology,
        model,
        requestHash: hashBenchmarkValue(request)
      },
      maximumCostUsd: benchmarkStageReservationUsd(request.stage)
    }, async () => {
      const result = await adapter(request);
      const costUsd = Number((result.trace.actualCostUsd ?? result.trace.estimatedCostUsd ?? 0).toFixed(6));
      return { costUsd, value: result };
    });
    const result = checked.stored.value;
    if (result.ok) outputObserver(request, result.output);
    return result;
  };
  const strong = checkpointed(
    createBenchmarkModelAdapter({
      client,
      model: input.manifest.routing.strong,
      onRawOutput: rawOutputObserver
    }),
    input.manifest.routing.strong
  );
  const scout = checkpointed(
    createBenchmarkModelAdapter({
      client,
      model: input.manifest.routing.scout,
      onRawOutput: rawOutputObserver
    }),
    input.manifest.routing.scout
  );
  const critic = checkpointed(
    createBenchmarkModelAdapter({
      client,
      model: input.manifest.routing.critic,
      onRawOutput: rawOutputObserver
    }),
    input.manifest.routing.critic
  );
  const startedAt = new Date().toISOString();
  const started = Date.now();
  try {
    const verdict = await createHowItWinsJudge({
      adapters: { strong, scout, critic },
      rules: input.rules,
      scopes: scopesForTopology(input.run.topology),
      maxScoutConcurrency: input.run.topology === "thirteen_groups" ? 4 : undefined,
      telemetry: (trace) => {
        traces.push(trace);
        if (!traceIndex.traceIds.has(trace.callId)) {
          privateLine(input.tracePath, { type: "trace", trace });
          traceIndex.traceIds.add(trace.callId);
        }
      }
    })(judgeInput(input.packet, input.rules));
    return {
      run: input.run,
      outcome: "ok" as const,
      startedAt,
      wallTimeMs: Date.now() - started,
      preCriticJudgment,
      verdict,
      traces,
      error: null
    } satisfies PrivateRunResult;
  } catch (error) {
    if (/approved spend cap/i.test(error instanceof Error ? error.message : String(error))) throw error;
    return {
      run: input.run,
      outcome: "failed" as const,
      startedAt,
      wallTimeMs: Date.now() - started,
      preCriticJudgment,
      verdict: null,
      traces,
      error: error instanceof Error ? error.message : String(error)
    } satisfies PrivateRunResult;
  }
}

function packetForRun(
  input: Awaited<ReturnType<typeof loadAndVerifyManifest>>,
  run: BenchmarkRunPlanItem
) {
  if (run.variant !== "order") return input.packets.get(run.slug)!;
  const card = input.cards.get(run.slug);
  if (!card || !run.orderSeed) throw new Error(`order perturbation input is missing for ${run.runId}`);
  const packet = buildHowItWinsEvidencePacket(card, { orderSeed: run.orderSeed });
  const base = input.packets.get(run.slug)!;
  const sorted = (value: typeof packet.evidence) => [...value].sort((left, right) =>
    left.evidenceId.localeCompare(right.evidenceId)
  );
  if (hashBenchmarkValue(sorted(packet.evidence)) !== hashBenchmarkValue(sorted(base.evidence))) {
    throw new Error(`order perturbation changed evidence content for ${run.runId}`);
  }
  return packet;
}

async function readBenchmarkRunRecords(input: {
  rawRoot: string;
  plan: readonly BenchmarkRunPlanItem[];
}) {
  const records: BenchmarkRunRecord[] = [];
  for (const run of input.plan) {
    const exactPath = resolve(input.rawRoot, "runs", `${run.runId.replaceAll(":", "__")}.json`);
    const stored = JSON.parse(await readFile(exactPath, "utf8")) as {
      costUsd: number;
      value: PrivateRunResult;
    };
    if (hashBenchmarkValue(stored.value.run) !== hashBenchmarkValue(run)) {
      throw new Error(`stored run identity drifted for ${run.runId}`);
    }
    if (stored.value.outcome === "ok") howItWinsJudgmentSchema.parse(stored.value.verdict);
    if (stored.value.outcome === "failed" && stored.value.verdict !== null) {
      throw new Error(`failed run retained a verdict for ${run.runId}`);
    }
    records.push({
      run,
      outcome: stored.value.outcome,
      costUsd: stored.costUsd,
      wallTimeMs: stored.value.wallTimeMs,
      preCriticJudgment: stored.value.preCriticJudgment,
      verdict: stored.value.verdict,
      traces: stored.value.traces,
      error: stored.value.error
    });
  }
  return records;
}

async function writePrivateJson(path: string, value: unknown) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

async function writeBaseAnalysis(input: {
  rawRoot: string;
  records: BenchmarkRunRecord[];
  manifest: Manifest;
}) {
  const adaptive = buildAdaptiveBenchmarkRunPlan({
    baseRecords: input.records,
    seed: input.manifest.seed,
    transportHash: input.manifest.transportHash
  });
  const blind = buildBlindBenchmarkReview({ records: input.records, seed: input.manifest.seed });
  await writePrivateJson(resolve(input.rawRoot, "base-aggregate.json"), aggregateBenchmarkRuns(input.records));
  await writePrivateJson(resolve(input.rawRoot, "repeat-plan.json"), adaptive);
  await writePrivateJson(resolve(input.rawRoot, "blind-base-packet.json"), blind.packet);
  await writePrivateJson(resolve(input.rawRoot, "blind-base-metadata.json"), blind.metadata);
  await writeFile(resolve(input.rawRoot, "blind-base-review.html"), renderBlindBenchmarkReviewHtml(blind.packet), { mode: 0o600 });
  return adaptive;
}

async function runPaidPlan(
  mode: "pilot" | "base" | "repeats",
  cap: number,
  input: Awaited<ReturnType<typeof loadAndVerifyManifest>>,
  requestedPlan: readonly BenchmarkRunPlanItem[]
) {
  const rawRoot = resolve(ROOT, input.manifest.rawResultRoot, input.manifest.benchmarkId);
  const traceRoot = resolve(rawRoot, "traces");
  await mkdir(traceRoot, { recursive: true, mode: 0o700 });
  const runRoot = resolve(rawRoot, "runs");
  const store = createBenchmarkResultStore({ root: runRoot, capUsd: cap });
  const attemptStore = createBenchmarkAttemptStore({ root: runRoot, capUsd: cap });
  const plan = orderBenchmarkRunsForCap(requestedPlan);
  const summaries: Array<{ runId: string; topology: string; outcome: string; costUsd: number; wallTimeMs: number; calls: number }> = [];
  for (const run of plan) {
    const packet = packetForRun(input, run);
    const tracePath = resolve(traceRoot, `${run.runId.replaceAll(":", "__")}.jsonl`);
    let stored = await store.readOnce<PrivateRunResult>(run.runId);
    if (!stored) {
      const value = await executePaidRun({
        run,
        packet,
        rules: input.rules,
        manifest: input.manifest,
        tracePath,
        attemptStore
      });
      const costUsd = Number(value.traces.reduce(
        (sum, trace) => sum + (trace.actualCostUsd ?? trace.estimatedCostUsd ?? 0),
        0
      ).toFixed(6));
      stored = await store.writeOnce(run.runId, { costUsd, value });
    }
    summaries.push({
      runId: run.runId,
      topology: run.topology,
      outcome: stored.value.outcome,
      costUsd: stored.costUsd,
      wallTimeMs: stored.value.wallTimeMs,
      calls: stored.value.traces.length
    });
    process.stdout.write(JSON.stringify(summaries.at(-1)) + "\n");
  }
  const totalCostUsd = Number(summaries.reduce((sum, row) => sum + row.costUsd, 0).toFixed(6));
  const totalWallTimeMs = summaries.reduce((sum, row) => sum + row.wallTimeMs, 0);
  const failedArms = summaries.filter((row) => row.outcome === "failed").length;
  process.stdout.write(JSON.stringify({
    mode,
    status: failedArms === 0 ? "passed" : "completed_with_failures",
    totalCostUsd,
    totalWallTimeMs,
    arms: summaries.length,
    failedArms
  }) + "\n");
  return readBenchmarkRunRecords({ rawRoot, plan: requestedPlan });
}

async function runPaid(
  mode: "pilot" | "base" | "repeats",
  cap: number,
  input: Awaited<ReturnType<typeof loadAndVerifyManifest>>,
  only: readonly string[] = []
) {
  const rawRoot = resolve(ROOT, input.manifest.rawResultRoot, input.manifest.benchmarkId);
  if (mode === "pilot") {
    const pilotPlan = buildBenchmarkRunPlan({
      phase: "pilot",
      transportHash: input.manifest.transportHash
    });
    const records = await runPaidPlan(mode, cap, input, selectBenchmarkRunPlan(pilotPlan, only));
    if (only.length === 0) {
      const blind = buildBlindBenchmarkReview({ records, seed: input.manifest.seed });
      await writePrivateJson(resolve(rawRoot, "pilot-blind-packet.json"), blind.packet);
      await writePrivateJson(resolve(rawRoot, "pilot-blind-metadata.json"), blind.metadata);
      await writeFile(resolve(rawRoot, "pilot-blind-review.html"), renderBlindBenchmarkReviewHtml(blind.packet), { mode: 0o600 });
    }
    return records;
  }
  const basePlan = buildBenchmarkRunPlan({ phase: "base", transportHash: input.manifest.transportHash });
  if (mode === "base") {
    const records = await runPaidPlan(mode, cap, input, basePlan);
    const adaptive = await writeBaseAnalysis({ rawRoot, records, manifest: input.manifest });
    process.stdout.write(JSON.stringify({
      mode: "base-analysis",
      status: "passed",
      divergentCards: adaptive.divergentSlugs.length,
      agreementControls: adaptive.agreementControlSlugs.length,
      agreementControlShortage: adaptive.controlShortage,
      divergenceRepeatArms: adaptive.divergenceRuns.length,
      controlRepeatArms: adaptive.controlRuns.length,
      orderPerturbationArms: adaptive.orderRuns.length
    }) + "\n");
    return records;
  }

  const baseRecords = await readBenchmarkRunRecords({ rawRoot, plan: basePlan });
  const adaptive = buildAdaptiveBenchmarkRunPlan({
    baseRecords,
    seed: input.manifest.seed,
    transportHash: input.manifest.transportHash
  });
  const repeatPlan = [...adaptive.divergenceRuns, ...adaptive.controlRuns, ...adaptive.orderRuns];
  const repeatRecords = await runPaidPlan(mode, cap, input, repeatPlan);
  const allRecords = [...baseRecords, ...repeatRecords];
  const blind = buildBlindBenchmarkReview({ records: allRecords, seed: input.manifest.seed });
  await writePrivateJson(resolve(rawRoot, "aggregate.json"), aggregateBenchmarkRuns(allRecords));
  await writePrivateJson(resolve(rawRoot, "blind-packet.json"), blind.packet);
  await writePrivateJson(resolve(rawRoot, "blind-metadata.json"), blind.metadata);
  await writeFile(resolve(rawRoot, "blind-review.html"), renderBlindBenchmarkReviewHtml(blind.packet), { mode: 0o600 });
  return allRecords;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const input = await loadAndVerifyManifest();
  if (args.mode === "dry-run") return runDry(input);
  const envPath = resolve(ROOT, input.manifest.environmentSource);
  loadEnvFile(envPath);
  if (!process.env.ANTHROPIC_API_KEY || !process.env.DEEPSEEK_API_KEY) {
    throw new Error("benchmark provider keys are missing from the frozen local environment source");
  }
  if (args.cap === null) {
    throw new Error(`${args.mode} execution requires an explicitly approved --cap`);
  }
  await runPaid(args.mode, args.cap, input, args.only);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
