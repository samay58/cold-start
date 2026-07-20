import {
  RESEARCH_SECTION_DEFINITIONS_BY_ID,
  canRunInvestorAnalysis,
  clusterSignals,
  fundingEvidenceFromCitations,
  sectionIdForLayer as coreSectionIdForLayer,
  signalCategorySchema,
  sourceQualityForSource,
  sourceQualityRank,
  stripCitationMarkers,
  type Citation,
  type ColdStartCard,
  type ResearchLayerId,
  type ResearchSection
} from "@cold-start/core";
import { formatCompactCurrency, formatMediumDate, formatShortDate, safeExternalHref } from "@cold-start/ui";

export type { ResearchLayerId } from "@cold-start/core";

type ResearchLayerSource = "card" | "analysis";
type ResearchLayerAvailability = "available" | "ready" | "empty";
type ResearchLayerDisplayStatus = "saved" | "ready" | "empty" | "running" | "failed" | "stale";

export type ResearchLayerCard = {
  id: ResearchLayerId;
  title: string;
  description: string;
  source: ResearchLayerSource;
};

export type ResearchLayer = ResearchLayerCard & {
  availability: ResearchLayerAvailability;
};

export type ResearchLayerDisplay = {
  id: ResearchLayerId;
  title: string;
  body: string;
  items?: Array<{
    title: string;
    body?: string;
    meta?: string;
    date?: string;
    corroboration?: number;
    sourceClass?: ResearchSourceClass;
  }> | undefined;
  rows?: Array<{
    label: string;
    value: string;
  }> | undefined;
  // Money layer only: deduped backer names (funding.investors plus rounds' leads) rendered
  // in one ledger row so the names are said exactly once.
  investors?: string[] | undefined;
  // Competition layer only: the cited sub-segment framing sentence, rendered as a lead line
  // above the comparable items. Absent when the card carries no supported framing.
  lead?: string | undefined;
  sources: ResearchLayerSourceReference[];
  sourceCount: number;
  // Honest module-header copy ("3 events · 10 sources"); falls back to the source count.
  statusLine?: string | undefined;
  status: ResearchLayerDisplayStatus;
};

type ResearchSourceClass = "independent" | "reporting" | "company";

type ResearchLayerSourceReference = {
  id: string;
  domain: string;
  href: string;
  title: string;
  qualityLabel: string;
  sourceClass: ResearchSourceClass;
};

// The investor read (memo) is the single synthesis surface: Why care, The case, Timing, and
// Next question all render there, absorbing whatever this deck used to show for them. This
// deck only carries the card-sourced layers, each backed by its own section.
export const RESEARCH_LAYER_CARDS: ResearchLayerCard[] = [
  { id: "serves", title: "Who pays", description: "Who pays and for what work", source: "card" },
  { id: "customers", title: "Proof", description: "Named customers and deployments", source: "card" },
  { id: "signals", title: "Signals", description: "What changed recently", source: "card" },
  { id: "investors", title: "Money", description: "Who funded it, and at what price", source: "card" },
  { id: "competition", title: "Comps", description: "The alternatives a buyer weighs", source: "card" },
  { id: "mechanism", title: "Product", description: "What makes it different", source: "card" }
];

