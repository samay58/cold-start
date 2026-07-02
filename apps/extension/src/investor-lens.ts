import {
  sourceQualityForSource,
  sourceQualityRank,
  stripCitationMarkers,
  type Citation,
  type ColdStartCard,
  type QuestionCategory,
  type SourcedText
} from "@cold-start/core";
import { safeExternalHref } from "@cold-start/ui";

export type SourcePosture = "company-authored" | "independent" | "reporting" | "enrichment" | "unknown";

const QUESTION_CATEGORY_LABELS: Record<QuestionCategory, string> = {
  buyer_budget: "Buyer & budget",
  adoption_proof: "Adoption & proof",
  durability: "Durability",
  unit_economics: "Unit economics",
  technical_edge: "Technical edge",
  market_timing: "Market & timing",
  trust_regulation: "Trust & regulation"
};

export function labelForQuestionCategory(category: QuestionCategory | null): string | null {
  return category ? QUESTION_CATEGORY_LABELS[category] : null;
}

// The sealed lens row in the company arc and the live control in the research layer
// speak this same line while the cited profile is still building.
export const LENS_WAITS_FOR_PROFILE_REASON = "The cited profile must finish before Investor Lens can run.";

export function cleanQuestionText(question: string) {
  return stripCitationMarkers(question)
    .replace(/\s*[\u2013\u2014]\s*/g, "; ")
    .replace(/\s+/g, " ")
    .replace(/^\s*(?:question\s*\d+[:.)-]?|ask[:.)-]?)\s*/i, "")
    .replace(/\s*(?:\.{3}|…)\s*$/u, "")
    .trim()
    .replace(/[.!?]*$/, "?");
}

export type LensClaim = {
  text: string;
  sourcePosture: SourcePosture;
};

type LensTiming = {
  field: string;
  text: string;
  sourcePosture: SourcePosture;
  // The other supported timing fields, in memo order, so the card can file them
  // behind a "+N more" affordance instead of a bare count.
  moreFields: Array<{ field: string; text: string }>;
};

type LensQuestion = {
  question: string;
  categoryLabel: string | null;
  changesReadIf: string | null;
};

type LensPostureMark = {
  posture: SourcePosture;
  label: string;
  count: number;
};

// Structurally matches the research-layer source reference so the shared SourceChips
// component renders memo sources without a cross-module type dependency.
type LensSource = {
  id: string;
  domain: string;
  href: string;
  title: string;
  qualityLabel: string;
  sourceClass: "independent" | "reporting" | "company";
};

export type InvestorReadDisplay = {
  receiptLine: string;
  lede: LensClaim;
  holds: LensClaim | null;
  breaks: LensClaim | null;
  timing: LensTiming | null;
  timingNotFound: boolean;
  nextQuestion: LensQuestion | null;
  postureMarks: LensPostureMark[];
  sources: LensSource[];
  independentlyBacked: boolean;
  supportedClaimCount: number;
};

const POSTURE_LABELS: Record<SourcePosture, string> = {
  independent: "independent",
  reporting: "reported",
  "company-authored": "company",
  enrichment: "enrichment",
  unknown: "unknown"
};

const POSTURE_ORDER: SourcePosture[] = ["independent", "reporting", "company-authored", "enrichment", "unknown"];

// The memo shows the single sharpest supported timing field. Trigger and risk carry the
// most "why now" weight; structural fields follow.
const TIMING_FIELD_ORDER: Array<{
  field: keyof NonNullable<NonNullable<ColdStartCard["synthesis"]>["marketStructureAndTiming"]>;
  label: string;
}> = [
  { field: "adoptionTrigger", label: "Adoption trigger" },
  { field: "timingRisk", label: "Timing risk" },
  { field: "buyerBudget", label: "Buyer budget" },
  { field: "painSeverity", label: "Pain severity" },
  { field: "marketStructure", label: "Market structure" },
  { field: "profitPool", label: "Profit pool" },
  { field: "expansionPath", label: "Expansion path" }
];

export function sourcePostureForCitation(citation: Citation | undefined): SourcePosture {
  if (!citation) {
    return "unknown";
  }

  if (citation.sourceType === "enrichment") {
    return "enrichment";
  }

  const tier = (citation.sourceQuality ?? sourceQualityForSource(citation)).tier;
  if (tier === "independent_technical" || tier === "independent_analysis") {
    return "independent";
  }

  if (tier === "independent_report" || citation.sourceType === "news" || citation.sourceType === "filing") {
    return "reporting";
  }

  if (citation.sourceType === "company_site" || tier === "primary_company" || tier === "press_release") {
    return "company-authored";
  }

  return "unknown";
}

export function timingIsNotFound(card: ColdStartCard) {
  const market = card.synthesis?.marketStructureAndTiming;
  if (!market) {
    return true;
  }

  return Object.values(market).every((claim) => claim === null);
}

function citationLookup(card: ColdStartCard) {
  return new Map(card.citations.map((citation) => [citation.id, citation]));
}

function strongestPosture(
  citations: Map<string, Citation>,
  citationIds: readonly string[]
): SourcePosture {
  const postures = citationIds.map((id) => sourcePostureForCitation(citations.get(id)));
  for (const posture of POSTURE_ORDER) {
    if (postures.includes(posture)) {
      return posture;
    }
  }
  return "unknown";
}

function lensClaim(citations: Map<string, Citation>, claim: SourcedText): LensClaim {
  return {
    text: stripCitationMarkers(claim.text),
    sourcePosture: strongestPosture(citations, claim.citationIds)
  };
}

