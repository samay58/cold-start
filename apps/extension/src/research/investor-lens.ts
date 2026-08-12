import {
  sourceQualityForSource,
  sourceQualityRank,
  safeWebUrl,
  stripCitationMarkers,
  type Citation,
  type ColdStartCard,
  type OpenQuestion,
  type QuestionCategory,
  type SourcedText
} from "@cold-start/core";
import { EMPHASIS_EMPTY_COPY, LENS_TENSION_EMPTY_COPY } from "./investor-read-copy";

export type SourcePosture =
  | "company-authored"
  | "founder-authored"
  | "independent"
  | "reporting"
  | "enrichment"
  | "unknown";

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
export const LENS_WAITS_FOR_PROFILE_REASON = "Finish the profile to open it.";

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

// The sixth Lens category's display state: "read" when the model filed a loud/quiet
// asymmetry, "thin_file"/"nothing_notable" mirror emphasisReadSchema's other two statuses,
// and "not_read" covers a legacy card generated before this field existed. The category is
// always present in investorLensCategories regardless of state; only its preview text and
// this state value change.
type EmphasisDisplayState = "read" | "thin_file" | "nothing_notable" | "not_read";
type EmphasisDisplay = {
  state: EmphasisDisplayState;
  loud: string | null;
  quiet: string | null;
  read: string | null;
  wouldChangeIf: string | null;
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
  emphasis: EmphasisDisplay;
};

export type InvestorLensCategoryId =
  | "why-care"
  | "must-be-true"
  | "could-break"
  | "why-now"
  | "learn-next"
  | "pay-attention";

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
        : "No clear timing signal yet."
    },
    {
      id: "learn-next",
      label: "What to learn next",
      preview: read.nextQuestion?.question ?? "No sharp next question yet."
    },
    {
      id: "pay-attention",
      label: "Pay attention to",
      preview: read.emphasis.read
        ?? (read.emphasis.state === "thin_file"
          ? EMPHASIS_EMPTY_COPY.thinFile
          : read.emphasis.state === "nothing_notable"
            ? EMPHASIS_EMPTY_COPY.nothingNotable
            : EMPHASIS_EMPTY_COPY.notRead)
    }
  ];
}

const POSTURE_ORDER: SourcePosture[] = [
  "independent",
  "reporting",
  "founder-authored",
  "company-authored",
  "enrichment",
  "unknown"
];

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

  if (tier === "founder_authored") {
    return "founder-authored";
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

// Loud and Read are cited SourcedText claims like any other; Quiet and Would-change-if are
// plain file-scoped strings with no citations. Only feeds lensSources (the footer source chips):
// independentlyBacked stays scoped to supportedClaims alone, per the emphasis read's own rule
// that it must never move the tension/timing posture judgment.
function emphasisSourcedClaims(card: ColdStartCard): SourcedText[] {
  const emphasis = card.synthesis?.emphasisRead;
  if (!emphasis || emphasis.status !== "read") {
    return [];
  }
  return [emphasis.loud, emphasis.read];
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
    const href = citation ? safeWebUrl(citation.url) : null;
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
      // founder_authored falls into the same "company" chip as company-authored sources: a
      // dedicated fourth chip class is not in v1, matching the founder-authored posture's
      // ranking right alongside company-authored for this footer's coarser three-class view.
      sourceClass: tier === "independent_technical" || tier === "independent_analysis"
        ? "independent"
        : tier === "independent_report"
          ? "reporting"
          : "company"
    });
  }

  return sources;
}

function updatedOn(generatedAt: string): string | null {
  const parsed = new Date(generatedAt);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short", timeZone: "UTC" }).format(parsed);
}

function receiptLine(card: ColdStartCard) {
  const date = updatedOn(card.generatedAt);
  return date ? `Updated ${date}` : "Updated";
}

// The sixth Lens category's display model. Absent (legacy card, no field at all) and
// thin_file/nothing_notable (the model ran but has nothing to file) collapse to the same
// null-content shape; only a filed "read" status carries text. Loud and Read cite like any
// other synthesis claim so they need stripCitationMarkers; Quiet and Would-change-if are
// plain file-scoped strings (emphasisReadFiledSchema) and carry no markers to strip.
function emphasisDisplayForCard(card: ColdStartCard): EmphasisDisplay {
  const emphasis = card.synthesis?.emphasisRead;
  if (!emphasis) {
    return { state: "not_read", loud: null, quiet: null, read: null, wouldChangeIf: null };
  }
  if (emphasis.status !== "read") {
    return { state: emphasis.status, loud: null, quiet: null, read: null, wouldChangeIf: null };
  }

  return {
    state: "read",
    loud: stripCitationMarkers(emphasis.loud.text),
    quiet: emphasis.quiet,
    read: stripCitationMarkers(emphasis.read.text),
    wouldChangeIf: emphasis.wouldChangeIf
  };
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
    // The sixth card's own citations (fv or otherwise) need to appear as source chips too, so
    // the footer sees the emphasis read's claims; independentlyBacked below stays scoped to the
    // original claims only, unaffected by this addition.
    sources: lensSources(citations, [...claims, ...emphasisSourcedClaims(card)]),
    independentlyBacked: claims.some((claim) => {
      const posture = strongestPosture(citations, claim.citationIds);
      return posture === "independent" || posture === "reporting";
    }),
    emphasis: emphasisDisplayForCard(card)
  };
}
