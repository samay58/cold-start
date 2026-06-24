import type { Citation } from "./card";
import { sourceAuthorityCategoriesForHost } from "./source-authority";
import { targetHostMatchesDomain } from "./source-target";

export type SourceQualityTier =
  | "independent_technical"
  | "independent_analysis"
  | "independent_report"
  | "primary_company"
  | "press_release"
  | "enrichment"
  | "unknown";

type SourceQuality = {
  tier: SourceQualityTier;
  label: string;
  rationale: string;
  incentive: string;
};

type SourceQualityInput = Pick<Citation, "url" | "title" | "sourceType">;
type SourceQualityOptions = {
  targetDomain?: string;
};

export function sourceQualityTierRank(tier: SourceQualityTier): number {
  const rank: Record<SourceQualityTier, number> = {
    independent_technical: 7,
    independent_analysis: 6,
    independent_report: 5,
    primary_company: 4,
    press_release: 2,
    enrichment: 1,
    unknown: 0,
  };

  return rank[tier];
}

export function sourceQualityRank(source: SourceQualityInput, options: SourceQualityOptions = {}): number {
  return sourceQualityTierRank(sourceQualityForSource(source, options).tier);
}

export function sourceQualityForSource(source: SourceQualityInput, options: SourceQualityOptions = {}): SourceQuality {
  const hostname = hostnameForUrl(source.url);
  const categories = new Set(sourceAuthorityCategoriesForHost(hostname));
  const searchable = `${source.url} ${source.title}`.toLowerCase();

  if (source.sourceType === "enrichment") {
    return {
      tier: "enrichment",
      label: "Data vendor",
      rationale: "Useful for coverage, weaker for investor judgment unless confirmed elsewhere.",
      incentive: "Vendor-derived.",
    };
  }

  if (source.sourceType === "company_site" || targetHostMatchesDomain(hostname, options.targetDomain)) {
    return companyAuthoredQuality();
  }

  if (categories.has("pressRelease") || /\bpress release\b/.test(searchable)) {
    return {
      tier: "press_release",
      label: "Company PR",
      rationale: "Company-shaped narrative. Good for exact announcement facts, weak for evaluation.",
      incentive: "Promotional.",
    };
  }

  if (categories.has("specialistTechnical")) {
    return {
      tier: "independent_technical",
      label: "Independent technical",
      rationale: "Technically grounded third-party source with less incentive to launder company positioning.",
      incentive: "Editorial or analyst judgment.",
    };
  }

  if (categories.has("publicRecord")) {
    return {
      tier: "independent_report",
      label: "Public record",
      rationale: "Primary public record or regulator-published source. Strong for facts, not interpretation.",
      incentive: "Regulated or public-interest disclosure.",
    };
  }

  if (categories.has("specialistAnalysis") || categories.has("analystResearch")) {
    return {
      tier: "independent_analysis",
      label: "Independent analysis",
      rationale: "Third-party framing source. Useful for market structure and category judgment.",
      incentive: "Editorial or analyst judgment.",
    };
  }

  if (categories.has("ventureFirm")) {
    return {
      tier: "independent_report",
      label: "Investor-authored",
      rationale: "Useful for market framing, funding context, and thesis context. Not neutral evaluation.",
      incentive: "Investor and portfolio incentives.",
    };
  }

  if (categories.has("expertTranscript")) {
    return {
      tier: "independent_report",
      label: "Expert transcript",
      rationale: "Useful for operator, investor, or expert context. Treat statements as interview evidence, not audited facts.",
      incentive: "Guest, host, and editorial incentives.",
    };
  }

  if (isLinkedInHost(hostname)) {
    return {
      tier: "enrichment",
      label: "Professional profile",
      rationale: "Useful for company presence and people evidence. Weak for market, traction, or evaluative claims.",
      incentive: "Self-reported professional-network data.",
    };
  }

  if (categories.has("communitySignal")) {
    return {
      tier: "independent_report",
      label: "Community signal",
      rationale: "Useful for practitioner sentiment and early technical adoption signals. Needs corroboration.",
      incentive: "Community discussion and anecdotal incentives.",
    };
  }

  if (categories.has("reputableReporting") || categories.has("professionalAndFundingDatabase")) {
    return {
      tier: "independent_report",
      label: "Independent report",
      rationale: "Third-party reporting or database context.",
      incentive: "Editorial, data-provider, or platform incentives.",
    };
  }

  if (categories.has("developerPlatform")) {
    return {
      tier: "independent_report",
      label: "Developer artifact",
      rationale: "Useful technical artifact or ecosystem signal. Interpret authorship and repository ownership carefully.",
      incentive: "Platform or repository incentives.",
    };
  }

  if (/\b(technical deep dive|architecture|benchmark|teardown|field notes)\b/.test(searchable)) {
    return {
      tier: "independent_technical",
      label: "Independent technical",
      rationale: "Technically grounded third-party source with less incentive to launder company positioning.",
      incentive: "Editorial or analyst judgment.",
    };
  }

  if (/\b(sacra|analysis|deep dive|market map|thesis|memo)\b/.test(searchable)) {
    return {
      tier: "independent_analysis",
      label: "Independent analysis",
      rationale: "Third-party framing source. Useful for market structure and category judgment.",
      incentive: "Editorial or analyst judgment.",
    };
  }

  if (source.sourceType === "news" || source.sourceType === "filing") {
    return {
      tier: "independent_report",
      label: source.sourceType === "filing" ? "Primary filing" : "Independent report",
      rationale: source.sourceType === "filing" ? "Primary document." : "Third-party reporting.",
      incentive: source.sourceType === "filing" ? "Regulated disclosure." : "Editorial reporting.",
    };
  }

  return {
    tier: "unknown",
    label: "Source",
    rationale: "Source incentive not classified.",
    incentive: "Unknown.",
  };
}

function companyAuthoredQuality(): SourceQuality {
  return {
    tier: "primary_company",
    label: "Company-authored",
    rationale: "Best for product mechanics and official facts, weaker for claims about importance.",
    incentive: "Company positioning.",
  };
}

function isLinkedInHost(hostname: string) {
  return hostname === "linkedin.com" || hostname.endsWith(".linkedin.com");
}

function hostnameForUrl(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}
