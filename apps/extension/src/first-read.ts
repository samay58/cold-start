import type { ColdStartCard } from "@cold-start/core";
import type { ExtensionResearchRunEvent, ExtensionSourceSummary } from "./extension-config";
import { currentProfileProgressEvents } from "./research-progress";

export type FirstRead = {
  productLine: string;
  buyerLine: string;
  evidenceCategories: string[];
  missingProofLine: string;
  status: "ready";
};

const fillerPattern = /\b(ai-native|agentic|emerging leader|next[-\s]?generation|platform for everyone|all-in-one|end-to-end|revolutionizing|transforming|unlocking)\b/i;
const boilerplatePattern = /\b(platform|solution)\s+(for|that)\s+(everyone|businesses of all sizes)\b/i;

const evidenceCategoryRank = new Map(
  [
    "company site",
    "docs",
    "funding coverage",
    "product page",
    "people source",
    "customer proof",
    "filing",
    "news",
    "database",
    "company profile"
  ].map((category, index) => [category, index])
);

const firstReadFiledEventTypes = new Set(["card.saved", "card.enriched"]);
const firstReadPendingEventTypes = new Set(["card.partial"]);

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

function hasCitations(citationIds: string[] | undefined) {
  return (citationIds?.length ?? 0) > 0;
}

function productLineForCard(card: ColdStartCard) {
  const description = card.identity.description;
  const descriptionValue = description?.value;
  const candidates = [
    descriptionValue?.shortDescription,
    descriptionValue?.mechanism,
    descriptionValue?.concept,
    card.identity.oneLiner.value
  ];

  for (const candidate of candidates) {
    const normalized = normalizeText(candidate);
    if (normalized) {
      return normalized;
    }
  }

  const name = card.identity.name.value?.trim() || card.domain;
  return `${name} has a source-backed company profile.`;
}

function buyerLineForCard(card: ColdStartCard) {
  const description = card.identity.description;
  const serves = normalizeText(description?.value?.serves);
  return serves && hasCitations(description?.citationIds) ? serves : "Buyer not proven yet.";
}

function sourceLooksLikeDocs(source: Pick<ExtensionSourceSummary, "domain" | "snippet" | "title" | "url">) {
  const text = `${source.domain} ${source.title} ${source.snippet} ${source.url}`.toLowerCase();
  return /\bdocs?\b|documentation|developer|api reference|quickstart|guide/.test(text);
}

function sourceLooksLikeFunding(source: Pick<ExtensionSourceSummary, "domain" | "snippet" | "title" | "url">) {
  const text = `${source.domain} ${source.title} ${source.snippet} ${source.url}`.toLowerCase();
  return /\bfunding\b|\braised\b|series [a-z]\b|\bround\b|\binvestors?\b|\bvaluation\b/.test(text);
}

function evidenceCategoryForSource(source: ExtensionSourceSummary) {
  if (source.sourceType === "company_site") {
    return sourceLooksLikeDocs(source) ? "docs" : "company site";
  }
  if (source.sourceType === "news") {
    return sourceLooksLikeFunding(source) ? "funding coverage" : "news";
  }
  if (source.sourceType === "filing") {
    return "filing";
  }
  if (source.sourceType === "github") {
    return "product page";
  }
  if (source.sourceType === "enrichment" || source.sourceType === "rdap") {
    return "database";
  }
  return null;
}

function normalizeEvidenceCategory(value: string) {
  const normalized = value.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return evidenceCategoryRank.has(normalized) ? normalized : null;
}

function evidenceCategoriesForRead(sources: ExtensionSourceSummary[], events: ExtensionResearchRunEvent[]) {
  const categories = new Set<string>();
  const profileEvents = latestProfileRunEvents(events);

  for (const source of sources) {
    const category = evidenceCategoryForSource(source);
    if (category) {
      categories.add(category);
    }
  }

  if (categories.size === 0) {
    for (const event of profileEvents) {
      const values = [
        event.metadata.sourceCategory,
        event.metadata.sourceCategoryLabel,
        ...(Array.isArray(event.metadata.sourceCategories) ? event.metadata.sourceCategories : []),
        ...(Array.isArray(event.metadata.sourceCategoryLabels) ? event.metadata.sourceCategoryLabels : [])
      ];
      for (const value of values) {
        if (typeof value !== "string") {
          continue;
        }
        const category = normalizeEvidenceCategory(value);
        if (category) {
          categories.add(category);
        }
      }
    }
  }

  if (categories.size === 0) {
    categories.add("company profile");
  }

  return [...categories]
    .sort((left, right) => (evidenceCategoryRank.get(left) ?? 999) - (evidenceCategoryRank.get(right) ?? 999))
    .slice(0, 4);
}

export function firstReadForCard({
  card,
  events = [],
  sources = []
}: {
  card: ColdStartCard;
  events?: ExtensionResearchRunEvent[];
  sources?: ExtensionSourceSummary[];
}): FirstRead {
  const buyerLine = buyerLineForCard(card);

  return {
    buyerLine,
    evidenceCategories: evidenceCategoriesForRead(sources, events),
    missingProofLine: buyerLine === "Buyer not proven yet." ? "Buyer and customer proof." : "Named customers and budget owner.",
    productLine: productLineForCard(card),
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
