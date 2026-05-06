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

export function chooseMostAuthoritativeFact<T>(facts: CandidateFact<T>[]): CandidateFact<T> | null {
  if (facts.length === 0) {
    return null;
  }

  return [...facts].sort((left, right) => {
    const authorityDelta = (authorityRank[right.sourceType] ?? 0) - (authorityRank[left.sourceType] ?? 0);
    if (authorityDelta !== 0) {
      return authorityDelta;
    }

    return new Date(right.fetchedAt).getTime() - new Date(left.fetchedAt).getTime();
  })[0] ?? null;
}
