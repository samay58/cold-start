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
  type OpenQuestion,
  type QuestionCategory,
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
    kind?: "evidence" | "question";
    meta?: string;
    date?: string;
    corroboration?: number;
    sourceClass?: ResearchSourceClass;
  }> | undefined;
  rows?: Array<{
    label: string;
    value: string;
  }> | undefined;
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

export const RESEARCH_LAYER_CARDS: ResearchLayerCard[] = [
  { id: "openQuestions", title: "Next question", description: "Highest-priority diligence gap", source: "analysis" },
  { id: "coreIdea", title: "Why care", description: "Cited investment read", source: "analysis" },
  { id: "theCase", title: "The case", description: "Bull and bear, side by side", source: "analysis" },
  { id: "serves", title: "Who pays", description: "Buyer and workflow", source: "card" },
  { id: "marketStructureTiming", title: "Timing", description: "Budget, trigger, profit pool", source: "analysis" },
  { id: "customers", title: "Proof", description: "Adoption evidence", source: "card" },
  { id: "signals", title: "Signals", description: "Recent momentum", source: "card" },
  { id: "investors", title: "Money", description: "Rounds, backers, price context", source: "card" },
  { id: "competition", title: "Comps", description: "Alternatives and durability", source: "card" },
  { id: "mechanism", title: "Product", description: "What makes it different", source: "card" }
];

// These layers render from the consolidated investor lens. They should not create standalone
// section work before synthesis exists.
const SYNTHESIS_LAYER_IDS = new Set<ResearchLayerId>(["openQuestions", "coreIdea", "theCase", "marketStructureTiming"]);

export function isSynthesisLayer(id: ResearchLayerId): boolean {
  return SYNTHESIS_LAYER_IDS.has(id);
}

const QUESTION_CATEGORY_LABELS: Record<QuestionCategory, string> = {
  buyer_budget: "Buyer & budget",
  adoption_proof: "Adoption & proof",
  durability: "Durability",
  unit_economics: "Unit economics",
  technical_edge: "Technical edge",
  market_timing: "Market & timing",
  trust_regulation: "Trust & regulation"
};

function labelForCategory(category: QuestionCategory | null): string {
  return category ? QUESTION_CATEGORY_LABELS[category] : "Open question";
}

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
    kind: "evidence" as const,
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
  const sources = citationSources(card, section.citationIds);
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

  const items = content.items.map((item) =>
    section.sectionId === "traction"
      ? tractionDisplayItem(card, item)
      : {
          title: item.label,
          body: stripCitationMarkers(item.text),
          kind: "evidence" as const,
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
    sources,
    sourceCount: displaySourceCount(sources),
    ...(section.sectionId === "traction" && items.length > 0
      ? { statusLine: eventsAndSourcesLine(items.length, displaySourceCount(sources)) }
      : {}),
    status: section.status === "stale" ? "stale" : "saved"
  };
}

function textFromList(items: string[], fallback: string) {
  return items.length > 0 ? items.join(", ") : fallback;
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

function cleanQuestionBody(question: string) {
  return stripCitationMarkers(question)
    .replace(/\s*[—–]\s*/g, "; ")
    .replace(/\s+/g, " ")
    .replace(/^\s*(?:question\s*\d+[:.)-]?|ask[:.)-]?)\s*/i, "")
    .replace(/\s*(?:\.{3}|…)\s*$/u, "")
    .trim()
    .replace(/[.!?]*$/, "?");
}

function isGenericRevenueQuestion(question: string) {
  const normalized = question.toLowerCase();
  return /\b(arr|revenue)\b/.test(normalized) && /\b(not public|undisclosed|not disclosed|verify|validate)\b/.test(normalized);
}

