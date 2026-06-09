import { z } from "zod";
import type { ColdStartCard } from "./card";
import type { GenerationJobKind } from "./generation-trace";

export const researchSectionIdSchema = z.enum([
  "buyer",
  "customer_proof",
  "traction",
  "financing",
  "competition",
  "product",
  "why_it_matters",
  "market",
  "risks",
  "the_case"
]);

export const researchSectionStatusSchema = z.enum(["not_started", "running", "available", "empty", "failed", "stale"]);
export const researchSectionVisibilitySchema = z.enum(["public", "gated"]);
export const researchLayerIdSchema = z.enum([
  "coreIdea",
  "serves",
  "marketStructureTiming",
  "customers",
  "signals",
  "investors",
  "competition",
  "mechanism",
  "openQuestions",
  "theCase"
]);

export type ResearchSectionId = z.infer<typeof researchSectionIdSchema>;
export type ResearchSectionStatus = z.infer<typeof researchSectionStatusSchema>;
export type ResearchSectionVisibility = z.infer<typeof researchSectionVisibilitySchema>;
export type ResearchLayerId = z.infer<typeof researchLayerIdSchema>;

export const researchSectionItemSchema = z.object({
  label: z.string().min(1),
  text: z.string().min(1),
  citationIds: z.array(z.string().min(1)),
  meta: z.string().min(1).optional()
});

export const researchSectionNapkinMathSchema = z.object({
  formula: z.string().min(1),
  buyers: z.object({
    value: z.string().min(1),
    basis: z.string().min(1),
    citationIds: z.array(z.string().min(1))
  }),
  annualSpend: z.object({
    value: z.string().min(1),
    basis: z.string().min(1),
    citationIds: z.array(z.string().min(1))
  }),
  marketSize: z.object({
    value: z.string().min(1),
    confidence: z.enum(["high", "medium", "low"])
  }),
  plainEnglish: z.string().min(1)
});

export const researchSectionContentSchema = z.object({
  status: z.enum(["available", "empty"]),
  summary: z.string().min(1).nullable(),
  items: z.array(researchSectionItemSchema),
  confidence: z.enum(["high", "medium", "low"]),
  competitorCountHighQuality: z.number().int().nonnegative().optional(),
  crowdedness: z.enum(["sparse", "moderate", "crowded", "brutally_crowded"]).optional(),
  napkinMath: researchSectionNapkinMathSchema.nullable().optional(),
  topDownCrossCheck: z.string().min(1).nullable().optional()
});

export type ResearchSectionContent = z.infer<typeof researchSectionContentSchema>;

export const researchSectionSchema = z.object({
  slug: z.string().min(1),
  domain: z.string().min(1),
  sectionId: researchSectionIdSchema,
  visibility: researchSectionVisibilitySchema,
  status: researchSectionStatusSchema,
  content: researchSectionContentSchema.nullable(),
  citationIds: z.array(z.string().min(1)),
  sourceIds: z.array(z.string().min(1)),
  runId: z.string().min(1).nullable(),
  error: z.string().min(1).nullable(),
  generatedAt: z.string().datetime().nullable(),
  staleAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional()
});

export type ResearchSection = z.infer<typeof researchSectionSchema>;

