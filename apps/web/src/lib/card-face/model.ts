// Pure-logic layer for the public card face. No React, no fetch: every function here takes a
// card (and, where noted, research sections) and returns data the face components render
// as-is. Card-face components (Tasks 5-9) import from here instead of recomputing evidence
// state, citation numbering, or the honesty-doctrine copy themselves.
import type { Citation, ColdStartCard, ResearchSection, ResolvedFact } from "@cold-start/core";
import { splitIntoSentences, stripCitationMarkers } from "@cold-start/core";
import type { CitationLedger } from "@cold-start/ui";
import {
  buildCitationLedger,
  citationHostname,
  formatCompactCurrency,
  formatShortDate,
  sortedUniqueCitations,
  sourceClassForCitation
} from "@cold-start/ui";

export type PublicCardData = Omit<ColdStartCard, "synthesis" | "synthesisWithheld">;

export type ResolvedFactLike = {
  value: unknown;
  status: ResolvedFact<unknown>["status"];
  confidence: ResolvedFact<unknown>["confidence"];
  citationIds: string[];
};

export type EvidenceState = "verified" | "reported" | "company" | "conflict" | "unknown";

const NO_SOURCE_DETAIL = "no source in ledger";
const STANDARD_NEXT_QUESTION_SUBLINE = "Not a recommendation. The first thing this ledger cannot answer.";
const THIN_FILE_NEXT_QUESTION_SUBLINE = "Thin file, not a verdict.";

const monthYearFormatter = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

