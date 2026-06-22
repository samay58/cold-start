import { newsworthyTitlePattern, sourceQualityForSource, sourceQualityRank, titleMentionsCompany, type ColdStartCard, type SourceQualityTier } from "@cold-start/core";
import type { ExtensionResearchRunEvent, ExtensionSourceSummary } from "./extension-config";
import { currentProfileProgressEvents, textLooksLikeDocs } from "./research-progress";

// First Read works off a unified source list: the live `sources` prop when present, plus the
// card's own citations (always available). A normalized shape lets both feed evidence + proof.
type FirstReadSourceLike = { id: string; url: string; title: string; sourceType: ColdStartCard["citations"][number]["sourceType"] };

// First Read is a temporary, source-backed evidence slip. It must read as the delta
// over the company overview, never a restatement of it: what evidence has actually
// landed, the one thing it lets you say, and the most important thing still missing.

type FirstReadMarkClass = "independent" | "company" | "reported";

type FirstReadEvidence = {
  id: string;
  domain: string;
  label: string;
  cls: FirstReadMarkClass;
  href: string;
};

type FirstReadKind = "buyer" | "proof" | "evidence";

export type FirstRead = {
  read: string;
  readKind: FirstReadKind;
  readLabel: string;
  evidence: FirstReadEvidence[];
  sourceCount: number;
  independentCount: number;
  gap: string;
  // True only when the slip has something concrete to say: a source-backed buyer read,
  // a real proof headline, or a real evidence trail. The panel hides First Read until this
  // is true so it never appears as a "still generating / don't know yet" filler card.
  substantive: boolean;
  status: "ready";
};

const fillerPattern = /\b(ai-native|agentic|emerging leader|next[-\s]?generation|platform for everyone|all-in-one|end-to-end|revolutionizing|transforming|unlocking)\b/i;
const boilerplatePattern = /\b(platform|solution)\s+(for|that)\s+(everyone|businesses of all sizes)\b/i;

const firstReadFiledEventTypes = new Set(["card.saved", "card.enriched"]);
const firstReadPendingEventTypes = new Set(["card.partial"]);

function terminalFirstReadState(events: ExtensionResearchRunEvent[]) {
  const profileEvents = currentProfileProgressEvents(events);
  let state: string | null = null;
  let stateTime: string | null = null;

  for (const event of profileEvents) {
    if (!firstReadFiledEventTypes.has(event.type) && !firstReadPendingEventTypes.has(event.type)) {
      continue;
    }

    if (!stateTime || event.createdAt.localeCompare(stateTime) >= 0) {
      state = event.type;
      stateTime = event.createdAt;
    }
  }

  return state;
}

function normalizeText(value: string | null | undefined) {
  const normalized = value?.replace(/\s+/g, " ").trim() ?? "";
  if (!normalized || fillerPattern.test(normalized) || boilerplatePattern.test(normalized)) {
    return null;
  }

  const sentence = normalized.replace(/[.。]+$/u, "");
  return `${sentence}.`;
}

