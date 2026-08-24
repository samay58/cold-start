import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  HOW_IT_WINS_STRATEGIES,
  type HowItWinsJudgeCallTrace,
  type HowItWinsJudgment,
  type HowItWinsStrategyId
} from "@cold-start/core";
import type { HowItWinsJudgeCallRequest } from "@cold-start/llm";

import {
  CLOSED_HOW_IT_WINS_CARDS,
  BENCHMARK_TOPOLOGIES,
  ORDER_PERTURBATION_SLUGS,
  aggregateBenchmarkRuns,
  buildAdaptiveBenchmarkRunPlan,
  buildBenchmarkRunPlan,
  buildBlindBenchmarkReview,
  buildDecisionScreenRunPlan,
  buildHowItWinsEvidencePacket,
  classifyMaterialDivergence,
  createBenchmarkAttemptStore,
  createBenchmarkResultStore,
  hashBenchmarkValue,
  orderBenchmarkRunsForCap,
  parseHowItWinsJudgeRules,
  renderBlindBenchmarkReviewHtml,
  selectDecisionScreenSlugs,
  selectBenchmarkRunPlan,
  verifyClosedBenchmarkCards,
  type BenchmarkRunRecord
} from "./how-it-wins-topology-benchmark-lib";
import {
  benchmarkStageReservationUsd,
  benchmarkTimeoutMsForStage,
  benchmarkProviderPayloadForRequest,
  benchmarkToolSchemaForRequest,
  benchmarkTransportHash,
  createBenchmarkModelAdapter,
  normalizeBenchmarkToolOutput
} from "./how-it-wins-topology-benchmark-adapter";

function globalRequest(): HowItWinsJudgeCallRequest {
  return {
    callId: "fixture:global",
    stage: "global_judge",
    attempt: 1,
    prompt: "fixture prompt",
    payload: {
      evidencePacket: { cutoff: "2026-08-22T00:00:00.000Z", evidence: [{ evidenceId: "e1" }] },
      betMap: { materialBets: [{ betRef: 1 }] },
      missingStrategyIds: ["usership"]
    }
  };
}

function stageRequest(
  stage: HowItWinsJudgeCallRequest["stage"],
  options: { multiStage?: boolean } = {}
): HowItWinsJudgeCallRequest {
  return {
    callId: `fixture:${stage}`,
    stage,
    attempt: 1,
    prompt: "fixture prompt",
    payload: {
      evidencePacket: {
        cutoff: "2026-08-22T00:00:00.000Z",
        evidence: [{ evidenceId: "e1" }, { evidenceId: "e2" }]
      },
      ...(stage === "global_judge"
        ? { betMap: options.multiStage ? { materialBets: [{ betRef: 1 }] } : null }
        : {})
    }
  };
}

function evidenceIdArrays(schema: unknown): Array<Record<string, unknown>> {
  const found: Array<Record<string, unknown>> = [];
  const visit = (value: unknown, key = "") => {
    if (!value || typeof value !== "object") return;
    const object = value as Record<string, unknown>;
    if (/evidenceids$/i.test(key)) found.push(object);
    for (const [childKey, child] of Object.entries(object)) visit(child, childKey);
  };
  visit(schema);
  return found;
}

test("the safe-card verifier accepts only the ten closed records", async () => {
  const root = await mkdtemp(join(tmpdir(), "cold-start-topology-safe-"));
  const ledger = join(root, "picks.jsonl");
  const notes = join(root, "notes.md");
  await writeFile(
    ledger,
    CLOSED_HOW_IT_WINS_CARDS.map(() => JSON.stringify({ kind: "how-it-wins" })).join("\n") + "\n"
  );
  await writeFile(
    notes,
    [
      "# Sitting 2 notes, enriched: the How it wins blind read (closed 2026-08-21, 10 of 10)",
      ...CLOSED_HOW_IT_WINS_CARDS.map((card, index) => `## Card ${index + 1}: ${card.name}. Pick A.`)
    ].join("\n")
  );

  const verified = await verifyClosedBenchmarkCards({ ledgerPath: ledger, notesPath: notes });
  assert.deepEqual(verified.map((card) => card.slug), CLOSED_HOW_IT_WINS_CARDS.map((card) => card.slug));

  await assert.rejects(
    verifyClosedBenchmarkCards({ ledgerPath: ledger, notesPath: notes, requestedSlugs: ["not-closed"] }),
    /not in the closed benchmark allowlist/
  );
});

test("the rubric parser proves all 80 canonical rows and exact meanings", async () => {
  const standard = await readFile("docs/superpowers/specs/2026-08-21-how-it-wins-judgment-standard.md", "utf8");
  const rubric = await readFile("docs/superpowers/specs/2026-08-21-how-it-wins-strategy-rubric.md", "utf8");
  const parsed = parseHowItWinsJudgeRules({ standard, rubric });
  assert.equal(parsed.strategyRubric.length, 80);
  assert.deepEqual(
    parsed.strategyRubric.map((row) => row.strategyId),
    HOW_IT_WINS_STRATEGIES.map((strategy) => strategy.id)
  );
});

test("evidence-order perturbation changes order but not evidence content", async () => {
  const card = JSON.parse(
    await readFile("packages/llm/tests/fixtures/how-it-wins-irregular.json", "utf8")
  ) as unknown;
  const base = buildHowItWinsEvidencePacket(card, { orderSeed: null });
  const shuffled = buildHowItWinsEvidencePacket(card, { orderSeed: "order-test" });
  assert.notDeepEqual(base.evidence.map((entry) => entry.evidenceId), shuffled.evidence.map((entry) => entry.evidenceId));
  assert.deepEqual(
    [...base.evidence].sort((a, b) => a.evidenceId.localeCompare(b.evidenceId)),
    [...shuffled.evidence].sort((a, b) => a.evidenceId.localeCompare(b.evidenceId))
  );
  const sortedHashes = (values: unknown[]) => values.map(hashBenchmarkValue).sort();
  assert.deepEqual(sortedHashes(base.context.signals), sortedHashes(shuffled.context.signals));
  assert.deepEqual(sortedHashes(base.context.comparables), sortedHashes(shuffled.context.comparables));
});

