import {
  hasUsablePublicProfile,
  publicProfileQuality,
  type ColdStartCard,
  type GenerationTrace,
  type ResolvedFact
} from "@cold-start/core";

type GenerationMode = "basics" | "analysis";

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

export function preserveExistingBasics(existing: ColdStartCard | null, next: ColdStartCard): ColdStartCard {
  if (!existing) {
    return next;
  }

  const citations = new Map(existing.citations.map((citation) => [citation.id, citation]));
  next.citations.forEach((citation) => citations.set(citation.id, citation));
  const synthesis = next.synthesis;
  const websiteUrl = preserveOptionalFact(existing.identity.websiteUrl, next.identity.websiteUrl);
  const linkedinUrl = preserveOptionalFact(existing.identity.linkedinUrl, next.identity.linkedinUrl);
  const description = preserveOptionalFact(existing.identity.description, next.identity.description);
  const rounds = preserveOptionalFact(existing.funding.rounds, next.funding.rounds);

  return {
    ...next,
    ...(synthesis ? { synthesis } : {}),
    identity: {
      ...next.identity,
      name: preserveFact(existing.identity.name, next.identity.name),
      ...(websiteUrl ? { websiteUrl } : {}),
      ...(linkedinUrl ? { linkedinUrl } : {}),
      oneLiner: preserveFact(existing.identity.oneLiner, next.identity.oneLiner),
      ...(description ? { description } : {}),
      hq: preserveFact(existing.identity.hq, next.identity.hq),
      foundedYear: preserveFact(existing.identity.foundedYear, next.identity.foundedYear),
    },
    funding: {
      ...next.funding,
      totalRaisedUsd: preserveFact(existing.funding.totalRaisedUsd, next.funding.totalRaisedUsd),
      lastRound: preserveFact(existing.funding.lastRound, next.funding.lastRound),
      ...(rounds ? { rounds } : {}),
      investors: preserveFact(existing.funding.investors, next.funding.investors),
    },
    team: {
      founders: preserveFact(existing.team.founders, next.team.founders),
      keyExecs: preserveFact(existing.team.keyExecs, next.team.keyExecs),
      headcount: preserveFact(existing.team.headcount, next.team.headcount),
    },
    signals: next.signals.length > 0 ? next.signals : existing.signals,
    comparables: next.comparables.length > 0 ? next.comparables : existing.comparables,
    citations: Array.from(citations.values()),
  };
}

export function prepareCardSnapshotForStorage(mode: GenerationMode, existing: ColdStartCard | null, generated: ColdStartCard): ColdStartCard {
  const merged = preserveExistingBasics(existing, generated);
  return {
    ...merged,
    cacheStatus: mode === "analysis" || hasUsablePublicProfile(merged) ? "hit" : "partial",
  };
}

export function prepareCardForStorage(mode: GenerationMode, existing: ColdStartCard | null, generated: ColdStartCard): ColdStartCard {
  const merged = prepareCardSnapshotForStorage(mode, existing, generated);
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
