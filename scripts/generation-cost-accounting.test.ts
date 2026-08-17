import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { GenerationTrace } from "@cold-start/core";

import { generationCostBreakdown } from "./generation-cost-accounting";

describe("generation cost accounting", () => {
  it("keeps exact receipts separate and uses the wallet delta only as a cross-check", () => {
    const trace: GenerationTrace = {
      jobKind: "basics",
      mode: "basics",
      costUsdAgentcash: 0.06,
      costUsdAnthropic: 0.04,
      providers: {
        stableenrich: {
          sourceCount: 1,
          failureCount: 0,
          accountingStatus: "receipts_complete",
          receiptCostUsd: 0.06,
          walletDeltaUsd: 0.14
        },
        directExa: { skipped: false, sourceCount: 1, failureCount: 0, estimatedCostUsd: 0.007 }
      },
      emphasis: { estimatedLaneCostUsd: 0.014 }
    };

    assert.deepEqual(generationCostBreakdown(trace), {
      agentcashAccountingStatus: "receipts_complete",
      incompleteAgentcashAccounting: false,
      agentcashReceiptUsd: 0.06,
      walletDeltaCrossCheckUsd: 0.14,
      llmUsd: 0.04,
      directExaEstimatedUsd: 0.007,
      founderVoiceEstimatedUsd: 0.014,
      websetsEstimatedUsd: null,
      totalUsd: 0.121
    });
  });

  it("withholds the total when any AgentCash call lacks settlement", () => {
    const trace: GenerationTrace = {
      jobKind: "basics",
      mode: "basics",
      costUsdAnthropic: 0.04,
      providers: {
        stableenrich: {
          sourceCount: 1,
          failureCount: 0,
          accountingStatus: "receipts_partial",
          receiptCostUsd: 0.01,
          walletDeltaUsd: 0.03,
          unreceiptedCallCount: 1
        }
      }
    };

    const result = generationCostBreakdown(trace);
    assert.equal(result.incompleteAgentcashAccounting, true);
    assert.equal(result.agentcashReceiptUsd, null);
    assert.equal(result.walletDeltaCrossCheckUsd, 0.03);
    assert.equal(result.totalUsd, null);
  });

  it("prefers the complete traced LLM total over stale summary fields", () => {
    const trace: GenerationTrace = {
      jobKind: "basics",
      mode: "basics",
      costUsdAnthropic: 0.04,
      llm: { calls: [], totalEstimatedCostUsd: 0.05 }
    };

    const result = generationCostBreakdown(trace, 0.01);

    assert.equal(result.llmUsd, 0.05);
    assert.equal(result.totalUsd, 0.05);
  });
});