function supportedClaims(card: ColdStartCard): SourcedText[] {
  if (!card.synthesis) {
    return [];
  }

  const market = card.synthesis.marketStructureAndTiming;
  const marketClaims = market
    ? Object.values(market).filter((claim): claim is SourcedText => Boolean(claim))
    : [];

  return [
    card.synthesis.whyItMatters,
    ...card.synthesis.bullCase,
    ...card.synthesis.bearCase,
    ...marketClaims
  ];
}

function timingDisplay(card: ColdStartCard, citations: Map<string, Citation>): LensTiming | null {
  const market = card.synthesis?.marketStructureAndTiming;
  if (!market) {
    return null;
  }

  const supported = TIMING_FIELD_ORDER.flatMap((entry) => {
    const claim = market[entry.field];
    return claim ? [{ label: entry.label, claim }] : [];
  });
  const first = supported[0];
  if (!first) {
    return null;
  }

  return {
    field: first.label,
    text: stripCitationMarkers(first.claim.text),
    sourcePosture: strongestPosture(citations, first.claim.citationIds),
    moreFields: supported.slice(1).map((entry) => ({
      field: entry.label,
      text: stripCitationMarkers(entry.claim.text)
    }))
  };
}

function nextQuestionDisplay(card: ColdStartCard): LensQuestion | null {
  const entry = card.synthesis?.openQuestions[0];
  if (!entry) {
    return null;
  }

  const changesReadIf = entry.wouldChangeReadIf
    ? stripCitationMarkers(entry.wouldChangeReadIf).replace(/\s+/g, " ").trim()
    : null;

  return {
    question: cleanQuestionText(entry.question),
    categoryLabel: labelForQuestionCategory(entry.category),
    changesReadIf: changesReadIf || null
  };
}

function postureMarks(citations: Map<string, Citation>, claims: SourcedText[]): LensPostureMark[] {
  const counts = new Map<SourcePosture, number>();
  for (const claim of claims) {
    const posture = strongestPosture(citations, claim.citationIds);
    counts.set(posture, (counts.get(posture) ?? 0) + 1);
  }

  return POSTURE_ORDER.flatMap((posture) => {
    const count = counts.get(posture);
    return count ? [{ posture, label: POSTURE_LABELS[posture], count }] : [];
  });
}

function domainFromHref(href: string) {
  try {
    return new URL(href).hostname.replace(/^www\./, "");
  } catch {
    return href;
  }
}

function sourceDedupeKey(href: string) {
  try {
    const parsed = new URL(href);
    parsed.hash = "";
    parsed.search = "";
    parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/";
    return parsed.toString().toLowerCase();
  } catch {
    return href.toLowerCase();
  }
}

function lensSources(citations: Map<string, Citation>, claims: SourcedText[]): LensSource[] {
  const orderedIds = Array.from(new Set(claims.flatMap((claim) => claim.citationIds))).sort((left, right) => {
    const leftCitation = citations.get(left);
    const rightCitation = citations.get(right);
    return (rightCitation ? sourceQualityRank(rightCitation) : -1) - (leftCitation ? sourceQualityRank(leftCitation) : -1);
  });
  const seenSourceKeys = new Set<string>();
  const sources: LensSource[] = [];

  for (const id of orderedIds) {
    const citation = citations.get(id);
    const href = citation ? safeExternalHref(citation.url) : null;
    if (!citation || !href) {
      continue;
    }

    const key = sourceDedupeKey(href);
    if (seenSourceKeys.has(key)) {
      continue;
    }

    seenSourceKeys.add(key);
    const tier = (citation.sourceQuality ?? sourceQualityForSource(citation)).tier;
    sources.push({
      id: citation.id,
      domain: domainFromHref(href),
      href,
      title: citation.title,
      qualityLabel: citation.sourceQuality?.label ?? sourceQualityForSource(citation).label,
      sourceClass: tier === "independent_technical" || tier === "independent_analysis"
        ? "independent"
        : tier === "independent_report"
          ? "reporting"
          : "company"
    });
  }

  return sources;
}

function filedOn(generatedAt: string): string | null {
  const parsed = new Date(generatedAt);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short", timeZone: "UTC" }).format(parsed);
}

// The filed date alone; the claims themselves are on the card, so a held-claims count
// would be ink without information.
function receiptLine(card: ColdStartCard) {
  const date = filedOn(card.generatedAt);
  return date ? `Filed ${date}` : "Filed";
}

export function investorReadForCard(card: ColdStartCard): InvestorReadDisplay | null {
  if (!card.synthesis) {
    return null;
  }

  const citations = citationLookup(card);
  const claims = supportedClaims(card);
  const marks = postureMarks(citations, claims);
  const timing = timingDisplay(card, citations);
  const bull = card.synthesis.bullCase[0] ?? null;
  const bear = card.synthesis.bearCase[0] ?? null;

  return {
    receiptLine: receiptLine(card),
    lede: lensClaim(citations, card.synthesis.whyItMatters),
    holds: bull ? lensClaim(citations, bull) : null,
    breaks: bear ? lensClaim(citations, bear) : null,
    timing,
    timingNotFound: timingIsNotFound(card),
    nextQuestion: nextQuestionDisplay(card),
    postureMarks: marks,
    sources: lensSources(citations, claims),
    independentlyBacked: marks.some((mark) => mark.posture === "independent" || mark.posture === "reporting"),
    supportedClaimCount: claims.length
  };
}
