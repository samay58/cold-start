import type { AnthropicUsage } from "./call-trace";

export class OpenAiCompatHttpError extends Error {
  readonly status: number;
  readonly responseId?: string;
  readonly responseModel?: string;
  readonly servingProvider?: string;
  readonly estimatedCostUsd?: number;
  readonly usage?: AnthropicUsage;

  constructor(input: {
    status: number;
    message: string;
    responseId?: string;
    responseModel?: string;
    servingProvider?: string;
    estimatedCostUsd?: number;
    usage?: AnthropicUsage;
  }) {
    super(input.message);
    this.name = "OpenAiCompatHttpError";
    this.status = input.status;
    if (input.responseId) this.responseId = input.responseId;
    if (input.responseModel) this.responseModel = input.responseModel;
    if (input.servingProvider) this.servingProvider = input.servingProvider;
    if (input.estimatedCostUsd !== undefined) this.estimatedCostUsd = input.estimatedCostUsd;
    if (input.usage) this.usage = input.usage;
  }
}
