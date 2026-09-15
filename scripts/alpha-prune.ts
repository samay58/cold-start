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
older than 30 days, and fixed-age How it wins cache judgments and job diagnostics older than 90
days.

Usage:
  npm run alpha:prune -- [--before 30d] [--batch 1000] [--max 10000]              # dry run
  npm run alpha:prune -- [--before 30d] [--batch 1000] [--max 10000] --apply      # delete

Options:
  --before <duration>  Delete events received before this age, default 30d. The access-request
                       and judgment/job windows are fixed and do not follow this flag.
  --batch <count>      Rows per repository call, default 1000
  --max <count>        Maximum rows deleted per record type in one invocation, default 10000
  --apply              Perform the deletion. Without it, only reports the count.
  --help               Show this help`;

type RetentionCounts = {
  events: number;
  inviteAttempts: number;
  accessRequests: number;
  howItWinsJudgments: number;
  howItWinsJobs: number;
};

type RetentionPruneResult = Record<keyof RetentionCounts, { deleted: number; stoppedAtMax: boolean }>;

// Field naming for events (no prefix, bare "before"/"eligible"/"deleted") is baked into the
// report shape below and stays hand-written; every other kind follows `${prefix}Before` /
// `${prefix}Eligible` / `${prefix}WouldDelete` (dry run) or `${prefix}Deleted` /
// `${prefix}StoppedAtMax` (apply). `inviteAttempts` predates the wouldDelete/stoppedAtMax fields
// and keeps reporting only eligibility and the raw deleted count.
const RETENTION_REPORT_KINDS: ReadonlyArray<{
  key: Exclude<keyof RetentionCounts, "events">;
  prefix: string;
  includeWouldDelete: boolean;
  includeStoppedAtMax: boolean;
}> = [
  { key: "inviteAttempts", prefix: "attempts", includeWouldDelete: false, includeStoppedAtMax: false },
  { key: "accessRequests", prefix: "accessRequests", includeWouldDelete: true, includeStoppedAtMax: true },
  { key: "howItWinsJudgments", prefix: "howItWinsJudgments", includeWouldDelete: true, includeStoppedAtMax: true },
  { key: "howItWinsJobs", prefix: "howItWinsJobs", includeWouldDelete: true, includeStoppedAtMax: true }
];

const PLAN_BOUNDARY_FIELD: Record<keyof RetentionCounts, keyof AlphaRetentionPlan> = {
  events: "eventsBefore",
  inviteAttempts: "inviteAttemptsBefore",
  accessRequests: "accessRequestsBefore",
  howItWinsJudgments: "howItWinsJudgmentsBefore",
  howItWinsJobs: "howItWinsJobsBefore"
};

export function alphaPruneDryRunReport(plan: AlphaRetentionPlan, eligible: RetentionCounts, maximum: number) {
  const kindFields: Record<string, string | number> = {};
  for (const { key, prefix, includeWouldDelete } of RETENTION_REPORT_KINDS) {
    kindFields[`${prefix}Before`] = plan[PLAN_BOUNDARY_FIELD[key]].toISOString();
    kindFields[`${prefix}Eligible`] = eligible[key];
    if (includeWouldDelete) kindFields[`${prefix}WouldDelete`] = Math.min(eligible[key], maximum);
  }

  return {
    mode: "dry-run",
    before: plan.eventsBefore.toISOString(),
    eligible: eligible.events,
    wouldDelete: Math.min(eligible.events, maximum),
    cappedByMax: Object.values(eligible).some((value) => value > maximum),
    ...kindFields
  };
}

export function alphaPruneApplyReport(plan: AlphaRetentionPlan, removed: RetentionPruneResult) {
  const kindFields: Record<string, string | number | boolean> = {};
  for (const { key, prefix, includeStoppedAtMax } of RETENTION_REPORT_KINDS) {
    kindFields[`${prefix}Before`] = plan[PLAN_BOUNDARY_FIELD[key]].toISOString();
    kindFields[`${prefix}Deleted`] = removed[key].deleted;
    if (includeStoppedAtMax) kindFields[`${prefix}StoppedAtMax`] = removed[key].stoppedAtMax;
  }

  return {
    mode: "apply",
    before: plan.eventsBefore.toISOString(),
    deleted: removed.events.deleted,
    stoppedAtMax: removed.events.stoppedAtMax,
    ...kindFields
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
    kinds: ["events", "inviteAttempts", "accessRequests", "howItWinsJudgments", "howItWinsJobs"],
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
