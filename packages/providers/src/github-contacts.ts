import { deriveEmailPattern, isRoleAlias, type EmailPattern } from "@cold-start/core";
import type { ProviderSource } from "./types";

/*
 * Free, no-AgentCash contact provider. Resolves a company's public GitHub org and
 * harvests author emails from recent commits, keeping only real @company-domain
 * human addresses. One such address reveals the domain's email pattern (see
 * @cold-start/core email-pattern), which the pipeline applies to already-extracted
 * founders/execs. The public GitHub REST API is free within rate limits, so this
 * provider reports estimatedCostUsd: 0 and never runs through provider-budget.
 * See docs/archive/product/contact-enrichment-yield-and-design-2026-07-01.md.
 */

const GITHUB_API = "https://api.github.com";
const NOREPLY = /noreply|users\.noreply/i;
const MAX_REPOS = 5;
const COMMITS_PER_REPO = 100;
const CURATED_ORG_LOGINS: Record<string, string> = {
  "anthropic.com": "anthropics",
  "brex.com": "brexhq",
  "glean.com": "gleanwork",
  "hex.tech": "hex-inc",
  "mercury.com": "MercuryTechnologies",
  "modal.com": "modal-labs",
  "neon.tech": "neondatabase",
  "notion.so": "makenotion",
  "pinecone.io": "pinecone-io",
  "retool.com": "tryretool",
  "snowflake.com": "snowflakedb",
  "together.ai": "togethercomputer",
  "trychroma.com": "chroma-core"
};

type FetchLike = (input: string, init?: { headers?: Record<string, string> }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}>;

export type GithubObservedContact = {
  email: string;
  fullName: string | null;
  sourceUrl: string | null;
};

export type GithubContactsTrace = {
  org: string | null;
  reposChecked: number;
  requestCount: number;
  estimatedCostUsd: 0;
};

export type GithubContactsResult = {
  found: true;
  org: string;
  observed: GithubObservedContact[];
  pattern: EmailPattern | null;
  patternAnchorCount: number;
  sources: ProviderSource[];
  trace: GithubContactsTrace;
};

export type GithubContactsFailure = {
  found: false;
  reason: string;
  trace: GithubContactsTrace;
};

export function isGithubContactsResult(value: GithubContactsResult | GithubContactsFailure): value is GithubContactsResult {
  return value.found;
}

export async function fetchGithubContacts(input: {
  domain: string;
  companyName: string;
  fetcher?: FetchLike;
  token?: string;
}): Promise<GithubContactsResult | GithubContactsFailure> {
  const fetcher: FetchLike = input.fetcher ?? (fetch as unknown as FetchLike);
  const token = input.token ?? process.env.GITHUB_TOKEN ?? process.env.GITHUB_PAT;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "cold-start-contacts"
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const counter = { count: 0 };
  const root = registrableDomain(input.domain);

  const org = await resolveOrg(input.companyName, root, fetcher, headers, counter);
  if (!org) {
    return { found: false, reason: "no_org_match", trace: { org: null, reposChecked: 0, requestCount: counter.count, estimatedCostUsd: 0 } };
  }

  const { observed, reposChecked } = await harvestCommitEmails(org.login, root, fetcher, headers, counter);
  // The org's own public email can also be a human anchor.
  if (org.email && !NOREPLY.test(org.email) && emailDomainMatches(org.email, root) && !isRoleAlias(localPart(org.email))) {
    if (!observed.some((entry) => entry.email === org.email!.toLowerCase())) {
      observed.push({ email: org.email.toLowerCase(), fullName: org.name, sourceUrl: `${GITHUB_API.replace("api.", "")}/${org.login}` });
    }
  }

  const patternResult = deriveEmailPattern(observed.map((entry) => ({ email: entry.email, fullName: entry.fullName })));

  const sources: ProviderSource[] = [
    {
      url: `https://github.com/${org.login}`,
      title: `${input.companyName} on GitHub`,
      sourceType: "github",
      fetchedAt: new Date().toISOString(),
      rawText: observed.length > 0 ? `Public commit authors on ${root}: ${observed.length} work email(s).` : `GitHub org ${org.login}.`,
      intent: "management_team"
    }
  ];

  return {
    found: true,
    org: org.login,
    observed,
    pattern: patternResult?.pattern ?? null,
    patternAnchorCount: patternResult?.anchorCount ?? 0,
    sources,
    trace: { org: org.login, reposChecked, requestCount: counter.count, estimatedCostUsd: 0 }
  };
}

type ResolvedOrg = { login: string; name: string | null; email: string | null };

async function resolveOrg(
  companyName: string,
  root: string,
  fetcher: FetchLike,
  headers: Record<string, string>,
  counter: { count: number }
): Promise<ResolvedOrg | null> {
  const curatedLogin = CURATED_ORG_LOGINS[root];
  if (curatedLogin) {
    const account = await getJson(fetcher, `${GITHUB_API}/users/${encodeURIComponent(curatedLogin)}`, headers, counter);
    const curated = resolvedOrg(account);
    if (curated) {
      return curated;
    }
  }

  for (const guess of orgLoginGuesses(companyName, root)) {
    const account = await getJson(fetcher, `${GITHUB_API}/users/${encodeURIComponent(guess)}`, headers, counter);
    const confirmed = confirmOrg(account, companyName, root);
    if (confirmed) {
      return confirmed;
    }
  }

  // Search is deliberately stricter than login guesses: plausible names are common and caused
  // false-positive orgs. A result must point back to the card domain before we harvest it.
  const search = await getJson(fetcher, `${GITHUB_API}/search/users?q=${encodeURIComponent(`${companyName} type:org`)}&per_page=5`, headers, counter);
  const items = isRecord(search) && Array.isArray(search.items) ? search.items : [];
  for (const item of items.slice(0, 5)) {
    const login = isRecord(item) ? stringOrNull(item.login) : null;
    if (!login) continue;
    const account = await getJson(fetcher, `${GITHUB_API}/users/${encodeURIComponent(login)}`, headers, counter);
    const confirmed = confirmOrgByWebsite(account, root);
    if (confirmed) {
      return confirmed;
    }
  }
  return null;
}