test("the frozen base plan has exact topology call counts and no unsafe cards", () => {
  const transportHash = benchmarkTransportHash();
  const plan = buildBenchmarkRunPlan({ phase: "pilot", transportHash });
  assert.deepEqual([...new Set(plan.map((run) => run.slug))].sort(), ["bland", "cognition"]);
  assert.deepEqual(
    Object.fromEntries(plan.map((run) => [run.topology, run.minimumCallCount])),
    { monolith: 2, four_bundles: 7, thirteen_groups: 16 }
  );
  assert.ok(plan.every((run) => run.runId.endsWith(transportHash.slice(0, 12))));
});

test("a transport change gets a new resume identity", () => {
  const first = buildBenchmarkRunPlan({ phase: "pilot", transportHash: "a".repeat(64) });
  const second = buildBenchmarkRunPlan({ phase: "pilot", transportHash: "b".repeat(64) });
  assert.notEqual(first[0]?.runId, second[0]?.runId);
});

test("a paid pilot can select only predeclared frozen arms", () => {
  const plan = buildBenchmarkRunPlan({ phase: "pilot", transportHash: "a".repeat(64) });
  const selected = selectBenchmarkRunPlan(plan, [
    "cognition:four_bundles",
    "bland:four_bundles",
    "bland:thirteen_groups"
  ]);
  assert.deepEqual(selected.map((run) => `${run.slug}:${run.topology}`), [
    "cognition:four_bundles",
    "bland:four_bundles",
    "bland:thirteen_groups"
  ]);
  assert.throws(
    () => selectBenchmarkRunPlan(plan, ["unjudged:monolith"]),
    /outside the frozen plan/
  );
  assert.throws(
    () => selectBenchmarkRunPlan(plan, ["cognition:four_bundles", "cognition:four_bundles"]),
    /unique/
  );
});

test("one JSON string envelope is normalized at the top level", () => {
  const topLevel = normalizeBenchmarkToolOutput(
    globalRequest(),
    JSON.stringify({ strategyEvaluations: [] })
  ) as { strategyEvaluations: unknown };
  assert.equal(typeof topLevel, "object");
  assert.deepEqual(topLevel.strategyEvaluations, []);
});

test("one JSON string layer around the complete bet array is normalized", () => {
  const request = stageRequest("bet_map");
  const normalized = normalizeBenchmarkToolOutput(request, {
    materialBets: JSON.stringify([{
      statement: "A material bet",
      scope: "company",
      supportingEvidenceIds: ["ev_001"],
      scopeReasons: []
    }])
  }) as { materialBets: Array<{ supportingEvidenceIds: string[] }> };
  assert.equal(Array.isArray(normalized.materialBets), true);
  assert.deepEqual(normalized.materialBets[0]?.supportingEvidenceIds, ["e1"]);
});

test("the exact provider parameter prefix around a bet array is normalized", () => {
  const request = stageRequest("bet_map");
  const bets = [{
    statement: "A material bet",
    scope: "company",
    supportingEvidenceIds: ["ev_001"],
    scopeReasons: []
  }];
  const normalized = normalizeBenchmarkToolOutput(request, {
    materialBets: `<parameter name="materialBets">${JSON.stringify(bets)}`
  }) as { materialBets: Array<{ supportingEvidenceIds: string[] }> };
  assert.deepEqual(normalized.materialBets[0]?.supportingEvidenceIds, ["e1"]);
  const withLeadingWhitespace = normalizeBenchmarkToolOutput(request, {
    materialBets: `\n<parameter name="materialBets">${JSON.stringify(bets)}`
  }) as { materialBets: Array<{ supportingEvidenceIds: string[] }> };
  assert.deepEqual(withLeadingWhitespace.materialBets[0]?.supportingEvidenceIds, ["e1"]);
  assert.throws(
    () => normalizeBenchmarkToolOutput(request, {
      materialBets: `<parameter name="other">${JSON.stringify(bets)}`
    }),
    /JSON array/i
  );
});

test("a bare semantic bet array is normalized without inventing identifiers", () => {
  const request = stageRequest("bet_map");
  const normalized = normalizeBenchmarkToolOutput(request, [{
    statement: "A material bet",
    scope: "company",
    supportingEvidenceIds: ["ev_001"],
    scopeReasons: ["One company scope applies."]
  }]) as { materialBets: Array<Record<string, unknown>> };
  assert.deepEqual(normalized.materialBets[0]?.supportingEvidenceIds, ["e1"]);
  assert.equal(Object.hasOwn(normalized.materialBets[0]!, "betId"), false);
});

test("unambiguous object wrappers around the bet array are normalized", () => {
  const request = stageRequest("bet_map");
  const bet = {
    statement: "A material bet",
    scope: "company",
    supportingEvidenceIds: ["ev_001"],
    scopeReasons: []
  };
  const nestedField = normalizeBenchmarkToolOutput(request, {
    materialBets: { value: [bet] }
  }) as { materialBets: Array<{ supportingEvidenceIds: string[] }> };
  assert.deepEqual(nestedField.materialBets[0]?.supportingEvidenceIds, ["e1"]);

  const nestedEnvelope = normalizeBenchmarkToolOutput(request, {
    result: { materialBets: [bet] }
  }) as { materialBets: Array<{ supportingEvidenceIds: string[] }> };
  assert.deepEqual(nestedEnvelope.materialBets[0]?.supportingEvidenceIds, ["e1"]);
});

test("invalid or repeated JSON string layers around the bet array fail closed", () => {
  const request = stageRequest("bet_map");
  assert.throws(
    () => normalizeBenchmarkToolOutput(request, { materialBets: "not json" }),
    /JSON array/i
  );
  assert.throws(
    () => normalizeBenchmarkToolOutput(request, {
      materialBets: JSON.stringify(JSON.stringify([{ statement: "A material bet" }]))
    }),
    /one JSON string layer/i
  );
  assert.throws(
    () => normalizeBenchmarkToolOutput(request, { materialBets: JSON.stringify({ statement: "A material bet" }) }),
    /JSON array/i
  );
});

