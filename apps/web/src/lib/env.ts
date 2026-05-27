import { z } from "zod";

const envBoolean = (defaultValue: boolean) =>
  z.preprocess((value) => {
    if (value === undefined || value === null || value === "") {
      return defaultValue;
    }

    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (["1", "true", "yes", "on"].includes(normalized)) {
        return true;
      }
      if (["0", "false", "no", "off"].includes(normalized)) {
        return false;
      }
    }

    return value;
  }, z.boolean());

const optionalEnvNumber = (minimum = 0) =>
  z.preprocess((value) => {
    if (value === undefined || value === null || value === "") {
      return undefined;
    }
    if (typeof value === "string") {
      return Number(value);
    }
    return value;
  }, z.number().min(minimum).optional());

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  NEXT_PUBLIC_WEB_ORIGIN: z.string().url(),
  INNGEST_EVENT_KEY: z.string().min(1).optional(),
  INNGEST_SIGNING_KEY: z.string().min(1).optional(),
  CONTACT_ENRICHMENT_ENABLED: envBoolean(true),
  CONTACT_ENRICHMENT_TIER: z.enum(["named-only", "full", "off"]).default("named-only"),
  CHEAP_FIRST_EXA_ENABLED: envBoolean(true),
  PER_RUN_AGENTCASH_BUDGET_USD: optionalEnvNumber(),
});

export function webEnv() {
  return envSchema.parse({
    DATABASE_URL: process.env.DATABASE_URL,
    NEXT_PUBLIC_WEB_ORIGIN: process.env.NEXT_PUBLIC_WEB_ORIGIN?.trim() || "http://localhost:3000",
    INNGEST_EVENT_KEY: process.env.INNGEST_EVENT_KEY,
    INNGEST_SIGNING_KEY: process.env.INNGEST_SIGNING_KEY,
    CONTACT_ENRICHMENT_ENABLED: process.env.CONTACT_ENRICHMENT_ENABLED,
    CONTACT_ENRICHMENT_TIER: process.env.CONTACT_ENRICHMENT_TIER,
    CHEAP_FIRST_EXA_ENABLED: process.env.CHEAP_FIRST_EXA_ENABLED,
    PER_RUN_AGENTCASH_BUDGET_USD: process.env.PER_RUN_AGENTCASH_BUDGET_USD,
  });
}
