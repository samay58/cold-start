export type GenerationJobKind =
  | "basics"
  | "analysis"
  | "signals"
  | "customers"
  | "serves"
  | "mechanism"
  | "competition"
  | "openQuestions";

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
  error?: string;
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
