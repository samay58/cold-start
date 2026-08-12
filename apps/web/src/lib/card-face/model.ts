// Pure-logic layer for the public card face. No React, no fetch: every function here takes a
// card (and, where noted, research sections) and returns data the face components render
// as-is. Card-face components (Tasks 5-9) import from here instead of recomputing evidence
// state, citation numbering, or the honesty-doctrine copy themselves.
import type { Citation, ColdStartCard, ResearchSection, ResolvedFact, SourceQualityTier } from "@cold-start/core";
import { isAgedProfile, splitIntoSentences, stripCitationMarkers } from "@cold-start/core";
import type { CitationLedger } from "@cold-start/ui";
import {
  buildCitationLedger,
  citationHostname,
  formatCompactCurrency,
  formatShortDate,
  sortedUniqueCitations,
  sourceClassForCitation,
  sourceClassForQualityTier
} from "@cold-start/ui";

export type PublicCardData = Omit<ColdStartCard, "synthesis" | "synthesisWithheld">;

export type ResolvedFactLike = {
  value: unknown;
  status: ResolvedFact<unknown>["status"];
  confidence: ResolvedFact<unknown>["confidence"];
  citationIds: string[];
};

export type EvidenceState = "verified" | "reported" | "company" | "conflict" | "unknown";

// The locked "Investor read" teaser's five row labels are shared by the public card and landing
// page preview so the gated categories cannot drift.
export const INVESTOR_READ_LABELS = [
  "Why care",
  "What must be true",
  "What could break",
  "Why now",
  "What to learn next"
] as const;

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

// "A and B" / "A, B, and C": the join style the design doc's example trailer uses verbatim.
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

