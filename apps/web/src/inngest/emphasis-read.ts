import {
  companyAuthoredQuality,
  emphasisSourceDigests,
  founderAuthoredQuality,
  type Citation,
  type ColdStartCard,
  type EmphasisRead
} from "@cold-start/core";
import { createAnthropicClient, isTransientLlmError, synthesizeEmphasisRead, type AnthropicTelemetrySink } from "@cold-start/llm";
import { fetchFounderVoiceEvidence, type FounderVoiceItem, type FounderVoiceTargets, type ProviderSource } from "@cold-start/providers";
import { boundedErrorMessage } from "../lib/errors";
import type { FounderVoiceEnv } from "./worker-env";

const FOUNDER_VOICE_SNIPPET_MAX_LENGTH = 240;

function sourceTypeForFounderVoiceItem(item: FounderVoiceItem): Citation["sourceType"] {
  return item.lane === "github_author_activity" ? "github" : "other";
}

// Maps the card's founders (name plus any known X/GitHub handle) into the shape the
// founder-voice lanes search against. A founder with neither handle still contributes a
// name-only target: the HN, Bluesky, and xAI lanes search by name.
export function founderVoiceTargetsFromCard(card: ColdStartCard): FounderVoiceTargets {
  const founders = card.team.founders.value ?? [];
  return {
    companyName: card.identity.name.value ?? card.domain,
    domain: card.domain,
    founders: founders.map((founder) => ({
      name: founder.name,
      xUrl: founder.xUrl ?? null,
      githubUrl: founder.githubUrl ?? null
    }))
  };
}

// Stamps authorship into sourceQuality (founder_authored or primary_company) so the emphasis
// digests and the rest of the card treat this evidence with the same tier discipline as any
// other citation; a third_party item is left unstamped, same as every other citation whose
// authority is derived downstream (sourceQualityForSource) rather than known at fetch time.
export function founderVoiceCitations(items: FounderVoiceItem[]): Citation[] {
  const fetchedAt = new Date().toISOString();
  return items.map((item, index) => ({
    id: `fv${index + 1}`,
    url: item.url,
    title: item.title,
    fetchedAt,
    sourceType: sourceTypeForFounderVoiceItem(item),
    snippet: item.text.slice(0, FOUNDER_VOICE_SNIPPET_MAX_LENGTH),
    ...(item.authorship === "founder" ? { sourceQuality: founderAuthoredQuality() } : {}),
    ...(item.authorship === "company" ? { sourceQuality: companyAuthoredQuality() } : {})
  }));
}

export function founderVoiceProviderSources(items: FounderVoiceItem[]): ProviderSource[] {
  const fetchedAt = new Date().toISOString();
  return items.map((item) => ({
    url: item.url,
    title: item.title,
    sourceType: sourceTypeForFounderVoiceItem(item),
    fetchedAt,
    rawText: item.text,
    ...(item.publishedAt ? { publishedAt: item.publishedAt } : {})
  }));
}

export type FetchFounderVoiceStepValue = {
  sources: ProviderSource[];
  citations: Citation[];
  laneCounts: Record<string, number>;
  laneFailures: string[];
  estimatedCostUsd: number;
};

// Lane failures are data, not throws: fetchFounderVoiceEvidence already tolerates any lane
// failing internally (Promise.allSettled), so this step body never needs its own try/catch. A
// throw here would only happen for a programming error, which should fail the step for real.
export async function fetchFounderVoiceStepBody(input: {
  card: ColdStartCard;
  env: FounderVoiceEnv;
}): Promise<FetchFounderVoiceStepValue> {
  const targets = founderVoiceTargetsFromCard(input.card);
  const evidence = await fetchFounderVoiceEvidence({ targets, env: input.env });

  const laneCounts: Record<string, number> = {};
  const laneFailures: string[] = [];
  for (const laneResult of evidence.laneResults) {
    laneCounts[laneResult.lane] = laneResult.items.length;
    if (laneResult.failure) {
      laneFailures.push(`${laneResult.lane}: ${laneResult.failure}`);
    }
  }

  return {
    sources: founderVoiceProviderSources(evidence.items),
    citations: founderVoiceCitations(evidence.items),
    laneCounts,
    laneFailures,
    estimatedCostUsd: evidence.estimatedCostUsd
  };
}

export type EmphasisReadStepResult = { ok: true; value: EmphasisRead } | { ok: false; error: string };

// Same catch-and-memoize pattern as synthesizeCardStepBody (generation-helpers.ts): a transient
// transport failure rethrows so Inngest retries the step; a semantic failure (schema mismatch,
// a citation that never made it onto the card) is memoized as { ok: false } so a later retry
// never re-pays for the call. Callers degrade a semantic failure to nothing_notable rather than
// failing the run: the emphasis read is a bonus category, never a reason to fail analysis.
export async function emphasisReadStepBody(input: {
  card: ColdStartCard;
  client: ReturnType<typeof createAnthropicClient>;
  model: string;
  telemetry: AnthropicTelemetrySink;
}): Promise<EmphasisReadStepResult> {
  try {
    const digests = emphasisSourceDigests(input.card);
    const value = await synthesizeEmphasisRead({
      client: input.client,
      model: input.model,
      card: input.card,
      digests,
      telemetry: input.telemetry
    });
    return { ok: true, value };
  } catch (error) {
    if (isTransientLlmError(error)) {
      throw error;
    }
    return { ok: false, error: boundedErrorMessage(error) };
  }
}
