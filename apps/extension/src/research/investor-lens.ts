import {
  sourceQualityForSource,
  sourceQualityRank,
  stripCitationMarkers,
  type Citation,
  type ColdStartCard,
  type OpenQuestion,
  type QuestionCategory,
  type SourcedText
} from "@cold-start/core";
import { safeExternalHref } from "@cold-start/ui";
import { LENS_TENSION_EMPTY_COPY } from "./investor-read-copy";

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

function labelForQuestionCategory(category: QuestionCategory | null): string | null {
  return category ? QUESTION_CATEGORY_LABELS[category] : null;
}

// The sealed lens row and partial profile use the same honest prerequisite.
export const LENS_WAITS_FOR_PROFILE_REASON = "Opens when the cited profile is filed.";

function cleanQuestionText(question: string) {
  return stripCitationMarkers(question)
    .replace(/\s*[\u2013\u2014]\s*/g, "; ")
    .replace(/\s+/g, " ")
    .replace(/^\s*(?:question\s*\d+[:.)-]?|ask[:.)-]?)\s*/i, "")
    .replace(/\s*(?:\.{3}|…)\s*$/u, "")
    .trim()
    .replace(/[.!?]*$/, "?");
}

type LensClaim = {
  text: string;
};

// A tension side (If true / It breaks if) keeps its lead claim in the card and files any
// remaining verified claims on that side behind a "+N more" affordance, mirroring how the
// timing row and the sources footer already handle overflow.
export type LensTensionClaim = LensClaim & {
  moreClaims: Array<{ text: string }>;
};

type LensTiming = {
  field: string;
  text: string;
  // The other supported timing fields, in memo order, so the card can file them
  // behind a "+N more" affordance instead of a bare count.
  moreFields: Array<{ field: string; text: string }>;
};

type LensQuestion = {
  question: string;
  categoryLabel: string | null;
  changesReadIf: string | null;
  // The rest of the model's ranked questions, filed behind a "+N more" affordance with their
  // category labels preserved so the memo does not drop what a dedicated Next Question layer
  // used to show.
  moreQuestions: Array<{ question: string; categoryLabel: string | null; changesReadIf: string | null }>;
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
  holds: LensTensionClaim | null;
  breaks: LensTensionClaim | null;
  timing: LensTiming | null;
  nextQuestion: LensQuestion | null;
  sources: LensSource[];
  independentlyBacked: boolean;
};

export type InvestorLensCategoryId =
  | "why-care"
  | "must-be-true"
  | "could-break"
  | "why-now"
  | "learn-next";

export type InvestorLensCategory = {
  id: InvestorLensCategoryId;
  label: string;
  preview: string;
};

export function investorLensCategories(read: InvestorReadDisplay): InvestorLensCategory[] {
  return [
    {
      id: "why-care",
      label: "Why care",
      preview: read.lede.text
    },
    {
      id: "must-be-true",
      label: "What must be true",
      preview: read.holds?.text ?? LENS_TENSION_EMPTY_COPY.holds
    },
    {
      id: "could-break",
      label: "What could break",
      preview: read.breaks?.text ?? LENS_TENSION_EMPTY_COPY.breaks
    },
    {
      id: "why-now",
      label: "Why now",
      preview: read.timing
        ? `${read.timing.field}. ${read.timing.text}`
        : "Not supported by current sources."
    },
    {
      id: "learn-next",
      label: "What to learn next",
      preview: read.nextQuestion?.question ?? "No ranked question survived verification."
    }
  ];
}

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

function lensClaim(claim: SourcedText): LensClaim {
  return { text: stripCitationMarkers(claim.text) };
}

// A tension side keeps its lead claim in the standard LensClaim shape and files whatever
// verified claims remain (bullCase/bearCase are 0-3 post-verification) behind moreClaims.
function tensionClaim(claims: SourcedText[]): LensTensionClaim | null {
  const [first, ...rest] = claims;
  if (!first) {
    return null;
  }

  return {
    ...lensClaim(first),
    moreClaims: rest.map((claim) => ({ text: stripCitationMarkers(claim.text) }))
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

function timingDisplay(card: ColdStartCard): LensTiming | null {
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
    moreFields: supported.slice(1).map((entry) => ({
      field: entry.label,
      text: stripCitationMarkers(entry.claim.text)
    }))
  };
}

function isGenericRevenueQuestion(question: string) {
  const normalized = question.toLowerCase();
  return /\b(arr|revenue)\b/.test(normalized) && /\b(not public|undisclosed|not disclosed|verify|validate)\b/.test(normalized);
}

type PrioritizedQuestion = {
  question: string;
  categoryLabel: string | null;
  changesReadIf: string | null;
};

// The model already emits its highest-conviction questions in priority order, so this keeps
// that order. It only cleans the text, rewrites a generic revenue ask into a concrete one,
// dedupes, and attaches the model's category label plus, when the model named it, what
// answer would change the read. Shared by the memo's shown question and its "+N more" file.
function prioritizedQuestions(questions: readonly OpenQuestion[]): PrioritizedQuestion[] {
  const seen = new Set<string>();
  return questions
    .map((entry) => {
      const cleanedBody = cleanQuestionText(entry.question);
      const genericRevenue = isGenericRevenueQuestion(cleanedBody);
      const question = genericRevenue
        ? "What revenue quality, retention, and margin evidence would change the read?"
        : cleanedBody;
      const category: QuestionCategory | null = genericRevenue ? "unit_economics" : entry.category;
      const changesReadIf = entry.wouldChangeReadIf
        ? stripCitationMarkers(entry.wouldChangeReadIf).replace(/\s+/g, " ").trim()
        : null;
      return { question, categoryLabel: labelForQuestionCategory(category), changesReadIf: changesReadIf || null };
    })
    .filter((item) => {
      const key = item.question.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      if (!item.question || item.question === "?" || seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .slice(0, 3);
}

function nextQuestionDisplay(card: ColdStartCard): LensQuestion | null {
  const [first, ...rest] = prioritizedQuestions(card.synthesis?.openQuestions ?? []);
  if (!first) {
    return null;
  }

  return {
    question: first.question,
    categoryLabel: first.categoryLabel,
    changesReadIf: first.changesReadIf,
    moreQuestions: rest.map((entry) => ({ question: entry.question, categoryLabel: entry.categoryLabel, changesReadIf: entry.changesReadIf }))
  };
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
  const timing = timingDisplay(card);

  return {
    receiptLine: receiptLine(card),
    lede: lensClaim(card.synthesis.whyItMatters),
    holds: tensionClaim(card.synthesis.bullCase),
    breaks: tensionClaim(card.synthesis.bearCase),
    timing,
    nextQuestion: nextQuestionDisplay(card),
    sources: lensSources(citations, claims),
    independentlyBacked: claims.some((claim) => {
      const posture = strongestPosture(citations, claim.citationIds);
      return posture === "independent" || posture === "reporting";
    })
  };
}
