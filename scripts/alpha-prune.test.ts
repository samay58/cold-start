import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { alphaRetentionPlan } from "@cold-start/db";

import { alphaPruneApplyReport, alphaPruneDryRunReport } from "./alpha-prune";

const plan = alphaRetentionPlan(new Date("2026-09-14T12:00:00.000Z"));

describe("alpha prune reporting", () => {
  it("reports fixed-age judgment eligibility in dry-run mode", () => {
    assert.deepEqual(alphaPruneDryRunReport(plan, {
      events: 12,
      inviteAttempts: 3,
      accessRequests: 21,
      howItWinsJudgments: 40
    }, 25), {
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
    });
  });

  it("reports each bounded apply result without reconstructing retention policy", () => {
    assert.deepEqual(alphaPruneApplyReport(plan, {
      events: { deleted: 12, stoppedAtMax: false },
      inviteAttempts: { deleted: 3, stoppedAtMax: false },
      accessRequests: { deleted: 25, stoppedAtMax: true },
      howItWinsJudgments: { deleted: 7, stoppedAtMax: false }
    }), {
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
      howItWinsJudgmentsStoppedAtMax: false
    });
  });
});
