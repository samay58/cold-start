import {
  hasUsablePublicProfile,
  publicProfileQuality,
  type ColdStartCard,
  type GenerationTrace,
  type ResolvedFact
} from "@cold-start/core";

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

  return {
    ...next,
    ...(synthesis ? { synthesis } : {}),
    ...(synthesisWithheld ? { synthesisWithheld } : {}),
    identity: {
      ...next.identity,
      name: mergeFact(existing.identity.name, next.identity.name),
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
    signals: mergeByKey(next.signals, existing.signals, (signal) => signal.url.trim().toLowerCase())
      .sort((left, right) => right.date.localeCompare(left.date))
      .slice(0, 6),
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
  return {
    ...merged,
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
