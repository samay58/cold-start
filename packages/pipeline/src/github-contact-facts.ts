import { applyEmailPattern, type ColdStartCard, type EmailPattern } from "@cold-start/core";
import type { GithubObservedContact, ProviderFactCandidate } from "@cold-start/providers";

/*
 * Turn a free GitHub commit-email harvest into per-person provider-fact candidates.
 * Observed @company-domain emails attach to an already-extracted founder/exec by
 * name match (labeled observed). For the remaining named people with no email, the
 * derived domain pattern constructs a likely work email (labeled inferred, low
 * confidence). We never invent new people: candidates only enrich people the
 * extractor already found. Inferred emails are honest guesses and are stripped from
 * the public card alongside every other email.
 */

type CardPerson = NonNullable<ColdStartCard["team"]["founders"]["value"]>[number];

function compact(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function candidateFor(input: {
  path: "team.founders" | "team.keyExecs";
  person: CardPerson;
  email: string;
  emailStatus: "observed" | "inferred";
  emailBasis?: string | undefined;
  sourceUrl: string;
  fetchedAt: string;
  sourceType: ProviderFactCandidate["sourceType"];
  provider: ProviderFactCandidate["provider"];
  endpoint: string;
  citationTitle: string;
}): ProviderFactCandidate {
  const observed = input.emailStatus === "observed";
  return {
    path: input.path,
    value: [
      {
        name: input.person.name,
        role: input.person.role ?? null,
        sourceUrl: input.sourceUrl,
        email: input.email,
        emailStatus: input.emailStatus,
        ...(input.emailBasis ? { emailBasis: input.emailBasis } : {})
      }
    ],
    status: observed ? "verified" : "inferred",
    confidence: observed ? "medium" : "low",
    sourceType: input.sourceType,
    provider: input.provider,
    endpoint: input.endpoint,
    citationUrl: input.sourceUrl,
    citationTitle: input.citationTitle,
    fetchedAt: input.fetchedAt
  };
}

export function buildEmailPatternContactFacts(input: {
  domain: string;
  founders: CardPerson[];
  keyExecs: CardPerson[];
  observed: GithubObservedContact[];
  pattern: EmailPattern | null;
  patternAnchorCount: number;
  fallbackSourceUrl: string;
  fetchedAt: string;
  sourceType: ProviderFactCandidate["sourceType"];
  provider: ProviderFactCandidate["provider"];
  endpoint: string;
  citationTitle: string;
}): ProviderFactCandidate[] {
  const observedByName = new Map<string, GithubObservedContact>();
  for (const contact of input.observed) {
    if (!contact.fullName) continue;
    const key = compact(contact.fullName);
    if (key && !observedByName.has(key)) {
      observedByName.set(key, contact);
    }
  }

  const candidates: ProviderFactCandidate[] = [];
  const lists: { path: "team.founders" | "team.keyExecs"; people: CardPerson[] }[] = [
    { path: "team.founders", people: input.founders },
    { path: "team.keyExecs", people: input.keyExecs }
  ];

  for (const { path, people } of lists) {
    for (const person of people) {
      const observed = observedByName.get(compact(person.name));
      if (observed) {
        candidates.push(
          candidateFor({
            path,
            person,
            email: observed.email,
            emailStatus: "observed",
            sourceUrl: observed.sourceUrl ?? input.fallbackSourceUrl,
            fetchedAt: input.fetchedAt,
            sourceType: input.sourceType,
            provider: input.provider,
            endpoint: input.endpoint,
            citationTitle: input.citationTitle
          })
        );
        continue;
      }

      if (person.email || !input.pattern) {
        continue;
      }

      const inferred = applyEmailPattern(input.pattern, person.name, input.domain);
      if (inferred) {
        candidates.push(
          candidateFor({
            path,
            person,
            email: inferred,
            emailStatus: "inferred",
            emailBasis: emailPatternBasis(input.pattern, input.patternAnchorCount),
            sourceUrl: input.fallbackSourceUrl,
            fetchedAt: input.fetchedAt,
            sourceType: input.sourceType,
            provider: input.provider,
            endpoint: input.endpoint,
            citationTitle: input.citationTitle
          })
        );
      }
    }
  }

  return candidates;
}

export function buildGithubContactFacts(input: {
  domain: string;
  founders: CardPerson[];
  keyExecs: CardPerson[];
  observed: GithubObservedContact[];
  pattern: EmailPattern | null;
  patternAnchorCount: number;
  orgUrl: string;
  fetchedAt: string;
}): ProviderFactCandidate[] {
  return buildEmailPatternContactFacts({
    ...input,
    fallbackSourceUrl: input.orgUrl,
    sourceType: "github",
    provider: "github",
    endpoint: "github_contacts",
    citationTitle: "GitHub"
  });
}

function emailPatternBasis(pattern: EmailPattern, anchorCount: number) {
  return `domain pattern ${pattern}, ${anchorCount} observed ${anchorCount === 1 ? "address" : "addresses"}`;
}
