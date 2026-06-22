import type { ColdStartCard } from "@cold-start/core";
import type { ExtensionResearchRunEvent, ExtensionSourceSummary } from "./extension-config";
import { currentProfileProgressEvents } from "./research-progress";

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
  status: "ready";
};

const fillerPattern = /\b(ai-native|agentic|emerging leader|next[-\s]?generation|platform for everyone|all-in-one|end-to-end|revolutionizing|transforming|unlocking)\b/i;
const boilerplatePattern = /\b(platform|solution)\s+(for|that)\s+(everyone|businesses of all sizes)\b/i;

const firstReadFiledEventTypes = new Set(["card.saved", "card.enriched"]);
const firstReadPendingEventTypes = new Set(["card.partial"]);

const markClassRank: Record<FirstReadMarkClass, number> = {
  independent: 0,
  company: 1,
  reported: 2
};

function latestProfileRunEvents(events: ExtensionResearchRunEvent[]) {
  return currentProfileProgressEvents(events);
}

function terminalFirstReadState(events: ExtensionResearchRunEvent[]) {
  const profileEvents = latestProfileRunEvents(events);
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

function sourceLooksLikeDocs(source: Pick<ExtensionSourceSummary, "domain" | "snippet" | "title" | "url">) {
  const text = `${source.domain} ${source.title} ${source.snippet} ${source.url}`.toLowerCase();
  return /\bdocs?\b|documentation|developer|api reference|quickstart|guide/.test(text);
}

function evidenceMarkForSource(source: ExtensionSourceSummary): { label: string; cls: FirstReadMarkClass } {
  switch (source.sourceType) {
    case "filing":
      return { label: "filing", cls: "independent" };
    case "news":
      return { label: "independent", cls: "independent" };
    case "company_site":
      return sourceLooksLikeDocs(source) ? { label: "docs", cls: "company" } : { label: "company", cls: "company" };
    case "github":
      return { label: "code", cls: "company" };
    case "enrichment":
    case "rdap":
      return { label: "database", cls: "reported" };
    default:
      return { label: "reported", cls: "reported" };
  }
}

function buildEvidence(sources: ExtensionSourceSummary[]) {
  const byDomain = new Map<string, FirstReadEvidence>();

  for (const source of sources) {
    const domain = source.domain?.toLowerCase().replace(/^www\./, "").trim();
    if (!domain) {
      continue;
    }

    const mark = evidenceMarkForSource(source);
    const candidate: FirstReadEvidence = {
      id: source.id,
      domain,
      label: mark.label,
      cls: mark.cls,
      href: source.url
    };
    const existing = byDomain.get(domain);
    // Keep the strongest classification when one domain appears as several sources.
    if (!existing || markClassRank[candidate.cls] < markClassRank[existing.cls]) {
      byDomain.set(domain, candidate);
    }
  }

  const ordered = [...byDomain.values()].sort(
    (left, right) => markClassRank[left.cls] - markClassRank[right.cls] || left.domain.localeCompare(right.domain)
  );

  return {
    evidence: ordered.slice(0, 4),
    sourceCount: ordered.length,
    independentCount: ordered.filter((item) => item.cls === "independent").length
  };
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
  events?: ExtensionResearchRunEvent[];
  sources?: ExtensionSourceSummary[];
  summary?: string;
}): FirstRead {
  const { evidence, sourceCount, independentCount } = buildEvidence(sources);
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
    const proof = proofReadForCard(card);
    if (proof && !isNearDuplicate(proof, summary)) {
      read = proof;
      readKind = "proof";
      readLabel = "Latest proof";
    }
  }

  return {
    read,
    readKind,
    readLabel,
    evidence,
    sourceCount,
    independentCount,
    gap: gapForCard(card, buyerProven),
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
