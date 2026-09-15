import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseRepairArguments, repairReport } from "./repair-how-it-wins";

const runId = "1b9c2d3e-4f50-4a61-8b72-9c0d1e2f3a4b";
const valid = ["--slug", "acme-labs", "--run-id", runId, "--budget-usd", "2.50"];

describe("repair how-it-wins argument parsing", () => {
  it("accepts a slug, a run id, and a dollar cap", () => {
    assert.deepEqual(parseRepairArguments(valid), {
      slug: "acme-labs",
      runId,
      budgetUsd: "2.50",
      capMicrodollars: 2_500_000,
      apply: false
    });
  });

  it("carries the apply flag through", () => {
    assert.equal(parseRepairArguments([...valid, "--apply"]).apply, true);
  });

  it("refuses a missing flag", () => {
    assert.throws(() => parseRepairArguments(["--run-id", runId, "--budget-usd", "1"]), /--slug is required/);
    assert.throws(() => parseRepairArguments(["--slug", "acme-labs", "--budget-usd", "1"]), /--run-id is required/);
    assert.throws(() => parseRepairArguments(["--slug", "acme-labs", "--run-id", runId]), /--budget-usd is required/);
  });

  it("refuses a slug the card route would not serve", () => {
    assert.throws(() => parseRepairArguments(["--slug", "Acme_Labs", "--run-id", runId, "--budget-usd", "1"]),
      /--slug must be lowercase/);
  });

  it("refuses a run id that is not a uuid", () => {
    assert.throws(() => parseRepairArguments(["--slug", "acme-labs", "--run-id", "not-a-uuid", "--budget-usd", "1"]),
      /--run-id must be/);
  });

  it("refuses a budget the worker env helper rejects", () => {
    for (const budget of ["0", "-1", "abc", "11"]) {
      assert.throws(() => parseRepairArguments(["--slug", "acme-labs", "--run-id", runId, "--budget-usd", budget]),
        /--budget-usd must be a dollar amount/, `budget ${budget} should be refused`);
    }
  });
});

describe("repair how-it-wins reporting", () => {
  it("reports what a repair would find without writing", () => {
    assert.deepEqual(repairReport({
      mode: "inspect",
      runId,
      runStatus: "complete",
      historicalStatus: "deferred",
      profilePresent: true,
      analysisPresent: true,
      evaluatorCurrent: false,
      capMicrodollars: 2_500_000,
      latestJob: { id: "9f8e7d6c-5b4a-4938-8271-605f4e3d2c1b", status: "failed", reasonCode: "lease_lost" }
    }), {
      apply: false,
      sourceAnalysisRunId: runId,
      runStatus: "complete",
      historicalStatus: "deferred",
      profilePresent: true,
      analysisPresent: true,
      evaluatorCurrent: false,
      capMicrodollars: 2_500_000,
      latestJob: { id: "9f8e7d6c-5b4a-4938-8271-605f4e3d2c1b", status: "failed", reasonCode: "lease_lost" }
    });
  });

  it("keeps the absent run and the absent job readable", () => {
    const report = repairReport({
      mode: "inspect",
      runId,
      runStatus: null,
      historicalStatus: null,
      profilePresent: false,
      analysisPresent: false,
      evaluatorCurrent: false,
      capMicrodollars: 1_000_000,
      latestJob: null
    });

    assert.equal(JSON.stringify(report).includes('"latestJob":null'), true);
    assert.equal(JSON.stringify(report).split("\n").length, 1);
  });

  it("reports the admitted job after a dispatch", () => {
    assert.deepEqual(repairReport({
      mode: "apply",
      state: "joined",
      jobId: "9f8e7d6c-5b4a-4938-8271-605f4e3d2c1b",
      dispatched: false,
      capMicrodollars: 2_500_000
    }), {
      apply: true,
      state: "joined",
      jobId: "9f8e7d6c-5b4a-4938-8271-605f4e3d2c1b",
      dispatched: false,
      capMicrodollars: 2_500_000
    });
  });
});
