import { z } from "zod";

export type GenerationJobKind =
  | "basics"
  | "analysis"
  | "signals"
  | "customers"
  | "serves"
  | "mechanism"
  | "competition"
  | "openQuestions"
  | "section:buyer"
  | "section:customer_proof"
  | "section:traction"
  | "section:financing"
  | "section:competition"
  | "section:product"
  | "section:why_it_matters"
  | "section:market"
  | "section:risks";

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
  durationMs?: number;
  estimatedCostUsd?: number;
  expectedFacts?: string[];
  stopCondition?: string;
  error?: string;
};

export type GenerationLlmCallTrace = {
  stage: "research_plan" | "extract_full" | "extract_block" | "synthesis" | "verify";
  label: string;
  model: string;
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
  emailSource: "apollo_search" | "apollo_enrich" | "minerva" | "clado" | "hunter" | "exa" | null;
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
    };
    stableenrich?: {
      sourceCount: number;
      factCount?: number;
      failureCount: number;
      endpoints?: GenerationProviderEndpointTrace[];
    };
    mergedSourceCount?: number;
    emailDiscovery?: GenerationEmailDiscoveryTrace[];
  };
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
  };
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
