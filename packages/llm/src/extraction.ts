import type Anthropic from "@anthropic-ai/sdk";
import type { Message } from "@anthropic-ai/sdk/resources/messages";
import { readableSourceText } from "@cold-start/core";
import { z } from "zod";
import { anthropicSystemCacheControl, createTracedAnthropicMessage, type AnthropicTelemetrySink } from "./anthropic";
import { withSchemaRetry, type LlmRequestOptions } from "./llm-provider";
import { withExtractionRecovery } from "./extraction-recovery";
import {
  budgetEvidenceSources,
  compactEvidenceText,
  defaultExtractionEvidenceBudgetChars,
  evidenceBudgetCharsFromEnv
} from "./evidence-budget";
import { investorTasteKernel } from "./investor-taste-kernel";
import type { ResearchPlan } from "./research-plan";
import { parseBlockEnrichmentToolUse, parseExtractionToolUse, type ExtractedCardSections } from "./extraction-parse";
import { blockEnrichmentTool, extractionTool, type BlockEnrichmentId } from "./extraction-tools";
import { SINGLE_TOOL_CHOICE } from "./tool-use";

const maxPromptSources = 24;
const maxBlockPromptSources = 8;
const maxPromptSourceTextLength = 2200;
const maxBlockPromptSourceTextLength = 1400;
const maxPromptLedgerEntries = 20;
const maxBlockPromptLedgerEntries = 10;
const maxPromptSnippetLength = 420;
const extractionEvidenceBudgetChars = evidenceBudgetCharsFromEnv(
  process.env.EXTRACTION_EVIDENCE_BUDGET_CHARS,
  defaultExtractionEvidenceBudgetChars
);


export type ExtractionEvidence = {
  domain: string;
  researchPlan?: ResearchPlan;
  sources: Array<{ url: string; title: string; rawText: string; sourceType: string; intent?: string | null }>;
  evidenceLedger?: Array<{
    id: string;
    url: string;
    title: string;
    sourceType: string;
    intents: string[];
    authorityScore: number;
    supportingSnippets: string[];
  }>;
};

export function evidenceForExtractionPrompt(
  evidence: ExtractionEvidence,
  options: { scope?: "full" | "block" } = {}
): ExtractionEvidence {
  const isBlock = options.scope === "block";
  const ledgerLimit = isBlock ? maxBlockPromptLedgerEntries : maxPromptLedgerEntries;
  const sourceLimit = isBlock ? maxBlockPromptSources : maxPromptSources;
  const sourceTextLimit = isBlock ? maxBlockPromptSourceTextLength : maxPromptSourceTextLength;

  // Named fields only: pipeline ledger entries also carry full stored text, which the budgeted sources send.
  const evidenceLedger = evidence.evidenceLedger?.slice(0, ledgerLimit).map(({ id, url, title, sourceType, intents, authorityScore, supportingSnippets }) => ({
    id, url, title, sourceType, intents, authorityScore,
    supportingSnippets: supportingSnippets.map((snippet) => compactEvidenceText(snippet, maxPromptSnippetLength)),
  }));
  const priorityUrls = new Set(evidenceLedger?.map((entry) => entry.url) ?? []);
  const sourcePool =
    priorityUrls.size > 0 ? evidence.sources.filter((source, index) => priorityUrls.has(source.url) || index < 8) : evidence.sources;

  return {
    domain: evidence.domain,
    ...(evidence.researchPlan ? { researchPlan: evidence.researchPlan } : {}),
    ...(evidenceLedger ? { evidenceLedger } : {}),
    sources: budgetEvidenceSources({
      sources: sourcePool,
      itemLimit: sourceLimit,
      textLimit: sourceTextLimit,
      budgetChars: extractionEvidenceBudgetChars,
      getText: (source) => readableSourceText(source.rawText, source.title),
      withText: (source, rawText) => ({ ...source, rawText }),
    }),
  };
}

