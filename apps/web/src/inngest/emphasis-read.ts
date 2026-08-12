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
const FOUNDER_VOICE_CITATION_ID_PATTERN = /^fv(\d+)$/;

function sourceTypeForFounderVoiceItem(item: FounderVoiceItem): Citation["sourceType"] {
  return item.lane === "github_author_activity" ? "github" : "other";
}

export function isFounderVoiceCitationId(id: string): boolean {
  return FOUNDER_VOICE_CITATION_ID_PATTERN.test(id);
}

// Drops any fv-prefixed citation from a working card's citations before this run's fresh set is
// appended. A repeat analysis run can already carry fv citations from a prior run (extraction
// reuse spreads the existing card's citations wholesale), and founderVoiceCitations always
// numbers a fresh batch from 1: without this strip, the working card would carry two citations
// with the same id (stale content plus fresh content), and emphasisSourceDigests would feed the
// emphasis LLM two digests under one ambiguous label.
export function citationsWithoutFounderVoice(citations: Citation[]): Citation[] {
  return citations.filter((citation) => !isFounderVoiceCitationId(citation.id));
}

// The lowest fv index this run's fresh citations can safely use without colliding with any
// fv-prefixed id already in play. Scans every citation list passed in (the working card and,
// separately, the existing stored card) rather than just one: the working card's fv citations get
// stripped before storage merges it with the existing stored row (packages/db's mergeByKey,
// last-wins by id), so a stale fv id can resurface from the existing row alone even after the
// strip. Numbering fresh ids past every known index keeps a preserved-wholesale old
// synthesis.emphasisRead's citation refs pointing at their original content instead of getting
// silently overwritten by this run's unrelated fresh item at the same id.
export function nextFounderVoiceIndex(...citationLists: Array<Citation[] | undefined>): number {
  let max = 0;
  for (const citations of citationLists) {
    for (const citation of citations ?? []) {
      const match = FOUNDER_VOICE_CITATION_ID_PATTERN.exec(citation.id);
      if (match) {
        max = Math.max(max, Number(match[1]));
      }
    }
  }
  return max + 1;
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
// startIndex defaults to 1 (fv1..fvN) for a first run; a repeat run passes
// nextFounderVoiceIndex's result so fresh ids never collide with a prior run's.
export function founderVoiceCitations(items: FounderVoiceItem[], startIndex = 1): Citation[] {
  const fetchedAt = new Date().toISOString();
  return items.map((item, index) => ({
    id: `fv${startIndex + index}`,
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
  startIndex?: number;
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
    citations: founderVoiceCitations(evidence.items, input.startIndex ?? 1),
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
