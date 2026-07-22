import {
  companySlugFromDomain,
  isSynthesisOnlySectionId,
  researchSectionIdSchema,
  type ColdStartCard,
  type GenerationLlmCallTrace,
  type GenerationTrace,
  type ResearchSectionId
} from "@cold-start/core";
import {
  createAnthropicClient,
  isTransientLlmError,
  synthesizeCard,
  verifySynthesis,
  type AnthropicTelemetrySink
} from "@cold-start/llm";
import {
  GenerateCardTraceError,
  synthesizeCardDraft,
  verifyCardSynthesisDraft,
  type CostLine,
  type GenerateCardTracePatch,
  type SynthesisDraft
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

// Pure step bodies for the split synthesize/verify steps (Phase 4 Task 5.2). Each wraps its
// pipeline call in the same catch-and-memoize-as-value pattern already used for the generate-card
// step body (see runCardAttempt in functions.ts): an unusable synthesis result (bad schema, no
// surviving claims) becomes an `{ ok: false }` step output rather than a thrown error, so it is
// memoized once and a later function-level retry replays the failure without re-paying for the
// call. A transient transport failure (Anthropic 529/429, network) is the opposite case: re-thrown
// so Inngest retries the step itself on its own backoff schedule, rather than memoizing what would
// otherwise be a sustained outage as a permanent run failure. See isTransientLlmError
// (packages/llm/src/transient-error.ts) for the classification.
export type SynthesizeCardStepResult =
  | { ok: true; value: SynthesisDraft }
  | { ok: false; error: string };

export async function synthesizeCardStepBody(input: {
  card: ColdStartCard;
  client: ReturnType<typeof createAnthropicClient>;
  model: string;
  telemetry: AnthropicTelemetrySink;
}): Promise<SynthesizeCardStepResult> {
  try {
    const draft = await synthesizeCardDraft(input.card, {
      synthesize: (card) => synthesizeCard({ client: input.client, model: input.model, card, telemetry: input.telemetry })
    });
    return { ok: true, value: draft };
  } catch (error) {
    if (isTransientLlmError(error)) {
      throw error;
    }
    return { ok: false, error: boundedErrorMessage(error) };
  }
}

export type VerifySynthesisStepResult =
  | { ok: true; value: Awaited<ReturnType<typeof verifyCardSynthesisDraft>> }
  | { ok: false; error: string };

export async function verifySynthesisStepBody(input: {
  card: ColdStartCard;
  draft: SynthesisDraft;
  client: ReturnType<typeof createAnthropicClient>;
  model: string;
  telemetry: AnthropicTelemetrySink;
  synthesisRequired: boolean;
}): Promise<VerifySynthesisStepResult> {
  try {
    const result = await verifyCardSynthesisDraft(input.card, input.draft, {
      verify: (claims, sources) => verifySynthesis({ client: input.client, model: input.model, claims, sources, telemetry: input.telemetry }),
      synthesisRequired: input.synthesisRequired
    });
    return { ok: true, value: result };
  } catch (error) {
    if (isTransientLlmError(error)) {
      throw error;
    }
    return { ok: false, error: boundedErrorMessage(error) };
  }
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
