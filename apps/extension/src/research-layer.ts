import { canRunInvestorAnalysis, type ColdStartCard } from "@cold-start/core";
import { formatCompactCurrency, formatShortDate, safeExternalHref } from "@cold-start/ui";

export type ResearchLayerId =
  | "coreIdea"
  | "customers"
  | "serves"
  | "signals"
  | "investors"
  | "competition"
  | "mechanism"
  | "openQuestions";

export type ResearchLayerSource = "card" | "analysis";
export type ResearchLayerAvailability = "available" | "needs-analysis" | "empty";
export type ResearchLayerDisplayStatus = "populated" | "needs-analysis" | "empty" | "running" | "failed";

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
  }> | undefined;
  rows?: Array<{
    label: string;
    value: string;
  }> | undefined;
  sources: ResearchLayerSourceReference[];
  sourceCount: number;
  status: ResearchLayerDisplayStatus;
};

export type ResearchLayerSourceReference = {
  id: string;
  domain: string;
  href: string;
  title: string;
};

export const RESEARCH_LAYER_CARDS: ResearchLayerCard[] = [
  { id: "coreIdea", title: "Thesis", description: "Cited investor read", source: "analysis" },
  { id: "customers", title: "Customers", description: "Buyers and adoption", source: "card" },
  { id: "serves", title: "Serves", description: "User and job", source: "card" },
  { id: "signals", title: "Signals", description: "Recent traction", source: "card" },
  { id: "investors", title: "Investors", description: "Rounds and backers", source: "card" },
  { id: "competition", title: "Competition", description: "Adjacent players", source: "card" },
  { id: "mechanism", title: "Mechanism", description: "How the product works", source: "card" },
  { id: "openQuestions", title: "Questions", description: "Open pressure points", source: "analysis" }
];

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
  for (const id of citationIds) {
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
      title: citation.title
    });
  }

  return sources;
}

function displaySourceCount(sources: ResearchLayerSourceReference[]) {
  return sources.length;
}

function textFromList(items: string[], fallback: string) {
  return items.length > 0 ? items.join(", ") : fallback;
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

export function layersForCard(card: ColdStartCard): ResearchLayer[] {
  const canAnalyze = canRunInvestorAnalysis(card);
  return RESEARCH_LAYER_CARDS.map((layer) => {
    if (layer.source === "analysis" && (!card.synthesis || !canAnalyze)) {
      return { ...layer, availability: "needs-analysis" };
    }

    const display = layerDisplayForCard(card, layer.id);
    return {
      ...layer,
      availability: display?.status === "populated" ? "available" : "empty"
    };
  });
}

export function layerDisplayForCard(card: ColdStartCard, id: ResearchLayerId): ResearchLayerDisplay | null {
  const layer = RESEARCH_LAYER_CARDS.find((candidate) => candidate.id === id);
  if (!layer) {
    return null;
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

    return {
      id,
      title: layer.title,
      body: textFromList(card.synthesis.openQuestions, "No open questions survived verification."),
      items: card.synthesis.openQuestions.map((question, index) => ({
        title: `Question ${index + 1}`,
        body: stripCitationMarkers(question)
      })),
      sources: [],
      sourceCount: 0,
      status: card.synthesis.openQuestions.length > 0 ? "populated" : "empty"
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
      return {
        id,
        title: layer.title,
        body: "No cited fundraising history yet.",
        sources: [],
        sourceCount: 0,
        status: "empty",
      };
    }

    const investorLine = investors.length > 0
      ? `${investors.length} named ${investors.length === 1 ? "investor" : "investors"}: ${investors.slice(0, 8).map((investor) => investor.name).join(", ")}${investors.length > 8 ? `, +${investors.length - 8} more` : ""}`
      : null;
    const headline = [
      totalRaised !== null ? `${formatCompactCurrency(totalRaised)} raised` : null,
      rounds.length > 0 ? `${rounds.length} ${rounds.length === 1 ? "round" : "rounds"}` : null,
    ].filter((part): part is string => Boolean(part)).join(" · ");
    const items = [
      ...(headline || investorLine
        ? [{ title: headline || "Fundraising", ...(investorLine ? { body: investorLine } : {}) }]
        : []),
      ...rounds.map((round) => {
        const detail = [
          round.amountUsd !== null ? formatCompactCurrency(round.amountUsd) : null,
          round.leadInvestors.length > 0 ? `${round.leadInvestors.slice(0, 3).join(", ")} leading` : null,
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
      body: mechanism ?? "Mechanism not yet available from cited sources.",
      rows: mechanism ? [{ label: "How it works", value: mechanism }] : undefined,
      sources,
      sourceCount: displaySourceCount(sources),
      status: mechanism ? "populated" : "empty"
    };
  }

  return null;
}
