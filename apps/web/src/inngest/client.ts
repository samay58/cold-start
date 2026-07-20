import { Inngest } from "inngest";
import type { GetStepTools } from "inngest";

export const inngest = new Inngest({ id: "cold-start" });

export type WorkerEventContext = {
  event: { id?: string; ts?: number; data: Record<string, unknown> };
  runId: string;
  step: GetStepTools<typeof inngest>;
};
