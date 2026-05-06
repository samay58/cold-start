export type StableenrichEnv = Partial<
  Record<
    | "AGENTCASH_API_KEY"
    | "STABLEENRICH_EXA_SEARCH_URL"
    | "STABLEENRICH_EXA_SIMILAR_URL"
    | "STABLEENRICH_FIRECRAWL_URL"
    | "STABLEENRICH_ORG_ENRICH_URL"
    | "STABLEENRICH_LINKEDIN_URL",
    string
  >
>;

export type StableenrichProbeName =
  | "exa_search_news"
  | "exa_find_similar"
  | "firecrawl_homepage"
  | "org_enrichment"
  | "linkedin_company";

export type StableenrichProbe = {
  name: StableenrichProbeName;
  url: string;
  body: Record<string, unknown>;
};

export type ProviderSource = {
  url: string;
  title: string;
  sourceType: "company_site" | "news" | "filing" | "enrichment" | "github" | "rdap" | "other";
  fetchedAt: string;
  rawText: string;
};
