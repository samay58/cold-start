import type { ColdStartCard } from "./card";
import { hasUsablePublicProfile } from "./card-quality";
import type { GenerationTrace } from "./generation-trace";
import { sentenceCount } from "./sentences";

export type GenerationQualitySeverity = "warn" | "fail";

export type GenerationQualityFlagCode =
  | "missing_trace"
  | "failed_run"
  | "missing_extraction_trace"
  | "zero_citations"
  | "missing_synthesis_trace"
  | "no_synthesis_after_analysis"
  | "zero_analysis_evidence"
  | "vendor_only_citations"
  | "stableenrich_all_failed"
  | "stableenrich_no_fact_candidates"
  | "high_source_rejection"
  | "long_plan_step"
  | "long_generate_step"
  | "empty_identity"
  | "missing_company_website"
  | "missing_headcount"
  | "missing_comparables"
  | "empty_research_layer"
  | "bloated_overview"
  | "underfilled_public_profile";

export type GenerationQualityFlag = {
  code: GenerationQualityFlagCode;
  severity: GenerationQualitySeverity;
  message: string;
};

export type GenerationQualityInput = {
  status: string;
  mode: string;
  traceJson?: GenerationTrace | null;
  card?: ColdStartCard | null;
};

const PLAN_WARN_MS = 30_000;
const GENERATE_WARN_MS = 90_000;
const SOURCE_REJECTION_WARN_RATIO = 0.4;

function add(flags: GenerationQualityFlag[], flag: GenerationQualityFlag) {
  if (!flags.some((existing) => existing.code === flag.code)) {
    flags.push(flag);
  }
}

function stepDurationMs(trace: GenerationTrace, stepName: string) {
  const duration = trace.steps?.[stepName]?.durationMs;
  return typeof duration === "number" ? duration : null;
}

function hasResearchLayerContent(card: ColdStartCard) {
  const description = card.identity.description?.value;
  return Boolean(
    description?.concept ||
      description?.serves ||
      description?.mechanism ||
      card.signals.length > 0 ||
      card.comparables.length > 0 ||
      card.synthesis
  );
}

function hasBloatedOverview(card: ColdStartCard) {
  const description = card.identity.description?.value;
  const overview = description?.shortDescription ?? card.identity.oneLiner.value;
  if (!overview) {
    return false;
  }

  return overview.length > 260 || sentenceCount(overview) > 2;
}

function citationHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

function isVendorOnlyCitation(citation: ColdStartCard["citations"][number]) {
  const host = citationHost(citation.url);
  return citation.sourceType === "enrichment" || host === "stableenrich.dev" || host.endsWith(".stableenrich.dev");
}

