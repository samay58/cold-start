type CandidateFact<T> = {
  value: T;
  sourceType: string;
  fetchedAt: string;
  citationId: string;
};

const authorityRank: Record<string, number> = {
  filing: 5,
  company_site: 4,
  news: 3,
  enrichment: 2,
  github: 2,
  rdap: 2,
  other: 1
};

function fetchedAtTime(fetchedAt: string) {
  const time = new Date(fetchedAt).getTime();
  return Number.isFinite(time) ? time : Number.NEGATIVE_INFINITY;
}

export function chooseMostAuthoritativeFact<T>(facts: CandidateFact<T>[]): CandidateFact<T> | null {
  if (facts.length === 0) {
    return null;
  }

  return [...facts].sort((left, right) => {
    const authorityDelta = (authorityRank[right.sourceType] ?? 0) - (authorityRank[left.sourceType] ?? 0);
    if (authorityDelta !== 0) {
      return authorityDelta;
    }

    return fetchedAtTime(right.fetchedAt) - fetchedAtTime(left.fetchedAt);
  })[0] ?? null;
}