test("invalid or repeated JSON string envelopes fail closed", () => {
  const request = globalRequest();
  assert.throws(() => normalizeBenchmarkToolOutput(request, "not json"), /JSON object/i);
  assert.throws(() => normalizeBenchmarkToolOutput(request, "{\"strategyEvaluations\":"), /JSON object/i);
  assert.throws(
    () => normalizeBenchmarkToolOutput(request, JSON.stringify(JSON.stringify({ strategyEvaluations: [] }))),
    /one JSON string layer/i
  );
  assert.throws(() => normalizeBenchmarkToolOutput(request, { wrong: true }), /strategyEvaluations/i);
});

test("normalization does not manufacture missing semantic judgment fields", () => {
  const normalized = normalizeBenchmarkToolOutput(globalRequest(), {
    strategyEvaluations: []
  }) as Record<string, unknown>;
  assert.equal(Object.hasOwn(normalized, "currentStrategyIds"), false);
  assert.equal(Object.hasOwn(normalized, "overrides"), false);
  assert.equal(Object.hasOwn(normalized, "overallWrongCondition"), false);
});

test("global judgment stays on the flat provider fields", () => {
  const schema = benchmarkToolSchemaForRequest(stageRequest("global_judge")) as {
    properties: Record<string, unknown>;
  };
  assert.equal(Object.hasOwn(schema.properties, "judgment"), false);
  assert.ok(Object.hasOwn(schema.properties, "strategyEvaluations"));

  const normalized = normalizeBenchmarkToolOutput(globalRequest(), {
    strategyEvaluations: [],
    currentStrategyIds: []
  }) as { strategyEvaluations: unknown; currentStrategyIds: unknown };
  assert.deepEqual(normalized.strategyEvaluations, []);
  assert.deepEqual(normalized.currentStrategyIds, []);
});

test("flat judgment fields normalize before evidence handles are resolved", () => {
  const strategyEvaluations = [{
    strategyId: "usership",
    supportingClaims: [{ type: "observed_fact", text: "Observed", evidenceIds: ["ev_001"] }]
  }];
  const normalized = normalizeBenchmarkToolOutput(globalRequest(), {
    strategyEvaluations: `<parameter name="strategyEvaluations">${JSON.stringify(strategyEvaluations)}`,
    currentStrategyIds: "[]"
  }) as {
    strategyEvaluations: Array<{ supportingClaims: Array<{ evidenceIds: string[] }> }>;
  };
  assert.deepEqual(normalized.strategyEvaluations[0]?.supportingClaims[0]?.evidenceIds, ["e1"]);
});

test("structured transport normalization applies recursively instead of per field", () => {
  const normalized = normalizeBenchmarkToolOutput(globalRequest(), {
    strategyEvaluations: [{
      strategyId: "usership",
      supportingClaims: `\n<parameter name="supportingClaims">${JSON.stringify([{
        type: "observed_fact",
        text: "Observed",
        evidenceIds: ["ev_001"]
      }])}`,
      siblingResolutions: "[]",
      notYet: JSON.stringify({
        precursorEvidenceIds: ["ev_001"],
        causalPath: "A causal path",
        missingCondition: "A missing condition",
        promotionEvidence: "Promotion evidence",
        horizonMonths: 12
      })
    }],
    currentStrategyIds: []
  }) as {
    strategyEvaluations: Array<{
      supportingClaims: Array<{ evidenceIds: string[] }>;
      siblingResolutions: unknown[];
      notYet: { precursorEvidenceIds: string[] };
    }>;
  };
  const strategy = normalized.strategyEvaluations[0]!;
  assert.deepEqual(strategy.supportingClaims[0]?.evidenceIds, ["e1"]);
  assert.deepEqual(strategy.siblingResolutions, []);
  assert.deepEqual(strategy.notYet.precursorEvidenceIds, ["e1"]);
});

test("transport normalization never rewrites semantic strings", () => {
  const semanticText = '<parameter name="dispositionReason">This is evidence, not a wrapper.';
  const normalized = normalizeBenchmarkToolOutput(globalRequest(), {
    strategyEvaluations: [{
      strategyId: "usership",
      dispositionReason: semanticText
    }],
    currentStrategyIds: []
  }) as { strategyEvaluations: Array<{ dispositionReason: string }> };
  assert.equal(normalized.strategyEvaluations[0]?.dispositionReason, semanticText);
});

test("paid runs use the largest cost reservation first", () => {
  const plan = buildBenchmarkRunPlan({ phase: "pilot", transportHash: "a".repeat(64) });
  assert.deepEqual(
    orderBenchmarkRunsForCap(plan).map((run) => run.topology),
    ["thirteen_groups", "thirteen_groups", "four_bundles", "four_bundles", "monolith", "monolith"]
  );
});

test("completed arms resume from the result file without another write", async () => {
  const root = await mkdtemp(join(tmpdir(), "cold-start-topology-store-"));
  const store = createBenchmarkResultStore({ root, capUsd: 1 });
  const first = await store.writeOnce("arm-1", { costUsd: 0.4, value: "first" });
  const second = await store.writeOnce("arm-1", { costUsd: 0.4, value: "second" });
  assert.deepEqual(second, first);
  assert.deepEqual(await store.readOnce("arm-1"), first);
});

