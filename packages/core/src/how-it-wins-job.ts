import { z } from "zod";

export const howItWinsJobStatusSchema = z.enum([
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
  "superseded"
]);

export const howItWinsJobStageSchema = z.enum([
  "queued",
  "judge_initial",
  "judge_recovery",
  "critic",
  "adjudication",
  "writer",
  "verifier",
  "storage",
  "complete"
]);

export const howItWinsJobOutcomeSchema = z.enum([
  "read",
  "thin_file",
  "nothing_stands_out"
]);

export const howItWinsJobReasonCodeSchema = z.enum([
  "structured_output",
  "semantic_contract",
  "transient_provider",
  "authentication_configuration",
  "cancelled",
  "deadline_expired",
  "budget_exhausted",
  "input_limit",
  "stale_evidence",
  "stale_evaluator",
  "lease_lost",
  "internal_storage",
  "dispatch_unconfirmed",
  "superseded",
  "unknown"
]);

export const howItWinsJobSummarySchema = z.object({
  id: z.string().uuid(),
  status: howItWinsJobStatusSchema,
  stage: howItWinsJobStageSchema,
  reasonCode: howItWinsJobReasonCodeSchema.nullable(),
  canRetry: z.boolean(),
  updatedAt: z.string().datetime(),
  outcome: howItWinsJobOutcomeSchema.optional(),
  // Sent only to clients that ask for it: the 0.2.8 extension parses this object with a strict
  // schema, so an unrequested key would break every installed poll.
  deadlineAt: z.string().datetime().optional()
}).strict();

export const howItWinsJobStatusEnvelopeSchema = z.object({
  job: howItWinsJobSummarySchema.nullable()
}).strict();

export type HowItWinsJobStatus = z.infer<typeof howItWinsJobStatusSchema>;
export type HowItWinsJobStage = z.infer<typeof howItWinsJobStageSchema>;
export type HowItWinsJobOutcome = z.infer<typeof howItWinsJobOutcomeSchema>;
export type HowItWinsJobReasonCode = z.infer<typeof howItWinsJobReasonCodeSchema>;
export type HowItWinsJobSummary = z.infer<typeof howItWinsJobSummarySchema>;
export type HowItWinsJobStatusEnvelope = z.infer<typeof howItWinsJobStatusEnvelopeSchema>;