// evidenceStateForFact falls back to a fact's stated status/confidence whenever none of its
// citationIds resolve in the card's citation ledger (see publicEvidenceStatusForFact above). Some
// card-face rows (the Money section's extra financing items, the Comps section) build a synthetic
// fact with a hard-coded "verified" status because they have no ResolvedFact of their own, so that
// fallback would render a filled-verified mark backed by zero real citations. Callers building a
// synthetic fact should use this instead of evidenceStateForFact directly: it checks the citation
// index first and reports "unknown" when nothing resolves, rather than trusting the hard-coded
// status.
export function resolvedEvidenceState(card: PublicCardData, index: CitationIndex, fact: ResolvedFactLike): EvidenceState {
  const hasResolvedCitation = fact.citationIds.some((id) => index.displayNumber(id) !== null);
  return hasResolvedCitation ? evidenceStateForFact(card, fact) : "unknown";
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

function callNumberFromParts(domain: string, generatedAt: string): string {
  const label = (domain.split(".")[0] || domain).toUpperCase();
  const year = new Date(generatedAt).getUTCFullYear();
  const yy = String(year % 100).padStart(2, "0");
  return `CS·${label}·${yy}`;
}

export type CitationMark = { id: string; number: number };

// Resolves citationIds through the index into plain, serializable {id, number} pairs, dropping
// any id the index can't place. Deliberately kept here rather than inside choreography.tsx's
// client component: StatStrip, SectionRows, and ConflictPanel are server components, and
// CitationIndex.displayNumber is a closure. If the resolve step lived in the "use client" module
// instead, a server component rendering it would have to serialize the whole index (including
// that function) across the RSC boundary, the exact crash CardFace.tsx's own comment documents
// for PocketCard ("Functions cannot be passed directly to Client Components"). Calling this here
// first and passing only the resolved marks into the client component keeps every card-face
// surface, server or client, on the same safe side of that boundary.
export function citationMarks(citationIds: string[], index: CitationIndex): CitationMark[] {
  return citationIds
    .map((id) => ({ id, number: index.displayNumber(id) }))
    .filter((entry): entry is CitationMark => entry.number !== null);
}

export function callNumber(card: PublicCardData): string {
  return callNumberFromParts(card.domain, card.generatedAt);
}

// For recorded-build-data.ts's consumers: that data module is deliberately import-free (its own
// header explains why), so it can't shape into a full PublicCardData. This takes the same two
// primitives (domain, a date string) directly instead.
export function callNumberFor(domain: string, generatedAt: string): string {
  return callNumberFromParts(domain, generatedAt);
}

// The receipt-register "2026·05·15" form every filed date on the card face, footer, catalog row,
// and landing hero card uses: parse to Date, guard NaN, format YYYY·MM·DD in UTC. Distinct from
// @cold-start/ui's formatShortDate, which produces "Mon YYYY" prose shorthand instead.
export function filedDateStamp(generatedAt: string): string {
  const parsed = new Date(generatedAt);
  if (Number.isNaN(parsed.getTime())) {
    return generatedAt;
  }
  const year = parsed.getUTCFullYear();
  const month = String(parsed.getUTCMonth() + 1).padStart(2, "0");
  const day = String(parsed.getUTCDate()).padStart(2, "0");
  return `${year}·${month}·${day}`;
}

// Whether the filed date has aged past the human-attention threshold (14 days, in core's
// card-age module). The face renders it as one weight step plus a dot, never an alert.
export function isAgedCard(card: PublicCardData, now?: Date): boolean {
  return now ? isAgedProfile(card.generatedAt, now) : isAgedProfile(card.generatedAt);
}

function isThinFileFromCitations(input: Citation[]): boolean {
  const citations = sortedUniqueCitations(input);
  if (citations.length < 3) {
    return true;
  }

  const hasVettedCitation = citations.some((citation) => {
    const sourceClass = sourceClassForCitation(citation);
    return sourceClass === "independent" || sourceClass === "reporting";
  });

  return !hasVettedCitation;
}

export function isThinFileFromSourceQualityCounts(
  counts: Record<SourceQualityTier, number>
): boolean {
  const sourceCount = Object.values(counts).reduce((total, count) => total + count, 0);
  if (sourceCount < 3) {
    return true;
  }

  return !Object.entries(counts).some(
    ([tier, count]) => count > 0 && ["independent", "reporting"].includes(
      sourceClassForQualityTier(tier as SourceQualityTier)
    )
  );
}

export function isThinFile(card: PublicCardData): boolean {
  return isThinFileFromCitations(card.citations);
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
  key: "stage" | "raised" | "headcount" | "valuation" | "founded";
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
  const foundedYear = card.identity.foundedYear;

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
    // Valuation has no schema field: it is permanently absent, not waiting for data.
    // Rendering the honest absent state is the point, not a bug.
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
      key: "founded",
      label: "Founded",
      value: foundedYear.value !== null ? String(foundedYear.value) : null,
      // No secondary line for a bare year; a founded year genuinely can be missing (unlike
      // Valuation, which never has a schema field at all), so the absence renders through the
      // same italic "not publicly disclosed" / "no source in ledger" treatment as every other
      // slot rather than a bespoke message.
      detail: foundedYear.value !== null ? "" : NO_SOURCE_DETAIL,
      state: foundedYear.value !== null ? evidenceStateForFact(card, foundedYear) : null,
      conflict: foundedYear.status === "mixed",
      citationIds: foundedYear.value !== null ? foundedYear.citationIds : []
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

// Shared by SectionRows (the desktop People section row) and PocketCard (the pocket's People
// tab): the same three-way OR decides whether either surface has anything to show.
export function hasPeopleContent(card: PublicCardData, conflict: HeadcountConflict | null): boolean {
  const founders = card.team.founders.value ?? [];
  const execs = card.team.keyExecs.value ?? [];
  return founders.length > 0 || execs.length > 0 || conflict !== null;
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

// deriveLegacyResearchSectionsFromCard (packages/core) always emits a customer_proof section,
// even when nothing was ever found for it: an empty placeholder with no items, no summary, and
// no citations. That placeholder must not read as "the customer proof is authoritative and
// company-only" (it says nothing at all), so a section only counts as authoritative here when it
// actually carries content.
function customerProofSectionHasContent(section: ResearchSection): boolean {
  if (section.citationIds.length > 0) {
    return true;
  }
  if (!section.content) {
    return false;
  }
  return section.content.items.length > 0 || Boolean(section.content.summary);
}

// Shared by riskCaveats and nextQuestionForCard: prefer the customer_proof research section
// when the caller passed one with real content; only fall back to scanning signals when no such
// section exists, or the one that exists is an empty placeholder (not when it has content but
// fails to qualify as company-only).
function companyOnlyProofCitationIds(
  card: PublicCardData,
  sections: ResearchSection[],
  ledger: CitationLedger
): string[] | null {
  const customerProofSection = sections.find((section) => section.sectionId === "customer_proof");
  if (customerProofSection && customerProofSectionHasContent(customerProofSection)) {
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
