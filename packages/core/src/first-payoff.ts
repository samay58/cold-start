import { z } from "zod";
import type { ColdStartCard, Citation } from "./card";
import { newsworthyTitlePattern, titleMentionsCompany } from "./headline";
import { splitIntoSentences } from "./sentences";
import { textLooksLikeCustomerProof, textLooksLikeDocs, textLooksLikeFunding } from "./source-class";
import { sourceQualityForSource, type SourceQualityTier } from "./source-quality";

export const firstPayoffEvidenceSchema = z.object({
  sourceId: z.string().min(1),
  citationId: z.string().min(1).optional(),
  url: z.string().url(),
  domain: z.string().min(1),
  title: z.string().min(1),
  sourceClass: z.enum(["company_site", "docs", "funding", "news", "people", "registry", "jobs", "customer_proof", "database", "other"]),
  quality: z.enum(["company", "reported", "independent"]),
  arrivedAtMs: z.number().int().nonnegative(),
  entityMatched: z.boolean()
});

export const firstPayoffClaimSchema = z.object({
  text: z.string().min(1),
  supportingText: z.string().min(1),
  sourceIds: z.array(z.string().min(1)).min(1),
  citationIds: z.array(z.string().min(1)),
  sourceClass: firstPayoffEvidenceSchema.shape.sourceClass,
  claimKind: z.enum(["what_it_does", "who_it_serves", "proof_headline"])
});

export const firstPayoffMissingProofSchema = z.object({
  text: z.string().min(1),
  missingEvidenceClass: z.enum(["entity", "funding", "customer_proof", "people", "registry", "recent_news", "external_coverage"])
});

export const firstPayoffSuppressionReasonSchema = z.enum([
  "no_sources",
  "entity_needs_check",
  "no_incremental_claim",
  "duplicate_of_header",
  "claim_missing_citation",
  "claim_not_source_supported",
  "wrong_or_ambiguous_entity",
  "marketing_filler",
  "investment_language",
  "too_long",
  "insufficient_evidence"
]);

export const firstPayoffSchema = z.object({
  status: z.enum(["receipt", "substantive_first_read", "withheld"]),
  slug: z.string().min(1),
  domain: z.string().min(1),
  generatedAt: z.string().datetime(),
  generatedAtMs: z.number().int().nonnegative(),
  sourceEventId: z.string().min(1).optional(),
  cardEventId: z.string().min(1).optional(),
  entityConfidence: z.enum(["high", "medium", "needs_check"]),
  entityConfidenceReason: z.string().min(1),
  evidenceSoFar: z.array(firstPayoffEvidenceSchema),
  stillChecking: firstPayoffMissingProofSchema,
  whatItDoes: firstPayoffClaimSchema.optional(),
  whoItSeemsFor: firstPayoffClaimSchema.optional(),
  proofHeadline: firstPayoffClaimSchema.optional(),
  suppressionReasons: z.array(firstPayoffSuppressionReasonSchema)
});

export type FirstPayoff = z.infer<typeof firstPayoffSchema>;
export type FirstPayoffClaim = z.infer<typeof firstPayoffClaimSchema>;
export type FirstPayoffEvidence = z.infer<typeof firstPayoffEvidenceSchema>;
export type FirstPayoffSuppressionReason = z.infer<typeof firstPayoffSuppressionReasonSchema>;

export type FirstPayoffSource = {
  id?: string;
  url: string;
  title: string;
  sourceType: Citation["sourceType"];
  fetchedAt?: string;
  rawText?: string;
  snippet?: string;
  publishedAt?: string;
  intent?: string;
};

