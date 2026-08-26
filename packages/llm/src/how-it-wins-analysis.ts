import type Anthropic from "@anthropic-ai/sdk";
import { HOW_IT_WINS_STRATEGIES, type ColdStartCard, type HowItWinsJudgment } from "@cold-start/core";

import type { AnthropicTelemetrySink } from "./anthropic";
import { createHowItWinsJudgeModelAdapter } from "./how-it-wins-judge-adapter";
import {
  createHowItWinsJudge,
  hashHowItWinsJudgeValue,
  howItWinsJudgePromptHash
} from "./how-it-wins-judge";
import { howItWinsEvidencePacketFromCard, loadHowItWinsJudgeRules } from "./how-it-wins-judge-rules";
import { parseModelString } from "./llm-provider";
import type { HowItWinsModels } from "./how-it-wins";

export async function judgeHowItWinsForAnalysis(input: {
  card: ColdStartCard;
  client: Anthropic;
  models: HowItWinsModels;
  telemetry?: AnthropicTelemetrySink;
  // Default true (undefined means on). False skips the critic and adjudication passes; see
  // createHowItWinsJudge.
  refinement?: boolean;
}): Promise<HowItWinsJudgment> {
  const packet = howItWinsEvidencePacketFromCard(input.card);
  const rules = loadHowItWinsJudgeRules();
  const adapterFor = (model: string) => createHowItWinsJudgeModelAdapter({
    client: input.client,
    model,
    ...(input.telemetry ? { telemetry: input.telemetry } : {})
  });
  const judge = createHowItWinsJudge({
    rules,
    providers: {
      strong: parseModelString(input.models.judge).provider,
      critic: parseModelString(input.models.editor).provider
    },
    adapters: {
      strong: adapterFor(input.models.judge),
      critic: adapterFor(input.models.editor)
    },
    ...(input.refinement === undefined ? {} : { refinement: input.refinement })
  });
  return judge({
    evidencePacket: packet,
    evidencePacketHash: hashHowItWinsJudgeValue(packet),
    vocabulary: HOW_IT_WINS_STRATEGIES,
    vocabularyHash: hashHowItWinsJudgeValue(HOW_IT_WINS_STRATEGIES),
    promptHash: howItWinsJudgePromptHash(rules, { refinement: input.refinement })
  });
}