test("attempt spend is durable before another attempt and resume does not repay", async () => {
  const root = await mkdtemp(join(tmpdir(), "cold-start-topology-attempt-"));
  await writeFile(join(root, "spend.json"), `${JSON.stringify({ costUsd: 11.852458 }, null, 2)}\n`);
  const identity = {
    evidenceHash: "a".repeat(64),
    promptHash: "b".repeat(64),
    vocabularyHash: "c".repeat(64),
    transportHash: "d".repeat(64),
    topology: "monolith",
    requestHash: "e".repeat(64)
  };
  let paidCalls = 0;
  const firstStore = createBenchmarkAttemptStore({ root, capUsd: 13 });
  const first = await firstStore.runOnce({
    attemptId: "run-1:global:1",
    identity,
    maximumCostUsd: 0.2
  }, async () => {
    paidCalls += 1;
    return { costUsd: 0.1, value: "first" };
  });
  assert.equal(first.reused, false);
  assert.equal(JSON.parse(await readFile(join(root, "spend.json"), "utf8")).costUsd, 11.952458);

  await firstStore.runOnce({
    attemptId: "run-1:critic:1",
    identity: { ...identity, requestHash: "f".repeat(64) },
    maximumCostUsd: 0.2
  }, async () => {
    assert.equal(JSON.parse(await readFile(join(root, "spend.json"), "utf8")).costUsd, 11.952458);
    return { costUsd: 0.05, value: "second" };
  });

  const resumedStore = createBenchmarkAttemptStore({ root, capUsd: 13 });
  const resumed = await resumedStore.runOnce({
    attemptId: "run-1:global:1",
    identity,
    maximumCostUsd: 0.2
  }, async () => {
    paidCalls += 1;
    return { costUsd: 0.1, value: "repaid" };
  });
  assert.equal(resumed.reused, true);
  assert.equal(resumed.stored.value, "first");
  assert.equal(paidCalls, 1);
  assert.equal(JSON.parse(await readFile(join(root, "spend.json"), "utf8")).costUsd, 12.002458);
});

test("attempt identity drift and absolute cumulative cap fail before a call", async () => {
  const root = await mkdtemp(join(tmpdir(), "cold-start-topology-attempt-guard-"));
  await writeFile(join(root, "spend.json"), `${JSON.stringify({ costUsd: 11.852458 }, null, 2)}\n`);
  const store = createBenchmarkAttemptStore({ root, capUsd: 12 });
  const identity = { requestHash: "a".repeat(64) };
  await store.runOnce({ attemptId: "run-1:bet:1", identity, maximumCostUsd: 0.1 }, async () => ({
    costUsd: 0.05,
    value: "saved"
  }));
  await assert.rejects(
    store.runOnce({
      attemptId: "run-1:bet:1",
      identity: { requestHash: "b".repeat(64) },
      maximumCostUsd: 0.1
    }, async () => ({ costUsd: 0, value: "wrong" })),
    /identity hash/i
  );

  let called = false;
  await assert.rejects(
    store.runOnce({
      attemptId: "run-1:global:1",
      identity: { requestHash: "c".repeat(64) },
      maximumCostUsd: 0.1
    }, async () => {
      called = true;
      return { costUsd: 0, value: "over" };
    }),
    /approved spend cap/i
  );
  assert.equal(called, false);
});

test("an over-reservation result still records known spend before failing closed", async () => {
  const root = await mkdtemp(join(tmpdir(), "cold-start-topology-attempt-overrun-"));
  await writeFile(join(root, "spend.json"), `${JSON.stringify({ costUsd: 11.852458 }, null, 2)}\n`);
  const store = createBenchmarkAttemptStore({ root, capUsd: 13 });
  await assert.rejects(
    store.runOnce({
      attemptId: "run-1:global:1",
      identity: { requestHash: "a".repeat(64) },
      maximumCostUsd: 0.1
    }, async () => ({ costUsd: 0.15, value: "paid" })),
    /reserved maximum/i
  );
  assert.equal(JSON.parse(await readFile(join(root, "spend.json"), "utf8")).costUsd, 12.002458);
});

test("the benchmark deadline aborts a provider call without sleeping", async () => {
  let fireTimeout: (() => void) | null = null;
  const client = {
    messages: {
      stream: (_params: unknown, options: { signal: AbortSignal }) => ({
        finalMessage: () => new Promise((_, reject) => {
          options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true });
        })
      })
    }
  };
  const adapter = createBenchmarkModelAdapter({
    client: client as never,
    model: "claude-opus-5",
    timers: {
      setTimeout: (callback) => {
        fireTimeout = callback;
        return 1;
      },
      clearTimeout: () => undefined
    },
    timeoutMsForStage: () => 123
  });
  const pending = adapter(globalRequest());
  assert.ok(fireTimeout);
  fireTimeout();
  const result = await pending;
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.retryable, true);
    assert.match(result.trace.error ?? "", /timed out|timeout/i);
  }
  assert.equal(benchmarkTimeoutMsForStage("global_judge"), 360_000);
  assert.ok(benchmarkStageReservationUsd("global_judge") > 0);
});

test("the paid global tool schema fixes all 80 rows and canonical enum words", () => {
  const schema = benchmarkToolSchemaForRequest(stageRequest("global_judge")) as {
    properties: {
      strategyEvaluations: {
        minItems: number;
        maxItems: number;
        items: { anyOf: Array<{ properties: Record<string, { enum?: readonly string[]; const?: string; minItems?: number; type?: string }> }> };
      };
    };
  };
  const evaluations = schema.properties.strategyEvaluations;
  assert.equal(evaluations.minItems, 80);
  assert.equal(evaluations.maxItems, 80);
  assert.equal(evaluations.items.anyOf[0]?.properties.evidenceGate?.const, "fail");
  assert.deepEqual(evaluations.items.anyOf[1]?.properties.evidenceGate?.enum, ["pass", "unresolved"]);
  assert.deepEqual(evaluations.items.anyOf[1]?.properties.presentRelevance?.enum, [
    "current",
    "historical_only",
    "unresolved",
    "not_reached"
  ]);
  assert.equal(evaluations.items.anyOf[1]?.properties.mechanism?.type, "string");
  assert.equal(evaluations.items.anyOf[1]?.properties.evidenceIds?.minItems, 1);
});

