import {
  clusterSignals,
  hasUsablePublicProfile,
  publicProfileQuality,
  type ColdStartCard,
  type GenerationTrace,
  type ResolvedFact
} from "@cold-start/core";
import { mutateCard, type CardWriteOptions, type ColdStartDb } from "@cold-start/db";
import { citationIdsReferencedIn, citationsPrunedToReferencedFounderVoice } from "./emphasis-read";

type GenerationMode = "basics" | "analysis";
type CardPerson = NonNullable<ColdStartCard["team"]["founders"]["value"]>[number];
type CardMergeOptions = {
  preferExisting?: boolean;
  preserveAnalysis?: boolean;
};

function preserveFact<T>(existing: ResolvedFact<T>, next: ResolvedFact<T>): ResolvedFact<T> {
  return next.value === null && existing.value !== null ? existing : next;
}

function preserveOptionalFact<T>(
  existing: ResolvedFact<T> | undefined,
  next: ResolvedFact<T> | undefined,
): ResolvedFact<T> | undefined {
  if (!next) {
    return existing;
  }
  if (!existing) {
    return next;
  }
  return next.value === null && existing.value !== null ? existing : next;
}

function mergePeopleFact(
  existing: ResolvedFact<CardPerson[]>,
  next: ResolvedFact<CardPerson[]>,
  preferExisting: boolean
): ResolvedFact<CardPerson[]> {
  if (!existing.value?.length) {
    return next;
  }
  if (!next.value?.length) {
    return existing;
  }

  const people = new Map(existing.value.map((person) => [person.name.trim().toLowerCase(), person]));
  for (const person of next.value) {
    const key = person.name.trim().toLowerCase();
    const current = people.get(key);
    if (!current) {
      people.set(key, person);
      continue;
    }

    const preferred = preferExisting ? current : person;
    const fallback = preferExisting ? person : current;
    people.set(key, {
      ...fallback,
      ...preferred,
      role: preferred.role ?? fallback.role ?? null,
      sourceUrl: preferred.sourceUrl ?? fallback.sourceUrl ?? null,
      email: preferred.email ?? fallback.email,
      emailStatus: preferred.emailStatus ?? fallback.emailStatus,
      emailBasis: preferred.emailBasis ?? fallback.emailBasis,
      githubUrl: preferred.githubUrl ?? fallback.githubUrl,
      xUrl: preferred.xUrl ?? fallback.xUrl,
      personalUrl: preferred.personalUrl ?? fallback.personalUrl,
      read: preferred.read ?? fallback.read
    });
  }

  return {
    ...next,
    value: Array.from(people.values()),
    citationIds: Array.from(new Set([...existing.citationIds, ...next.citationIds]))
  };
}

function mergeByKey<T>(preferred: T[], fallback: T[], key: (value: T) => string) {
  const merged = new Map(preferred.map((value) => [key(value), value]));
  fallback.forEach((value) => {
    if (!merged.has(key(value))) {
      merged.set(key(value), value);
    }
  });
  return Array.from(merged.values());
}

export function preserveExistingBasics(
  existing: ColdStartCard | null,
  next: ColdStartCard,
  options: CardMergeOptions = {}
): ColdStartCard {
  if (!existing) {
    return next;
  }

  const preferredCitations = options.preferExisting ? existing.citations : next.citations;
  const fallbackCitations = options.preferExisting ? next.citations : existing.citations;
  const citations = mergeByKey(preferredCitations, fallbackCitations, (citation) => citation.id);
  const synthesis = next.synthesis ?? (options.preserveAnalysis ? existing.synthesis : undefined);
  const synthesisWithheld = synthesis
    ? undefined
    : next.synthesisWithheld ?? (options.preserveAnalysis ? existing.synthesisWithheld : undefined);
  // Background-earned like synthesis: a profile refresh regenerates facts but never carries
  // an expanded description of its own, and wiping the stored one would re-pay its LLM call
  // and churn the copy on every refresh. The citation merge below unions by id, so the
  // preserved description's citationIds always still resolve.
  const expandedDescription = next.expandedDescription ?? existing.expandedDescription;
  const mergeFact = <T>(current: ResolvedFact<T>, incoming: ResolvedFact<T>) =>
    options.preferExisting ? preserveFact(incoming, current) : preserveFact(current, incoming);
  const mergeOptionalFact = <T>(current: ResolvedFact<T> | undefined, incoming: ResolvedFact<T> | undefined) =>
    options.preferExisting
      ? preserveOptionalFact(incoming, current)
      : preserveOptionalFact(current, incoming);
  const websiteUrl = mergeOptionalFact(existing.identity.websiteUrl, next.identity.websiteUrl);
  const linkedinUrl = mergeOptionalFact(existing.identity.linkedinUrl, next.identity.linkedinUrl);
  const description = mergeOptionalFact(existing.identity.description, next.identity.description);
  const rounds = mergeOptionalFact(existing.funding.rounds, next.funding.rounds);
  const name = mergeFact(existing.identity.name, next.identity.name);

  return {
    ...next,
    ...(synthesis ? { synthesis } : {}),
    ...(synthesisWithheld ? { synthesisWithheld } : {}),
    ...(expandedDescription ? { expandedDescription } : {}),
    identity: {
      ...next.identity,
      name,
      ...(websiteUrl ? { websiteUrl } : {}),
      ...(linkedinUrl ? { linkedinUrl } : {}),
      oneLiner: mergeFact(existing.identity.oneLiner, next.identity.oneLiner),
      ...(description ? { description } : {}),
      hq: mergeFact(existing.identity.hq, next.identity.hq),
      foundedYear: mergeFact(existing.identity.foundedYear, next.identity.foundedYear),
    },
    funding: {
      ...next.funding,
      totalRaisedUsd: mergeFact(existing.funding.totalRaisedUsd, next.funding.totalRaisedUsd),
      lastRound: mergeFact(existing.funding.lastRound, next.funding.lastRound),
      ...(rounds ? { rounds } : {}),
      investors: mergeFact(existing.funding.investors, next.funding.investors),
    },
    team: {
      founders: mergePeopleFact(existing.team.founders, next.team.founders, options.preferExisting === true),
      keyExecs: mergePeopleFact(existing.team.keyExecs, next.team.keyExecs, options.preferExisting === true),
      headcount: mergeFact(existing.team.headcount, next.team.headcount),
    },
    // A URL-keyed merge only dedupes the same link. Two runs that each caught a different outlet
    // covering one announcement would otherwise land as two signals, so the merged list goes
    // through the same one-per-event clustering the pipeline applies at generation time; it
    // carries the corroboration in citationIds, orders date-descending, and caps at six.
    signals: clusterSignals(
      mergeByKey(next.signals, existing.signals, (signal) => signal.url.trim().toLowerCase()),
      { companyDomain: next.domain, companyName: name.value }
    ),
    comparables: mergeByKey(
      options.preferExisting ? existing.comparables : next.comparables,
      options.preferExisting ? next.comparables : existing.comparables,
      (comparable) => comparable.domain.trim().toLowerCase()
    ).slice(0, 8),
    citations,
  };
}

