import { Inngest } from "inngest";
import type { GetStepTools } from "inngest";

export const inngest = new Inngest({
  id: "cold-start",
  isDev: process.env.INNGEST_DEV === "1" || process.env.NODE_ENV !== "production"
});

export type WorkerEventContext = {
  event: { id?: string; ts?: number; data: Record<string, unknown> };
  runId: string;
  step: GetStepTools<typeof inngest>;
};
