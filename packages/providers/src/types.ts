export type StableenrichEnv = Partial<
  Record<
    | "STABLEENRICH_BASE_URL"
    | "STABLEENRICH_EXA_SEARCH_URL"
    | "STABLEENRICH_EXA_SIMILAR_URL"
    | "STABLEENRICH_FIRECRAWL_URL"
    | "STABLEENRICH_ORG_ENRICH_URL"
    | "STABLEENRICH_APOLLO_ORG_SEARCH_URL"
    | "STABLEENRICH_APOLLO_PEOPLE_SEARCH_URL"
    | "STABLEENRICH_APOLLO_PEOPLE_ENRICH_URL"
    | "STABLEENRICH_HUNTER_EMAIL_VERIFIER_URL"
    | "STABLEENRICH_CLADO_CONTACTS_ENRICH_URL"
    | "STABLEENRICH_MINERVA_ENRICH_URL",
    string
  >
>;

export type DirectExaEnv = Partial<
  Record<"DIRECT_EXA_API_KEY" | "DIRECT_EXA_BASE_URL", string>
>;

export type WebsetsEnv = Partial<
  Record<"EXA_WEBSETS_API_KEY" | "EXA_WEBSETS_BASE_URL" | "EXA_WEBSETS_CREDIT_USD", string>
>;

export type PeopleEmailHint = {
  id?: string | null;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  role?: string | null;
  email?: string | null;
  sourceUrl?: string | null;
  linkedinUrl?: string | null;
};

export type StableenrichProbeName =
  | "exa_funding_history"
  | "exa_company_profile"
  | "exa_management_team"
  | "exa_recent_signals"
  | "exa_competition"
  | "exa_independent_analysis"
  | "exa_customer_proof"
  | "exa_product_proof"
  | "exa_find_similar"
  | "firecrawl_homepage"
  | "firecrawl_about"
  | "firecrawl_team"
  | "apollo_org_search"
  | "org_enrichment"
  | "apollo_people_search"
  | "apollo_people_enrich"
  | "clado_contacts_enrich"
  | "minerva_enrich"
  | "hunter_email_verifier"
  | "exa_email_search"
  | "exa_leader_discovery";

export type RetrievalIntent =
  | "funding"
  | "company_profile"
  | "management_team"
  | "recent_signals"
  | "independent_analysis"
  | "customer_proof"
  | "product_proof"
  | "comparables"
  | "homepage"
  | "firmographics"
  | "email_verification";

export type StableenrichProbe = {
  name: StableenrichProbeName;
  url: string;
  body: Record<string, unknown>;
};

export type ProviderResearchPlan = {
  searchQueries?: {
    funding?: string;
    companyProfile?: string;
    managementTeam?: string;
    recentSignals?: string;
    comparables?: string;
    independentAnalysis?: string;
    customerProof?: string;
    productProof?: string;
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

export type ProviderFactPath =
  | "identity.name"
  | "identity.websiteUrl"
  | "identity.linkedinUrl"
  | "identity.logoUrl"
  | "identity.hq"
  | "identity.foundedYear"
  | "identity.description"
  | "funding.totalRaisedUsd"
  | "funding.lastRound"
  | "team.founders"
  | "team.keyExecs"
  | "team.headcount"
  | "signals"
  | "comparables";

export type ProviderFactCandidate<T = unknown> = {
  path: ProviderFactPath;
  value: T;
  status: "verified" | "mixed" | "inferred" | "unknown";
  confidence: "high" | "medium" | "low";
  sourceType: ProviderSource["sourceType"];
  provider: "stableenrich" | "direct_exa" | "sec_edgar" | "websets";
  endpoint: string;
  citationUrl: string;
  citationTitle: string;
  fetchedAt: string;
  rawText?: string;
};
