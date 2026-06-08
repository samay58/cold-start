import {
  RESEARCH_SECTION_DEFINITIONS_BY_ID,
  canRunInvestorAnalysis,
  fundingEvidenceFromCitations,
  sectionIdForLayer as coreSectionIdForLayer,
  sourceQualityForSource,
  sourceQualityRank,
  type Citation,
  type ColdStartCard,
  type ResearchLayerId,
  type ResearchSection
} from "@cold-start/core";
import { formatCompactCurrency, formatShortDate, safeExternalHref } from "@cold-start/ui";

export type { ResearchLayerId } from "@cold-start/core";

type ResearchLayerSource = "card" | "analysis";
type ResearchLayerAvailability = "available" | "needs-analysis" | "empty";
type ResearchLayerDisplayStatus = "populated" | "needs-analysis" | "empty" | "running" | "failed" | "stale";

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
  }> | undefined;
  rows?: Array<{
    label: string;
    value: string;
  }> | undefined;
  sources: ResearchLayerSourceReference[];
  sourceCount: number;
  status: ResearchLayerDisplayStatus;
};

type ResearchLayerSourceReference = {
  id: string;
  domain: string;
  href: string;
  title: string;
  qualityLabel: string;
};

export const RESEARCH_LAYER_CARDS: ResearchLayerCard[] = [
  { id: "openQuestions", title: "Next question", description: "Best use of attention", source: "analysis" },
  { id: "coreIdea", title: "Why care", description: "Cited investment read", source: "analysis" },
  { id: "serves", title: "Who pays", description: "Buyer and workflow", source: "card" },
  { id: "marketStructureTiming", title: "Timing", description: "Budget, trigger, profit pool", source: "analysis" },
  { id: "customers", title: "Proof", description: "Adoption evidence", source: "card" },
  { id: "signals", title: "Signals", description: "Recent momentum", source: "card" },
  { id: "investors", title: "Money", description: "Rounds, backers, price context", source: "card" },
  { id: "competition", title: "Comps", description: "Alternatives and durability", source: "card" },
  { id: "mechanism", title: "Product", description: "What is differentiated", source: "card" }
];

export function sectionIdForLayer(id: ResearchLayerId): ResearchSection["sectionId"] {
  return coreSectionIdForLayer(id);
}