function resolvedOrg(account: unknown): ResolvedOrg | null {
  if (!isRecord(account)) {
    return null;
  }
  const login = stringOrNull(account.login);
  if (!login) {
    return null;
  }
  return { login, name: stringOrNull(account.name), email: stringOrNull(account.email) };
}

function confirmOrgByWebsite(account: unknown, root: string): ResolvedOrg | null {
  const resolved = resolvedOrg(account);
  if (!resolved || !isRecord(account)) {
    return null;
  }
  const blogHost = hostFromUrl(stringOrNull(account.blog) ?? "");
  return blogHost === root || blogHost.endsWith(`.${root}`) ? resolved : null;
}

function confirmOrg(account: unknown, companyName: string, root: string): ResolvedOrg | null {
  const resolved = resolvedOrg(account);
  if (!resolved || !isRecord(account)) {
    return null;
  }
  const blogHost = hostFromUrl(stringOrNull(account.blog) ?? "");
  const name = resolved.name;
  const websiteMatch = blogHost === root || blogHost.endsWith(`.${root}`);
  const nameMatch = Boolean(name && compact(name).includes(compact(companyName).slice(0, 6)) && compact(companyName).length >= 4);
  if (websiteMatch || nameMatch) {
    return resolved;
  }
  return null;
}

async function harvestCommitEmails(
  login: string,
  root: string,
  fetcher: FetchLike,
  headers: Record<string, string>,
  counter: { count: number }
): Promise<{ observed: GithubObservedContact[]; reposChecked: number }> {
  let repos = await getJson(fetcher, `${GITHUB_API}/orgs/${login}/repos?sort=pushed&per_page=8`, headers, counter);
  if (!Array.isArray(repos)) {
    repos = await getJson(fetcher, `${GITHUB_API}/users/${login}/repos?sort=pushed&per_page=8`, headers, counter);
  }
  const repoList = Array.isArray(repos) ? repos : [];
  const sorted = repoList
    .filter((repo): repo is Record<string, unknown> => isRecord(repo) && repo.fork !== true)
    .sort((a, b) => numberOrZero(b.stargazers_count) - numberOrZero(a.stargazers_count));

  const byEmail = new Map<string, GithubObservedContact>();
  let reposChecked = 0;
  for (const repo of sorted.slice(0, MAX_REPOS)) {
    const name = stringOrNull(repo.name);
    if (!name) continue;
    reposChecked += 1;
    const commits = await getJson(fetcher, `${GITHUB_API}/repos/${login}/${name}/commits?per_page=${COMMITS_PER_REPO}`, headers, counter);
    if (!Array.isArray(commits)) continue;
    for (const commit of commits) {
      if (!isRecord(commit)) continue;
      const author = isRecord(commit.commit) && isRecord(commit.commit.author) ? commit.commit.author : null;
      const email = author ? stringOrNull(author.email) : null;
      if (!email) continue;
      const lower = email.toLowerCase();
      if (NOREPLY.test(lower) || !emailDomainMatches(lower, root) || isRoleAlias(localPart(lower))) {
        continue;
      }
      if (!byEmail.has(lower)) {
        byEmail.set(lower, {
          email: lower,
          fullName: author ? stringOrNull(author.name) : null,
          sourceUrl: stringOrNull(commit.html_url)
        });
      }
    }
    if (byEmail.size >= 12) break; // enough signal to derive a pattern; save API calls
  }
  return { observed: [...byEmail.values()], reposChecked };
}

async function getJson(fetcher: FetchLike, url: string, headers: Record<string, string>, counter: { count: number }): Promise<unknown> {
  counter.count += 1;
  try {
    const response = await fetcher(url, { headers });
    if (!response.ok) {
      return null;
    }
    return await response.json();
  } catch {
    return null;
  }
}

function orgLoginGuesses(companyName: string, root: string): string[] {
  const label = root.split(".")[0] ?? root;
  const nm = compact(companyName);
  const noAi = nm.replace(/ai$/, "");
  const set = new Set([label, nm, noAi, `${nm}ai`, `${nm}-ai`, `${nm}labs`, `${nm}-labs`, `${nm}hq`, `get${nm}`, `${nm}io`, `${nm}-io`, `${nm}db`]);
  return [...set].filter(Boolean);
}

function registrableDomain(domain: string): string {
  const parts = domain.toLowerCase().replace(/^www\./, "").split(".");
  if (parts.length <= 2) return parts.join(".");
  const lastTwo = parts.slice(-2).join(".");
  const twoLevel = new Set(["co.uk", "com.au", "co.jp"]);
  return twoLevel.has(lastTwo) ? parts.slice(-3).join(".") : parts.slice(-2).join(".");
}

function emailDomainMatches(email: string, root: string): boolean {
  const host = email.split("@")[1] ?? "";
  return host === root || host.endsWith(`.${root}`);
}

function localPart(email: string): string {
  return email.split("@")[0] ?? email;
}

function hostFromUrl(value: string): string {
  if (!value) return "";
  try {
    return new URL(value.startsWith("http") ? value : `https://${value}`).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function compact(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function numberOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
