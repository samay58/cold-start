#!/usr/bin/env tsx

import { and, count, isNotNull, lt } from "drizzle-orm";

import {
  accessRequests,
  alphaEvents,
  alphaInviteAttempts,
  howItWinsJudgments,
  pruneAlphaEvents,
  pruneAlphaInviteAttempts,
  pruneHandledAccessRequests,
  pruneHowItWinsJudgments
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
older than 30 days, and How it wins judgments older than 90 days.

Usage:
  npm run alpha:prune -- [--before 30d] [--batch 1000] [--max 10000]              # dry run
  npm run alpha:prune -- [--before 30d] [--batch 1000] [--max 10000] --apply      # delete

Options:
  --before <duration>  Delete events received before this age, default 30d. The access-request
                       and judgment windows are fixed and do not follow this flag.
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

  // Access-request retention is its own privacy commitment (see the privacy page): a handled
  // request is deleted 30 days after handling, decoupled from --before like the attempts window
  // above, so tuning the events cutoff never quietly changes this one.
  const accessRequestsBefore = dateBefore(new Date(), "30d", "--before");

  // How it wins judgments are a cache keyed by evidence hashes (no tester data). One row per
  // distinct evidence packet at 60 to 80 KB each; a verdict nothing has reached for in 90 days
  // goes, and the next run over that evidence pays for a fresh one. Fixed window, same reason.
  const judgmentsBefore = dateBefore(new Date(), "90d", "--before");

  const { eligible, attemptsEligible, accessRequestsEligible, judgmentsEligible } = await withAlphaDb(async (db) => {
    const rows = await db
      .select({ value: count() })
      .from(alphaEvents)
      .where(lt(alphaEvents.receivedAt, before));
    const attemptRows = await db
      .select({ value: count() })
      .from(alphaInviteAttempts)
      .where(lt(alphaInviteAttempts.createdAt, attemptsBefore));
    const accessRequestRows = await db
      .select({ value: count() })
      .from(accessRequests)
      .where(and(isNotNull(accessRequests.handledAt), lt(accessRequests.handledAt, accessRequestsBefore)));
    const judgmentRows = await db
      .select({ value: count() })
      .from(howItWinsJudgments)
      .where(lt(howItWinsJudgments.createdAt, judgmentsBefore));
    return {
      eligible: rows[0]?.value ?? 0,
      attemptsEligible: attemptRows[0]?.value ?? 0,
      accessRequestsEligible: accessRequestRows[0]?.value ?? 0,
      judgmentsEligible: judgmentRows[0]?.value ?? 0
    };
  });

  if (!apply) {
    const eventsWouldDelete = Math.min(eligible, maximum);
    const accessRequestsWouldDelete = Math.min(
      accessRequestsEligible,
      maximum
    );
    console.log(
      JSON.stringify(
        {
          mode: "dry-run",
          before: before.toISOString(),
          eligible,
          wouldDelete: eventsWouldDelete,
          cappedByMax: eligible > maximum || accessRequestsEligible > maximum || judgmentsEligible > maximum,
          attemptsBefore: attemptsBefore.toISOString(),
          attemptsEligible,
          accessRequestsBefore: accessRequestsBefore.toISOString(),
          accessRequestsEligible,
          accessRequestsWouldDelete,
          howItWinsJudgmentsBefore: judgmentsBefore.toISOString(),
          howItWinsJudgmentsEligible: judgmentsEligible,
          howItWinsJudgmentsWouldDelete: Math.min(judgmentsEligible, maximum)
        },
        null,
        2
      )
    );
    return;
  }

  const { deleted, attemptsDeleted, accessRequestsDeleted, judgmentsDeleted } = await withAlphaDb(async (db) => {
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
    let removedAccessRequests = 0;
    while (removedAccessRequests < maximum) {
      const removed = await pruneHandledAccessRequests(db, {
        before: accessRequestsBefore,
        limit: Math.min(batch, maximum - removedAccessRequests)
      });
      removedAccessRequests += removed;
      if (removed < batch) break;
    }
    let removedJudgments = 0;
    while (removedJudgments < maximum) {
      const removed = await pruneHowItWinsJudgments(db, {
        before: judgmentsBefore,
        limit: Math.min(batch, maximum - removedJudgments)
      });
      removedJudgments += removed;
      if (removed < batch) break;
    }
    return {
      deleted: countDeleted,
      attemptsDeleted: removedAttempts,
      accessRequestsDeleted: removedAccessRequests,
      judgmentsDeleted: removedJudgments
    };
  });

  console.log(
    JSON.stringify(
      {
        mode: "apply",
        before: before.toISOString(),
        deleted,
        stoppedAtMax: deleted === maximum,
        attemptsBefore: attemptsBefore.toISOString(),
        attemptsDeleted,
        accessRequestsBefore: accessRequestsBefore.toISOString(),
        accessRequestsDeleted,
        accessRequestsStoppedAtMax: accessRequestsDeleted === maximum,
        howItWinsJudgmentsBefore: judgmentsBefore.toISOString(),
        howItWinsJudgmentsDeleted: judgmentsDeleted,
        howItWinsJudgmentsStoppedAtMax: judgmentsDeleted === maximum
      },
      null,
      2
    )
  );
}

runCli(import.meta.url, main);
