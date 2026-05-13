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
      failureCount: number;
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