export function prepareCardSnapshotForStorage(
  mode: GenerationMode,
  existing: ColdStartCard | null,
  generated: ColdStartCard,
  options: CardMergeOptions = {}
): ColdStartCard {
  const merged = preserveExistingBasics(existing, generated, {
    ...(options.preferExisting !== undefined ? { preferExisting: options.preferExisting } : {}),
    preserveAnalysis: options.preserveAnalysis ?? mode === "analysis"
  });
  // Prune founder-voice ("fv"-prefixed) citations the MERGED card's own synthesis no longer
  // references. mergeByKey above (preserveExistingBasics's citations union) fills any id missing
  // from the preferred side using the fallback side, so a prior run's now-orphaned fv citation
  // resurfaces from existing.citations even after the caller pruned its own pre-merge working
  // card. Keying the prune to this MERGED synthesis, on every call site (including the real
  // optimistic-concurrency write inside mutateCardWithRetry, which re-runs this same function
  // against the freshest DB row), is what makes an orphan actually stay dropped instead of
  // resurrecting on the very next write. A citation still referenced by the merged synthesis
  // (the preserve-branch case: an old emphasisRead carried over wholesale) is untouched.
  const referencedFounderVoiceIds = citationIdsReferencedIn(merged.synthesis);
  const citations = citationsPrunedToReferencedFounderVoice(merged.citations, referencedFounderVoiceIds);
  return {
    ...merged,
    citations,
    cacheStatus: mode === "analysis" || hasUsablePublicProfile(merged) ? "hit" : "partial",
  };
}

export function prepareCardForStorage(
  mode: GenerationMode,
  existing: ColdStartCard | null,
  generated: ColdStartCard,
  options: CardMergeOptions = {}
): ColdStartCard {
  const merged = prepareCardSnapshotForStorage(mode, existing, generated, options);
  assertTerminalCardQuality(mode, merged);
  return {
    ...merged,
    cacheStatus: "hit"
  };
}

export function underfilledBasicsErrorMessage(card: ColdStartCard) {
  const quality = publicProfileQuality(card);
  const gaps = [
    !quality.hasCitations ? "citations" : null,
    !quality.hasName ? "name" : null,
    !quality.hasSummary ? "summary" : null,
    quality.structuredFactCount < quality.minimumStructuredFactCount ? "structured facts" : null,
    quality.visibleFactCount < quality.minimumVisibleFactCount ? "visible facts" : null
  ].filter(Boolean);
  return [
    "generated basics underfilled public profile",
    `(${quality.structuredFactCount}/${quality.minimumStructuredFactCount} structured facts,`,
    `${quality.visibleFactCount}/${quality.minimumVisibleFactCount} visible facts,`,
    `${card.citations.length} citations${gaps.length > 0 ? `; missing ${gaps.join(", ")}` : ""})`
  ].join(" ");
}

export function canStoreCardSnapshot(mode: GenerationMode, card: ColdStartCard) {
  return mode !== "basics" || hasUsablePublicProfile(card);
}

export function noteSkippedUnderfilledSnapshot(trace: GenerationTrace, stepName: string, card: ColdStartCard) {
  trace.steps = {
    ...trace.steps,
    [stepName]: {
      status: "skipped",
      message: `${underfilledBasicsErrorMessage(card)}; continuing enrichment without saving a partial card`
    }
  };
}

export function assertTerminalCardQuality(mode: GenerationMode, card: ColdStartCard) {
  if (mode === "basics" && !hasUsablePublicProfile(card)) {
    throw new Error(underfilledBasicsErrorMessage(card));
  }
}

// Spread args so a default write keeps the exact three-argument mutateCard call shape; only a
// caller that must leave the synthesis TTL alone carries an options argument at all.
export type CardWriteArgs = [CardWriteOptions] | [];

// mutateCard returns null only when the slug has no row yet, which is why every caller falls back
// to a blind upsert. A row inserted between the read and that fallback would be overwritten
// wholesale, so retry the merge once first and let the fallback handle the genuinely absent row.
export async function mutateCardWithRetry(
  db: ColdStartDb,
  slug: string,
  mutate: (current: ColdStartCard) => ColdStartCard,
  ...options: CardWriteArgs
) {
  return (await mutateCard(db, slug, mutate, ...options)) ?? (await mutateCard(db, slug, mutate, ...options));
}