test("model-facing verdicts contain semantic references but no durable bookkeeping ids", () => {
  const schema = benchmarkToolSchemaForRequest(stageRequest("global_judge")) as {
    properties: {
      claims?: unknown;
      materialBets: { items: { properties: Record<string, unknown> } };
      openQuestions: { items: { properties: Record<string, unknown> } };
      disagreements: { items: { properties: Record<string, unknown> } };
      strategyEvaluations: {
        items: { anyOf: Array<{ properties: Record<string, unknown> }> };
      };
    };
  };
  const judgment = schema.properties;
  const fullStrategy = judgment.strategyEvaluations.items.anyOf[1]!.properties;
  assert.equal(Object.hasOwn(judgment, "claims"), false);
  assert.equal(Object.hasOwn(judgment.materialBets.items.properties, "betId"), false);
  assert.equal(Object.hasOwn(judgment.openQuestions.items.properties, "questionId"), false);
  assert.equal(Object.hasOwn(judgment.disagreements.items.properties, "disagreementId"), false);
  assert.equal(Object.hasOwn(fullStrategy, "betIds"), false);
  assert.equal(Object.hasOwn(fullStrategy, "claimIds"), false);
  assert.ok(Object.hasOwn(fullStrategy, "betRefs"));
  assert.ok(Object.hasOwn(fullStrategy, "supportingClaims"));
});

test("multi-stage bet references are limited to bets code already owns", () => {
  const request = stageRequest("global_judge", { multiStage: true });
  request.payload = {
    ...request.payload,
    betMap: { materialBets: [{ betRef: 1 }, { betRef: 2 }] }
  };
  const schema = benchmarkToolSchemaForRequest(request) as {
    properties: {
      strategyEvaluations: {
        items: { anyOf: Array<{ properties: { betRefs?: { items?: { enum?: number[] } } } }> };
      };
    };
  };
  const full = schema.properties.strategyEvaluations.items.anyOf.find((option) => option.properties.betRefs);
  assert.deepEqual(full?.properties.betRefs?.items?.enum, [1, 2]);
  assert.throws(
    () => normalizeBenchmarkToolOutput(request, {
      strategyEvaluations: [{ strategyId: "usership", betRefs: [3] }]
    }),
    /unknown local bet reference 3/i
  );
});

test("every stage schema restricts every evidence reference to the request registry", () => {
  const requests = [
    stageRequest("bet_map"),
    stageRequest("group_scout"),
    stageRequest("global_judge"),
    stageRequest("global_judge", { multiStage: true }),
    stageRequest("critic"),
    stageRequest("adjudication")
  ];
  for (const request of requests) {
    const references = evidenceIdArrays(benchmarkToolSchemaForRequest(request));
    assert.ok(references.length > 0, `${request.stage} should expose evidence references`);
    for (const reference of references) {
      const items = reference.items as { enum?: string[] } | undefined;
      assert.deepEqual(items?.enum, ["ev_001", "ev_002"]);
      assert.equal(items?.enum?.includes("unknown"), false);
      assert.equal(items?.enum?.includes("e1"), false);
    }
  }
});

test("provider payloads replace frozen evidence IDs with deterministic short handles", () => {
  const request = stageRequest("global_judge", { multiStage: true });
  request.payload = {
    ...request.payload,
    betMap: {
      materialBets: [{
        betRef: 1,
        statement: "A material bet",
        scope: "company",
        supportingEvidenceIds: ["e2"],
        scopeReasons: []
      }]
    }
  };
  const payload = benchmarkProviderPayloadForRequest(request) as {
    evidencePacket: { evidence: Array<{ evidenceId: string }> };
    betMap: { materialBets: Array<{ supportingEvidenceIds: string[] }> };
  };
  assert.deepEqual(payload.evidencePacket.evidence.map((item) => item.evidenceId), ["ev_001", "ev_002"]);
  assert.deepEqual(payload.betMap.materialBets[0]?.supportingEvidenceIds, ["ev_002"]);
  assert.deepEqual(
    (request.payload as { evidencePacket: { evidence: Array<{ evidenceId: string }> } }).evidencePacket.evidence
      .map((item) => item.evidenceId),
    ["e1", "e2"]
  );
});

test("the model adapter sends evidence handles and restores frozen IDs", async () => {
  let sent: Record<string, unknown> | null = null;
  const client = {
    messages: {
      stream: (params: Record<string, unknown>) => {
        sent = params;
        return {
          finalMessage: async () => ({
            usage: {
              input_tokens: 10,
              output_tokens: 10,
              cache_creation_input_tokens: 0,
              cache_read_input_tokens: 0
            },
            content: [{
              type: "tool_use",
              name: "emit_how_it_wins_judgment",
              input: {
                materialBets: [{
                  statement: "A material bet",
                  scope: "company",
                  supportingEvidenceIds: ["ev_002"],
                  scopeReasons: []
                }]
              }
            }]
          })
        };
      }
    }
  };
  const adapter = createBenchmarkModelAdapter({ client: client as never, model: "claude-opus-5" });
  const result = await adapter(stageRequest("bet_map"));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const output = result.output as { materialBets: Array<{ supportingEvidenceIds: string[] }> };
  assert.deepEqual(output.materialBets[0]?.supportingEvidenceIds, ["e2"]);

  const messages = sent?.messages as Array<{ content: string }>;
  const providerPayload = JSON.parse(messages[0]!.content) as {
    evidencePacket: { evidence: Array<{ evidenceId: string }> };
  };
  assert.deepEqual(providerPayload.evidencePacket.evidence.map((item) => item.evidenceId), ["ev_001", "ev_002"]);
});

test("the model adapter preserves rejected raw tool output before normalization", async () => {
  let observed: unknown = null;
  const raw = { materialBets: { left: [], right: [] } };
  const client = {
    messages: {
      stream: () => ({
        finalMessage: async () => ({
          usage: {
            input_tokens: 10,
            output_tokens: 10,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0
          },
          content: [{
            type: "tool_use",
            name: "emit_how_it_wins_judgment",
            input: raw
          }]
        })
      })
    }
  };
  const adapter = createBenchmarkModelAdapter({
    client: client as never,
    model: "claude-opus-5",
    onRawOutput: (_request, output) => { observed = output; }
  });
  const result = await adapter(stageRequest("bet_map"));
  assert.equal(result.ok, false);
  assert.deepEqual(observed, raw);
  if (!result.ok) {
    assert.equal(result.retryable, true);
    assert.match(result.repairInstruction ?? "", /previous structured output failed validation/i);
  }
});

