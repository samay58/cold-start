import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { alphaRetentionPlan } from "@cold-start/db";

import { alphaPruneApplyReport, alphaPruneDryRunReport } from "./alpha-prune";

const plan = alphaRetentionPlan(new Date("2026-09-14T12:00:00.000Z"));

describe("alpha prune reporting", () => {
  it("reports fixed-age judgment and job eligibility in dry-run mode", () => {
    const report = alphaPruneDryRunReport(plan, {
      events: 12,
      inviteAttempts: 3,
      accessRequests: 21,
      howItWinsJudgments: 40,
      howItWinsJobs: 9
    }, 25);

    assert.deepEqual(report, {
      mode: "dry-run",
      before: "2026-08-15T12:00:00.000Z",
      eligible: 12,
      wouldDelete: 12,
      cappedByMax: true,
      attemptsBefore: "2026-09-13T12:00:00.000Z",
      attemptsEligible: 3,
      accessRequestsBefore: "2026-08-15T12:00:00.000Z",
      accessRequestsEligible: 21,
      accessRequestsWouldDelete: 21,
      howItWinsJudgmentsBefore: "2026-06-16T12:00:00.000Z",
      howItWinsJudgmentsEligible: 40,
      howItWinsJudgmentsWouldDelete: 25,
      howItWinsJobsBefore: "2026-06-16T12:00:00.000Z",
      howItWinsJobsEligible: 9,
      howItWinsJobsWouldDelete: 9
    });

    // The pre-existing kinds' fields must serialize byte-identically (same keys, same order) to
    // what shipped before How it wins jobs joined the guarded retention path; the new kind's
    // fields are additive at the end.
    const existingKindsPrefix = JSON.stringify({
      mode: "dry-run",
      before: "2026-08-15T12:00:00.000Z",
      eligible: 12,
      wouldDelete: 12,
      cappedByMax: true,
      attemptsBefore: "2026-09-13T12:00:00.000Z",
      attemptsEligible: 3,
      accessRequestsBefore: "2026-08-15T12:00:00.000Z",
      accessRequestsEligible: 21,
      accessRequestsWouldDelete: 21,
      howItWinsJudgmentsBefore: "2026-06-16T12:00:00.000Z",
      howItWinsJudgmentsEligible: 40,
      howItWinsJudgmentsWouldDelete: 25
    }).slice(0, -1);
    assert.ok(JSON.stringify(report).startsWith(existingKindsPrefix));
  });

  it("caps How it wins job diagnostics eligibility at the invocation maximum", () => {
    const report = alphaPruneDryRunReport(plan, {
      events: 0,
      inviteAttempts: 0,
      accessRequests: 0,
      howItWinsJudgments: 0,
      howItWinsJobs: 100
    }, 25);

    assert.equal(report.howItWinsJobsEligible, 100);
    assert.equal(report.howItWinsJobsWouldDelete, 25);
    assert.equal(report.cappedByMax, true);
  });

  it("reports each bounded apply result without reconstructing retention policy", () => {
    const report = alphaPruneApplyReport(plan, {
      events: { deleted: 12, stoppedAtMax: false },
      inviteAttempts: { deleted: 3, stoppedAtMax: false },
      accessRequests: { deleted: 25, stoppedAtMax: true },
      howItWinsJudgments: { deleted: 7, stoppedAtMax: false },
      howItWinsJobs: { deleted: 5, stoppedAtMax: false }
    });

    assert.deepEqual(report, {
      mode: "apply",
      before: "2026-08-15T12:00:00.000Z",
      deleted: 12,
      stoppedAtMax: false,
      attemptsBefore: "2026-09-13T12:00:00.000Z",
      attemptsDeleted: 3,
      accessRequestsBefore: "2026-08-15T12:00:00.000Z",
      accessRequestsDeleted: 25,
      accessRequestsStoppedAtMax: true,
      howItWinsJudgmentsBefore: "2026-06-16T12:00:00.000Z",
      howItWinsJudgmentsDeleted: 7,
      howItWinsJudgmentsStoppedAtMax: false,
      howItWinsJobsBefore: "2026-06-16T12:00:00.000Z",
      howItWinsJobsDeleted: 5,
      howItWinsJobsStoppedAtMax: false
    });
  });

  it("reports stoppedAtMax for How it wins job diagnostics", () => {
    const report = alphaPruneApplyReport(plan, {
      events: { deleted: 0, stoppedAtMax: false },
      inviteAttempts: { deleted: 0, stoppedAtMax: false },
      accessRequests: { deleted: 0, stoppedAtMax: false },
      howItWinsJudgments: { deleted: 0, stoppedAtMax: false },
      howItWinsJobs: { deleted: 10_000, stoppedAtMax: true }
    });

    assert.equal(report.howItWinsJobsDeleted, 10_000);
    assert.equal(report.howItWinsJobsStoppedAtMax, true);
  });
});
