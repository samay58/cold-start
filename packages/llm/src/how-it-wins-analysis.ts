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
}): Promise<HowItWinsJudgment> {
  const packet = howItWinsEvidencePacketFromCard(input.card);
  const rules = loadHowItWinsJudgeRules();
  const adapterFor = (model: string) => createHowItWinsJudgeModelAdapter({
    client: input.client,
    model,
    ...(input.telemetry ? { telemetry: input.telemetry } : {})
  });
  const judge = createHowItWinsJudge({
    scopes: [],
    rules,
    providers: {
      strong: parseModelString(input.models.judge).provider,
      critic: parseModelString(input.models.editor).provider
    },
    adapters: {
      strong: adapterFor(input.models.judge),
      scout: adapterFor(input.models.judge),
      critic: adapterFor(input.models.editor)
    }
  });
  return judge({
    evidencePacket: packet,
    evidencePacketHash: hashHowItWinsJudgeValue(packet),
    vocabulary: HOW_IT_WINS_STRATEGIES,
    vocabularyHash: hashHowItWinsJudgeValue(HOW_IT_WINS_STRATEGIES),
    promptHash: howItWinsJudgePromptHash(rules)
  });
}
