import type { GenerationTrace } from "@cold-start/core";

export type GenerationCostBreakdown = {
  agentcashAccountingStatus: "receipts_complete" | "receipts_partial" | "legacy_wallet_delta" | "not_recorded";
  incompleteAgentcashAccounting: boolean;
  agentcashReceiptUsd: number | null;
  walletDeltaCrossCheckUsd: number | null;
  llmUsd: number | null;
  directExaEstimatedUsd: number | null;
  founderVoiceEstimatedUsd: number | null;
  websetsEstimatedUsd: number | null;
  totalUsd: number | null;
};

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function generationCostBreakdown(
  trace: GenerationTrace | null | undefined,
  storedLlmCostUsd?: string | number | null
): GenerationCostBreakdown {
  const stableenrich = trace?.providers?.stableenrich;
  const accountingStatus = stableenrich?.accountingStatus ?? "not_recorded";
  const incompleteAgentcashAccounting = accountingStatus === "receipts_partial";
  const agentcashReceiptUsd = incompleteAgentcashAccounting
    ? null
    : finiteNumber(trace?.costUsdAgentcash) ?? finiteNumber(stableenrich?.receiptCostUsd);
  const walletDeltaCrossCheckUsd = finiteNumber(stableenrich?.walletDeltaUsd);
  const parsedStoredLlmCost = storedLlmCostUsd === null || storedLlmCostUsd === undefined
    ? null
    : Number(storedLlmCostUsd);
  const llmUsd = Number.isFinite(parsedStoredLlmCost)
    ? parsedStoredLlmCost
    : finiteNumber(trace?.costUsdAnthropic) ?? finiteNumber(trace?.llm?.totalEstimatedCostUsd);
  const directExaEstimatedUsd = finiteNumber(trace?.providers?.directExa?.estimatedCostUsd);
  const founderVoiceEstimatedUsd = finiteNumber(trace?.emphasis?.estimatedLaneCostUsd);
  const websetsEstimatedUsd = finiteNumber(trace?.providers?.websets?.estimatedCostUsd);
  const streams = [agentcashReceiptUsd, llmUsd, directExaEstimatedUsd, founderVoiceEstimatedUsd, websetsEstimatedUsd]
    .filter((value): value is number => value !== null);

  return {
    agentcashAccountingStatus: accountingStatus,
    incompleteAgentcashAccounting,
    agentcashReceiptUsd,
    walletDeltaCrossCheckUsd,
    llmUsd,
    directExaEstimatedUsd,
    founderVoiceEstimatedUsd,
    websetsEstimatedUsd,
    totalUsd: incompleteAgentcashAccounting || streams.length === 0
      ? null
      : Number(streams.reduce((total, value) => total + value, 0).toFixed(6))
  };
}