export function generationQualityFlags(input: GenerationQualityInput): GenerationQualityFlag[] {
  const flags: GenerationQualityFlag[] = [];
  const trace = input.traceJson ?? null;
  const status = input.status.toLowerCase();
  const mode = input.mode.toLowerCase();

  if (status === "failed") {
    add(flags, {
      code: "failed_run",
      severity: "fail",
      message: "run failed"
    });
  }

  if (!trace) {
    add(flags, {
      code: "missing_trace",
      severity: "fail",
      message: "trace_json is missing"
    });
    return flags;
  }

  if (status === "complete" && !trace.extraction) {
    add(flags, {
      code: "missing_extraction_trace",
      severity: "fail",
      message: "completed run has no extraction trace"
    });
  }

  if (status === "complete" && trace.extraction && trace.extraction.citationCount === 0) {
    add(flags, {
      code: "zero_citations",
      severity: "fail",
      message: "completed run has zero extracted citations"
    });
  }

  if (status === "complete" && mode === "analysis" && !trace.synthesis) {
    add(flags, {
      code: "missing_synthesis_trace",
      severity: "fail",
      message: "completed analysis run has no synthesis trace"
    });
  }

  if (status === "complete" && mode === "analysis" && input.card && !input.card.synthesis) {
    add(flags, {
      code: "no_synthesis_after_analysis",
      severity: "fail",
      message: "analysis completed but API card has no synthesis"
    });
  }

  if (mode === "analysis" && trace.extraction && trace.extraction.sourceCount === 0 && trace.extraction.evidenceCount === 0) {
    add(flags, {
      code: "zero_analysis_evidence",
      severity: "fail",
      message: "analysis run had no fetched or loaded evidence sources"
    });
  }

  const stableenrich = trace.providers?.stableenrich;
  if (stableenrich && stableenrich.sourceCount === 0 && stableenrich.failureCount >= 3) {
    add(flags, {
      code: "stableenrich_all_failed",
      severity: "warn",
      message: "StableEnrich returned no sources and multiple failures"
    });
  }

  if (stableenrich && stableenrich.sourceCount > 0 && stableenrich.factCount !== undefined && stableenrich.factCount === 0) {
    add(flags, {
      code: "stableenrich_no_fact_candidates",
      severity: "warn",
      message: "StableEnrich returned sources but no structured facts"
    });
  }

  const sourceGate = trace.sourceGate;
  if (sourceGate) {
    const total = sourceGate.acceptedCount + sourceGate.rejectedCount;
    const rejectionRatio = total > 0 ? sourceGate.rejectedCount / total : 0;
    if (total >= 5 && rejectionRatio >= SOURCE_REJECTION_WARN_RATIO) {
      add(flags, {
        code: "high_source_rejection",
        severity: "warn",
        message: `${sourceGate.rejectedCount}/${total} sources rejected`
      });
    }
  }

  const planDuration = stepDurationMs(trace, "plan-research");
  if (planDuration !== null && planDuration > PLAN_WARN_MS) {
    add(flags, {
      code: "long_plan_step",
      severity: "warn",
      message: `plan step took ${Math.round(planDuration / 1000)}s`
    });
  }

  const generateDuration = stepDurationMs(trace, "generate-card");
  if (generateDuration !== null && generateDuration > GENERATE_WARN_MS) {
    add(flags, {
      code: "long_generate_step",
      severity: "warn",
      message: `generate step took ${Math.round(generateDuration / 1000)}s`
    });
  }

  if (input.card) {
    if (!input.card.identity.name.value && !input.card.identity.oneLiner.value) {
      add(flags, {
        code: "empty_identity",
        severity: "fail",
        message: "API card has no company name or one-liner"
      });
    }

    if (!input.card.identity.websiteUrl?.value) {
      add(flags, {
        code: "missing_company_website",
        severity: "warn",
        message: "API card has no canonical company website"
      });
    }

    if (!input.card.team.headcount.value) {
      add(flags, {
        code: "missing_headcount",
        severity: "warn",
        message: "API card has no headcount fact"
      });
    }

    if (input.card.comparables.length === 0) {
      add(flags, {
        code: "missing_comparables",
        severity: "warn",
        message: "API card has no comparable companies"
      });
    }

    if (status === "complete" && !hasResearchLayerContent(input.card)) {
      add(flags, {
        code: "empty_research_layer",
        severity: "warn",
        message: "API card has no research-layer content"
      });
    }

    if (status === "complete" && hasBloatedOverview(input.card)) {
      add(flags, {
        code: "bloated_overview",
        severity: "warn",
        message: "API card overview reads like a long product-page paragraph"
      });
    }

    if (status === "complete" && input.card.citations.length > 0 && input.card.citations.every(isVendorOnlyCitation)) {
      add(flags, {
        code: "vendor_only_citations",
        severity: "fail",
        message: "API card citations are only enrichment/vendor sources"
      });
    }

    if (status === "complete" && !hasUsablePublicProfile(input.card)) {
      add(flags, {
        code: "underfilled_public_profile",
        severity: "fail",
        message: "API card has citations but too few structured facts"
      });
    }
  }

  return flags;
}

export function formatGenerationQualityFlags(flags: GenerationQualityFlag[]) {
  if (flags.length === 0) {
    return "ok";
  }

  return flags.map((flag) => flag.code).join(", ");
}
