import { Inngest } from "inngest";
import type { GetStepTools } from "inngest";

export const inngest = new Inngest({
  id: "cold-start",
  isDev: process.env.INNGEST_DEV === "1" || process.env.NODE_ENV !== "production"
});

// The subset of Inngest's step tooling the generate-card and card-enrichment handlers use.
// Narrowed so the same handler bodies run against either executor: Inngest's durable step
// tools, or the inline in-process executor in inline-dispatch.ts. Handlers needing more
// (contact enrichment uses step.sleep) type their context off Inngest directly.
export type GenerationStepTools = Pick<GetStepTools<typeof inngest>, "run" | "sendEvent">;

export type WorkerEventContext = {
  event: { id?: string; ts?: number; data: Record<string, unknown> };
  runId: string;
  step: GenerationStepTools;
};