const marketingFillerPattern = /\b(ai-native|agentic|next[-\s]?generation|transforming|revolutionizing|all-in-one|end-to-end|unlocking|emerging leader)\b/i;
const investmentLanguagePattern = /\b(attractive|compelling|could matter|bull case|bear case|risk|winner|underwrite|invest)\b/i;
const rawPayloadPattern = /(^\s*(?:\[|{))|(?:["']?[a-zA-Z0-9_-]+["']?\s*:\s*(?:["'{]|\[))|(?:\\[nrt])/;
const directoryCategoryPattern = /\bis an?\s+[A-Z][A-Za-z]+(?:\s+(?:and|&)?\s*[A-Z][A-Za-z]+)*\s+company\b/;

function domainFromUrl(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

function sourceIdFor(source: FirstPayoffSource, index: number) {
  return source.id?.trim() || `source-${index + 1}`;
}

function normalizeSentence(value: string) {
  const normalized = value.replace(/\\[nrt]/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return null;
  }
  return `${normalized.replace(/[.。]+$/u, "")}.`;
}

function sourceText(source: FirstPayoffSource) {
  return readableSourceText(source.rawText) ?? readableSourceText(source.snippet) ?? source.title;
}

function readableSourceText(value: string | undefined) {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!looksLikeJsonObject(trimmed)) {
    return trimmed;
  }
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return trimmed;
    }
    const record = parsed as Record<string, unknown>;
    const text = stringField(record, "text") ?? stringField(record, "summary") ?? stringField(record, "description");
    return text?.trim() || trimmed;
  } catch {
    return trimmed;
  }
}

function looksLikeJsonObject(value: string) {
  return value.startsWith("{") && value.endsWith("}");
}

function stringField(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" ? value : null;
}

function evidenceQuality(tier: SourceQualityTier): FirstPayoffEvidence["quality"] {
  if (tier === "primary_company" || tier === "press_release") {
    return "company";
  }
  if (tier === "independent_technical" || tier === "independent_analysis") {
    return "independent";
  }
  if (tier === "independent_report") {
    return "reported";
  }
  return "reported";
}

function sourceClassFor(source: FirstPayoffSource): FirstPayoffEvidence["sourceClass"] {
  const text = `${source.intent ?? ""} ${source.url} ${source.title}`;
  if (source.sourceType === "company_site") {
    return textLooksLikeDocs(text) ? "docs" : "company_site";
  }
  if (source.sourceType === "news") {
    if (textLooksLikeFunding(text)) {
      return "funding";
    }
    if (textLooksLikeCustomerProof(text)) {
      return "customer_proof";
    }
    return "news";
  }
  if (source.sourceType === "filing") {
    return "registry";
  }
  if (source.sourceType === "github") {
    return "docs";
  }
  if (source.sourceType === "enrichment" || source.sourceType === "rdap") {
    return "database";
  }
  return "other";
}

function sourceEntityMatched(source: FirstPayoffSource, domain: string, companyName: string | null | undefined) {
  const host = domainFromUrl(source.url);
  const target = domain.replace(/^www\./i, "").toLowerCase();
  if (host === target || host.endsWith(`.${target}`)) {
    return true;
  }
  return titleMentionsCompany(`${source.title} ${sourceText(source)}`, {
    domain,
    ...(companyName !== undefined ? { name: companyName } : {})
  });
}

function citationIdsForSource(source: FirstPayoffSource, card?: ColdStartCard): string[] {
  if (!card) {
    return [];
  }
  return card.citations.filter((citation) => citation.url === source.url).map((citation) => citation.id);
}

function firstUsefulLine(rawText: string, domain: string, skipTexts: string[] = []) {
  const skipped = new Set(skipTexts.map((text) => normalizeComparableText(text)).filter(Boolean));
  return rawText
    .replace(/\\[nrt]/g, " ")
    // Newlines stay a hard boundary (raw scraped text, one candidate line per visual line);
    // splitIntoSentences (abbreviation-aware) breaks each line further at real sentence ends,
    // replacing the old (?<=[.!?])\s+ lookbehind that truncated on "Inc.", "D.C.", etc.
    .split(/\r?\n/)
    .flatMap((line) => splitIntoSentences(line))
    .map((line) => line.replace(/[#*_`>[\]{}()]|https?:\/\/\S+/g, " ").replace(/\s+/g, " ").trim())
    .find((line) => {
      const lower = line.toLowerCase();
      const comparable = normalizeComparableText(line);
      return (
        line.length >= 28 &&
        line.length <= 220 &&
        !skipped.has(comparable) &&
        !rawPayloadPattern.test(line) &&
        !directoryCategoryPattern.test(line) &&
        !lower.includes("cookie") &&
        !lower.includes("javascript") &&
        !lower.includes("captcha") &&
        !lower.includes(domain.toLowerCase())
      );
    }) ?? null;
}

function normalizeComparableText(value: string) {
  return value.toLowerCase().replace(/[.。]+$/u, "").replace(/\s+/g, " ").trim();
}

function isBadClaimText(text: string) {
  if (rawPayloadPattern.test(text)) {
    return "claim_not_source_supported" as const;
  }
  if (directoryCategoryPattern.test(text)) {
    return "marketing_filler" as const;
  }
  if (text.length > 220) {
    return "too_long" as const;
  }
  if (investmentLanguagePattern.test(text)) {
    return "investment_language" as const;
  }
  if (marketingFillerPattern.test(text)) {
    return "marketing_filler" as const;
  }
  return null;
}

function looksLikeRawProviderPayload(text: string) {
  return (
    (/^\s*(?:\[|\{)/.test(text) && /["']?[a-zA-Z0-9_-]+["']?\s*:/.test(text)) ||
    /\\[nrt]/.test(text)
  );
}

function normalizedEvidenceKey(evidence: FirstPayoffEvidence) {
  const cleanUrl = (() => {
    try {
      const url = new URL(evidence.url);
      url.hash = "";
      url.search = "";
      url.pathname = url.pathname.replace(/\/+$/u, "") || "/";
      return url.toString().toLowerCase();
    } catch {
      return evidence.url.toLowerCase();
    }
  })();
  return `${cleanUrl}:${evidence.sourceClass}`;
}

function dedupeEvidence(evidence: FirstPayoffEvidence[]) {
  const seen = new Set<string>();
  const deduped: FirstPayoffEvidence[] = [];

  for (const item of evidence) {
    const key = normalizedEvidenceKey(item);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(item);
  }

  return deduped;
}

function companyLabel(domain: string, card?: ColdStartCard) {
  const name = card?.identity.name.value?.trim();
  if (name && name.toLowerCase() !== domain.replace(/^www\./i, "").toLowerCase()) {
    return name;
  }
  const root = domain.replace(/^www\./i, "").split(".")[0] ?? domain;
  return (
    root
      .split(/[-_]+/)
      .filter(Boolean)
      .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
      .join(" ") || domain
  );
}

function normalizeMoney(numStr: string, unit: string): string | null {
  const value = numStr.replace(/,/g, "");
  if (!/^\d+(\.\d+)?$/.test(value)) {
    return null;
  }
  const u = unit.toLowerCase();
  const suffix = u.startsWith("b") ? "B" : u.startsWith("m") ? "M" : u === "k" || u === "thousand" ? "K" : null;
  if (!suffix) {
    return null;
  }
  const clean = value.replace(/\.0+$/, "");
  return `$${clean}${suffix}`;
}

// A money token already scaled (M/B/K). A token reads as a valuation only when "valuation"
// or "valued" sits next to it, so the raise amount is never mistaken for the valuation.
function extractMoney(text: string): { amount: string | null; valuation: string | null } {
  const re = /\$\s?(\d[\d,]*(?:\.\d+)?)\s?(k|thousand|m|mn|mm|million|b|bn|billion)\b/gi;
  let amount: string | null = null;
  let valuation: string | null = null;
  for (const match of text.matchAll(re)) {
    const label = normalizeMoney(match[1] ?? "", match[2] ?? "");
    if (!label) {
      continue;
    }
    const index = match.index ?? 0;
    const context = text.slice(Math.max(0, index - 20), index + match[0].length + 20).toLowerCase();
    if (/valuat|valued/.test(context)) {
      valuation ??= label;
    } else {
      amount ??= label;
    }
  }
  return { amount, valuation };
}

function extractRound(text: string): string | null {
  const match = text.match(/\b(pre[-\s]?seed|seed|series\s+([a-h]))\b/i);
  if (!match) {
    return null;
  }
  if (/series/i.test(match[1] ?? "")) {
    return `Series ${(match[2] ?? "").toUpperCase()}`;
  }
  return /pre/i.test(match[1] ?? "") ? "pre-seed" : "seed";
}

// Deterministic plain-English funding read. The raw article title is never surfaced; we recompose
// one clean sentence from the structured facts it carries, or return null so the caller suppresses.
function buildFundingRead(company: string, facts: { amount: string | null; round: string | null; valuation: string | null }) {
  const { amount, round, valuation } = facts;
  if (!amount && !round) {
    return null;
  }
  const tail = valuation ? ` at a ${valuation} valuation` : "";
  if (amount && round) {
    return `${company} reported ${amount} in ${round} funding${tail}.`;
  }
  if (amount) {
    return `${company} reported new funding of ${amount}${tail}.`;
  }
  return `${company} reported a new ${round} round${tail}.`;
}

function buildProofClaim({
  card,
  domain,
  evidence,
  source,
  sourceId
}: {
  card: ColdStartCard | undefined;
  domain: string;
  evidence: FirstPayoffEvidence;
  source: FirstPayoffSource;
  sourceId: string;
}): { claim?: FirstPayoffClaim; reason?: FirstPayoffSuppressionReason } {
  if (!newsworthyTitlePattern.test(source.title)) {
    return {};
  }
  const companyName = card?.identity.name.value;
  if (!titleMentionsCompany(source.title, { domain, ...(companyName !== undefined ? { name: companyName } : {}) })) {
    return { reason: "wrong_or_ambiguous_entity" };
  }
  if (!evidence.entityMatched) {
    return { reason: "wrong_or_ambiguous_entity" };
  }
  const supportingLine = firstUsefulLine(sourceText(source), domain, [source.title]) ?? sourceText(source);
  const supportingText = normalizeSentence(supportingLine);
  if (!supportingText) {
    return { reason: "claim_not_source_supported" };
  }
  const badSupportingReason = isBadClaimText(supportingText);
  if (badSupportingReason) {
    return { reason: badSupportingReason };
  }

  const titleMoney = extractMoney(source.title);
  const supportMoney = extractMoney(supportingText);
  const read = buildFundingRead(companyLabel(domain, card), {
    amount: titleMoney.amount ?? supportMoney.amount,
    valuation: titleMoney.valuation ?? supportMoney.valuation,
    round: extractRound(source.title) ?? extractRound(supportingText)
  });
  if (!read) {
    // Newsworthy, but not a cleanly structured funding event. Suppress rather than echo the headline.
    return { reason: "no_incremental_claim" };
  }
  const text = normalizeSentence(read);
  if (!text) {
    return { reason: "claim_not_source_supported" };
  }
  const badReason = isBadClaimText(text);
  if (badReason) {
    return { reason: badReason };
  }
  return {
    claim: {
      text,
      supportingText,
      sourceIds: [sourceId],
      citationIds: citationIdsForSource(source, card),
      sourceClass: evidence.sourceClass,
      claimKind: "proof_headline"
    }
  };
}

function buildWhatItDoesClaim({
  card,
  domain,
  evidence,
  source,
  sourceId
}: {
  card: ColdStartCard | undefined;
  domain: string;
  evidence: FirstPayoffEvidence;
  source: FirstPayoffSource;
  sourceId: string;
}): { claim?: FirstPayoffClaim; reason?: FirstPayoffSuppressionReason } {
  if (source.sourceType !== "company_site" || !evidence.entityMatched) {
    return {};
  }
  if (looksLikeRawProviderPayload(sourceText(source))) {
    return { reason: "claim_not_source_supported" };
  }
  const line = firstUsefulLine(sourceText(source), domain);
  const text = line ? normalizeSentence(line) : null;
  if (!text) {
    return {};
  }
  const badReason = isBadClaimText(text);
  if (badReason) {
    return { reason: badReason };
  }
  const summary = card?.identity.description?.value?.shortDescription ?? card?.identity.oneLiner.value ?? "";
  if (summary && text.toLowerCase() === normalizeSentence(summary)?.toLowerCase()) {
    return { reason: "duplicate_of_header" };
  }
  return {
    claim: {
      text,
      supportingText: text,
      sourceIds: [sourceId],
      citationIds: citationIdsForSource(source, card),
      sourceClass: evidence.sourceClass,
      claimKind: "what_it_does"
    }
  };
}

function buildWhoServesClaim({
  card,
  evidence,
  source,
  sourceId
}: {
  card: ColdStartCard | undefined;
  evidence: FirstPayoffEvidence;
  source: FirstPayoffSource;
  sourceId: string;
}): { claim?: FirstPayoffClaim; reason?: FirstPayoffSuppressionReason } {
  const serves = card?.identity.description?.value?.serves?.trim();
  if (!serves || source.sourceType !== "company_site" || !evidence.entityMatched) {
    return {};
  }
  const text = normalizeSentence(serves);
  if (!text) {
    return {};
  }
  const badReason = isBadClaimText(text);
  if (badReason) {
    return { reason: badReason };
  }
  return {
    claim: {
      text,
      supportingText: text,
      sourceIds: [sourceId],
      citationIds: card?.identity.description?.citationIds ?? [],
      sourceClass: evidence.sourceClass,
      claimKind: "who_it_serves"
    }
  };
}

function stillCheckingFor(evidence: FirstPayoffEvidence[], entityConfidence: FirstPayoff["entityConfidence"]): FirstPayoff["stillChecking"] {
  if (entityConfidence === "needs_check") {
    return { text: "Confirming this is the right company.", missingEvidenceClass: "entity" };
  }
  if (!evidence.some((item) => item.sourceClass === "funding")) {
    return { text: "Independent funding or source-of-capital proof.", missingEvidenceClass: "funding" };
  }
  if (!evidence.some((item) => item.sourceClass === "customer_proof")) {
    return { text: "Named customer proof.", missingEvidenceClass: "customer_proof" };
  }
  return { text: "Independent external coverage.", missingEvidenceClass: "external_coverage" };
}

function entityConfidenceFor(evidence: FirstPayoffEvidence[]): Pick<FirstPayoff, "entityConfidence" | "entityConfidenceReason"> {
  if (evidence.length === 0) {
    return { entityConfidence: "needs_check", entityConfidenceReason: "No accepted source has matched the company yet." };
  }
  if (evidence.some((item) => item.sourceClass === "company_site" && item.entityMatched)) {
    return { entityConfidence: "high", entityConfidenceReason: "Company-controlled source matches the current domain." };
  }
  if (evidence.some((item) => item.entityMatched)) {
    return { entityConfidence: "medium", entityConfidenceReason: "At least one accepted source names the company or domain." };
  }
  return { entityConfidence: "needs_check", entityConfidenceReason: "Accepted sources do not clearly match the current company." };
}

export function buildFirstPayoff(input: {
  slug: string;
  domain: string;
  sources: FirstPayoffSource[];
  card?: ColdStartCard | null;
  generatedAtMs?: number;
  sourceEventId?: string;
  cardEventId?: string;
}): FirstPayoff {
  const generatedAtMs = Math.max(0, Math.round(input.generatedAtMs ?? Date.now()));
  const card = input.card ?? undefined;
  const evidence = input.sources.flatMap((source, index): FirstPayoffEvidence[] => {
    const domain = domainFromUrl(source.url);
    if (!domain) {
      return [];
    }
    const tier = sourceQualityForSource(source).tier;
    return [{
      sourceId: sourceIdFor(source, index),
      ...(citationIdsForSource(source, card)[0] ? { citationId: citationIdsForSource(source, card)[0] } : {}),
      url: source.url,
      domain,
      title: source.title || source.url,
      sourceClass: sourceClassFor(source),
      quality: evidenceQuality(tier),
      arrivedAtMs: Date.parse(source.fetchedAt ?? "") || generatedAtMs,
      entityMatched: sourceEntityMatched(source, input.domain, card?.identity.name.value)
    }];
  });
  const displayEvidence = dedupeEvidence(evidence);
  const entity = entityConfidenceFor(displayEvidence);
  const reasons = new Set<FirstPayoffSuppressionReason>();
  if (displayEvidence.length === 0) {
    reasons.add("no_sources");
  }
  if (entity.entityConfidence === "needs_check") {
    reasons.add("entity_needs_check");
  }

  let whatItDoes: FirstPayoffClaim | undefined;
  let whoItSeemsFor: FirstPayoffClaim | undefined;
  let proofHeadline: FirstPayoffClaim | undefined;
  input.sources.forEach((source, index) => {
    const sourceId = sourceIdFor(source, index);
    const sourceEvidence = evidence.find((item) => item.sourceId === sourceId);
    if (!sourceEvidence) {
      return;
    }
    if (!whatItDoes) {
      const result = buildWhatItDoesClaim({ card, domain: input.domain, evidence: sourceEvidence, source, sourceId });
      if (result.claim) {
        whatItDoes = result.claim;
      } else if (result.reason) {
        reasons.add(result.reason);
      }
    }
    if (!whoItSeemsFor) {
      const result = buildWhoServesClaim({ card, evidence: sourceEvidence, source, sourceId });
      if (result.claim) {
        whoItSeemsFor = result.claim;
      } else if (result.reason) {
        reasons.add(result.reason);
      }
    }
    if (!proofHeadline) {
      const result = buildProofClaim({ card, domain: input.domain, evidence: sourceEvidence, source, sourceId });
      if (result.claim) {
        proofHeadline = result.claim;
      } else if (result.reason) {
        reasons.add(result.reason);
      }
    }
  });

  // Do not show the same line twice when the description's "serves" sentence
  // collapses to the what-it-does line.
  if (whoItSeemsFor && whatItDoes && whoItSeemsFor.text.toLowerCase() === whatItDoes.text.toLowerCase()) {
    whoItSeemsFor = undefined;
  }

  const primaryClaim = whatItDoes ?? proofHeadline;
  if (!primaryClaim) {
    reasons.add("no_incremental_claim");
  }
  const status: FirstPayoff["status"] = primaryClaim
    ? "substantive_first_read"
    : displayEvidence.length > 0 && !reasons.has("entity_needs_check")
      ? "receipt"
      : "withheld";

  return firstPayoffSchema.parse({
    status,
    slug: input.slug,
    domain: input.domain,
    generatedAt: new Date(generatedAtMs).toISOString(),
    generatedAtMs,
    ...(input.sourceEventId ? { sourceEventId: input.sourceEventId } : {}),
    ...(input.cardEventId ? { cardEventId: input.cardEventId } : {}),
    ...entity,
    evidenceSoFar: displayEvidence.slice(0, 4),
    stillChecking: stillCheckingFor(displayEvidence, entity.entityConfidence),
    ...(whatItDoes ? { whatItDoes } : {}),
    ...(whoItSeemsFor ? { whoItSeemsFor } : {}),
    ...(proofHeadline ? { proofHeadline } : {}),
    suppressionReasons: [...reasons]
  });
}

export function parseFirstPayoff(value: unknown): FirstPayoff | null {
  const parsed = firstPayoffSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
