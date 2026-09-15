import type { Message, MessageCreateParamsNonStreaming } from "@anthropic-ai/sdk/resources/messages";
import type { LlmRequestOptions } from "./llm-provider";

export type HowItWinsMessageExecutor = (
  request: { callId: string; model: string; params: MessageCreateParamsNonStreaming },
  invoke: (options: LlmRequestOptions) => Promise<Message>
) => Promise<Message>;