export const extractionSystemPrompt = [
  investorTasteKernel,
  "You extract investor-grade public company facts from a structured evidence ledger and raw public sources.",
  "Drop unsupported claims. Every material fact must map to citation IDs. Use null for missing facts.",
  "Funding standard: build a round ledger first. Include rounds only when amount, round name, date, or investors are explicitly supported. Set totalRaisedUsd.value only when explicitly stated by a cited source or mechanically reconciled from a complete cited round ledger; otherwise set its value to null. Record unresolved source disagreement in status as mixed, never as text in value.",
  "Numeric fields must be JSON numbers or null, never quoted numbers, currency labels, or the string unknown. Unsupported amounts must remain null.",
  "Description standard: identity.description.shortDescription must be one complete sentence, roughly 18 to 24 words and no more than about 170 characters, that explains what the company actually does and who it serves. It is the card lead, not a product-page overview.",
  "identity.description.expandedDescription must be two or three complete sentences in plain English. Explain what the company does, who uses or buys it, what workflow or pain it addresses, and the nuance that matters. Use concrete nouns, clean causal language, and no brochure copy.",
  "Use identity.description.concept for the non-obvious product idea in one complete sentence.",
  "Use identity.description.serves for buyer and use case and identity.description.mechanism for product and technology, when sources support those details, in up to two complete sentences each. Every sentence must name a concrete segment, channel, price, or mechanic the evidence supports. Never pad, never restate shortDescription, and never write a second sentence with nothing new to say.",
  "Use identity.websiteUrl for the canonical public website when a provider or source returns it. Use identity.linkedinUrl only for the company LinkedIn page, never a person profile.",
  "identity.oneLiner is a backwards-compatible display alias for description.shortDescription. It should be the same kind of short complete sentence, not a paragraph.",
  "Do not write generic category labels such as answer engine, AI-native ERP, copilot, or platform unless the cited sources make that the most precise description.",
  "Never end any description field with an incomplete phrase. Never use literal ellipses or trailing dots to imply omitted text.",
  "Never stuff feature lists into the overview. If a source lists ten capabilities, extract the underlying workflow and leave the details for concept, buyer and use case, or product and technology.",
  "Ban brochure language: innovative, comprehensive, seamless, robust, advanced, trusted by, commitment to, designed to enhance, and with ease. Replace with the supported fact or omit the sentence.",
  "One signal per underlying event. When several sources cover the same announcement, emit it once and cite every supporting source in that signal's citationIds. Never emit one signal per article.",
  "Comparable standard: every comparable must pass the buyer-alternative test. It must be something the same buyer would seriously evaluate instead of this company for the same job to be done, not a lookalike that only shares a category label or a directory listing. basis is required for every comparable and must state, grounded in the cited evidence, the concrete reason a buyer would weigh it: same buyer, same job to be done, same workflow, same budget line, or named together in a market map. Drop lookalikes, boilerplate positioning, directories, and the target itself rather than padding to a fixed count.",
  "Use competitionFraming only when cited evidence supports it: one sentence naming the specific competitive slice this company sits in and how crowded that slice is. Never invent market commentary. Return null when no cited evidence states or clearly implies the slice or its crowdedness; absent is better than a padded guess.",
  "Treat source incentives as evidence: independent technical and independent analysis sources should shape qualitative framing more than press releases; company-authored sources are strongest for exact product mechanics, not evaluative claims.",
  "Prefer primary company pages for product mechanics, recent funding/news sources for round data, and independent analysis for market framing. Surface conflicts as mixed rather than averaging."
].join(" ");

const schemaCorrectionIssueLimit = 8;
const schemaCorrectionMessageLimit = 1200;
const schemaCorrectionPathSegmentLimit = 80;

function boundedIssuePath(path: PropertyKey[]) {
  if (path.length === 0) return "(root)";
  return path
    .map((segment) => String(segment).replace(/[^a-zA-Z0-9_-]/g, "?").slice(0, schemaCorrectionPathSegmentLimit))
    .join(".");
}

function expectedIssueType(issue: z.ZodIssue) {
  const expected = (issue as z.ZodIssue & { expected?: unknown }).expected;
  if (typeof expected === "string" && expected.length > 0) {
    return expected.slice(0, 80);
  }
  return "a value matching the declared schema";
}

function schemaCorrectionMessage(error: unknown) {
  const lead = [
    `The prior ${extractionTool.name} tool call did not match the unchanged schema.`,
    "Return the complete tool call again. Correct only the validation failures and keep every claim and citation grounded in the original evidence.",
  ];
  const details = error instanceof z.ZodError
    ? [
        "Validation failures:",
        ...error.issues.slice(0, schemaCorrectionIssueLimit).map(
          (issue) => `- ${boundedIssuePath(issue.path)}: expected ${expectedIssueType(issue)}`,
        ),
      ]
    : ["The prior response did not contain one complete, valid tool call. Return valid JSON matching the declared schema."];
  const message = [...lead, ...details].join("\n");
  return message.slice(0, schemaCorrectionMessageLimit);
}

export async function extractCompanyClaims(input: {
  client: Anthropic;
  model: string;
  evidence: ExtractionEvidence;
  telemetry?: AnthropicTelemetrySink;
  providerRecovery?: boolean;
}) {
  const extract = (model: string, requestOptions?: LlmRequestOptions) => withSchemaRetry(model, async (previousError) => {
    requestOptions?.signal.throwIfAborted();
    const response: Message = await createTracedAnthropicMessage({
      client: input.client,
      label: "extract-company-claims",
      model,
      stage: "extract_full",
      telemetry: input.telemetry,
      requestOptions,
      params: {
        model,
        max_tokens: 4000,
        temperature: 0,
        system: [
          {
            type: "text",
            text: extractionSystemPrompt,
            cache_control: anthropicSystemCacheControl()
          }
        ],
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: JSON.stringify(evidenceForExtractionPrompt(input.evidence))
              }
            ]
          },
          ...(previousError
            ? [{ role: "user" as const, content: [{ type: "text" as const, text: schemaCorrectionMessage(previousError) }] }]
            : [])
        ],
        tools: [extractionTool],
        tool_choice: SINGLE_TOOL_CHOICE
      },
    });

    return parseExtractionToolUse(response);
  });
  // Provider comparisons must measure the requested model, including its failures.
  return input.providerRecovery === false ? extract(input.model) : withExtractionRecovery(input.model, extract);
}