test("provider evidence handles map back exactly and unknown handles fail closed", () => {
  const request = stageRequest("global_judge");
  const normalized = normalizeBenchmarkToolOutput(request, {
    strategyEvaluations: [{
      strategyId: "usership",
      supportingClaims: [{ type: "observed_fact", text: "Observed", evidenceIds: ["ev_002"] }]
    }]
  }) as { strategyEvaluations: Array<{ supportingClaims: Array<{ evidenceIds: string[] }> }> };
  assert.deepEqual(normalized.strategyEvaluations[0]?.supportingClaims[0]?.evidenceIds, ["e2"]);

  assert.throws(
    () => normalizeBenchmarkToolOutput(request, {
      strategyEvaluations: [{
        strategyId: "usership",
        supportingClaims: [{ type: "observed_fact", text: "Observed", evidenceIds: ["c10"] }]
      }]
    }),
    /unknown evidence handle/i
  );
});

test("multi-stage global output omits frozen bets and offers an explicit revision", () => {
  const multi = benchmarkToolSchemaForRequest(stageRequest("global_judge", { multiStage: true })) as {
    properties: {
      materialBets?: unknown;
      betRevision?: { properties: Record<string, unknown> };
    };
  };
  assert.equal(Object.hasOwn(multi.properties, "materialBets"), false);
  assert.ok(multi.properties.betRevision);

  const monolith = benchmarkToolSchemaForRequest(stageRequest("global_judge")) as {
    properties: {
      materialBets?: unknown;
      betRevision?: unknown;
    };
  };
  assert.equal(Object.hasOwn(monolith.properties, "materialBets"), true);
  assert.equal(Object.hasOwn(monolith.properties, "betRevision"), false);
});

test("request-scoped evidence arrays keep their judgment-level cardinality", () => {
  const schema = benchmarkToolSchemaForRequest(stageRequest("global_judge")) as {
    properties: {
      strategyEvaluations: {
        items: { anyOf: Array<{ properties: Record<string, { minItems?: number }> }> };
      };
      overallWrongCondition: { properties: { evidenceIds: { minItems?: number } } };
    };
  };
  const full = schema.properties.strategyEvaluations.items.anyOf[1]!;
  assert.equal(full.properties.evidenceIds?.minItems, 1);
  assert.equal(full.properties.counterevidenceIds?.minItems, undefined);
  assert.equal(schema.properties.overallWrongCondition.properties.evidenceIds.minItems, undefined);
});

const fixtureHash = "a".repeat(64);

function failedEvaluation(strategyId: HowItWinsStrategyId) {
  return {
    strategyId,
    disposition: "insufficient_evidence" as const,
    betIds: [],
    mechanism: null,
    evidenceGate: "fail" as const,
    evidenceIds: [],
    claimIds: [],
    counterevidenceIds: [],
    dimensions: {
      evidenceStrength: "insufficient" as const,
      centrality: "not_reached" as const,
      materiality: "not_reached" as const,
      distinctiveness: "not_reached" as const,
      independence: "not_reached" as const,
      explanatoryValue: "not_reached" as const
    },
    presentRelevance: "not_reached" as const,
    historicalEvidenceIds: [],
    presentEvidenceIds: [],
    presentBridge: null,
    siblingCandidateIds: [],
    siblingResolutions: [],
    notYet: null,
    dispositionReason: "The fixture has insufficient evidence."
  };
}

function currentEvaluation(strategyId: HowItWinsStrategyId) {
  return {
    ...failedEvaluation(strategyId),
    disposition: "current" as const,
    betIds: ["b1"],
    mechanism: "The fixture mechanism affects buyer choice.",
    evidenceGate: "pass" as const,
    evidenceIds: ["e1"],
    claimIds: ["c1"],
    dimensions: {
      evidenceStrength: "direct" as const,
      centrality: "central" as const,
      materiality: "material" as const,
      distinctiveness: "company_specific" as const,
      independence: "independent" as const,
      explanatoryValue: "necessary" as const
    },
    presentRelevance: "current" as const,
    presentEvidenceIds: ["e1"],
    dispositionReason: "The fixture mechanism is current."
  };
}

function fixtureVerdict(currentIds: HowItWinsStrategyId[] = ["usership", "aggregation"]): HowItWinsJudgment {
  const current = new Set(currentIds);
  return {
    version: 1,
    hashes: { evidencePacket: fixtureHash, prompt: "b".repeat(64), vocabulary: "c".repeat(64) },
    evidenceCutoff: "2026-08-23T00:00:00.000Z",
    evidenceRegistry: [{
      evidenceId: "e1",
      text: "A fixture source supports the mechanism.",
      source: "Fixture source",
      sourceDate: "2026-08-22",
      attribution: "independent",
      scope: "company"
    }],
    claims: [{
      claimId: "c1",
      type: "observed_fact",
      text: "A fixture source supports the mechanism.",
      evidenceIds: ["e1"]
    }],
    materialBets: [{
      betId: "b1",
      statement: "The company is betting on the fixture mechanism.",
      scope: "company",
      supportingEvidenceIds: ["e1"],
      scopeReasons: ["One buyer and operating model apply."]
    }],
    strategyEvaluations: HOW_IT_WINS_STRATEGIES.map((strategy) =>
      current.has(strategy.id) ? currentEvaluation(strategy.id) : failedEvaluation(strategy.id)
    ),
    currentStrategyIds: currentIds,
    unusualPair: null,
    openQuestions: [],
    overallWrongCondition: { condition: "The mechanism stops affecting buyer choice.", evidenceIds: ["e1"] },
    disagreements: [],
    overrides: [],
    calls: [{
      callId: "fixture-global",
      stage: "global_judge",
      provider: "fixture",
      model: "fixture-model",
      inputTokens: 10,
      outputTokens: 20,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
      actualCostUsd: null,
      estimatedCostUsd: 0.1,
      latencyMs: 100,
      retryCount: 0,
      thinkingState: "disabled",
      outcome: "ok"
    }]
  };
}

