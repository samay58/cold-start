#!/usr/bin/env tsx

import {
  type AlphaRetentionPlan,
  alphaRetentionPlan,
  countAlphaRetentionEligible,
  pruneAlphaRetention
} from "@cold-start/db";

import {
  boundedInteger,
  dateBefore,
  hasFlag,
  loadProductionEnv,
  parseCliArguments,
  runCli,
  valueFor,
  withAlphaDb
} from "./alpha-common";

const HELP = `Delete raw alpha events older than the retention boundary, handled access requests
older than 30 days, and fixed-age How it wins cache judgments older than 90 days.

Usage:
  npm run alpha:prune -- [--before 30d] [--batch 1000] [--max 10000]              # dry run
  npm run alpha:prune -- [--before 30d] [--batch 1000] [--max 10000] --apply      # delete

Options:
  --before <duration>  Delete events received before this age, default 30d. The access-request
                       and judgment windows are fixed and do not follow this flag.
  --batch <count>      Rows per repository call, default 1000
  --max <count>        Maximum rows deleted per record type in one invocation, default 10000
  --apply              Perform the deletion. Without it, only reports the count.
  --help               Show this help`;

type RetentionCounts = {
  events: number;
  inviteAttempts: number;
  accessRequests: number;
  howItWinsJudgments: number;
};

type RetentionPruneResult = Record<keyof RetentionCounts, { deleted: number; stoppedAtMax: boolean }>;

export function alphaPruneDryRunReport(plan: AlphaRetentionPlan, eligible: RetentionCounts, maximum: number) {
  return {
    mode: "dry-run",
    before: plan.eventsBefore.toISOString(),
    eligible: eligible.events,
    wouldDelete: Math.min(eligible.events, maximum),
    cappedByMax: Object.values(eligible).some((value) => value > maximum),
    attemptsBefore: plan.inviteAttemptsBefore.toISOString(),
    attemptsEligible: eligible.inviteAttempts,
    accessRequestsBefore: plan.accessRequestsBefore.toISOString(),
    accessRequestsEligible: eligible.accessRequests,
    accessRequestsWouldDelete: Math.min(eligible.accessRequests, maximum),
    howItWinsJudgmentsBefore: plan.howItWinsJudgmentsBefore.toISOString(),
    howItWinsJudgmentsEligible: eligible.howItWinsJudgments,
    howItWinsJudgmentsWouldDelete: Math.min(eligible.howItWinsJudgments, maximum)
  };
}

export function alphaPruneApplyReport(plan: AlphaRetentionPlan, removed: RetentionPruneResult) {
  return {
    mode: "apply",
    before: plan.eventsBefore.toISOString(),
    deleted: removed.events.deleted,
    stoppedAtMax: removed.events.stoppedAtMax,
    attemptsBefore: plan.inviteAttemptsBefore.toISOString(),
    attemptsDeleted: removed.inviteAttempts.deleted,
    accessRequestsBefore: plan.accessRequestsBefore.toISOString(),
    accessRequestsDeleted: removed.accessRequests.deleted,
    accessRequestsStoppedAtMax: removed.accessRequests.stoppedAtMax,
    howItWinsJudgmentsBefore: plan.howItWinsJudgmentsBefore.toISOString(),
    howItWinsJudgmentsDeleted: removed.howItWinsJudgments.deleted,
    howItWinsJudgmentsStoppedAtMax: removed.howItWinsJudgments.stoppedAtMax
  };
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const args = parseCliArguments(argv);
  if (hasFlag(args, "--help")) {
    console.log(HELP);
    return;
  }

  const before = dateBefore(new Date(), valueFor(args, "--before") ?? "30d", "--before");
  const batch = boundedInteger(valueFor(args, "--batch"), 1_000, {
    name: "--batch",
    min: 1,
    max: 10_000
  });
  const maximum = boundedInteger(valueFor(args, "--max"), 10_000, {
    name: "--max",
    min: 1,
    max: 100_000
  });

  loadProductionEnv();
  const apply = hasFlag(args, "--apply");

  const plan = alphaRetentionPlan(new Date(), before);
  const eligible = await withAlphaDb((db) => countAlphaRetentionEligible(db, plan));

  if (!apply) {
    console.log(
      JSON.stringify(
        alphaPruneDryRunReport(plan, eligible, maximum),
        null,
        2
      )
    );
    return;
  }

  const removed = await withAlphaDb((db) => pruneAlphaRetention(db, {
    plan,
    kinds: ["events", "inviteAttempts", "accessRequests", "howItWinsJudgments"],
    batch,
    maximum
  }));

  console.log(
    JSON.stringify(
      alphaPruneApplyReport(plan, removed),
      null,
      2
    )
  );
}

runCli(import.meta.url, main);
