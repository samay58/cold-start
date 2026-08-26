import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { hashHowItWinsJudgeValue } from "@cold-start/llm";
import type { GenerationLlmCallTrace } from "@cold-start/core";

import {
  compactCalls,
  hashBenchmarkValue,
  judgmentCacheFileName,
  loadRootEnv,
  seededBenchmarkOrder,
  usageFromCalls
} from "./how-it-wins-eval-shared";

// ---- hash ---------------------------------------------------------------------------------------

// hashBenchmarkValue is the judge's own hash under the name the benchmark scripts use. These two
// vectors are locked: a frozen evidence hash filed by any of the three scripts has to keep
// meaning the same thing, and a silent change here would quietly invalidate every one of them.
test("the benchmark hash is the judge hash, on a locked vector", () => {
  assert.equal(
    hashBenchmarkValue("how-it-wins-eval-shared"),
    "8a5d0ed037494bbfcf4461ffd1d90fe2fbf425ff36d55ac5e81234b89afd73e6"
  );
  assert.equal(
    hashBenchmarkValue({ b: 1, a: ["x", { d: true, c: null }] }),
    "d54a61c21bb625ea8fd34324d9c0456795b357923581182789237b5c03362db8"
  );
  assert.equal(hashBenchmarkValue("how-it-wins-eval-shared"), hashHowItWinsJudgeValue("how-it-wins-eval-shared"));
});

test("the hash ignores key order and separates different values", () => {
  assert.equal(hashBenchmarkValue({ a: 1, b: 2 }), hashBenchmarkValue({ b: 2, a: 1 }));
  assert.notEqual(hashBenchmarkValue({ a: 1 }), hashBenchmarkValue({ a: 2 }));
});

test("seeded order is deterministic, moves with the seed, and keeps every item", () => {
  const values = Array.from({ length: 8 }, (_, index) => `item-${index}`);
  const first = seededBenchmarkOrder(values, "seed-one");
  assert.deepEqual(first, seededBenchmarkOrder(values, "seed-one"));
  assert.notDeepEqual(first, seededBenchmarkOrder(values, "seed-two"));
  assert.deepEqual([...first].sort(), [...values].sort());
});

// ---- cache naming --------------------------------------------------------------------------------

test("the judgment cache file name is the three hashes joined with dots", () => {
  assert.equal(judgmentCacheFileName("evidence-hash", "prompt-hash", "vocab-hash"), "evidence-hash.prompt-hash.vocab-hash.json");
});

test("the cache file name changes when any one of the three hashes changes", () => {
  const base = judgmentCacheFileName("a", "b", "c");
  assert.notEqual(judgmentCacheFileName("a2", "b", "c"), base);
  assert.notEqual(judgmentCacheFileName("a", "b2", "c"), base);
  assert.notEqual(judgmentCacheFileName("a", "b", "c2"), base);
});

// ---- usage ---------------------------------------------------------------------------------------

const FULL_CALL: GenerationLlmCallTrace = {
  stage: "how_it_wins",
  label: "how-it-wins-frozen-writer",
  model: "claude-sonnet-5",
  provider: "anthropic",
  status: "ok",
  durationMs: 1200,
  inputTokens: 900,
  outputTokens: 300,
  estimatedCostUsd: 0.02
};

// A call the provider answered without reporting any counts, which is what a failed call looks
// like in the trace.
const COUNTLESS_CALL: GenerationLlmCallTrace = {
  stage: "how_it_wins",
  label: "how-it-wins-critic",
  model: "claude-sonnet-5",
  status: "failed",
  durationMs: 300
};

test("usage totals add across calls and read a missing count as zero", () => {
  assert.deepEqual(usageFromCalls([]), { inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0, durationMs: 0 });
  assert.deepEqual(usageFromCalls([FULL_CALL, COUNTLESS_CALL]), {
    inputTokens: 900,
    outputTokens: 300,
    estimatedCostUsd: 0.02,
    durationMs: 1500
  });
});

test("compact calls keep label, model, and outcome, and zero out what a call never reported", () => {
  assert.deepEqual(compactCalls([COUNTLESS_CALL]), [
    {
      label: "how-it-wins-critic",
      model: "claude-sonnet-5",
      status: "failed",
      durationMs: 300,
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostUsd: 0
    }
  ]);
});

// ---- env ------------------------------------------------------------------------------------------

test("root env fills unset variables and leaves an already-set one alone", () => {
  const root = mkdtempSync(path.join(tmpdir(), "how-it-wins-shared-"));
  writeFileSync(
    path.join(root, ".env.local"),
    ["HOW_IT_WINS_TEST_FRESH=\"filled\"", "HOW_IT_WINS_TEST_HELD=from-file", "not a variable line"].join("\n")
  );
  process.env.HOW_IT_WINS_TEST_HELD = "from-shell";
  try {
    loadRootEnv(root);
    assert.equal(process.env.HOW_IT_WINS_TEST_FRESH, "filled");
    assert.equal(process.env.HOW_IT_WINS_TEST_HELD, "from-shell");
  } finally {
    delete process.env.HOW_IT_WINS_TEST_FRESH;
    delete process.env.HOW_IT_WINS_TEST_HELD;
  }
});

test("root env is a no-op when the directory holds no .env.local", () => {
  const root = mkdtempSync(path.join(tmpdir(), "how-it-wins-shared-empty-"));
  assert.doesNotThrow(() => loadRootEnv(root));
});
