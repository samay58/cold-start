import { z } from "zod";

export const generationFailureCodeSchema = z.enum([
  "evidence_insufficiency",
  "provider_unavailable",
  "model_contract",
  "concurrent_write",
  "timeout",
  "authentication",
  "allowance_exhausted",
  "unknown"
]);

export type GenerationFailureCode = z.infer<typeof generationFailureCodeSchema>;
