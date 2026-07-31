#!/usr/bin/env tsx

import { count, lt } from "drizzle-orm";

import {
  alphaEvents,
  alphaInviteAttempts,
  pruneAlphaEvents,
  pruneAlphaInviteAttempts
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

const HELP = `Delete raw alpha events older than the retention boundary.

Usage:
  npm run alpha:prune -- [--before 30d] [--batch 1000] [--max 10000]              # dry run
  npm run alpha:prune -- [--before 30d] [--batch 1000] [--max 10000] --apply      # delete

Options:
  --before <duration>  Delete events received before this age, default 30d
  --batch <count>      Rows per repository call, default 1000
  --max <count>        Maximum rows deleted in one invocation, default 10000
  --apply              Perform the deletion. Without it, only reports the count.
  --help               Show this help`;

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

  // Breaker attempts only matter for the trailing hour; anything older than a day
  // is noise. Pruned on the same cadence as events, at a fixed 24h boundary.
  const attemptsBefore = dateBefore(new Date(), "24h", "--before");

  const { eligible, attemptsEligible } = await withAlphaDb(async (db) => {
    const rows = await db
      .select({ value: count() })
      .from(alphaEvents)
      .where(lt(alphaEvents.receivedAt, before));
    const attemptRows = await db
      .select({ value: count() })
      .from(alphaInviteAttempts)
      .where(lt(alphaInviteAttempts.createdAt, attemptsBefore));
    return {
      eligible: rows[0]?.value ?? 0,
      attemptsEligible: attemptRows[0]?.value ?? 0
    };
  });

  if (!apply) {
    console.log(
      JSON.stringify(
        {
          mode: "dry-run",
          before: before.toISOString(),
          eligible,
          wouldDelete: Math.min(eligible, maximum),
          cappedByMax: eligible > maximum,
          attemptsBefore: attemptsBefore.toISOString(),
          attemptsEligible
        },
        null,
        2
      )
    );
    return;
  }

  const { deleted, attemptsDeleted } = await withAlphaDb(async (db) => {
    let countDeleted = 0;
    while (countDeleted < maximum) {
      const removed = await pruneAlphaEvents(db, {
        before,
        limit: Math.min(batch, maximum - countDeleted)
      });
      countDeleted += removed;
      if (removed < batch) break;
    }
    const removedAttempts = await pruneAlphaInviteAttempts(db, attemptsBefore);
    return { deleted: countDeleted, attemptsDeleted: removedAttempts };
  });

  console.log(
    JSON.stringify(
      {
        mode: "apply",
        before: before.toISOString(),
        deleted,
        stoppedAtMax: deleted === maximum,
        attemptsBefore: attemptsBefore.toISOString(),
        attemptsDeleted
      },
      null,
      2
    )
  );
}

runCli(import.meta.url, main);
