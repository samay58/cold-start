import type { DirectExaEnv, StableenrichEnv, WebsetsEnv } from "@cold-start/providers";

function readEnvSubset<K extends string>(keys: readonly K[]): Partial<Record<K, string>> {
  const out: Partial<Record<K, string>> = {};
  for (const key of keys) {
    const value = process.env[key];
    if (value) {
      out[key] = value;
    }
  }
  return out;
}

const STABLEENRICH_ENV_KEYS = [
  "STABLEENRICH_BASE_URL",
  "STABLEENRICH_EXA_SEARCH_URL",
  "STABLEENRICH_EXA_SIMILAR_URL",
  "STABLEENRICH_FIRECRAWL_URL",
  "STABLEENRICH_ORG_ENRICH_URL",
  "STABLEENRICH_APOLLO_ORG_SEARCH_URL",
  "STABLEENRICH_APOLLO_PEOPLE_SEARCH_URL",
  "STABLEENRICH_APOLLO_PEOPLE_ENRICH_URL",
  "STABLEENRICH_HUNTER_EMAIL_VERIFIER_URL",
  "STABLEENRICH_CLADO_CONTACTS_ENRICH_URL",
  "STABLEENRICH_MINERVA_ENRICH_URL",
] as const satisfies ReadonlyArray<keyof StableenrichEnv>;

const DIRECT_EXA_ENV_KEYS = [
  "DIRECT_EXA_API_KEY",
  "DIRECT_EXA_BASE_URL",
] as const satisfies ReadonlyArray<keyof DirectExaEnv>;

const WEBSETS_ENV_KEYS = [
  "EXA_WEBSETS_API_KEY",
  "EXA_WEBSETS_BASE_URL",
] as const satisfies ReadonlyArray<keyof WebsetsEnv>;

export type ContactEnrichmentTier = "named-only" | "full" | "off";

export function stableenrichEnvFromProcess(): StableenrichEnv {
  return readEnvSubset(STABLEENRICH_ENV_KEYS);
}

export function directExaEnvFromProcess(): DirectExaEnv {
  return readEnvSubset(DIRECT_EXA_ENV_KEYS);
}

export function websetsEnvFromProcess(): WebsetsEnv {
  return readEnvSubset(WEBSETS_ENV_KEYS);
}

// Personal access token for the free GitHub commit-email harvester (5,000 req/hr vs 60
// unauthenticated). Optional: the harvester degrades to a no-op when it is missing.
export function githubTokenFromProcess(): string | undefined {
  const raw = process.env.GITHUB_TOKEN ?? process.env.GITHUB_PAT;
  return raw?.trim() ? raw.trim() : undefined;
}

export function directExaEnabled() {
  return process.env.FAST_BASICS_ENABLED !== "false";
}

export type AnalysisSourceRefreshMode = "full" | "targeted" | "skip-fresh";

const ANALYSIS_SOURCE_REFRESH_MODES = new Set<AnalysisSourceRefreshMode>(["full", "targeted", "skip-fresh"]);

// Re-fetch policy for the analysis-mode fetch-sources step when extraction is being reused from
// an existing investor-usable card. Read at call time (not cached at module load) so a Vercel env
// flip takes effect on the next invocation without a rebuild. Unknown or unset values fall back
// to "full": today's unconditional 13-probe stableenrich fetch. Nothing changes until this is
// explicitly promoted; see docs/product/provider-cost-assumptions.md for the cost deltas.
export function analysisSourceRefreshModeFromProcess(): AnalysisSourceRefreshMode {
  const raw = process.env.ANALYSIS_SOURCE_REFRESH;
  return raw && ANALYSIS_SOURCE_REFRESH_MODES.has(raw as AnalysisSourceRefreshMode) ? (raw as AnalysisSourceRefreshMode) : "full";
}

export function personReadsEnabled() {
  return process.env.PERSON_READS_ENABLED !== "false";
}

export function contactEnrichmentEnabled(input: {
  CONTACT_ENRICHMENT_ENABLED: boolean;
  CONTACT_ENRICHMENT_TIER: ContactEnrichmentTier;
}) {
  return input.CONTACT_ENRICHMENT_ENABLED && input.CONTACT_ENRICHMENT_TIER !== "off";
}

// Optional per-function Inngest concurrency cap for background (post-first-usable) work.
// Unset, or any non-positive-integer value, means no cap: the function keeps using the
// account default pool. Only set this against the known Inngest account concurrency limit
// so background enrichment cannot starve the user-facing generation queue.
export function backgroundConcurrencyLimit(envVarName: string): number | undefined {
  const raw = process.env[envVarName];
  if (!raw) return undefined;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) return undefined;
  return parsed;
}
