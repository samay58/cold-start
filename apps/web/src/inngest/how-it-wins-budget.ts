import { parseModelString } from "@cold-start/llm";
import type { HowItWinsJobReasonCode } from "@cold-start/core";

export class HowItWinsExecutionError extends Error {
  constructor(readonly reasonCode: HowItWinsJobReasonCode) {
    super(reasonCode);
    this.name = "HowItWinsExecutionError";
  }
}

// Maximum published rates, including a fresh one-hour Anthropic cache write.
// Verified September 14, 2026: platform.claude.com/docs/en/about-claude/pricing
// and api-docs.deepseek.com/quick_start/pricing. Unknown models fail admission.
const RATES: Record<string, { input: number; output: number }> = {
  "anthropic/claude-opus-5": { input: 10, output: 25 },
  "anthropic/claude-sonnet-4-6": { input: 6, output: 15 },
  "anthropic/claude-sonnet-5": { input: 4, output: 10 },
  "deepseek/deepseek-v4-pro": { input: 1.32, output: 3.96 },
  "deepseek/deepseek-v4-flash": { input: 0.3, output: 1.2 },
  "deepseek/deepseek-flash": { input: 0.3, output: 1.2 },
  "deepseek/deepseek-v4.1-flash": { input: 0.3, output: 1.2 }
};

export function howItWinsModelRates(model: string) {
  const resolved = parseModelString(model);
  const rates = RATES[`${resolved.provider}/${resolved.model}`];
  if (!rates) throw new HowItWinsExecutionError("authentication_configuration");
  return rates;
}

export function howItWinsBudgetMicrodollars(value = process.env.HOW_IT_WINS_JOB_BUDGET_USD) {
  if (!value || !/^\d+(?:\.\d{1,6})?$/.test(value)) {
    throw new HowItWinsExecutionError("authentication_configuration");
  }
  const amount = Math.round(Number(value) * 1_000_000);
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 10_000_000) {
    throw new HowItWinsExecutionError("authentication_configuration");
  }
  return amount;
}

export function howItWinsCallReservation(input: { model: string; input: unknown; maxOutputTokens: number }) {
  const rates = howItWinsModelRates(input.model);
  const bytes = Buffer.byteLength(JSON.stringify(input.input), "utf8");
  // Byte count bounds text tokens without relying on a model-specific tokenizer.
  // The extra allowance covers protocol and tool framing absent from the JSON.
  if (bytes > 512 * 1024) throw new HowItWinsExecutionError("input_limit");
  if (!Number.isSafeInteger(input.maxOutputTokens) || input.maxOutputTokens < 1 || input.maxOutputTokens > 50_000) {
    throw new HowItWinsExecutionError("authentication_configuration");
  }
  return Math.ceil((bytes + 4096) * rates.input + input.maxOutputTokens * rates.output);
}

export function howItWinsRequestDeadline(deadlineAt: Date, now = Date.now(), stageLimitMs = 240_000) {
  if (![deadlineAt.getTime(), now, stageLimitMs].every(Number.isFinite) || stageLimitMs <= 0) throw new HowItWinsExecutionError("authentication_configuration");
  const timeout = Math.min(240_000, stageLimitMs, deadlineAt.getTime() - now - 15_000);
  if (timeout <= 0) throw new HowItWinsExecutionError("deadline_expired");
  return { timeout, deadlineAt: now + timeout };
}