function benchmarkRecord(
  topology: (typeof BENCHMARK_TOPOLOGIES)[number],
  verdict: HowItWinsJudgment | null = fixtureVerdict(),
  options: { slug?: (typeof CLOSED_HOW_IT_WINS_CARDS)[number]["slug"]; costUsd?: number } = {}
): BenchmarkRunRecord {
  const slug = options.slug ?? "suki";
  return {
    run: {
      runId: `${slug}:base:0:${topology}:${fixtureHash.slice(0, 12)}`,
      slug,
      topology,
      repeat: 0,
      variant: "base",
      minimumCallCount: 1
    },
    outcome: verdict ? "ok" : "failed",
    costUsd: options.costUsd ?? 0.1,
    wallTimeMs: 100,
    preCriticJudgment: verdict,
    verdict,
    traces: verdict?.calls ?? [],
    error: verdict ? null : "fixture failed closed"
  };
}

function recordsForCard(
  slug: (typeof CLOSED_HOW_IT_WINS_CARDS)[number]["slug"],
  verdicts: Partial<Record<(typeof BENCHMARK_TOPOLOGIES)[number], HowItWinsJudgment | null>> = {}
) {
  return BENCHMARK_TOPOLOGIES.map((topology) =>
    benchmarkRecord(topology, Object.hasOwn(verdicts, topology) ? verdicts[topology]! : fixtureVerdict(), { slug })
  );
}

test("the full base plan contains exactly ten cards by three topologies", () => {
  const plan = buildBenchmarkRunPlan({ phase: "base", transportHash: fixtureHash });
  assert.equal(plan.length, 30);
  assert.equal(new Set(plan.map((run) => run.slug)).size, 10);
  assert.deepEqual(new Set(plan.map((run) => run.topology)), new Set(BENCHMARK_TOPOLOGIES));
});

test("the seeded decision screen freezes three non-pilot cards across all topologies", () => {
  const slugs = selectDecisionScreenSlugs("how-it-wins-topology-2026-08-22-v1");
  assert.deepEqual(slugs, ["hebbia", "august", "nekohealth"]);
  assert.equal(slugs.some((slug) => slug === "cognition" || slug === "bland"), false);

  const plan = buildDecisionScreenRunPlan({
    seed: "how-it-wins-topology-2026-08-22-v1",
    transportHash: fixtureHash
  });
  assert.equal(plan.length, 9);
  assert.deepEqual([...new Set(plan.map((run) => run.slug))], slugs);
  assert.deepEqual(new Set(plan.map((run) => run.topology)), new Set(BENCHMARK_TOPOLOGIES));
  assert.ok(plan.every((run) => run.variant === "screen"));
  assert.equal(new Set(plan.map((run) => run.runId)).size, 9);
});

test("material divergence detects every frozen category without comparing trace prose", () => {
  const base = fixtureVerdict();
  const changedBet = structuredClone(base);
  changedBet.materialBets[0]!.statement = "The company is betting on a different mechanism.";
  assert.deepEqual(
    classifyMaterialDivergence(recordsForCard("suki", { thirteen_groups: changedBet })),
    ["material_bet"]
  );

  const changedCurrent = fixtureVerdict(["usership"]);
  assert.ok(classifyMaterialDivergence(recordsForCard("suki", { thirteen_groups: changedCurrent })).includes("current_disposition"));

  const reordered = fixtureVerdict(["aggregation", "usership"]);
  assert.deepEqual(
    classifyMaterialDivergence(recordsForCard("suki", { thirteen_groups: reordered })),
    ["current_ordering"]
  );

  const sibling = structuredClone(base);
  const usership = sibling.strategyEvaluations.find((entry) => entry.strategyId === "usership")!;
  usership.siblingCandidateIds = ["reliability"];
  usership.siblingResolutions = [{
    strategyId: "reliability",
    decidingQuestion: "Does another user increase utility?",
    reason: "The fixture shows user utility, not uptime.",
    evidenceIds: ["e1"]
  }];
  assert.deepEqual(
    classifyMaterialDivergence(recordsForCard("suki", { thirteen_groups: sibling })),
    ["sibling_decision"]
  );

  const pair = structuredClone(base);
  pair.unusualPair = {
    strategyIds: ["usership", "aggregation"],
    referenceClass: "Fixture substitutes",
    normalChoice: "A closed product",
    excludedAlternative: "A closed product",
    acceptedCost: "Outside participation",
    interaction: "Participation raises utility",
    copyingDifficulty: "The operating model must change",
    evidenceIds: ["e1"]
  };
  assert.deepEqual(
    classifyMaterialDivergence(recordsForCard("suki", { thirteen_groups: pair })),
    ["pair_selection"]
  );

  const notYet = fixtureVerdict();
  const standardization = notYet.strategyEvaluations.find((entry) => entry.strategyId === "standardization")!;
  Object.assign(standardization, {
    disposition: "not_yet",
    betIds: ["b1"],
    mechanism: "Independent adoption could create a shared norm.",
    evidenceGate: "pass",
    evidenceIds: ["e1"],
    claimIds: ["c1"],
    dimensions: currentEvaluation("standardization").dimensions,
    presentRelevance: "unresolved",
    presentEvidenceIds: ["e1"],
    notYet: {
      precursorEvidenceIds: ["e1"],
      causalPath: "More adopters converge.",
      missingCondition: "A third adopter is missing.",
      promotionEvidence: "A third adopter converges.",
      horizonMonths: 18
    }
  });
  assert.deepEqual(
    classifyMaterialDivergence(recordsForCard("suki", { thirteen_groups: notYet })),
    ["not_yet_selection"]
  );

  assert.deepEqual(
    classifyMaterialDivergence(recordsForCard("suki", { thirteen_groups: null })),
    ["fail_closed"]
  );

  const sameJudgment = structuredClone(base);
  sameJudgment.calls[0] = { ...sameJudgment.calls[0]!, callId: "different-trace", latencyMs: 999 };
  sameJudgment.disagreements = [{
    disagreementId: "nonmaterial",
    stage: "critic",
    summary: "A nonmaterial note.",
    material: false,
    strategyIds: [],
    evidenceIds: []
  }];
  assert.deepEqual(classifyMaterialDivergence(recordsForCard("suki", { thirteen_groups: sameJudgment })), []);
});