// The model already emits the 3 highest-conviction questions in priority order, so we
// keep its order. We only clean the text, rewrite a generic revenue ask, dedupe, and
// attach the model's category label.
function prioritizedOpenQuestionItems(questions: OpenQuestion[]) {
  const seen = new Set<string>();
  return questions
    .map((entry) => {
      const cleanedBody = cleanQuestionBody(entry.question);
      const genericRevenue = isGenericRevenueQuestion(cleanedBody);
      const body = genericRevenue
        ? "What revenue quality, retention, and margin evidence would change the read?"
        : cleanedBody;
      const category: QuestionCategory | null = genericRevenue ? "unit_economics" : entry.category;
      return { body, category };
    })
    .filter((item) => {
      const key = item.body.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      if (!item.body || item.body === "?" || seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .slice(0, 3)
    .map((item) => ({
      title: labelForCategory(item.category),
      body: item.body,
      kind: "question" as const,
      meta: "Next best use of time"
    }));
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

function marketRows(card: ColdStartCard) {
  const market = card.synthesis?.marketStructureAndTiming;
  if (!market) {
    return [];
  }

  return [
    { title: "Buyer budget", claim: market.buyerBudget },
    { title: "Pain severity", claim: market.painSeverity },
    { title: "Adoption trigger", claim: market.adoptionTrigger },
    { title: "Market structure", claim: market.marketStructure },
    { title: "Profit pool", claim: market.profitPool },
    { title: "Expansion path", claim: market.expansionPath },
    { title: "Timing risk", claim: market.timingRisk }
  ].flatMap((row) => row.claim ? [{ title: row.title, body: stripCitationMarkers(row.claim.text), citationIds: row.claim.citationIds }] : []);
}

export function layersForCard(card: ColdStartCard, sections?: ResearchSection[]): ResearchLayer[] {
  const canAnalyze = canRunInvestorAnalysis(card);
  return RESEARCH_LAYER_CARDS.map((layer) => {
    const section = sectionForLayer(sections, layer.id);
    if (section && !SYNTHESIS_LAYER_IDS.has(layer.id)) {
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
    !SYNTHESIS_LAYER_IDS.has(id) &&
    !(id === "signals" && signalsRenderFromCard(card, section))
  ) {
    return displayFromSection(card, layer, section);
  }

  if (id === "theCase") {
    if (!card.synthesis) {
      return {
        id,
        title: layer.title,
        body: "Run Investor Lens to weigh the bull and bear case.",
        sources: [],
        sourceCount: 0,
        status: "ready"
      };
    }

    const bull = card.synthesis.bullCase[0] ?? null;
    const bear = card.synthesis.bearCase[0] ?? null;
    const question = card.synthesis.openQuestions[0]?.question ?? null;
    const evidenceClaims = [bull, bear].filter((claim): claim is NonNullable<typeof bull> => Boolean(claim));
    const sources = citationSources(card, evidenceClaims.flatMap((claim) => claim.citationIds));
    const items = [
      ...(bull ? [{ title: "If true", body: stripCitationMarkers(bull.text), kind: "evidence" as const, meta: "bull" }] : []),
      ...(bear ? [{ title: "It breaks if", body: stripCitationMarkers(bear.text), kind: "evidence" as const, meta: "bear" }] : []),
      ...(question ? [{ title: "Test", body: cleanQuestionBody(question), kind: "question" as const, meta: "Next diligence question" }] : [])
    ];
    return {
      id,
      title: layer.title,
      body: stripCitationMarkers(bull?.text ?? bear?.text ?? question ?? "No supported case survived verification."),
      ...(items.length > 0 ? { items } : {}),
      sources,
      sourceCount: displaySourceCount(sources),
      status: evidenceClaims.length > 0 || question ? "saved" : "empty"
    };
  }

  if (id === "coreIdea") {
    if (!card.synthesis) {
      return {
        id,
        title: layer.title,
        body: "Run Investor Lens to synthesize the core idea from cited evidence.",
        sources: [],
        sourceCount: 0,
        status: "ready"
      };
    }

    const sources = citationSources(card, card.synthesis.whyItMatters.citationIds);
    return {
      id,
      title: layer.title,
      body: stripCitationMarkers(card.synthesis.whyItMatters.text),
      sources,
      sourceCount: displaySourceCount(sources),
      status: "saved"
    };
  }

  if (id === "marketStructureTiming") {
    if (!card.synthesis) {
      return {
        id,
        title: layer.title,
        body: "Run Investor Lens to assess market structure and timing.",
        sources: [],
        sourceCount: 0,
        status: "ready"
      };
    }

    if (!card.synthesis.marketStructureAndTiming) {
      return {
        id,
        title: layer.title,
        body: "Timing not found · Current sources did not support a timing read.",
        sources: [],
        sourceCount: 0,
        status: "empty"
      };
    }

    const rows = marketRows(card);
    const sources = citationSources(card, rows.flatMap((row) => row.citationIds));
    return {
      id,
      title: layer.title,
      body: rows[0]?.body ?? "Timing not found · Current sources did not support a timing read.",
      items: rows.map((row) => ({ title: row.title, body: row.body })),
      sources,
      sourceCount: displaySourceCount(sources),
      status: rows.length > 0 ? "saved" : "empty"
    };
  }

  if (id === "openQuestions") {
    if (!card.synthesis) {
      return {
        id,
        title: layer.title,
        body: "Run Investor Lens to surface open questions.",
        sources: [],
        sourceCount: 0,
        status: "ready"
      };
    }

    const items = prioritizedOpenQuestionItems(card.synthesis.openQuestions);
    return {
      id,
      title: layer.title,
      body: textFromList(items.map((item) => item.body ?? item.title), "No open questions survived verification."),
      items,
      sources: [],
      sourceCount: 0,
      status: items.length > 0 ? "saved" : "empty"
    };
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
        kind: "evidence" as const,
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

    const investorNames = dedupeStrings([
      ...rounds.flatMap((round) => round.leadInvestors),
      ...investors.map((investor) => investor.name),
    ]);
    const investorLine = investorNames.length > 0
      ? `Backers: ${investorNames.slice(0, 6).join(", ")}${investorNames.length > 6 ? `, +${investorNames.length - 6} more` : ""}`
      : null;
    const headline = totalRaised !== null && rounds.length > 0
      ? `${formatCompactCurrency(totalRaised)} disclosed across ${rounds.length} ${rounds.length === 1 ? "round" : "rounds"}`
      : [
          totalRaised !== null ? `${formatCompactCurrency(totalRaised)} disclosed` : null,
          rounds.length > 0 ? `${rounds.length} ${rounds.length === 1 ? "round" : "rounds"}` : null,
        ].filter((part): part is string => Boolean(part)).join(" · ");
    const items = [
      ...(headline || investorLine
        ? [{ title: headline || "Funding read", ...(investorLine ? { body: investorLine } : {}) }]
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
      sources,
      sourceCount: displaySourceCount(sources),
      status: "saved",
    };
  }

  if (id === "competition") {
    const comparables = displayComparables(card);
    const sources = citationSources(card, comparables.flatMap((company) => company.citationIds ?? []));
    return {
      id,
      title: layer.title,
      body: comparables.length > 0
        ? comparables.map((company) => `${company.name} (${company.domain})`).join(", ")
        : emptyBodyForLayer(id),
      items: comparables.slice(0, 4).map((company) => ({
        title: company.name,
        meta: company.domain,
        body: company.oneLiner
      })),
      sources,
      sourceCount: displaySourceCount(sources),
      status: comparables.length > 0 ? "saved" : "empty"
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