function monthYear(value: string | null): string | null {
  if (!value) {
    return null;
  }
  if (/^\d{4}$/.test(value)) {
    return value;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return monthYearFormatter.format(parsed);
}

// "A and B" / "A, B, and C" — the join style the design doc's example trailer uses verbatim.
function listOf(items: string[]): string {
  if (items.length === 0) {
    return "";
  }
  if (items.length === 1) {
    return items[0]!;
  }
  if (items.length === 2) {
    return `${items[0]} and ${items[1]}`;
  }
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function sectionLabel(sectionId: string): string {
  const spaced = sectionId.replaceAll("_", " ");
  return spaced.length > 0 ? `${spaced[0]!.toUpperCase()}${spaced.slice(1)}` : spaced;
}

// --- Evidence state (ported verbatim from packages/ui/src/CardShell.tsx; deleted from ui in
// Task 10). Behavior must stay identical: this is the honesty-doctrine judgment every fact
// and section on the card face renders against. ---

function evidenceStateFromConfidence(fact: ResolvedFactLike): EvidenceState {
  if (fact.status === "inferred" || fact.confidence === "low") {
    return "company";
  }

  if (fact.confidence === "medium") {
    return "reported";
  }

  return "verified";
}

function publicEvidenceStatusForFact(fact: ResolvedFactLike | undefined, ledger: CitationLedger): EvidenceState {
  if (!fact || fact.value === null) {
    return "unknown";
  }

  if (fact.status === "mixed") {
    return "conflict";
  }

  const classes = fact.citationIds.flatMap((id) => {
    const entry = ledger.get(id);
    return entry ? [entry.sourceClass] : [];
  });
  const uniqueClasses = new Set(classes);

  if (classes.length === 0) {
    return evidenceStateFromConfidence(fact);
  }

  if ((uniqueClasses.has("independent") || uniqueClasses.has("reporting")) && new Set(fact.citationIds).size > 1) {
    return "verified";
  }

  if (uniqueClasses.has("independent") || uniqueClasses.has("reporting")) {
    return "reported";
  }

  if (uniqueClasses.has("company")) {
    return "company";
  }

  return "unknown";
}

export function evidenceStateForFact(card: PublicCardData, fact: ResolvedFactLike): EvidenceState {
  return publicEvidenceStatusForFact(fact, buildCitationLedger(card.citations));
}

// Ported verbatim from packages/ui/src/CardShell.tsx (publicEvidenceText). Sentence-aware clip
// to ~260 chars: prefers a clean sentence boundary, falls back to a word-boundary ellipsis.
export function publicEvidenceText(text: string, limit = 260): string {
  const cleaned = stripCitationMarkers(text);
  if (cleaned.length <= limit) {
    return cleaned;
  }

  let sentencePrefix = "";
  for (const sentence of splitIntoSentences(cleaned)) {
    const candidate = sentencePrefix ? `${sentencePrefix} ${sentence}` : sentence;
    if (candidate.length > limit) {
      break;
    }
    sentencePrefix = candidate;
    if (sentencePrefix.length >= 120) {
      return sentencePrefix;
    }
  }

  const clipped = cleaned.slice(0, limit);
  const lastSpace = clipped.lastIndexOf(" ");
  return `${clipped.slice(0, lastSpace > 120 ? lastSpace : limit).trim()}...`;
}

// --- Citations ---

export interface CitationIndex {
  ordered: Citation[];
  displayNumber(id: string): number | null;
}

// Deliberately distinct from the CitationLedger's quality-tier order: this is the order
// citations first appear in the card, the numbering the sources rail and inline marks share.
export function buildCitationIndex(card: PublicCardData): CitationIndex {
  const seen = new Set<string>();
  const ordered: Citation[] = [];

  for (const citation of card.citations) {
    if (seen.has(citation.id)) {
      continue;
    }
    seen.add(citation.id);
    ordered.push(citation);
  }

  const numberById = new Map<string, number>();
  ordered.forEach((citation, index) => numberById.set(citation.id, index + 1));

  return {
    ordered,
    displayNumber: (id: string) => numberById.get(id) ?? null
  };
}

export function callNumber(card: PublicCardData): string {
  const label = (card.domain.split(".")[0] || card.domain).toUpperCase();
  const year = new Date(card.generatedAt).getUTCFullYear();
  const yy = String(year % 100).padStart(2, "0");
  return `CS·${label}·${yy}`;
}

export function isThinFile(card: PublicCardData): boolean {
  const citations = sortedUniqueCitations(card.citations);
  if (citations.length < 3) {
    return true;
  }

  const hasVettedCitation = citations.some((citation) => {
    const sourceClass = sourceClassForCitation(citation);
    return sourceClass === "independent" || sourceClass === "reporting";
  });

  return !hasVettedCitation;
}

export function vettedCounts(card: PublicCardData): { verified: number; total: number } {
  const citations = sortedUniqueCitations(card.citations);
  const verified = citations.filter((citation) => {
    const sourceClass = sourceClassForCitation(citation);
    return sourceClass === "independent" || sourceClass === "reporting";
  }).length;

  return { verified, total: citations.length };
}

// --- Stat strip ---

export interface StatSlot {
  key: "stage" | "raised" | "headcount" | "valuation" | "openRoles";
  label: string;
  value: string | null;
  detail: string;
  state: EvidenceState | null;
  conflict: boolean;
  citationIds: string[];
}

export function statSlots(card: PublicCardData): StatSlot[] {
  const round = card.funding.lastRound;
  const totalRaised = card.funding.totalRaisedUsd;
  const headcount = card.team.headcount;

  const stageDetail = ((): string => {
    if (!round.value) {
      return NO_SOURCE_DETAIL;
    }
    const lead = round.value.leadInvestors[0] ?? null;
    const parts = [monthYear(round.value.announcedAt), lead ? `led by ${lead}` : null].filter(
      (part): part is string => Boolean(part)
    );
    return parts.length > 0 ? parts.join(" · ") : NO_SOURCE_DETAIL;
  })();

  const headcountDetail = ((): string => {
    if (!headcount.value) {
      return NO_SOURCE_DETAIL;
    }
    if (headcount.status === "mixed") {
      return "sources disagree, see below";
    }
    return `as of ${formatShortDate(headcount.value.asOf)}`;
  })();

  return [
    {
      key: "stage",
      label: "Stage",
      value: round.value?.name ?? null,
      detail: stageDetail,
      state: round.value ? evidenceStateForFact(card, round) : null,
      conflict: round.status === "mixed",
      citationIds: round.value ? round.citationIds : []
    },
    {
      key: "raised",
      label: "Raised",
      value: totalRaised.value !== null ? formatCompactCurrency(totalRaised.value) : null,
      detail: totalRaised.value !== null ? "disclosed rounds" : NO_SOURCE_DETAIL,
      state: totalRaised.value !== null ? evidenceStateForFact(card, totalRaised) : null,
      conflict: totalRaised.status === "mixed",
      citationIds: totalRaised.value !== null ? totalRaised.citationIds : []
    },
    {
      key: "headcount",
      label: "Headcount",
      value: headcount.value ? String(headcount.value.value) : null,
      detail: headcountDetail,
      state: headcount.value ? evidenceStateForFact(card, headcount) : null,
      conflict: headcount.status === "mixed",
      citationIds: headcount.value ? headcount.citationIds : []
    },
    // Valuation and Open roles have no schema field: they are permanently absent, not
    // waiting for data. Rendering the honest absent state is the point, not a bug.
    {
      key: "valuation",
      label: "Valuation",
      value: null,
      detail: NO_SOURCE_DETAIL,
      state: null,
      conflict: false,
      citationIds: []
    },
    {
      key: "openRoles",
      label: "Open roles",
      value: null,
      detail: NO_SOURCE_DETAIL,
      state: null,
      conflict: false,
      citationIds: []
    }
  ];
}

// --- Money ---

export interface FactBullet {
  text: string;
  state: EvidenceState;
  citationIds: string[];
  muted?: boolean;
}

export function moneyBullets(card: PublicCardData): FactBullet[] {
  const totalRaised = card.funding.totalRaisedUsd;
  const lastRound = card.funding.lastRound;
  const hasRaised = totalRaised.value !== null;
  const hasRound = lastRound.value !== null;

  if (!hasRaised && !hasRound) {
    return [];
  }

  const bullets: FactBullet[] = [];

  if (hasRaised) {
    bullets.push({
      text: `Raised ${formatCompactCurrency(totalRaised.value)} across disclosed rounds.`,
      state: evidenceStateForFact(card, totalRaised),
      citationIds: totalRaised.citationIds
    });
  }

  if (hasRound) {
    const round = lastRound.value!;
    const lead = round.leadInvestors[0] ?? null;
    const monthText = monthYear(round.announcedAt);
    const closedClause = monthText ? ` closed ${monthText}` : "";
    const leadClause = lead ? `, led by ${lead}` : "";
    bullets.push({
      text: `${round.name}${closedClause}${leadClause}.`,
      state: evidenceStateForFact(card, lastRound),
      citationIds: lastRound.citationIds
    });
  }

  const investors = card.funding.investors;
  const investorsMissing = investors.value === null || investors.value.length === 0;

  const missing: string[] = [];
  if (hasRound && lastRound.value!.amountUsd === null) {
    missing.push("Round size");
  }
  // Post-money valuation has no schema field anywhere on the card: it is always missing,
  // the same honesty doctrine the Valuation stat slot renders.
  missing.push("post-money valuation");
  if (investorsMissing) {
    missing.push("the full investor list");
  }

  if (missing.length > 0) {
    bullets.push({
      text: `${listOf(missing)} ${missing.length === 1 ? "is" : "are"} not publicly disclosed.`,
      state: "unknown",
      citationIds: [],
      muted: true
    });
  }

  return bullets;
}

// --- Headcount conflict ---

export interface HeadcountConflict {
  value: number;
  asOf: string | null;
  sources: { label: string; date: string | null; citationId: string }[];
}

export function headcountConflict(card: PublicCardData): HeadcountConflict | null {
  const headcount = card.team.headcount;
  if (headcount.status !== "mixed" || !headcount.value) {
    return null;
  }

  const citationsById = new Map(card.citations.map((citation) => [citation.id, citation]));
  const sources = headcount.citationIds.map((citationId) => {
    const citation = citationsById.get(citationId);
    const label = citation ? citation.title || citationHostname(citation.url) || citationId : citationId;
    const date = citation ? formatShortDate(citation.fetchedAt) : null;
    return { label, date, citationId };
  });

  return {
    value: headcount.value.value,
    asOf: headcount.value.asOf,
    sources
  };
}

// --- Signals ---

// Signals are raw events, not ResolvedFacts (no status/confidence to read), so they get their
// own simpler evidence rule instead of routing through evidenceStateForFact: an all-company
// signal is caveated as company-sourced, any independent citation clears the bar as verified
// outright (even mixed with weaker sources), everything else with at least one citation reads
// as reported, and a signal with no citation at all is unknown.
export function signalEvidenceState(card: PublicCardData, signal: { citationIds: string[] }): EvidenceState {
  if (signal.citationIds.length === 0) {
    return "unknown";
  }

  const ledger = buildCitationLedger(card.citations);
  const classes = signal.citationIds.map((id) => ledger.get(id)?.sourceClass ?? "unknown");

  if (classes.every((sourceClass) => sourceClass === "company")) {
    return "company";
  }

  if (classes.some((sourceClass) => sourceClass === "independent")) {
    return "verified";
  }

  return "reported";
}

// --- Risk caveats ---

function allCitationsResolveToCompanyClass(citationIds: string[], ledger: CitationLedger): boolean {
  if (citationIds.length === 0) {
    return false;
  }
  return citationIds.every((id) => ledger.get(id)?.sourceClass === "company");
}

// Shared by riskCaveats and nextQuestionForCard: prefer the customer_proof research section
// when the caller passed one; only fall back to scanning signals when no such section exists
// at all (not when it exists but fails to qualify).
function companyOnlyProofCitationIds(
  card: PublicCardData,
  sections: ResearchSection[],
  ledger: CitationLedger
): string[] | null {
  const customerProofSection = sections.find((section) => section.sectionId === "customer_proof");
  if (customerProofSection) {
    return allCitationsResolveToCompanyClass(customerProofSection.citationIds, ledger)
      ? customerProofSection.citationIds
      : null;
  }

  const fallbackSignal = card.signals.find((signal) => allCitationsResolveToCompanyClass(signal.citationIds, ledger));
  return fallbackSignal ? fallbackSignal.citationIds : null;
}

export function riskCaveats(card: PublicCardData, sections: ResearchSection[]): FactBullet[] {
  const ledger = buildCitationLedger(card.citations);
  const bullets: FactBullet[] = [];

  const companyOnlyCitationIds = companyOnlyProofCitationIds(card, sections, ledger);
  if (companyOnlyCitationIds) {
    bullets.push({
      text: "The customer proof is company-sourced only. No independent source in this ledger confirms it.",
      state: "company",
      citationIds: companyOnlyCitationIds
    });
  }

  for (const section of sections) {
    if (section.status === "stale") {
      bullets.push({
        text: `The ${sectionLabel(section.sectionId)} section is stale. Its sources predate the last successful refresh.`,
        state: "unknown",
        citationIds: section.citationIds
      });
    }
  }

  return bullets;
}

// --- Next question ---

export interface NextQuestion {
  question: string;
  subline: string;
}

export function nextQuestionForCard(card: PublicCardData, sections: ResearchSection[]): NextQuestion | null {
  const ledger = buildCitationLedger(card.citations);

  if (companyOnlyProofCitationIds(card, sections, ledger)) {
    return { question: "Ask for one referenceable production customer.", subline: STANDARD_NEXT_QUESTION_SUBLINE };
  }

  if (headcountConflict(card)) {
    return {
      question: "Ask the company for a current headcount and the date it was counted.",
      subline: STANDARD_NEXT_QUESTION_SUBLINE
    };
  }

  if (card.funding.totalRaisedUsd.value === null && card.funding.lastRound.value === null) {
    return { question: "Ask what the company has raised and from whom.", subline: STANDARD_NEXT_QUESTION_SUBLINE };
  }

  if (isThinFile(card)) {
    return { question: "Ask who funds the company and on what terms.", subline: THIN_FILE_NEXT_QUESTION_SUBLINE };
  }

  return null;
}