test("adaptive planning schedules exact divergence repeats, controls, and order tests", () => {
  const baseRecords = CLOSED_HOW_IT_WINS_CARDS.flatMap((card, index) =>
    recordsForCard(card.slug, index === 0 ? { thirteen_groups: null } : {})
  );
  const plan = buildAdaptiveBenchmarkRunPlan({
    baseRecords,
    seed: "fixture-seed",
    transportHash: fixtureHash
  });
  assert.deepEqual(plan.divergentSlugs, [CLOSED_HOW_IT_WINS_CARDS[0]!.slug]);
  assert.equal(plan.divergenceRuns.length, 6);
  assert.ok(plan.divergenceRuns.every((run) => run.repeat === 1 || run.repeat === 2));
  assert.equal(plan.agreementControlSlugs.length, 2);
  assert.equal(plan.controlShortage, 0);
  assert.equal(plan.controlRuns.length, 12);
  assert.equal(plan.orderRuns.length, 9);
  assert.deepEqual(new Set(plan.orderRuns.map((run) => run.slug)), new Set(ORDER_PERTURBATION_SLUGS));
  assert.equal(new Set([...plan.divergenceRuns, ...plan.controlRuns, ...plan.orderRuns].map((run) => run.runId)).size, 27);
});

test("adaptive planning reports an honest agreement-control shortage", () => {
  const baseRecords = CLOSED_HOW_IT_WINS_CARDS.flatMap((card, index) =>
    recordsForCard(card.slug, index === 0 ? {} : { thirteen_groups: null })
  );
  const plan = buildAdaptiveBenchmarkRunPlan({
    baseRecords,
    seed: "fixture-seed",
    transportHash: fixtureHash
  });
  assert.equal(plan.agreementControlSlugs.length, 1);
  assert.equal(plan.controlShortage, 1);
  assert.equal(plan.controlRuns.length, 6);
});

test("aggregate comparison reconciles outcomes, spend, latency, retries, critics, and adjudications", () => {
  const retriedTrace: HowItWinsJudgeCallTrace = {
    ...fixtureVerdict().calls[0]!,
    callId: "fixture-global:2",
    retryCount: 1
  };
  const valid = benchmarkRecord("monolith", fixtureVerdict(), { costUsd: 0.2 });
  valid.traces.push(retriedTrace, { ...retriedTrace, callId: "fixture-critic", stage: "critic", retryCount: 0 });
  const failed = benchmarkRecord("four_bundles", null, { costUsd: 0.3 });
  failed.traces.push({ ...retriedTrace, callId: "fixture-adjudication", stage: "adjudication", retryCount: 0 });
  const aggregate = aggregateBenchmarkRuns([valid, failed]);
  assert.deepEqual(aggregate.totals, {
    arms: 2,
    valid: 1,
    failedClosed: 1,
    costUsd: 0.5,
    wallTimeMs: 200,
    retries: 1,
    criticCalls: 1,
    adjudicationCalls: 1
  });
});

test("blind review aliases are seeded and the private reader packet hides topology names", () => {
  const divergent = recordsForCard("suki", { thirteen_groups: null });
  const first = buildBlindBenchmarkReview({ records: divergent, seed: "blind-seed" });
  const second = buildBlindBenchmarkReview({ records: divergent, seed: "blind-seed" });
  assert.deepEqual(first, second);
  assert.equal(first.packet.items.length, 1);
  assert.equal(JSON.stringify(first.packet).includes("thirteen_groups"), false);
  assert.equal(JSON.stringify(first.packet).includes("evidenceRegistry"), true);
  assert.equal(JSON.stringify(first.packet).includes("claims"), true);
  assert.deepEqual(new Set(Object.values(first.metadata.aliasToTopology)), new Set(BENCHMARK_TOPOLOGIES));
});

test("blind review preserves full answers and highlights differences without replacing them with summaries", () => {
  const changed = fixtureVerdict(["usership"]);
  changed.materialBets[0]!.statement = "The company is betting on a different fixture mechanism.";
  changed.strategyEvaluations.find((entry) => entry.strategyId === "usership")!.mechanism =
    "The complete alternate mechanism stays visible.";
  const review = buildBlindBenchmarkReview({
    records: recordsForCard("suki", { thirteen_groups: changed }),
    seed: "blind-seed"
  });
  const validArms = review.packet.items[0]!.arms.filter((arm) => arm.outcome === "valid");
  assert.equal(validArms.length, 3);
  for (const arm of validArms) {
    assert.equal(arm.fullAnswer.strategyEvaluations.length, HOW_IT_WINS_STRATEGIES.length);
    assert.equal(arm.fullAnswer.claims.length, 1);
    assert.equal(arm.fullAnswer.materialBets.length, 1);
    assert.equal(arm.fullAnswer.overallWrongCondition.condition, "The mechanism stops affecting buyer choice.");
  }

  const html = renderBlindBenchmarkReviewHtml(review.packet);
  assert.match(html, /The complete alternate mechanism stays visible\./);
  assert.match(html, /A fixture source supports the mechanism\./);
  assert.match(html, /Complete 80-strategy audit/);
  assert.match(html, /data-difference="different"/);
  assert.match(html, /data-difference="same"/);
  assert.doesNotMatch(html, /thirteen_groups|four_bundles|monolith/);
});