export type ResearchSectionDefinition = {
  id: ResearchSectionId;
  layerId: ResearchLayerId;
  title: string;
  visibility: ResearchSectionVisibility;
  staleAfterMs: number;
  emptyState: string;
  generationPrompt: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

const sharedPromptRules = [
  "Use only supplied evidence.",
  "Do not use outside knowledge.",
  "Do not write marketing copy.",
  "Do not praise the company.",
  "Do not pad weak evidence.",
  "Do not use cutting-edge, world-class, best-in-class, transformative, unlock, revolutionize, or poised to.",
  "Prefer not disclosed over guessing.",
  "Every claim needs citation ids.",
  "Write like a sharp investor writing for another human.",
  "Never use an em dash. Use a period or a semicolon instead.",
  "Short, concrete, useful."
].join("\n");

function prompt(body: string) {
  return `${sharedPromptRules}\n\n${body}`.trim();
}

export const RESEARCH_SECTION_DEFINITIONS: ResearchSectionDefinition[] = [
  {
    id: "buyer",
    layerId: "serves",
    title: "Who pays",
    visibility: "public",
    staleAfterMs: 7 * DAY_MS,
    emptyState: "No buyer or use-case evidence found yet.",
    generationPrompt: prompt("Write Buyer & Use Case. Find who uses the product, who pays, what workflow changes, and what pain makes adoption plausible. Do not summarize the whole company. Do not infer buyer from category alone. Return one sentence on the job served, up to 3 points, or empty if evidence does not show buyer or use case.")
  },
  {
    id: "customer_proof",
    layerId: "customers",
    title: "Proof",
    visibility: "public",
    staleAfterMs: 7 * DAY_MS,
    emptyState: "No named customer proof found yet.",
    generationPrompt: prompt("Write Customer Proof. Find named customers, pilots, case studies, deployments, public logos, usage quotes, or partner deployments. Do not call someone a customer unless the source does. Keep exact wording: customer, partner, pilot, integration, user. Return up to 4 proof points or empty if evidence is vague.")
  },
  {
    id: "traction",
    layerId: "signals",
    title: "Traction",
    visibility: "public",
    staleAfterMs: SIX_HOURS_MS,
    emptyState: "No traction signal found yet.",
    generationPrompt: prompt("Write Traction. Look creatively for traction without guessing. Signals can include revenue, ARR, bookings, paid customers, usage, API calls, seats, transactions, hiring velocity, senior hires, customer expansion, launches with adoption evidence, funding from strong investors, partnerships with distribution, GitHub activity, package downloads, app rankings, community growth, approvals, procurement, contracts, pilots, deployments, or technical benchmarks that matter commercially. Do not call a signal traction unless it shows momentum, adoption, buyer pull, or resource attraction. Return up to 6 dated signals, label weak signals, and explain why each matters in plain language.")
  },
  {
    id: "financing",
    layerId: "investors",
    title: "Money",
    visibility: "public",
    staleAfterMs: 7 * DAY_MS,
    emptyState: "No financing evidence found yet.",
    generationPrompt: prompt("Write Financing & Valuation. Find total raised, last round, valuation if disclosed, investors, round date, strategic backers, and conflicting numbers. Never estimate valuation. Never infer total raised. If sources conflict, show the conflict. Return one compact summary and up to 4 financing rows.")
  },
  {
    id: "competition",
    layerId: "competition",
    title: "Comps",
    visibility: "public",
    staleAfterMs: 7 * DAY_MS,
    emptyState: "No useful competitive evidence found yet.",
    generationPrompt: prompt("Write Competitive Position. Find competitors that actually matter: direct startups, high-flying adjacent startups likely to converge, incumbents with distribution, frontier AI labs entering or likely to enter, and internal build or open-source substitutes. A competitor matters only if it competes for the same buyer, budget, workflow, model layer, or distribution path. Rank 3 to 7 competitors or substitutes by relevance, return competitor_count_high_quality, crowdedness, why the market is or is not crowded, and the company's likely wedge. Separate quantity from quality.")
  },
  {
    id: "product",
    layerId: "mechanism",
    title: "Product",
    visibility: "public",
    staleAfterMs: 7 * DAY_MS,
    emptyState: "No product or technology evidence found yet.",
    generationPrompt: prompt("Write Product & Technology. Find what the product does, how it works, what seems differentiated, and what is still unclear. Do not list features. Do not repeat the homepage line. Do not use technical terms unless evidence explains them. Return one sentence and up to 3 points.")
  },
  {
    id: "why_it_matters",
    layerId: "coreIdea",
    title: "Why It Matters",
    visibility: "gated",
    staleAfterMs: DAY_MS,
    emptyState: "No supported investment rationale survived verification.",
    generationPrompt: prompt("Write Why It Matters. This is not a company summary. This is the reason an investor might spend the next 30 minutes. Find the strongest supported reason: painful workflow, timing shift, unusual adoption signal, strong wedge, strategic relevance, distribution advantage, technical advantage, or cost advantage. Do not say it matters because the market is large. Return 2 to 4 sentences and one would-matter-more-if line.")
  },
  {
    id: "market",
    layerId: "marketStructureTiming",
    title: "Market Structure & Timing",
    visibility: "gated",
    staleAfterMs: DAY_MS,
    emptyState: "No market-structure claims survived verification.",
    generationPrompt: prompt("Write Market Structure & Timing. Answer whether this is a real, reachable, timely market. Use bottom-up thinking first, then cross-check top-down data if available. Find buyer type, addressable buyer count, likely annual spend per buyer, current spend being replaced or expanded, adoption trigger, budget owner, pricing clue, market structure, capital intensity, and timing risk. Do not start with TAM. Do not invent numbers. If a number is estimated, label it and show the math. Return buyerBudget, painSeverity, adoptionTrigger, marketStructure, profitPool, expansionPath, timingRisk, napkinMath, and topDownCrossCheck. Better 2 strong fields than 8 weak ones.")
  },
  {
    id: "risks",
    layerId: "openQuestions",
    title: "Risks & Diligence",
    visibility: "gated",
    staleAfterMs: DAY_MS,
    emptyState: "No supported risks or diligence questions found yet.",
    generationPrompt: prompt("Write Risks & Diligence. Find what could break the case: adoption, budget owner, procurement friction, competition, technical risk, margin pressure, regulation, customer concentration, platform dependency, funding/runway, or unclear proof. Do not write generic risks. Every risk must point to evidence or missing evidence. Do not default to ARR or revenue-not-public unless that is the most specific uncertainty for this company. Return up to 4 risks.")
  },
  // The Case renders from card.synthesis (bull + bear) in the surfaces, so this section is
  // never generated or derived; its generationPrompt is a latent fallback only.
  {
    id: "the_case",
    layerId: "theCase",
    title: "The Case",
    visibility: "gated",
    staleAfterMs: DAY_MS,
    emptyState: "No supported bull or bear case survived verification.",
    generationPrompt: prompt("Write The Case. State the bull case and the bear case side by side using only verified synthesis claims. Each line ends with citation ids. Do not invent claims. Do not pad to a fixed count.")
  }
];

export const RESEARCH_SECTION_DEFINITIONS_BY_ID = Object.fromEntries(
  RESEARCH_SECTION_DEFINITIONS.map((definition) => [definition.id, definition])
) as Record<ResearchSectionId, ResearchSectionDefinition>;

export const RESEARCH_SECTION_DEFINITIONS_BY_LAYER_ID = Object.fromEntries(
  RESEARCH_SECTION_DEFINITIONS.map((definition) => [definition.layerId, definition])
) as Record<ResearchLayerId, ResearchSectionDefinition>;

export function sectionIdForLayer(id: ResearchLayerId): ResearchSectionId {
  return RESEARCH_SECTION_DEFINITIONS_BY_LAYER_ID[id].id;
}

export function sectionDefinitionForLayer(id: ResearchLayerId): ResearchSectionDefinition {
  return RESEARCH_SECTION_DEFINITIONS_BY_LAYER_ID[id];
}

export function layerIdForSection(id: ResearchSectionId): ResearchLayerId {
  return RESEARCH_SECTION_DEFINITIONS_BY_ID[id].layerId;
}

export function researchSectionJobKind(id: ResearchSectionId): GenerationJobKind {
  return `section:${id}`;
}

export function researchSectionIdsForVisibility(visibility: ResearchSectionVisibility): ResearchSectionId[] {
  return RESEARCH_SECTION_DEFINITIONS
    .filter((definition) => definition.visibility === visibility)
    .map((definition) => definition.id);
}

function citedContent(input: {
  slug: string;
  domain: string;
  sectionId: ResearchSectionId;
  summary: string | null;
  items?: ResearchSectionContent["items"];
  confidence?: ResearchSectionContent["confidence"];
  citationIds?: string[];
  generatedAt?: string | null;
}): ResearchSection {
  const definition = RESEARCH_SECTION_DEFINITIONS_BY_ID[input.sectionId];
  const citationIds = Array.from(new Set(input.citationIds ?? input.items?.flatMap((item) => item.citationIds) ?? []));
  const hasContent = Boolean(input.summary || (input.items?.length ?? 0) > 0);
  return {
    slug: input.slug,
    domain: input.domain,
    sectionId: input.sectionId,
    visibility: definition.visibility,
    status: hasContent ? "available" : "empty",
    content: {
      status: hasContent ? "available" : "empty",
      summary: input.summary,
      items: input.items ?? [],
      confidence: input.confidence ?? (hasContent ? "medium" : "low")
    },
    citationIds,
    sourceIds: [],
    runId: null,
    error: null,
    generatedAt: input.generatedAt ?? null,
    staleAt: null
  };
}

export function emptyResearchSectionForCard(card: ColdStartCard, sectionId: ResearchSectionId, status: ResearchSectionStatus = "empty"): ResearchSection {
  const definition = RESEARCH_SECTION_DEFINITIONS_BY_ID[sectionId];
  return {
    slug: card.slug,
    domain: card.domain,
    sectionId,
    visibility: definition.visibility,
    status,
    content: status === "not_started" ? null : {
      status: "empty",
      summary: null,
      items: [],
      confidence: "low"
    },
    citationIds: [],
    sourceIds: [],
    runId: null,
    error: null,
    generatedAt: null,
    staleAt: null
  };
}

export function placeholderResearchSectionsForCard(card: ColdStartCard): ResearchSection[] {
  return RESEARCH_SECTION_DEFINITIONS.map((definition) =>
    emptyResearchSectionForCard(card, definition.id, definition.visibility === "gated" ? "not_started" : "empty")
  );
}

function hasReaderFacingEvidence(card: ColdStartCard, citationIds: string[]) {
  const citations = new Map(card.citations.map((citation) => [citation.id, citation]));
  return citationIds.some((id) => {
    const citation = citations.get(id);
    if (!citation) {
      return false;
    }

    return citation.sourceType !== "enrichment";
  });
}

export function deriveLegacyResearchSectionsFromCard(card: ColdStartCard): ResearchSection[] {
  const description = card.identity.description?.value;
  const descriptionCitationIds = card.identity.description?.citationIds ?? card.identity.oneLiner.citationIds;
  const descriptionHasReaderEvidence = hasReaderFacingEvidence(card, descriptionCitationIds);
  const fundingEvidence = [
    card.funding.totalRaisedUsd.value ? {
      label: "Total raised",
      text: `Total raised is ${card.funding.totalRaisedUsd.value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}.`,
      citationIds: card.funding.totalRaisedUsd.citationIds
    } : null,
    card.funding.lastRound.value ? {
      label: card.funding.lastRound.value.name,
      text: `${card.funding.lastRound.value.name}${card.funding.lastRound.value.amountUsd ? ` was ${card.funding.lastRound.value.amountUsd.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}` : ""}${card.funding.lastRound.value.announcedAt ? ` on ${card.funding.lastRound.value.announcedAt}` : ""}.`,
      citationIds: card.funding.lastRound.citationIds
    } : null,
    (card.funding.investors.value?.length ?? 0) > 0 ? {
      label: "Investors",
      text: `Named investors include ${card.funding.investors.value?.map((investor) => investor.name).join(", ")}.`,
      citationIds: card.funding.investors.citationIds
    } : null
  ].filter((item): item is ResearchSectionContent["items"][number] => Boolean(item));

  const marketRows = card.synthesis?.marketStructureAndTiming
    ? Object.entries(card.synthesis.marketStructureAndTiming).flatMap(([label, claim]) =>
        claim ? [{ label, text: claim.text, citationIds: claim.citationIds }] : []
      )
    : [];

  return [
    descriptionHasReaderEvidence && (description?.serves ?? description?.concept ?? card.identity.oneLiner.value)
      ? citedContent({
          slug: card.slug,
          domain: card.domain,
          sectionId: "buyer",
          summary: description?.serves ?? description?.concept ?? card.identity.oneLiner.value,
          citationIds: descriptionCitationIds.length > 0 ? descriptionCitationIds : card.identity.oneLiner.citationIds
        })
      : emptyResearchSectionForCard(card, "buyer"),
    emptyResearchSectionForCard(card, "customer_proof"),
    card.signals.length > 0
      ? citedContent({
          slug: card.slug,
          domain: card.domain,
          sectionId: "traction",
          summary: card.signals[0]?.title ?? "Recent signals found.",
          items: card.signals.map((signal) => ({
            label: signal.category,
            text: `${signal.date}: ${signal.title}`,
            citationIds: signal.citationIds,
            meta: signal.source
          })),
          confidence: "medium"
        })
      : emptyResearchSectionForCard(card, "traction"),
    fundingEvidence.length > 0
      ? citedContent({ slug: card.slug, domain: card.domain, sectionId: "financing", summary: fundingEvidence[0]?.text ?? null, items: fundingEvidence })
      : emptyResearchSectionForCard(card, "financing"),
    card.comparables.length > 0
      ? citedContent({
          slug: card.slug,
          domain: card.domain,
          sectionId: "competition",
          summary: `${card.comparables.length} comparable ${card.comparables.length === 1 ? "company" : "companies"} surfaced.`,
          items: card.comparables.slice(0, 7).map((comparable) => ({
            label: comparable.name,
            text: comparable.basis ?? comparable.oneLiner,
            citationIds: comparable.citationIds ?? []
          })),
          confidence: "medium"
        })
      : emptyResearchSectionForCard(card, "competition"),
    descriptionHasReaderEvidence && (description?.mechanism || description?.concept)
      ? citedContent({ slug: card.slug, domain: card.domain, sectionId: "product", summary: description.mechanism ?? description.concept ?? null, citationIds: descriptionCitationIds })
      : emptyResearchSectionForCard(card, "product"),
    card.synthesis?.whyItMatters
      ? citedContent({ slug: card.slug, domain: card.domain, sectionId: "why_it_matters", summary: card.synthesis.whyItMatters.text, citationIds: card.synthesis.whyItMatters.citationIds })
      : emptyResearchSectionForCard(card, "why_it_matters", "not_started"),
    card.synthesis?.marketStructureAndTiming
      ? citedContent({ slug: card.slug, domain: card.domain, sectionId: "market", summary: marketRows[0]?.text ?? null, items: marketRows, confidence: marketRows.length > 0 ? "medium" : "low" })
      : emptyResearchSectionForCard(card, "market", "not_started"),
    // Open Questions and The Case render from card.synthesis directly (synthesis branches),
    // so the risks and the_case sections are not derived. Placeholders keep the maps total.
    emptyResearchSectionForCard(card, "risks", "not_started"),
    emptyResearchSectionForCard(card, "the_case", "not_started")
  ];
}

export function mergeStoredResearchSectionsWithLegacy(input: {
  card: ColdStartCard | null;
  storedSections: ResearchSection[];
  includeGated?: boolean;
}): ResearchSection[] {
  const storedById = new Map(input.storedSections.map((section) => [section.sectionId, section]));
  let legacySections: ResearchSection[] = [];
  if (input.card) {
    try {
      legacySections = deriveLegacyResearchSectionsFromCard(input.card);
    } catch {
      legacySections = [];
    }
  }
  const legacyById = new Map(legacySections.map((section) => [section.sectionId, section]));
  const definitions = input.includeGated === false
    ? RESEARCH_SECTION_DEFINITIONS.filter((definition) => definition.visibility === "public")
    : RESEARCH_SECTION_DEFINITIONS;

  return definitions.map((definition) =>
    storedById.get(definition.id) ??
    legacyById.get(definition.id) ??
    (input.card ? emptyResearchSectionForCard(input.card, definition.id, definition.visibility === "gated" ? "not_started" : "empty") : null)
  ).filter((section): section is ResearchSection => Boolean(section));
}

export function researchSectionCitationIssues(card: ColdStartCard, section: ResearchSection): string[] {
  const validIds = new Set(card.citations.map((citation) => citation.id));
  const contentIds = [
    ...section.citationIds,
    ...(section.content?.items.flatMap((item) => item.citationIds) ?? []),
    ...(section.content?.napkinMath?.buyers.citationIds ?? []),
    ...(section.content?.napkinMath?.annualSpend.citationIds ?? [])
  ];

  return Array.from(new Set(contentIds))
    .filter((id) => !validIds.has(id))
    .map((id) => `Citation ref does not resolve: ${id}`);
}

export function researchSectionHasReaderFacingEvidence(card: ColdStartCard, section: ResearchSection): boolean {
  return hasReaderFacingEvidence(card, section.citationIds);
}
