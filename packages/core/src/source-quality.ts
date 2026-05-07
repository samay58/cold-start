import type { Citation } from "./card";

export type SourceQualityTier =
  | "independent_technical"
  | "independent_analysis"
  | "independent_report"
  | "primary_company"
  | "press_release"
  | "enrichment"
  | "unknown";

export type SourceQuality = {
  tier: SourceQualityTier;
  label: string;
  rationale: string;
  incentive: string;
};

type SourceQualityInput = Pick<Citation, "url" | "title" | "sourceType">;

const independentTechnicalHosts = [
  "substack.com",
  "sacrainsights.com",
  "stratechery.com",
  "latentspace.ai",
  "interconnects.ai",
  "newsletter.pragmaticengineer.com",
];

const pressReleaseHosts = [
  "prnewswire.com",
  "businesswire.com",
  "globenewswire.com",
  "accesswire.com",
  "einpresswire.com",
];

export function sourceQualityRank(source: SourceQualityInput): number {
  const rank: Record<SourceQualityTier, number> = {
    independent_technical: 7,
    independent_analysis: 6,
    independent_report: 5,
    primary_company: 4,
    press_release: 2,
    enrichment: 1,
    unknown: 0,
  };

  return rank[sourceQualityForSource(source).tier];
}

export function sourceQualityForSource(source: SourceQualityInput): SourceQuality {
  const hostname = hostnameForUrl(source.url);
  const searchable = `${source.url} ${source.title}`.toLowerCase();

  if (source.sourceType === "enrichment") {
    return {
      tier: "enrichment",
      label: "Data vendor",
      rationale: "Useful for coverage, weaker for investor judgment unless confirmed elsewhere.",
      incentive: "Vendor-derived.",
    };
  }

  if (pressReleaseHosts.some((host) => hostname.endsWith(host)) || /\bpress release\b/.test(searchable)) {
    return {
      tier: "press_release",
      label: "Company PR",
      rationale: "Company-shaped narrative. Good for exact announcement facts, weak for evaluation.",
      incentive: "Promotional.",
    };
  }

  if (
    independentTechnicalHosts.some((host) => hostname.endsWith(host)) ||
    /\b(technical deep dive|architecture|benchmark|teardown|field notes)\b/.test(searchable)
  ) {
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

  if (source.sourceType === "company_site") {
    return {
      tier: "primary_company",
      label: "Company-authored",
      rationale: "Best for product mechanics and official facts, weaker for claims about importance.",
      incentive: "Company positioning.",
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

function hostnameForUrl(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}
