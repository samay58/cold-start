import type { GenerationFailureCode } from "@cold-start/core";

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
  ["model_contract", /\b(zod|schema|tool use|model contract|synthesis claim|citationids|validation)\b/i],
  ["provider_unavailable", /\b(provider unavailable|no accepted provider|wallet exhausted|insufficient_balance|upstream 404)\b/i],
  ["evidence_insufficiency", /\b(insufficient evidence|evidence floor|underfilled|structured facts)\b/i]
];

export function generationFailureCode(error: unknown): GenerationFailureCode {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return classifiers.find(([, pattern]) => pattern.test(message))?.[0] ?? "unknown";
}