function stripCitationMarkers(text: string) {
  return text
    .replace(/\s*\[(?:c|C)?[\w.-]+(?:,\s*(?:c|C)?[\w.-]+)*\]/g, "")
    .replace(/\s+([.,;:!?])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
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
    sources.push({
      id: citation.id,
      domain: domainFromHref(href),
      href,
      title: citation.title,
      qualityLabel: citation.sourceQuality?.label ?? sourceQualityForSource(citation).label
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
      status: "needs-analysis"
    };
  }

  if (section.status === "empty" || !content) {
    return {
      id: layer.id,
      title,
      body: definition.emptyState,
      rows: [{ label: "Evidence gap", value: definition.emptyState }],
      sources,
      sourceCount: displaySourceCount(sources),
      status: "empty"
    };
  }

  const items = content.items.map((item) => ({
    title: item.label,
    body: stripCitationMarkers(item.text),
    kind: "evidence" as const,
    ...(item.meta ? { meta: item.meta } : {})
  }));
  const questions = content.questions.map((question, index) => ({
    title: titleForQuestion(question) || `Question ${index + 1}`,
    body: stripCitationMarkers(question),
    kind: "question" as const
  }));
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
    body: stripCitationMarkers(content.summary ?? items[0]?.body ?? questions[0]?.body ?? definition.emptyState),
    ...(items.length > 0 || questions.length > 0 ? { items: [...items, ...questions] } : {}),
    ...(rows ? { rows } : {}),
    sources,
    sourceCount: displaySourceCount(sources),
    status: section.status === "stale" ? "stale" : "populated"
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

function titleForQuestion(question: string) {
  const normalized = question.toLowerCase();
  if (/\b(budget|buyer|pay|pays|procurement|economic buyer|owner)\b/.test(normalized)) {
    return "Budget owner";
  }
  if (/\b(customer|customers|pilot|deployment|deployments|adoption|usage|expansion|retention|reference)\b/.test(normalized)) {
    return "Expansion proof";
  }
  if (/\b(moat|durab|defend|defensible|incumbent|bundle|bundling|competition|competitive|compete|substitute)\b/.test(normalized)) {
    return "Durability";
  }
  if (/\b(arr|revenue|pricing|gross margin|margin|monetiz|unit economics|burn|runway)\b/.test(normalized)) {
    return "Revenue quality";
  }
  if (/\b(model|technical|accuracy|latency|inference|data|architecture|performance|reliability)\b/.test(normalized)) {
    return "Technical edge";
  }
  if (/\b(security|compliance|legal|regulat|privacy|risk)\b/.test(normalized)) {
    return "Trust hurdle";
  }
  if (/\b(channel|partner|distribution|nvidia|cloud|platform)\b/.test(normalized)) {
    return "Distribution path";
  }
  return "Conviction driver";
}

function cleanQuestionBody(question: string) {
  return stripCitationMarkers(question)
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

function priorityForQuestion(question: string) {
  const normalized = question.toLowerCase();
  if (/\b(customer|pilot|deployment|adoption|usage|retention|expansion|budget|buyer|procurement|moat|durab|competition|bundle)\b/.test(normalized)) {
    return 0;
  }
  if (/\b(model|technical|accuracy|latency|inference|security|compliance|distribution|partner)\b/.test(normalized)) {
    return 1;
  }
  if (isGenericRevenueQuestion(question)) {
    return 3;
  }
  return 2;
}

function prioritizedOpenQuestionItems(questions: string[]) {
  const seen = new Set<string>();
  return questions
    .map((question, index) => {
      const cleanedBody = cleanQuestionBody(question);
      const genericRevenue = isGenericRevenueQuestion(cleanedBody);
      const body = genericRevenue
        ? "What revenue quality, retention, and margin evidence would change the read?"
        : cleanedBody;
      return {
        body,
        index,
        priority: genericRevenue ? 3 : priorityForQuestion(body),
        title: genericRevenue ? "Revenue quality" : titleForQuestion(body)
      };
    })
    .filter((item) => {
      const key = `${item.title}:${item.body.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}`;
      if (!item.body || item.body === "?" || seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .sort((left, right) => left.priority - right.priority || left.index - right.index)
    .slice(0, 4)
    .map((item) => ({
      title: item.title,
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
    if (section) {
      return {
        ...layer,
        availability: section.status === "available" || section.status === "stale"
          ? "available"
          : section.status === "not_started" || section.status === "running"
            ? "needs-analysis"
            : "empty"
      };
    }

    if (layer.source === "analysis" && !card.synthesis) {
      return { ...layer, availability: "needs-analysis" };
    }

    const display = layerDisplayForCard(card, layer.id, sections);
    if (layer.source === "analysis" && display?.status === "needs-analysis" && !canAnalyze) {
      return { ...layer, availability: "needs-analysis" };
    }

    return {
      ...layer,
      availability: display?.status === "populated"
        ? "available"
        : display?.status === "needs-analysis" ? "needs-analysis" : "empty"
    };
  });
}

export function layerDisplayForCard(card: ColdStartCard, id: ResearchLayerId, sections?: ResearchSection[]): ResearchLayerDisplay | null {
  const layer = RESEARCH_LAYER_CARDS.find((candidate) => candidate.id === id);
  if (!layer) {
    return null;
  }

  const section = sectionForLayer(sections, id);
  if (section) {
    return displayFromSection(card, layer, section);
  }

  if (id === "coreIdea") {
    if (!card.synthesis) {
      return {
        id,
        title: layer.title,
        body: "Activate the investor lens to synthesize the core idea from cited evidence.",
        sources: [],
        sourceCount: 0,
        status: "needs-analysis"
      };
    }

    const sources = citationSources(card, card.synthesis.whyItMatters.citationIds);
    return {
      id,
      title: layer.title,
      body: stripCitationMarkers(card.synthesis.whyItMatters.text),
      sources,
      sourceCount: displaySourceCount(sources),
      status: "populated"
    };
  }

  if (id === "marketStructureTiming") {
    if (!card.synthesis) {
      return {
        id,
        title: layer.title,
        body: "Activate the investor lens to assess market structure and timing.",
        sources: [],
        sourceCount: 0,
        status: "needs-analysis"
      };
    }

    if (!card.synthesis.marketStructureAndTiming) {
      return {
        id,
        title: layer.title,
        body: "Market structure analysis has not been generated for this card yet.",
        sources: [],
        sourceCount: 0,
        status: "needs-analysis"
      };
    }

    const rows = marketRows(card);
    const sources = citationSources(card, rows.flatMap((row) => row.citationIds));
    return {
      id,
      title: layer.title,
      body: rows[0]?.body ?? "No market structure claims survived verification.",
      items: rows.map((row) => ({ title: row.title, body: row.body })),
      sources,
      sourceCount: displaySourceCount(sources),
      status: rows.length > 0 ? "populated" : "empty"
    };
  }

  if (id === "openQuestions") {
    if (!card.synthesis) {
      return {
        id,
        title: layer.title,
        body: "Activate the investor lens to surface open questions.",
        sources: [],
        sourceCount: 0,
        status: "needs-analysis"
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
      status: items.length > 0 ? "populated" : "empty"
    };
  }

  if (id === "customers") {
    const description = card.identity.description;
    const serves = description?.value?.serves;
    const sources = citationSources(card, description?.citationIds);
    return {
      id,
      title: layer.title,
      body: serves ?? "Customer and buyer segmentation is not extracted yet.",
      rows: serves
        ? [{ label: "Buyer / user", value: serves }]
        : [{ label: "Evidence gap", value: "No customer-specific field exists on this card yet." }],
      sources,
      sourceCount: displaySourceCount(sources),
      status: serves ? "populated" : "empty"
    };
  }

  if (id === "serves") {
    const description = card.identity.description;
    const concept = description?.value?.concept;
    const shortDescription = description?.value?.shortDescription;
    const body = concept ?? shortDescription ?? card.identity.oneLiner.value ?? "Served job is not yet available from cited sources.";
    const sources = citationSources(card, concept || shortDescription ? description?.citationIds : card.identity.oneLiner.citationIds);
    return {
      id,
      title: layer.title,
      body,
      rows: body ? [{ label: "Job served", value: body }] : undefined,
      sources,
      sourceCount: displaySourceCount(sources),
      status: concept || shortDescription || card.identity.oneLiner.value ? "populated" : "empty"
    };
  }

  if (id === "signals") {
    const sources = citationSources(card, card.signals.flatMap((signal) => signal.citationIds));
    return {
      id,
      title: layer.title,
      body: card.signals[0]?.title ?? "No recent cited signals found yet.",
      items: card.signals.slice(0, 3).map((signal) => ({
        title: signal.title,
        meta: `${signal.source} · ${signal.category}`,
        body: signal.date
      })),
      sources,
      sourceCount: displaySourceCount(sources),
      status: card.signals.length > 0 ? "populated" : "empty"
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
          status: "populated",
        };
      }

      return {
        id,
        title: layer.title,
        body: "No cited fundraising history yet.",
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
      status: "populated",
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
        : "Comparables not yet available.",
      items: comparables.slice(0, 4).map((company) => ({
        title: company.name,
        meta: company.domain,
        body: company.oneLiner
      })),
      sources,
      sourceCount: displaySourceCount(sources),
      status: comparables.length > 0 ? "populated" : "empty"
    };
  }

  if (id === "mechanism") {
    const mechanism = card.identity.description?.value?.mechanism;
    const sources = citationSources(card, card.identity.description?.citationIds);
    return {
      id,
      title: layer.title,
      body: mechanism ?? "Product and technology context not yet available from cited sources.",
      rows: mechanism ? [{ label: "How it works", value: mechanism }] : undefined,
      sources,
      sourceCount: displaySourceCount(sources),
      status: mechanism ? "populated" : "empty"
    };
  }

  return null;
}
