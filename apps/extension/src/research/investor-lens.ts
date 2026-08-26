import {
  HOW_IT_WINS_STRATEGIES,
  howItWinsStrategyById,
  sourceQualityForSource,
  sourceQualityRank,
  safeWebUrl,
  stripCitationMarkers,
  type Citation,
  type ColdStartCard,
  type HowItWinsStrategyId,
  type OpenQuestion,
  type QuestionCategory,
  type SourcedText
} from "@cold-start/core";
import { EMPHASIS_EMPTY_COPY, LENS_TENSION_EMPTY_COPY } from "./investor-read-copy";
import type { ExtensionResearchRunEvent } from "../shared/extension-config";

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

// A side of The case (Bull / Bear) keeps its lead claim in the card and files any remaining
// verified claims on that side behind a "+N more" affordance, mirroring how the next question
// and the sources footer already handle overflow.
export type LensTensionClaim = LensClaim & {
  moreClaims: Array<{ text: string }>;
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

// The Pay attention to category's display state: "read" when the model filed a loud/quiet
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

// How it wins is not a category row: it is the crown on the packet's edge, so it carries its
// own display shape rather than a preview string. "not_read" covers a legacy card generated
// before the field existed; three of the rest mirror howItWinsSchema's own statuses. "reading"
// is the one state no stored card can carry: the read runs in the background after the analysis
// run settles, so the panel supplies it from the run's trail (see howItWinsPendingForCard).
type HowItWinsDisplayState = "read" | "reading" | "thin_file" | "nothing_stands_out" | "not_read";
export type HowItWinsDisplay = {
  state: HowItWinsDisplayState;
  // read: the model's sentence. nothing_stands_out: the model's own sentence when it named
  // one, null when the verifier degraded a read in code and the crown falls back to its copy.
  sentence: string | null;
  running: Array<{ id: HowItWinsStrategyId; name: string; note: string }>;
  pair: {
    strategies: [HowItWinsStrategyId, HowItWinsStrategyId];
    names: [string, string];
    note: string;
    wrongIf: string;
  } | null;
  next: Array<{ id: HowItWinsStrategyId; name: string; note: string }>;
  inQuestion: Array<{ id: HowItWinsStrategyId; name: string; note: string }>;
  count: number;
};

export type InvestorReadDisplay = {
  receiptLine: string;
  lede: LensClaim;
  holds: LensTensionClaim | null;
  breaks: LensTensionClaim | null;
  nextQuestion: LensQuestion | null;
  sources: LensSource[];
  independentlyBacked: boolean;
  emphasis: EmphasisDisplay;
};

export type InvestorLensCategoryId =
  | "why-care"
  | "the-case"
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
      id: "the-case",
      // The closed preview shows one line for a two-sided row, so it leads with the Bull claim
      // and falls back to the Bear claim only when no bull survived verification.
      label: "The case",
      preview: read.holds?.text ?? read.breaks?.text ?? LENS_TENSION_EMPTY_COPY.holds
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
// that it must never move the case's posture judgment.
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

function displaySentence(text: string): string {
  const stripped = stripCitationMarkers(text).replace(/\s+/g, " ").trim();
  if (!stripped) {
    return "";
  }
  return /[.!?]$/.test(stripped) ? stripped : `${stripped}.`;
}

// Timing has no row of its own: it closes the Why care thesis when the model supported it.
// Only the two fields that carry real timing weight qualify, trigger before risk. The five
// structural fields (buyer budget, pain severity, market structure, profit pool, expansion
// path) stay in the card's synthesis and off this surface.
function timingBeat(card: ColdStartCard): string | null {
  const market = card.synthesis?.marketStructureAndTiming;
  if (!market) {
    return null;
  }

  const beat = [market.adoptionTrigger, market.timingRisk]
    .flatMap((claim) => (claim ? [displaySentence(claim.text)] : []))
    .filter(Boolean)
    .join(" ");

  return beat || null;
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

// The Pay attention to category's display model. Absent (legacy card, no field at all) and
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

// Every non-read state carries the same empty content. A function rather than a shared
// constant so each display gets its own arrays and no two reads can alias one another.
function noHowItWinsContent() {
  return { running: [], pair: null, next: [], inQuestion: [], count: 0 };
}

const KNOWN_STRATEGY_IDS = new Set<string>(HOW_IT_WINS_STRATEGIES.map((strategy) => strategy.id));

// The crown's display model. Names come from the shared vocabulary rather than the model's
// output, so a filed read can never show a strategy name Cold Start does not recognize. An id
// the vocabulary has never heard of drops out rather than throwing on lookup: the write path
// enforces the enum twice, but the panel has no error boundary and does not parse the cards it
// fetches, so a card filed by a newer build must cost its own entry and nothing else.
function howItWinsEntries(entries: Array<{ strategy: HowItWinsStrategyId; note: string }>) {
  return entries
    .filter((entry) => KNOWN_STRATEGY_IDS.has(entry.strategy))
    .map((entry) => ({
      id: entry.strategy,
      name: howItWinsStrategyById(entry.strategy).name,
      note: stripCitationMarkers(entry.note)
    }));
}

// A card is fresh enough that a read dispatched alongside it could still be running. Only
// consulted when the panel holds no event trail to ask instead.
const HOW_IT_WINS_FRESH_CARD_MS = 10 * 60 * 1000;

// The crown's one panel-local state. The background read lands one to four minutes after the
// analysis run settles, and the stored card carries no status for that gap, so the panel reads
// it off the run's own trail: the read started and has not landed. An explicit completion in
// the trail is final even with no read on the card, because the background function emits it
// when it gives up too. With no trail at all (a panel opened cold on a cached card) the card's
// own age stands in for one.
export function howItWinsPendingForCard(
  card: ColdStartCard,
  events: ExtensionResearchRunEvent[],
  now: number = Date.now()
): boolean {
  if (!card.synthesis || card.synthesis.howItWins) {
    return false;
  }
  if (events.some((event) => event.type === "how-it-wins.complete")) {
    return false;
  }
  if (events.some((event) => event.type === "how-it-wins.started")) {
    return true;
  }
  if (events.length > 0) {
    return false;
  }
  const generatedAt = Date.parse(card.generatedAt);
  return Number.isFinite(generatedAt) && now >= generatedAt && now - generatedAt < HOW_IT_WINS_FRESH_CARD_MS;
}

export function howItWinsDisplayForCard(
  card: ColdStartCard,
  options: { pending?: boolean } = {}
): HowItWinsDisplay {
  const howItWins = card.synthesis?.howItWins;
  if (!howItWins) {
    const reading = options.pending === true && Boolean(card.synthesis);
    return { state: reading ? "reading" : "not_read", sentence: null, ...noHowItWinsContent() };
  }
  if (howItWins.status === "thin_file") {
    return { state: "thin_file", sentence: null, ...noHowItWinsContent() };
  }
  if (howItWins.status === "nothing_stands_out") {
    return {
      state: "nothing_stands_out",
      sentence: howItWins.sentence ? stripCitationMarkers(howItWins.sentence) : null,
      ...noHowItWinsContent(),
      inQuestion: howItWinsEntries(howItWins.inQuestion ?? [])
    };
  }

  const [pairLeft, pairRight] = howItWins.pair?.strategies ?? [];
  const running = howItWinsEntries(howItWins.running);
  const pairIds: [HowItWinsStrategyId, HowItWinsStrategyId] | null =
    pairLeft && pairRight && KNOWN_STRATEGY_IDS.has(pairLeft) && KNOWN_STRATEGY_IDS.has(pairRight)
      ? [pairLeft, pairRight]
      : null;

  return {
    state: "read",
    sentence: stripCitationMarkers(howItWins.sentence),
    running,
    pair: howItWins.pair && pairIds
      ? {
        strategies: pairIds,
        names: [howItWinsStrategyById(pairIds[0]).name, howItWinsStrategyById(pairIds[1]).name],
        note: stripCitationMarkers(howItWins.pair.note),
        wrongIf: stripCitationMarkers(howItWins.pair.wrongIf)
      }
      : null,
    next: howItWinsEntries(howItWins.next),
    inQuestion: howItWinsEntries(howItWins.inQuestion ?? []),
    count: running.length
  };
}

// The crown's cited notes belong in the footer's source chips for the same reason the emphasis
// read's do: a reader who follows the claim needs the source behind it. independentlyBacked
// stays scoped to supportedClaims alone, so neither read can move the posture judgment.
function howItWinsSourcedClaims(card: ColdStartCard): SourcedText[] {
  const howItWins = card.synthesis?.howItWins;
  if (!howItWins || (howItWins.status !== "read" && howItWins.status !== "nothing_stands_out")) {
    return [];
  }

  const inQuestion = (howItWins.inQuestion ?? []).map((entry) => ({ text: entry.note, citationIds: entry.citationIds }));
  if (howItWins.status === "nothing_stands_out") {
    return inQuestion;
  }

  const running = howItWins.running.map((entry) => ({ text: entry.note, citationIds: entry.citationIds }));
  const next = howItWins.next.map((entry) => ({ text: entry.note, citationIds: entry.citationIds }));
  return howItWins.pair
    ? [...running, { text: howItWins.pair.note, citationIds: howItWins.pair.citationIds }, ...next, ...inQuestion]
    : [...running, ...next, ...inQuestion];
}

export function investorReadForCard(card: ColdStartCard): InvestorReadDisplay | null {
  if (!card.synthesis) {
    return null;
  }

  const citations = citationLookup(card);
  const claims = supportedClaims(card);
  const beat = timingBeat(card);
  const lede = lensClaim(card.synthesis.whyItMatters);
  // A thesis that ends without punctuation would run straight into the beat, so it goes
  // through the same normalizer the beat's own sentences do. With no beat the thesis is left
  // exactly as the model wrote it.
  const ledeText = beat ? `${displaySentence(lede.text)} ${beat}` : lede.text;

  return {
    receiptLine: receiptLine(card),
    lede: { text: ledeText },
    holds: tensionClaim(card.synthesis.bullCase),
    breaks: tensionClaim(card.synthesis.bearCase),
    nextQuestion: nextQuestionDisplay(card),
    // The emphasis read's and the crown's own citations (fv or otherwise) need to appear as
    // source chips too, so the footer sees their claims; independentlyBacked below stays scoped
    // to the original claims only, unaffected by these additions.
    sources: lensSources(citations, [
      ...claims,
      ...emphasisSourcedClaims(card),
      ...howItWinsSourcedClaims(card)
    ]),
    independentlyBacked: claims.some((claim) => {
      const posture = strongestPosture(citations, claim.citationIds);
      return posture === "independent" || posture === "reporting";
    }),
    emphasis: emphasisDisplayForCard(card)
  };
}
