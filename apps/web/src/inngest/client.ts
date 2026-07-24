import { Inngest } from "inngest";
import type { GetStepTools } from "inngest";

export const inngest = new Inngest({
  id: "cold-start",
  isDev: process.env.INNGEST_DEV === "1" || process.env.NODE_ENV !== "production"
});

export type GenerationStepWarning = {
  stepId: string;
  message: string;
};

// The subset of Inngest's step tooling the generate-card and card-enrichment handlers use.
// Narrowed so the same handler bodies run against either executor: Inngest's durable step
// tools, or the inline in-process executor in inline-dispatch.ts. Handlers needing more
// (contact enrichment uses step.sleep) type their context off Inngest directly.
//
// stepWarnings is the inline executor's channel for failures it swallowed. Inngest's own tools
// fail the step, so the trace already records those; inline swallows a failed enrichment dispatch
// to keep the run's stored card, and without this the trace would claim the dispatch completed.
// The handler reads the array rather than registering a callback because the tools are built
// before the handler creates its trace, and because Inngest's step object must stay untouched.
export type GenerationStepTools = Pick<GetStepTools<typeof inngest>, "run" | "sendEvent"> & {
  stepWarnings?: readonly GenerationStepWarning[] | undefined;
};

export type WorkerEventContext = {
  event: { id?: string; ts?: number; data: Record<string, unknown> };
  runId: string;
  step: GenerationStepTools;
};
