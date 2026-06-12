import { z } from "zod";

export type GenerationJobKind =
  | "basics"
  | "analysis"
  | "section:buyer"
  | "section:customer_proof"
  | "section:traction"
  | "section:financing"
  | "section:competition"
  | "section:product"
  | "section:why_it_matters"
  | "section:market"
  | "section:risks"
  | "section:the_case";

export type GenerationTraceStep = {
  status: "started" | "complete" | "failed" | "skipped";
  durationMs?: number;
  message?: string;
};

export type GenerationSourceRejectionReason =
  | "unsupported_protocol"
  | "company_site_domain_mismatch"
  | "ambiguous_same_name_domain"
  | "low_relevance";

export type GenerationSourceTrace = {
  url: string;
  title: string;
  sourceType: string;
  intent?: string;
};

export type GenerationProviderEndpointTrace = {
  name: string;
  endpointUrl: string;
  status: "ok" | "failed" | "skipped";
  sourceCount: number;
  factCount: number;
  factsAppliedCount?: number;
  durationMs?: number;
  estimatedCostUsd?: number;
  expectedFacts?: string[];
  stopCondition?: string;
  error?: string;
};

export type GenerationLlmCallTrace = {
  stage: "research_plan" | "extract_full" | "extract_block" | "synthesis" | "verify" | "research_section";
  label: string;
  model: string;
  // LLM provider that served the call ("anthropic", "deepseek", ...). Absent on rows
  // written before provider routing existed; absence means anthropic.
  provider?: string;
  // Section this call paid for, when it is a per-section pass. Lets cost tie back
  // to the section model without parsing the label string.
  sectionId?: string;
  status: "ok" | "failed";
  durationMs: number;
  inputTokens?: number;
  outputTokens?: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
  cacheCreation?: {
    ephemeral5mInputTokens?: number;
    ephemeral1hInputTokens?: number;
  };
  estimatedCostUsd?: number;
  error?: string;
};

export type GenerationEmailDiscoveryTrace = {
  name: string;
  role: string | null;
  discoverySource: "apollo" | "sec_edgar" | "exa" | "search_hint" | "people_hint" | null;
  emailFound: string | null;
  emailSource: "apollo_search" | "apollo_enrich" | "minerva" | "clado" | "hunter" | "exa" | "websets" | null;
  hunterAttempts?: Array<{
    email: string;
    status: string | null;
    score: number | null;
    accepted: boolean;
  }>;
};

export type GenerationSourceRejection = GenerationSourceTrace & {
  reason: GenerationSourceRejectionReason;
};

// How a research section was produced this run: "deep" = a per-section LLM pass ran;
// "derived" = built from existing card data with no LLM call. Absence means the section
// was not touched this run.
export type GenerationSectionProvenance = "deep" | "derived";

export type GenerationSectionTrace = {
  sectionId: string;
  provenance: GenerationSectionProvenance;
  status: "available" | "empty" | "failed" | "skipped";
  estimatedCostUsd?: number;
  durationMs?: number;
};

export type GenerationTrace = {
  jobKind: GenerationJobKind;
  mode: "basics" | "analysis";
  inngest?: {
    eventId?: string;
    runId?: string;
  };
  steps?: Record<string, GenerationTraceStep>;
  milestones?: {
    seedCardMs?: number;
    firstUsableCardMs?: number;
    contactsReadyMs?: number;
    analysisReadyMs?: number;
  };
  providers?: {
    directExa?: {
      skipped: boolean;
      sourceCount: number;
      failureCount: number;
      // Successful /search requests this run and their estimated spend. Direct Exa bills
      // the Exa account directly (not AgentCash), so without these fields the spend is
      // invisible to run telemetry.
      requestCount?: number;
      estimatedCostUsd?: number;
    };
    stableenrich?: {
      sourceCount: number;
      factCount?: number;
      failureCount: number;
      endpoints?: GenerationProviderEndpointTrace[];
      skippedProbeNames?: string[];
      walletSnapshotBeforeUsd?: number;
      walletSnapshotAfterUsd?: number;
      walletDeltaUsd?: number;
      walletSnapshotError?: string;
      budgetCeilingHit?: boolean;
    };
    websets?: {
      skipped: boolean;
      sourceCount: number;
      factCount: number;
      failureCount: number;
      itemCount?: number;
      acceptedEmailCount?: number;
      rejectedEmailCount?: number;
      websetId?: string;
      dashboardUrl?: string;
      // API requests made and estimated credit spend. Websets bills the Exa account directly
      // (not AgentCash), so these make the spend visible in run telemetry.
      requestCount?: number;
      estimatedCostUsd?: number;
    };
    mergedSourceCount?: number;
    emailDiscovery?: GenerationEmailDiscoveryTrace[];
  };
  costUsdAgentcash?: number;
  costUsdAnthropic?: number;
  llm?: {
    calls: GenerationLlmCallTrace[];
    totalEstimatedCostUsd?: number;
  };
  sourceGate?: {
    acceptedCount: number;
    rejectedCount: number;
    acceptedSamples: GenerationSourceTrace[];
    rejectedSamples: GenerationSourceRejection[];
  };
  extraction?: {
    sourceCount: number;
    evidenceCount: number;
    citationCount: number;
    fallbackUsed: boolean;
    providerFactCandidateCount?: number;
    providerFactAppliedCount?: number;
    providerFactPaths?: string[];
    providerFactAppliedByEndpoint?: Record<string, number>;
    blockEnrichment?: {
      requested: string[];
      produced: string[];
      citationCount: number;
      errors?: Record<string, string>;
    };
  };
  synthesis?: {
    required: boolean;
    produced: boolean;
    claimCountBeforeVerify: number;
    claimCountAfterVerify: number;
    gateMessage?: string;
  };
  // Per-section provenance and cost for the section model. A derived section is
  // recorded as "derived", never as "deep".
  sections?: GenerationSectionTrace[];
  failure?: {
    stage: string;
    message: string;
    className?: string;
  };
};

// Minimal runtime guard for GenerationTrace persisted in DB JSONB. Lenient on optional sub-fields,
// strict on the two required fields. .passthrough() preserves unknown keys so new trace fields don't
// require a coordinated migration.
export const generationTraceSchema = z
  .object({
    jobKind: z.string().min(1),
    mode: z.enum(["basics", "analysis"]),
    steps: z.record(z.unknown()).optional(),
    inngest: z.unknown().optional(),
    milestones: z.unknown().optional(),
    providers: z.unknown().optional(),
    llm: z.unknown().optional(),
    sourceGate: z.unknown().optional(),
    extraction: z.unknown().optional(),
    synthesis: z.unknown().optional(),
    failure: z.unknown().optional()
  })
  .passthrough();
