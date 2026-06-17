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

export function directExaEnabled() {
  return process.env.FAST_BASICS_ENABLED !== "false";
}

export function contactEnrichmentEnabled(input: {
  CONTACT_ENRICHMENT_ENABLED: boolean;
  CONTACT_ENRICHMENT_TIER: ContactEnrichmentTier;
}) {
  return input.CONTACT_ENRICHMENT_ENABLED && input.CONTACT_ENRICHMENT_TIER !== "off";
}
