#!/usr/bin/env tsx

import { findCardBySlug, findGenerationRunById, findLatestHowItWinsJobBySlug } from "@cold-start/db";

import {
  hasFlag,
  loadProductionEnv,
  parseCliArguments,
  requiredValue,
  runCli,
  safeError,
  withAlphaDb
} from "./alpha-common";
import {
  dispatchHowItWinsJob,
  howItWinsExecutionConfig,
  requestOperatorHowItWinsRepair
} from "../apps/web/src/inngest/how-it-wins-jobs";
import { howItWinsJobBudgetMicrodollars } from "../apps/web/src/inngest/worker-env";
import type { AlphaPrincipal } from "../apps/web/src/lib/extension-auth";

const HELP = `Re-admit one How it wins read whose analysis run never closed its trail.

Usage:
  npm run repair:how-it-wins -- --slug <slug> --run-id <uuid> --budget-usd <usd>           # report
  npm run repair:how-it-wins -- --slug <slug> --run-id <uuid> --budget-usd <usd> --apply   # admit

Options:
  --slug <slug>        The company profile the read belongs to
  --run-id <uuid>      The analysis run that owns the read
  --budget-usd <usd>   The spend cap reserved for the repair, in dollars
  --apply              Admit and dispatch the job. Needs NODE_ENV=production.
  --help               Show this help`;

// The same shape the extension route accepts, so a slug that cannot be served is refused here
// rather than at the database.
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const OPERATOR: AlphaPrincipal = {
  kind: "operator",
  installationId: null,
  inviteId: null,
  scopes: ["cards:read", "generation:write"]
};

export type RepairArguments = {
  slug: string;
  runId: string;
  budgetUsd: string;
  capMicrodollars: number;
  apply: boolean;
};

export type RepairReportInput =
  | {
      mode: "inspect";
      runId: string;
      runStatus: string | null;
      historicalStatus: string | null;
      profilePresent: boolean;
      analysisPresent: boolean;
      evaluatorCurrent: boolean;
      capMicrodollars: number;
      latestJob: { id: string; status: string; reasonCode: string | null } | null;
    }
  | {
      mode: "apply";
      state: string;
      jobId: string;
      dispatched: boolean;
      capMicrodollars: number;
    };

export function parseRepairArguments(argv: readonly string[]): RepairArguments {
  const args = parseCliArguments(argv);
  const slug = requiredValue(args, "--slug");
  if (!SLUG_PATTERN.test(slug) || slug.length > 120) {
    throw new Error("--slug must be lowercase letters, digits, and single dashes, such as acme-labs.");
  }
  const runId = requiredValue(args, "--run-id");
  if (!UUID_PATTERN.test(runId)) {
    throw new Error("--run-id must be the analysis run's uuid.");
  }
  const budgetUsd = requiredValue(args, "--budget-usd");
  const capMicrodollars = howItWinsJobBudgetMicrodollars(budgetUsd);
  if (capMicrodollars === null) {
    throw new Error("--budget-usd must be a dollar amount above zero and no more than 10, such as 2.50.");
  }
  return { slug, runId, budgetUsd, capMicrodollars, apply: hasFlag(args, "--apply") };
}

export function repairReport(input: RepairReportInput) {
  if (input.mode === "apply") {
    return {
      apply: true,
      state: input.state,
      jobId: input.jobId,
      dispatched: input.dispatched,
      capMicrodollars: input.capMicrodollars
    };
  }
  return {
    apply: false,
    sourceAnalysisRunId: input.runId,
    runStatus: input.runStatus,
    historicalStatus: input.historicalStatus,
    profilePresent: input.profilePresent,
    analysisPresent: input.analysisPresent,
    evaluatorCurrent: input.evaluatorCurrent,
    capMicrodollars: input.capMicrodollars,
    latestJob: input.latestJob
  };
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  if (argv.includes("--help")) {
    console.log(HELP);
    return;
  }
  const parsed = parseRepairArguments(argv);
  if (parsed.apply && process.env.NODE_ENV !== "production") {
    throw new Error("Set NODE_ENV=production before dispatching the production Inngest event.");
  }
  loadProductionEnv();

  try {
    await withAlphaDb(async (db) => {
      if (!parsed.apply) {
        const run = await findGenerationRunById(db, parsed.runId);
        const card = await findCardBySlug(db, parsed.slug, { allowStale: true });
        const job = await findLatestHowItWinsJobBySlug(db, parsed.slug);
        console.log(JSON.stringify(repairReport({
          mode: "inspect",
          runId: parsed.runId,
          runStatus: run?.status ?? null,
          historicalStatus: run?.traceJson?.howItWins?.status ?? null,
          profilePresent: !!card,
          analysisPresent: !!card?.synthesis,
          evaluatorCurrent: card?.synthesis?.howItWinsEvaluator?.signature === howItWinsExecutionConfig().evaluator.signature,
          capMicrodollars: parsed.capMicrodollars,
          latestJob: job ? { id: job.id, status: job.status, reasonCode: job.reasonCode ?? null } : null
        })));
        return;
      }
      const admitted = await requestOperatorHowItWinsRepair(db, OPERATOR, {
        slug: parsed.slug,
        sourceAnalysisRunId: parsed.runId,
        capMicrodollars: parsed.capMicrodollars
      });
      // The job row exists before the event is sent, so a lost acknowledgement cannot admit a
      // second paid job. A job that is already running was joined, and nothing is sent for it.
      const dispatched = admitted.job.status === "queued"
        ? await dispatchHowItWinsJob(db, admitted.job)
        : false;
      console.log(JSON.stringify(repairReport({
        mode: "apply",
        state: admitted.state,
        jobId: admitted.job.id,
        dispatched,
        capMicrodollars: admitted.job.configuredCapMicrodollars
      })));
    });
  } catch (error) {
    throw new Error(`How it wins repair stopped: ${safeError(error).split("\n")[0]}`);
  }
}

runCli(import.meta.url, main);