function normalizeForComparison(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

// The read must not echo the company summary shown directly above it. Catch exact
// matches and the common case where one line is a substring of the other.
function isNearDuplicate(candidate: string, summary: string) {
  const left = normalizeForComparison(candidate);
  const right = normalizeForComparison(summary);
  if (!left || !right) {
    return false;
  }
  if (left === right) {
    return true;
  }
  const shorter = left.length <= right.length ? left : right;
  const longer = shorter === left ? right : left;
  return shorter.length >= 24 && longer.includes(shorter);
}

function hasCitations(citationIds: string[] | undefined) {
  return (citationIds?.length ?? 0) > 0;
}

function domainFromUrl(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

function looksLikeDocs(source: FirstReadSourceLike) {
  return textLooksLikeDocs(`${source.title} ${source.url}`);
}

// Classify by core's source-quality tier rather than raw sourceType, so a tertiary aggregator
// (independent_report) is honestly marked as reporting, not promoted to the green independent
// class. Only genuine independent technical/analysis sources earn "independent".
function markForTier(tier: SourceQualityTier, source: FirstReadSourceLike): { label: string; cls: FirstReadMarkClass } {
  switch (tier) {
    case "independent_technical":
    case "independent_analysis":
      // The green independent class must be earned by the host, not by a news headline that
      // happens to contain "analysis" or "deep dive". Generic news stays reporting.
      return source.sourceType === "news"
        ? { label: "report", cls: "reported" }
        : { label: tier === "independent_technical" ? "technical" : "analysis", cls: "independent" };
    case "independent_report":
      return { label: "report", cls: "reported" };
    case "primary_company":
      return { label: looksLikeDocs(source) ? "docs" : "company", cls: "company" };
    case "press_release":
      return { label: "PR", cls: "reported" };
    case "enrichment":
      return { label: "database", cls: "reported" };
    default:
      return { label: "source", cls: "reported" };
  }
}

function unifiedSources(card: ColdStartCard, sources: ExtensionSourceSummary[]): FirstReadSourceLike[] {
  const live = sources.map((source) => ({ id: source.id, url: source.url, title: source.title, sourceType: source.sourceType }));
  const cited = (card.citations ?? []).map((citation) => ({
    id: citation.id,
    url: citation.url,
    title: citation.title,
    sourceType: citation.sourceType
  }));
  return [...live, ...cited];
}

function buildEvidence(sources: FirstReadSourceLike[]) {
  const byDomain = new Map<string, FirstReadEvidence & { rank: number }>();

  for (const source of sources) {
    const domain = domainFromUrl(source.url);
    if (!domain) {
      continue;
    }

    const tier = sourceQualityForSource(source).tier;
    const mark = markForTier(tier, source);
    const rank = sourceQualityRank(source);
    const candidate = { id: source.id, domain, label: mark.label, cls: mark.cls, href: source.url, rank };
    const existing = byDomain.get(domain);
    // Keep the strongest source when one domain appears more than once.
    if (!existing || rank > existing.rank) {
      byDomain.set(domain, candidate);
    }
  }

  const ordered = [...byDomain.values()].sort(
    (left, right) => right.rank - left.rank || left.domain.localeCompare(right.domain)
  );

  return {
    evidence: ordered.slice(0, 4).map(({ rank: _rank, ...item }) => item),
    sourceCount: ordered.length,
    independentCount: ordered.filter((item) => item.cls === "independent").length
  };
}

// A headline read straight off the strongest source title, before any LLM extraction. This is
// what makes the early state useful: "Runloop raises $7M seed" beats "11 sources filed". The
// classifier and entity match come from core (newsworthyTitlePattern, titleMentionsCompany) so
// the title must actually name the company and a mismatched aggregator headline is never surfaced.
function proofReadFromSources(sources: FirstReadSourceLike[], card: ColdStartCard) {
  const company = { name: card.identity.name.value, domain: card.domain };
  const ranked = sources
    .filter((source) => source.title && newsworthyTitlePattern.test(source.title) && titleMentionsCompany(source.title, company))
    .sort((left, right) => sourceQualityRank(right) - sourceQualityRank(left));

  for (const source of ranked) {
    const headline = normalizeText(source.title);
    if (headline) {
      return headline;
    }
  }
  return null;
}

function buyerReadForCard(card: ColdStartCard) {
  const description = card.identity.description;
  const serves = normalizeText(description?.value?.serves);
  return serves && hasCitations(description?.citationIds) ? serves : null;
}

function proofReadForCard(card: ColdStartCard) {
  const signals = card.signals ?? [];
  const freshest = [...signals]
    .filter((signal) => signal.title?.trim())
    .sort((left, right) => (right.date ?? "").localeCompare(left.date ?? ""))[0];

  return freshest ? normalizeText(freshest.title) : null;
}

function evidencePosture(sourceCount: number, independentCount: number) {
  if (sourceCount === 0) {
    return "Reading the first sources.";
  }
  const base = `${sourceCount} ${sourceCount === 1 ? "source" : "sources"} filed`;
  return independentCount > 0 ? `${base}, ${independentCount} independent.` : `${base}.`;
}

function gapForCard(card: ColdStartCard, buyerProven: boolean) {
  if (!buyerProven) {
    return "Who it's for and who pays.";
  }
  const noFunding = !card.funding.lastRound?.value && card.funding.totalRaisedUsd?.value == null;
  if (noFunding) {
    return "Funding terms and backers.";
  }
  return "Named customers and budget owner.";
}

export function firstReadForCard({
  card,
  sources = [],
  summary = ""
}: {
  card: ColdStartCard;
  sources?: ExtensionSourceSummary[];
  summary?: string;
}): FirstRead {
  const unified = unifiedSources(card, sources);
  const { evidence, sourceCount, independentCount } = buildEvidence(unified);
  const buyer = buyerReadForCard(card);
  const buyerProven = buyer !== null;

  let read = evidencePosture(sourceCount, independentCount);
  let readKind: FirstReadKind = "evidence";
  let readLabel = "Evidence so far";

  if (buyer && !isNearDuplicate(buyer, summary)) {
    read = buyer;
    readKind = "buyer";
    readLabel = "Who it's for";
  } else {
    // Prefer a dated signal headline, then a headline read straight off the strongest source.
    const proof = proofReadForCard(card) ?? proofReadFromSources(unified, card);
    if (proof && !isNearDuplicate(proof, summary)) {
      read = proof;
      readKind = "proof";
      readLabel = "Latest proof";
    }
  }

  // The slip is worth showing only when it carries a real read or a real evidence trail.
  // A bare "reading the first sources" with nothing filed is not a payoff, so it stays hidden.
  const substantive = readKind !== "evidence" || evidence.length >= 3;

  return {
    read,
    readKind,
    readLabel,
    evidence,
    sourceCount,
    independentCount,
    gap: gapForCard(card, buyerProven),
    substantive,
    status: "ready"
  };
}

export function firstReadIsFiled(events: ExtensionResearchRunEvent[] = []) {
  const state = terminalFirstReadState(events);
  return state === "card.saved" || state === "card.enriched";
}

export function firstReadIsPending(events: ExtensionResearchRunEvent[] = []) {
  const state = terminalFirstReadState(events);
  return state === "card.partial";
}
