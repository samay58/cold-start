import { and, count, isNotNull, lt, sql } from "drizzle-orm";

import { rowsFromExecuteResult, type ColdStartDb } from "./client";
import {
  pruneAlphaEvents,
  pruneAlphaInviteAttempts
} from "./repositories/alpha";
import { pruneHandledAccessRequests } from "./repositories/access-requests";
import { pruneHowItWinsJudgments } from "./repositories/how-it-wins-judgments";
import { pruneHowItWinsJobs } from "./repositories/how-it-wins-jobs";
import {
  accessRequests,
  alphaEvents,
  alphaInviteAttempts,
  howItWinsJudgments
} from "./schema";

export const ALPHA_RETENTION_DAYS = {
  events: 30,
  accessRequests: 30,
  inviteAttempts: 1,
  // Judgments are a cache. This is fixed age from creation, not inactivity: cache reads do not
  // write, and an old exact verdict simply re-runs if its evidence packet returns.
  howItWinsJudgments: 90,
  // Job diagnostics are operational records tied to the same runs as judgments; same fixed
  // 90-day age window, not inactivity.
  howItWinsJobs: 90
} as const;

export const ALPHA_RETENTION_BATCH_SIZE = 1_000;
export const ALPHA_RETENTION_MAX_DELETIONS = 10_000;

export type AlphaRetentionPlan = {
  eventsBefore: Date;
  accessRequestsBefore: Date;
  inviteAttemptsBefore: Date;
  howItWinsJudgmentsBefore: Date;
  howItWinsJobsBefore: Date;
};

export type AlphaRetentionKind =
  | "events"
  | "accessRequests"
  | "inviteAttempts"
  | "howItWinsJudgments"
  | "howItWinsJobs";

function daysBefore(now: Date, days: number) {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1_000);
}

export function alphaRetentionPlan(now = new Date(), eventsBefore = daysBefore(now, ALPHA_RETENTION_DAYS.events)): AlphaRetentionPlan {
  return {
    eventsBefore,
    accessRequestsBefore: daysBefore(now, ALPHA_RETENTION_DAYS.accessRequests),
    inviteAttemptsBefore: daysBefore(now, ALPHA_RETENTION_DAYS.inviteAttempts),
    howItWinsJudgmentsBefore: daysBefore(now, ALPHA_RETENTION_DAYS.howItWinsJudgments),
    howItWinsJobsBefore: daysBefore(now, ALPHA_RETENTION_DAYS.howItWinsJobs)
  };
}

type RetentionOperation = (input: { before: Date; limit: number }) => Promise<number>;

export async function pruneRetentionInBatches(
  operation: RetentionOperation,
  before: Date,
  options: { batch?: number; maximum?: number } = {}
): Promise<{ deleted: number; stoppedAtMax: boolean }> {
  const batch = options.batch ?? ALPHA_RETENTION_BATCH_SIZE;
  const maximum = options.maximum ?? ALPHA_RETENTION_MAX_DELETIONS;
  if (!Number.isInteger(batch) || batch < 1) throw new Error("batch must be a positive integer");
  if (!Number.isInteger(maximum) || maximum < 1) throw new Error("maximum must be a positive integer");

  let deleted = 0;
  while (deleted < maximum) {
    const removed = await operation({ before, limit: Math.min(batch, maximum - deleted) });
    deleted += removed;
    if (removed < batch) break;
  }
  return { deleted, stoppedAtMax: deleted === maximum };
}

export async function pruneAlphaRetention(
  db: ColdStartDb,
  input: {
    plan: AlphaRetentionPlan;
    kinds: AlphaRetentionKind[];
    batch?: number;
    maximum?: number;
  }
): Promise<Record<AlphaRetentionKind, { deleted: number; stoppedAtMax: boolean }>> {
  const operations: Record<AlphaRetentionKind, RetentionOperation> = {
    events: (options) => pruneAlphaEvents(db, options),
    accessRequests: (options) => pruneHandledAccessRequests(db, options),
    inviteAttempts: (options) => pruneAlphaInviteAttempts(db, options),
    howItWinsJudgments: (options) => pruneHowItWinsJudgments(db, options),
    howItWinsJobs: (options) => pruneHowItWinsJobs(db, options)
  };
  const boundaries: Record<AlphaRetentionKind, Date> = {
    events: input.plan.eventsBefore,
    accessRequests: input.plan.accessRequestsBefore,
    inviteAttempts: input.plan.inviteAttemptsBefore,
    howItWinsJudgments: input.plan.howItWinsJudgmentsBefore,
    howItWinsJobs: input.plan.howItWinsJobsBefore
  };
  const result = {} as Record<AlphaRetentionKind, { deleted: number; stoppedAtMax: boolean }>;
  for (const kind of input.kinds) {
    result[kind] = await pruneRetentionInBatches(operations[kind], boundaries[kind], input);
  }
  return result;
}

export async function countAlphaRetentionEligible(
  db: ColdStartDb,
  plan: AlphaRetentionPlan
): Promise<Record<AlphaRetentionKind, number>> {
  const [events, inviteAttempts, accessRequestsCount, judgments, jobs] = await Promise.all([
    db.select({ value: count() }).from(alphaEvents).where(lt(alphaEvents.receivedAt, plan.eventsBefore)),
    db.select({ value: count() }).from(alphaInviteAttempts).where(lt(alphaInviteAttempts.createdAt, plan.inviteAttemptsBefore)),
    db.select({ value: count() }).from(accessRequests).where(and(isNotNull(accessRequests.handledAt), lt(accessRequests.handledAt, plan.accessRequestsBefore))),
    db.select({ value: count() }).from(howItWinsJudgments).where(lt(howItWinsJudgments.createdAt, plan.howItWinsJudgmentsBefore)),
    // Mirrors pruneHowItWinsJobs's eligibility: a root job in a terminal state, aged past the
    // window, with no queued or running child still depending on it.
    db.execute<{ value: number }>(sql`
      select count(*)::int as value
      from how_it_wins_jobs root
      where root.id = root.root_job_id
        and root.status in ('succeeded', 'failed', 'cancelled', 'superseded')
        and root.updated_at < ${plan.howItWinsJobsBefore}
        and not exists (
          select 1 from how_it_wins_jobs child
          where child.root_job_id = root.id
            and child.status in ('queued', 'running')
        )
    `)
  ]);
  return {
    events: events[0]?.value ?? 0,
    inviteAttempts: inviteAttempts[0]?.value ?? 0,
    accessRequests: accessRequestsCount[0]?.value ?? 0,
    howItWinsJudgments: judgments[0]?.value ?? 0,
    howItWinsJobs: rowsFromExecuteResult<{ value: number }>(jobs)[0]?.value ?? 0
  };
}
