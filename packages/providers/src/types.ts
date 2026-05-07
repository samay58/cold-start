export type StableenrichEnv = Partial<
  Record<
    | "STABLEENRICH_BASE_URL"
    | "STABLEENRICH_EXA_SEARCH_URL"
    | "STABLEENRICH_EXA_SIMILAR_URL"
    | "STABLEENRICH_FIRECRAWL_URL"
    | "STABLEENRICH_ORG_ENRICH_URL",
    string
  >
>;

export type StableenrichProbeName =
  | "exa_funding_history"
  | "exa_company_profile"
  | "exa_independent_analysis"
  | "exa_find_similar"
  | "firecrawl_homepage"
  | "org_enrichment";

export type RetrievalIntent =
  | "funding"
  | "company_profile"
  | "independent_analysis"
  | "comparables"
  | "homepage"
  | "firmographics";

export type StableenrichProbe = {
  name: StableenrichProbeName;
  url: string;
  body: Record<string, unknown>;
};

export type ProviderResearchPlan = {
  searchQueries?: {
    funding?: string;
    companyProfile?: string;
    independentAnalysis?: string;
  };
};

export type ProviderSource = {
  url: string;
  title: string;
  sourceType: "company_site" | "news" | "filing" | "enrichment" | "github" | "rdap" | "other";
  fetchedAt: string;
  rawText: string;
  intent?: RetrievalIntent;
  publishedAt?: string;
};
