import {
  companySlugFromDomain,
  isSynthesisOnlySectionId,
  researchSectionIdSchema,
  type ColdStartCard,
  type GenerationLlmCallTrace,
  type GenerationTrace,
  type ResearchSectionId
} from "@cold-start/core";
import { type AnthropicTelemetrySink } from "@cold-start/llm";
import {
  GenerateCardTraceError,
  type CostLine,
  type GenerateCardTracePatch
} from "@cold-start/pipeline";
import { type ProviderSource, agentcashWalletSnapshot } from "@cold-start/providers";
import { canonicalCompanyDomain } from "../lib/domain";
import { boundedErrorMessage } from "../lib/errors";
import { anthropicGenerationCostUsdFromTrace, llmTracePatchFromCalls } from "./generation-trace";

export type GenerationMode = "basics" | "analysis";
type TimedResult<T> = { durationMs: number; value: T };

export function generationModeForRun(input: unknown): GenerationMode {
  if (input === undefined || input === null || input === "") {
    return "basics";
  }
  if (input === "basics" || input === "analysis") {
    return input;
  }

  throw new Error(`invalid generation mode: ${String(input).slice(0, 80)}`);
}

export async function timed<T>(fn: () => Promise<T> | T): Promise<TimedResult<T>> {
  const startedAt = Date.now();
  const value = await fn();
  return { durationMs: Date.now() - startedAt, value };
}

export async function safeAgentcashWalletSnapshot() {
  try {
    return {
      ok: true as const,
      snapshot: await agentcashWalletSnapshot()
    };
  } catch (error) {
    return {
      ok: false as const,
      error: boundedErrorMessage(error)
    };
  }
}

export function generateErrorTracePatch(error: unknown): GenerateCardTracePatch {
  return error instanceof GenerateCardTraceError ? error.tracePatch : {};
}

export function rawDomainForRun(input: unknown): string {
  if (typeof input !== "string" || input.trim().length === 0) {
    return "invalid-domain";
  }

  return input.trim().slice(0, 253);
}

function costLineForLlmCall(call: GenerationLlmCallTrace): CostLine | null {
  if (call.estimatedCostUsd !== undefined && call.estimatedCostUsd > 0) {
    return {
      label: `anthropic:${call.stage}:${call.label}:${call.model}`,
      usd: call.estimatedCostUsd
    };
  }

  return null;
}

export function createStepLlmTelemetryCollector() {
  const calls: GenerationLlmCallTrace[] = [];
  const costLines: CostLine[] = [];
  const telemetry: AnthropicTelemetrySink = (call) => {
    calls.push(call);
    const costLine = costLineForLlmCall(call);
    if (costLine) {
      costLines.push(costLine);
    }
  };

  return {
    telemetry,
    costLines,
    tracePatch: () => llmTracePatchFromCalls(calls)
  };
}

export function generationRunAnthropicCostUsd(trace: GenerationTrace, fallback = 0) {
  // generation_runs.cost_usd is the estimated Anthropic generation cost. Observed AgentCash spend
  // stays in trace.costUsdAgentcash / trace.providers.stableenrich.walletDeltaUsd.
  return anthropicGenerationCostUsdFromTrace(trace) ?? fallback;
}

export function cardWithTraceCost(card: ColdStartCard, trace: GenerationTrace) {
  const costUsd = anthropicGenerationCostUsdFromTrace(trace);
  return costUsd === undefined ? card : { ...card, generationCostUsd: costUsd };
}

const progressSourceCategoryOrder = [
  "company site",
  "docs",
  "funding coverage",
  "product page",
  "people source",
  "customer proof",
  "filing",
  "news",
  "database"
] as const;

type ProgressSourceCategory = typeof progressSourceCategoryOrder[number];

function sourceTextForProgress(source: ProviderSource) {
  return `${source.url} ${source.title} ${source.rawText ?? ""}`.toLowerCase();
}

function progressCategoryForSource(source: ProviderSource): ProgressSourceCategory | null {
  const text = sourceTextForProgress(source);

  if (source.sourceType === "company_site") {
    if (/\bdocs?\b|documentation|developer|api reference|quickstart|guide/.test(text)) {
      return "docs";
    }
    if (/\bproduct\b|\bpricing\b|\bplatform\b|\bapi\b/.test(text)) {
      return "product page";
    }
    return "company site";
  }

  if (source.sourceType === "news") {
    if (/\bfunding\b|\braised\b|series [a-z]\b|\bround\b|\binvestors?\b|\bvaluation\b/.test(text)) {
      return "funding coverage";
    }
    return "news";
  }

  if (source.sourceType === "filing") {
    return "filing";
  }

  if (source.sourceType === "github") {
    return "product page";
  }

  if (source.sourceType === "enrichment" || source.sourceType === "rdap") {
    return "database";
  }

  return null;
}

export function progressSourceCategories(sources: ProviderSource[]) {
  const categories = new Set<ProgressSourceCategory>();

  for (const source of sources) {
    const category = progressCategoryForSource(source);
    if (category) {
      categories.add(category);
    }
  }

  return progressSourceCategoryOrder.filter((category) => categories.has(category));
}

export function sourceEventDomain(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function stringValue(input: unknown): string | null {
  return typeof input === "string" && input.trim().length > 0 ? input.trim() : null;
}

export function rawSlugForRun(input: unknown, domainInput?: unknown): string {
  if (typeof input !== "string" || input.trim().length === 0) {
    if (typeof domainInput === "string" && domainInput.trim().length > 0) {
      try {
        return companySlugFromDomain(canonicalCompanyDomain(domainInput)).slice(0, 120);
      } catch {
        return "unknown";
      }
    }

    return "unknown";
  }

  return input.trim().slice(0, 120);
}

export function parseEventSectionId(input: unknown): ResearchSectionId | null {
  if (input === undefined || input === null || input === "") {
    return null;
  }

  const parsed = researchSectionIdSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(`invalid research section id: ${String(input).slice(0, 80)}`);
  }

  if (isSynthesisOnlySectionId(parsed.data)) {
    throw new Error(`section ${parsed.data} renders from synthesis and cannot run as a standalone section job`);
  }

  return parsed.data;
}
