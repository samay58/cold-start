import { parseArgs } from "node:util";
import { createDb, findCardBySlug, findGenerationRunById } from "@cold-start/db";
import { loadProductionEnv } from "./alpha-common";
import { dispatchHowItWinsJob, requestLegacyColumnHowItWins } from "../apps/web/src/inngest/how-it-wins-jobs";
import { howItWinsBudgetMicrodollars } from "../apps/web/src/inngest/how-it-wins-budget";

async function main() {
  const { values } = parseArgs({ options: { "legacy-column": { type: "boolean" }, "budget-usd": { type: "string" }, apply: { type: "boolean" } } });
  if (!values["legacy-column"] || !values["budget-usd"]) throw new Error("Pass --legacy-column and an explicitly reserved --budget-usd cap. Add --apply to dispatch.");
  if (values.apply && process.env.NODE_ENV !== "production") throw new Error("Set NODE_ENV=production before dispatching the production Inngest event.");
  loadProductionEnv();
  const cap = howItWinsBudgetMicrodollars(values["budget-usd"]);
  const db = createDb(process.env.DATABASE_URL!);
  if (!values.apply) {
    const run = await findGenerationRunById(db, "8d70f327-90fd-4dfb-8691-bc8056370886");
    const card = await findCardBySlug(db, "column", { allowStale: true });
    console.log(JSON.stringify({ apply: false, sourceAnalysisRunId: run?.id, historicalStatus: run?.traceJson?.howItWins?.status,
      profilePresent: !!card, analysisPresent: !!card?.synthesis, capMicrodollars: cap }));
  } else {
    const result = await requestLegacyColumnHowItWins(db, { kind: "operator", installationId: null, inviteId: null,
      scopes: ["cards:read", "generation:write"] }, cap);
    const dispatched = await dispatchHowItWinsJob(db, result.job);
    console.log(JSON.stringify({ state: result.state, jobId: result.job.id, dispatched, capMicrodollars: result.job.configuredCapMicrodollars }));
  }
}

main().catch(() => {
  console.error("How it wins recovery could not be admitted. Check the command arguments, configuration, and saved job state.");
  process.exitCode = 1;
});
