import { z } from "zod";

export const generationFailureCodeSchema = z.enum([
  "evidence_insufficiency",
  "provider_unavailable",
  "storage_unavailable",
  "model_contract",
  "concurrent_write",
  "timeout",
  "authentication",
  "allowance_exhausted",
  "unknown"
]);

export type GenerationFailureCode = z.infer<typeof generationFailureCodeSchema>;

const classifiers: Array<[GenerationFailureCode, RegExp]> = [
  ["allowance_exhausted", /\ballowance\b.*\b(exhausted|limit|remaining)\b/i],
  // Bare "token" alone is too broad: LLM errors like "output token limit reached" or
  // "max_tokens exceeded" contain it but are model/limit failures, not auth failures. Only match
  // "token" in auth-shaped phrasing (invalid/expired/bearer token, token invalid/expired/missing).
  [
    "authentication",
    /\b(auth|authentication|authorization|identity|credential)\b|\bx-api-key\b|\b(?:bearer|invalid|expired|revoked|missing)\s+token\b|\btoken\s+(?:invalid|expired|revoked|missing|required)\b/i
  ],
  ["concurrent_write", /\b(concurrent write|concurrent card|optimistic conflict|after concurrent writes)\b/i],
  ["timeout", /\b(timeout|timed out|went silent|watchdog)\b/i],
  // "Failed query:" is drizzle's error prefix for any Postgres statement that died (the Neon
  // outage class); classified before model_contract so a DB error mentioning "validation" or
  // "schema" cannot land in the wrong bucket.
  ["storage_unavailable", /\b(failed query|econnrefused|connection terminated)\b/i],
  [
    "model_contract",
    /\b(zod|schema|tool use|model contract|synthesis claim|citationids|validation)\b|\bunexpected (?:non-whitespace|token|end of json)\b/i
  ],
  [
    "provider_unavailable",
    /\b(provider unavailable|no accepted provider|wallet exhausted|insufficient[_ ](?:balance|quota|credits?)|credit balance is too low|billing quota (?:has been )?exceeded|upstream 404)\b/i
  ],
  ["evidence_insufficiency", /\b(insufficient evidence|evidence floor|underfilled|structured facts)\b/i]
];

export function generationFailureCode(error: unknown): GenerationFailureCode {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return classifiers.find(([, pattern]) => pattern.test(message))?.[0] ?? "unknown";
}