export function sectionIdForLayer(id: ResearchLayerId): ResearchSection["sectionId"] {
  return coreSectionIdForLayer(id);
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

function citationSources(card: ColdStartCard, citationIds: readonly string[] = []): ResearchLayerSourceReference[] {
  if (citationIds.length === 0 || card.citations.length === 0) {
    return [];
  }

  const citations = new Map(card.citations.map((citation) => [citation.id, citation]));
  const seenCitationIds = new Set<string>();
  const seenSourceKeys = new Set<string>();
  const sources: ResearchLayerSourceReference[] = [];
  const orderedIds = Array.from(new Set(citationIds)).sort((left, right) => {
    const leftCitation = citations.get(left);
    const rightCitation = citations.get(right);
    return citationRank(rightCitation) - citationRank(leftCitation);
  });

  for (const id of orderedIds) {
    if (seenCitationIds.has(id)) {
      continue;
    }

    const citation = citations.get(id);
    const href = citation ? safeExternalHref(citation.url) : null;
    if (!citation || !href) {
      continue;
    }

    seenCitationIds.add(id);
    const sourceKey = sourceDedupeKey(href);
    if (seenSourceKeys.has(sourceKey)) {
      continue;
    }

    seenSourceKeys.add(sourceKey);
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

function citationRank(citation: Citation | undefined) {
  return citation ? sourceQualityRank(citation) : -1;
}

function displaySourceCount(sources: ResearchLayerSourceReference[]) {
  return sources.length;
}

function sectionForLayer(sections: ResearchSection[] | undefined, id: ResearchLayerId) {
  return sections?.find((section) => section.sectionId === sectionIdForLayer(id)) ?? null;
}

// Card-derived layers reuse the section definitions' empty-state copy so the truth-telling
// language lives in exactly one place.
function emptyBodyForLayer(id: ResearchLayerId) {
  return RESEARCH_SECTION_DEFINITIONS_BY_ID[sectionIdForLayer(id)].emptyState;
}

function bestSourceClass(card: ColdStartCard, citationIds: readonly string[]): ResearchSourceClass | undefined {
  // citationSources orders by source quality, so the first entry carries the strongest class.
  return citationSources(card, citationIds)[0]?.sourceClass;
}

function countNoun(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function eventsAndSourcesLine(eventCount: number, sourceCount: number) {
  return sourceCount > 0
    ? `${countNoun(eventCount, "event")} · ${countNoun(sourceCount, "source")}`
    : countNoun(eventCount, "event");
}

// Runtime gate over arbitrary stored labels, so it is a Set<string>; the values derive from the
// core taxonomy so this gate cannot silently drift from the schema.
const SIGNAL_CATEGORIES = new Set<string>(signalCategorySchema.options);
const LEGACY_DATED_TITLE = /^(\d{4}-\d{2}(?:-\d{2})?):\s+(.*)$/;

type SectionItem = NonNullable<ResearchSection["content"]>["items"][number];
type DisplayItem = NonNullable<ResearchLayerDisplay["items"]>[number];

// Traction items arrive in three stored shapes: the current derived shape (headline in label,
// "date · category · source" in meta), the legacy derived shape (category in label, "DATE: TITLE"
// in text), and deep LLM-authored items (label headline plus explanation text). All three render
// headline-first with quiet metadata.
function tractionDisplayItem(card: ColdStartCard, item: SectionItem): DisplayItem {
  const corroboration = item.citationIds.length;
  const sourceClass = bestSourceClass(card, item.citationIds);
  const base = {
    ...(corroboration > 1 ? { corroboration } : {}),
    ...(sourceClass ? { sourceClass } : {})
  };

  const metaParts = (item.meta ?? "").split(" · ");
  if (metaParts.length >= 2 && /^\d{4}(?:-\d{2}){1,2}$/.test(metaParts[0] ?? "")) {
    return {
      ...base,
      title: item.label,
      date: formatMediumDate(metaParts[0]),
      meta: [...metaParts.slice(2), metaParts[1]].filter(Boolean).join(" · ")
    };
  }

  const legacy = item.text.match(LEGACY_DATED_TITLE);
  if (legacy && SIGNAL_CATEGORIES.has(item.label)) {
    return {
      ...base,
      title: stripCitationMarkers(legacy[2] ?? item.text),
      date: formatMediumDate(legacy[1]),
      meta: [item.meta, item.label].filter(Boolean).join(" · ")
    };
  }

  return {
    ...base,
    title: item.label,
    ...(item.text !== item.label ? { body: stripCitationMarkers(item.text) } : {}),
    ...(item.meta ? { meta: item.meta } : {})
  };
}

function displayFromSection(card: ColdStartCard, layer: ResearchLayerCard, section: ResearchSection): ResearchLayerDisplay {
  const definition = RESEARCH_SECTION_DEFINITIONS_BY_ID[section.sectionId];
  const competitionFraming = section.sectionId === "competition" && card.competitionFraming?.value
    ? stripCitationMarkers(card.competitionFraming.value)
    : null;
  const sources = citationSources(card, competitionFraming
    ? Array.from(new Set([...section.citationIds, ...(card.competitionFraming?.citationIds ?? [])]))
    : section.citationIds);
  const content = section.content;
  const title = layer.title;

  if (section.status === "running") {
    return {
      id: layer.id,
      title,
      body: "Generating this section from cited evidence.",
      sources,
      sourceCount: displaySourceCount(sources),
      status: "running"
    };
  }

  if (section.status === "failed") {
    // Never surface the raw section.error here: it can be a ZodError dump or other internal
    // detail. The error is kept in the database for debugging; the reader gets a plain line.
    return {
      id: layer.id,
      title,
      body: "This section failed to generate. Retry to rebuild it from cited sources.",
      sources,
      sourceCount: displaySourceCount(sources),
      status: "failed"
    };
  }

  if (section.status === "not_started") {
    return {
      id: layer.id,
      title,
      body: "This section has not been generated yet.",
      sources,
      sourceCount: displaySourceCount(sources),
      status: "ready"
    };
  }

  if (section.status === "empty" || !content) {
    return {
      id: layer.id,
      title,
      body: definition.emptyState,
      sources,
      sourceCount: displaySourceCount(sources),
      status: "empty"
    };
  }

  // Financing renders the aggregate backer names from the card's structured funding;
  // the derived "Named investors include ..." text row would repeat them, so it is suppressed
  // whenever the ledger row carries the names.
  const investorNames = section.sectionId === "financing" ? investorNamesForCard(card) : [];
  const items = content.items
    .filter((item) => !(
      investorNames.length > 0 &&
      item.label === "Investors" &&
      item.text.startsWith("Named investors include")
    ))
    .map((item) =>
      section.sectionId === "traction"
        ? tractionDisplayItem(card, item)
        : {
            title: item.label,
            body: stripCitationMarkers(item.text),
            ...(item.meta ? { meta: item.meta } : {})
          }
    );
  const rows = section.sectionId === "market" && content.napkinMath
    ? [
        { label: "Formula", value: content.napkinMath.formula },
        { label: "Buyer count", value: content.napkinMath.buyers.value },
        { label: "Annual spend", value: content.napkinMath.annualSpend.value },
        { label: "Market size", value: content.napkinMath.marketSize.value },
      ]
    : undefined;

  return {
    id: layer.id,
    title,
    body: stripCitationMarkers(content.summary ?? items[0]?.body ?? items[0]?.title ?? definition.emptyState),
    ...(items.length > 0 ? { items } : {}),
    ...(rows ? { rows } : {}),
    ...(investorNames.length > 0 ? { investors: investorNames } : {}),
    ...(competitionFraming ? { lead: competitionFraming } : {}),
    sources,
    sourceCount: displaySourceCount(sources),
    ...(section.sectionId === "traction" && items.length > 0
      ? { statusLine: eventsAndSourcesLine(items.length, displaySourceCount(sources)) }
      : {}),
    status: section.status === "stale" ? "stale" : "saved"
  };
}

function dedupeStrings(values: string[]) {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const value of values) {
    const trimmed = value.trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(trimmed);
  }

  return unique;
}

// Aggregate backer list for the Money layer: every round lead first (ledger order),
// then the named investors fact, deduped case-insensitively.
function investorNamesForCard(card: ColdStartCard) {
  const rounds = card.funding.rounds?.value ?? (card.funding.lastRound.value ? [card.funding.lastRound.value] : []);
  return dedupeStrings([
    ...rounds.flatMap((round) => round.leadInvestors),
    ...(card.funding.investors.value ?? []).map((investor) => investor.name),
  ]);
}

function normalizeCompanyTerm(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/^www\./, "")
    .replace(/\b(ai|inc|labs|company|corp|corporation|llc|ltd)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function comparableDomainTerms(domain: string) {
  const cleaned = domain.replace(/^https?:\/\//i, "").split("/")[0]?.replace(/^www\./i, "") ?? domain;
  const parts = cleaned.split(".").filter(Boolean);
  const registrable = parts.length >= 2 ? parts.slice(-2).join(".") : cleaned;
  return Array.from(new Set([
    cleaned,
    registrable,
    parts[0] ?? cleaned,
  ].map(normalizeCompanyTerm).filter(Boolean)));
}

function targetCompanyTerms(card: ColdStartCard) {
  return Array.from(new Set([
    normalizeCompanyTerm(card.domain.split(".")[0] ?? card.domain),
    normalizeCompanyTerm(card.domain),
    normalizeCompanyTerm(card.identity.name.value),
  ].filter(Boolean)));
}

function comparableLooksLikeTarget(card: ColdStartCard, comparable: ColdStartCard["comparables"][number]) {
  const targetTerms = targetCompanyTerms(card);
  const comparableName = normalizeCompanyTerm(comparable.name);
  const comparableDomains = comparableDomainTerms(comparable.domain);

  return targetTerms.some((term) => {
    return (
      comparableName === term ||
      comparableName.startsWith(`${term} `) ||
      comparableDomains.some((domainTerm) => domainTerm === term || domainTerm.startsWith(`${term} `))
    );
  });
}

function displayComparables(card: ColdStartCard) {
  return card.comparables.filter((comparable) => !comparableLooksLikeTarget(card, comparable));
}

export function layersForCard(card: ColdStartCard, sections?: ResearchSection[]): ResearchLayer[] {
  const canAnalyze = canRunInvestorAnalysis(card);
  return RESEARCH_LAYER_CARDS.map((layer) => {
    const section = sectionForLayer(sections, layer.id);
    if (section) {
      return {
        ...layer,
        availability: section.status === "available" || section.status === "stale"
          ? "available"
          : section.status === "not_started" || section.status === "running"
            ? "ready"
            : "empty"
      };
    }

    if (layer.source === "analysis" && !card.synthesis) {
      return { ...layer, availability: "ready" };
    }

    const display = layerDisplayForCard(card, layer.id, sections);
    if (layer.source === "analysis" && display?.status === "ready" && !canAnalyze) {
      return { ...layer, availability: "ready" };
    }

    return {
      ...layer,
      availability: display?.status === "saved"
        ? "available"
        : display?.status === "ready" ? "ready" : "empty"
    };
  });
}

// The card is canonical for signals: stored traction rows are usually derived projections of
// card.signals (runId null), and the card-direct path renders clustered, corroborated events
// straight from the typed data. A stored section only wins while a run is in flight, after a
// failure, or when it carries deep LLM-authored content (runId set).
function signalsRenderFromCard(card: ColdStartCard, section: ResearchSection) {
  if (section.status === "running" || section.status === "failed") {
    return false;
  }
  if (section.runId) {
    return false;
  }
  return card.signals.length > 0;
}

export function layerDisplayForCard(card: ColdStartCard, id: ResearchLayerId, sections?: ResearchSection[]): ResearchLayerDisplay | null {
  const layer = RESEARCH_LAYER_CARDS.find((candidate) => candidate.id === id);
  if (!layer) {
    return null;
  }

  const section = sectionForLayer(sections, id);
  if (
    section &&
    !(id === "signals" && signalsRenderFromCard(card, section))
  ) {
    return displayFromSection(card, layer, section);
  }

  if (id === "customers") {
    const description = card.identity.description;
    const serves = description?.value?.serves;
    const sources = citationSources(card, description?.citationIds);
    return {
      id,
      title: layer.title,
      body: serves ?? emptyBodyForLayer(id),
      ...(serves ? { rows: [{ label: "Buyer / user", value: serves }] } : {}),
      sources,
      sourceCount: displaySourceCount(sources),
      status: serves ? "saved" : "empty"
    };
  }

  if (id === "serves") {
    const description = card.identity.description;
    const concept = description?.value?.concept;
    const shortDescription = description?.value?.shortDescription;
    const body = concept ?? shortDescription ?? card.identity.oneLiner.value ?? emptyBodyForLayer(id);
    const sources = citationSources(card, concept || shortDescription ? description?.citationIds : card.identity.oneLiner.citationIds);
    return {
      id,
      title: layer.title,
      body,
      rows: body ? [{ label: "Job served", value: body }] : undefined,
      sources,
      sourceCount: displaySourceCount(sources),
      status: concept || shortDescription || card.identity.oneLiner.value ? "saved" : "empty"
    };
  }

  if (id === "signals") {
    const clustered = clusterSignals(card.signals, {
      companyDomain: card.domain,
      companyName: card.identity.name.value
    });
    const sources = citationSources(card, clustered.flatMap((signal) => signal.citationIds));
    const items = clustered.map((signal) => {
      const sourceClass = bestSourceClass(card, signal.citationIds);
      return {
        title: signal.title,
        date: formatMediumDate(signal.date),
        meta: [signal.source, signal.category].filter(Boolean).join(" · "),
        ...(signal.citationIds.length > 1 ? { corroboration: signal.citationIds.length } : {}),
        ...(sourceClass ? { sourceClass } : {})
      };
    });
    return {
      id,
      title: layer.title,
      body: clustered[0]?.title ?? emptyBodyForLayer(id),
      ...(items.length > 0 ? { items } : {}),
      sources,
      sourceCount: displaySourceCount(sources),
      ...(items.length > 0 ? { statusLine: eventsAndSourcesLine(items.length, displaySourceCount(sources)) } : {}),
      status: clustered.length > 0 ? "saved" : "empty"
    };
  }

  if (id === "investors") {
    const rounds = card.funding.rounds?.value ?? (card.funding.lastRound.value ? [card.funding.lastRound.value] : []);
    const totalRaised = card.funding.totalRaisedUsd.value;
    const investors = card.funding.investors.value ?? [];
    const citationIds = Array.from(new Set([
      ...card.funding.totalRaisedUsd.citationIds,
      ...card.funding.lastRound.citationIds,
      ...(card.funding.rounds?.citationIds ?? []),
      ...card.funding.investors.citationIds,
    ]));
    const sources = citationSources(card, citationIds);
    const hasFunding = rounds.length > 0 || investors.length > 0 || totalRaised !== null;

    if (!hasFunding) {
      const citationEvidence = fundingEvidenceFromCitations(card);
      if (citationEvidence.length > 0) {
        const citationEvidenceIds = citationEvidence.flatMap((item) => item.citationIds);
        const evidenceSources = citationSources(card, citationEvidenceIds);
        return {
          id,
          title: layer.title,
          body: citationEvidence[0]?.title ?? "Cited fundraising reporting",
          items: citationEvidence.map((item) => ({
            title: item.title,
            body: item.body,
            meta: item.meta
          })),
          sources: evidenceSources,
          sourceCount: displaySourceCount(evidenceSources),
          status: "saved",
        };
      }

      return {
        id,
        title: layer.title,
        body: emptyBodyForLayer(id),
        sources: [],
        sourceCount: 0,
        status: "empty",
      };
    }

    const investorNames = investorNamesForCard(card);
    const headline = totalRaised !== null && rounds.length > 0
      ? `${formatCompactCurrency(totalRaised)} disclosed across ${rounds.length} ${rounds.length === 1 ? "round" : "rounds"}`
      : [
          totalRaised !== null ? `${formatCompactCurrency(totalRaised)} disclosed` : null,
          rounds.length > 0 ? `${rounds.length} ${rounds.length === 1 ? "round" : "rounds"}` : null,
        ].filter((part): part is string => Boolean(part)).join(" · ");
    // Backer names render in the investors ledger row, not as a hero text line.
    const items = [
      ...(headline || investorNames.length > 0
        ? [{ title: headline || "Funding read" }]
        : []),
      ...rounds.map((round) => {
        const detail = [
          round.amountUsd !== null ? formatCompactCurrency(round.amountUsd) : null,
          round.leadInvestors.length > 0 ? round.leadInvestors.slice(0, 3).join(", ") : null,
        ].filter((part): part is string => Boolean(part)).join(" · ");
        return {
          title: round.name,
          ...(round.announcedAt ? { meta: formatShortDate(round.announcedAt) } : {}),
          body: detail || "Round details not disclosed",
        };
      }),
    ];

    return {
      id,
      title: layer.title,
      body: headline || "Cited fundraising history",
      items,
      ...(investorNames.length > 0 ? { investors: investorNames } : {}),
      sources,
      sourceCount: displaySourceCount(sources),
      status: "saved",
    };
  }

  if (id === "competition") {
    const comparables = displayComparables(card);
    const framing = card.competitionFraming;
    const framingText = framing?.value ? stripCitationMarkers(framing.value) : null;
    const citationIds = Array.from(new Set([
      ...(framingText ? framing?.citationIds ?? [] : []),
      ...comparables.flatMap((company) => company.citationIds ?? []),
    ]));
    const sources = citationSources(card, citationIds);
    const summaryFallback = comparables.length > 0
      ? comparables.map((company) => `${company.name} (${company.domain})`).join(", ")
      : emptyBodyForLayer(id);

    return {
      id,
      title: layer.title,
      body: framingText ?? summaryFallback,
      ...(framingText ? { lead: framingText } : {}),
      items: comparables.slice(0, 4).map((company) => ({
        title: company.name,
        meta: company.domain,
        body: company.basis ?? company.oneLiner
      })),
      sources,
      sourceCount: displaySourceCount(sources),
      status: framingText || comparables.length > 0 ? "saved" : "empty"
    };
  }

  if (id === "mechanism") {
    const mechanism = card.identity.description?.value?.mechanism;
    const sources = citationSources(card, card.identity.description?.citationIds);
    return {
      id,
      title: layer.title,
      body: mechanism ?? emptyBodyForLayer(id),
      rows: mechanism ? [{ label: "How it works", value: mechanism }] : undefined,
      sources,
      sourceCount: displaySourceCount(sources),
      status: mechanism ? "saved" : "empty"
    };
  }

  return null;
}