export const blockGuidance: Record<BlockEnrichmentId, string> = {
  description:
    "Fill identity.description fields for both display layers and the structured product facts. shortDescription must be one complete sentence, roughly 18 to 24 words and under about 170 characters. expandedDescription must be two or three complete sentences explaining what the company does, who uses or buys it, what workflow or pain it addresses, and what nuance matters. Keep concept to one complete sentence. Give serves and mechanism up to two complete sentences each, and make every sentence name a concrete segment, channel, price, or mechanic the evidence supports; never pad, never restate shortDescription, and never write a second sentence with nothing new to say. Never use literal ellipses or incomplete endings. Prefer primary product pages for product mechanics and independent product analysis for framing. Do not use category labels when concrete workflow language is available.",
  funding:
    "Build the funding ledger before any totals. For each cited round, capture the round name, the exact USD amount whenever the source states one (do not round-number guess; record explicit figures verbatim), the announcedAt date, and the named leads in leadInvestors. For funding.investors, enumerate every named investor across every round (leads and participating both), deduped, with their domain when the source provides it. For totalRaisedUsd, fill it only when a cited source states the cumulative total explicitly or when every round in the ledger has a cited amount you can sum without overlap. Prefer recent reporting from Reuters, Bloomberg, TechCrunch, The Information, Crunchbase News, PitchBook, and Forbes; company press releases and investor posts are acceptable for exact announcement facts. Demote aggregator pages that lack a primary citation.",
  team:
    "Extract founders, CEO, and current management team. Include public work emails only when explicitly present in cited professional sources or provider enrichment. Do not guess email patterns or personal email addresses.",
  signals:
    "Extract recent traction signals: launches, customers, hiring, partnerships, funding, filings, technical releases, and credible news. Prefer dated sources and avoid generic profile blurbs. One signal per underlying event: when several sources cover the same announcement, emit it once and cite every supporting source in that signal's citationIds, never one signal per article.",
  comparables:
    "Pick 3 to 5 real competitors or close adjacencies, each passing the buyer-alternative test: something the same buyer would seriously evaluate instead of the target for the same job to be done, not a lookalike that only shares a category label. For each one: domain must come from a cited source (Exa find-similar or competition search), oneLiner must be a concrete sentence drawn from that source's text describing what the company actually does (not the target), and basis is required and must state, grounded in the cited evidence, the concrete reason a buyer would weigh this alternative: same buyer, same job to be done, same workflow, same budget line, or named together in a market map. Forbid generic boilerplate like 'similar web result', 'find-similar', 'adjacent player'; forbid press-release positioning; forbid the target itself, alternate domains of the target, directories, blog posts, or app-store listings. If fewer than 3 sources support a real buyer alternative, return fewer rather than fabricate. Also fill competitionFraming when cited evidence supports it: one sentence naming the specific competitive slice this company sits in and how crowded that slice is. Never invent market commentary; leave it null when no cited evidence states or clearly implies the slice or its crowdedness.",
};

export async function extractCompanyBlockClaims(input: {
  client: Anthropic;
  model: string;
  block: BlockEnrichmentId;
  evidence: ExtractionEvidence & { currentSections?: ExtractedCardSections };
  telemetry?: AnthropicTelemetrySink;
}) {
  return withSchemaRetry(input.model, async () => {
    const response: Message = await createTracedAnthropicMessage({
      client: input.client,
      label: `extract-block:${input.block}`,
      model: input.model,
      stage: "extract_block",
      telemetry: input.telemetry,
      params: {
        model: input.model,
        max_tokens: 1800,
        temperature: 0,
        system: [
          {
            type: "text",
            text: [
              investorTasteKernel,
              "You extract one Cold Start card block from public cited evidence.",
              "Return only claims supported by citations in this prompt. Use null or omit fields when evidence is missing.",
              "Do not backfill from general knowledge. Do not infer funding, leaders, emails, customers, or competitors without source support.",
              blockGuidance[input.block],
            ].join(" "),
            cache_control: anthropicSystemCacheControl(),
          }
        ],
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  blockId: input.block,
                  ...evidenceForExtractionPrompt(input.evidence, { scope: "block" }),
                  ...(input.evidence.currentSections ? { currentSections: input.evidence.currentSections } : {}),
                })
              }
            ]
          }
        ],
        tools: [blockEnrichmentTool],
        tool_choice: SINGLE_TOOL_CHOICE
      },
    });

    return parseBlockEnrichmentToolUse(response);
  });
}
