import {
  clusterSignals,
  type ColdStartCard,
  coldStartCardSchema,
  type GenerationTrace,
  type ResolvedFact,
  type SourcedText,
  type SynthesisGateDecision,
  synthesisGateDecision,
  synthesisSchema,
  type SynthesisWithheld
} from "@cold-start/core";
import {
  applyVerifierResults,
  BLOCK_ENRICHMENT_IDS,
  type BlockEnrichmentId,
  type VerificationResult
} from "@cold-start/llm";
import type { ProviderFactCandidate, ProviderResearchPlan, ProviderSource } from "@cold-start/providers";
import { withResolvedCitationRefs } from "./citation-refs";
import { type CostLine, totalGenerationCost } from "./cost";
import { buildEvidenceLedger, type EvidenceLedgerEntry } from "./evidence-ledger";
import { applyProviderFactCandidates } from "./provider-facts";
import {
  buildSkeletonCard,
  type ExtractedCardSections,
  extractedCardSectionsSchema,
  fallbackSectionsFromEvidence,
  finalizeGeneratedCard,
  unknownFact
} from "./seed-profile";
import { applySynthesisUsefulnessGate } from "./synthesis-quality";

type CardSynthesis = NonNullable<ColdStartCard["synthesis"]>;
type MarketStructureAndTiming = NonNullable<CardSynthesis["marketStructureAndTiming"]>;
type MarketStructureField = keyof MarketStructureAndTiming;
type VerificationSource = { id: string; url: string; title: string; snippet?: string };
export type GenerateCardTracePatch = Partial<Pick<GenerationTrace, "extraction" | "synthesis">>;
const synthesisGateMessage = "insufficient evidence for synthesis";
export { BLOCK_ENRICHMENT_IDS, type BlockEnrichmentId };
export type BlockEnrichmentPatch = {
  identity?: Partial<Pick<ColdStartCard["identity"], "oneLiner" | "description">>;
  funding?: Partial<ColdStartCard["funding"]>;
  team?: Partial<ColdStartCard["team"]>;
  signals?: ColdStartCard["signals"];
  comparables?: ColdStartCard["comparables"];
  competitionFraming?: ColdStartCard["competitionFraming"];
  citations: ColdStartCard["citations"];
};

export class GenerateCardTraceError extends Error {
  constructor(
    message: string,
    readonly tracePatch: GenerateCardTracePatch,
    options?: { cause?: unknown }
  ) {
    super(message, options);
    this.name = "GenerateCardTraceError";
  }
}

// Assembly-only deps: fetch, extract, and block-enrich a card. Synthesis and verification run
// as their own Inngest steps (apps/web/src/inngest/functions.ts) via the separately-callable
// synthesizeCardDraft and verifyCardSynthesisDraft below; this type never carries synthesis deps.
export type GenerateCardDeps = {
  researchPlan?: ProviderResearchPlan;
  providerFacts?: ProviderFactCandidate[];
  skipBlockEnrichment?: boolean;
  fetchSources(domain: string, researchPlan?: ProviderResearchPlan): Promise<ProviderSource[]>;
  extractSections(input: {
    domain: string;
    researchPlan?: ProviderResearchPlan;
    sources: ProviderSource[];
    evidenceLedger: EvidenceLedgerEntry[];
  }): Promise<ExtractedCardSections>;
  enrichSections?(input: {
    block: BlockEnrichmentId;
    domain: string;
    researchPlan?: ProviderResearchPlan;
    sources: ProviderSource[];
    evidenceLedger: EvidenceLedgerEntry[];
    currentSections: ExtractedCardSections;
  }): Promise<BlockEnrichmentPatch | null>;
  costLines?: CostLine[];
};

type SynthesizeCardFn = (card: ColdStartCard) => Promise<CardSynthesis>;
type VerifySynthesisFn = (claims: SourcedText[], sources: VerificationSource[]) => Promise<VerificationResult[]>;

function analysisSynthesisMinCitations() {
  const value = Number.parseInt(process.env.ANALYSIS_SYNTHESIS_MIN_CITATIONS ?? "8", 10);
  return Number.isFinite(value) ? value : 8;
}

function traceGateFromDecision(decision: SynthesisGateDecision) {
  return {
    blocked: decision.blocked,
    reasons: decision.reasons,
    advisories: decision.advisories,
    citationCount: decision.signals.citationCount,
    sourceTypeCount: decision.signals.nonEnrichmentSourceTypes.length,
    hasFundingEvidence: decision.signals.hasFundingEvidence,
    hasNamedTeamMember: decision.signals.hasNamedTeamMember
  };
}

function synthesisWithheldFromGate(gate: ReturnType<typeof traceGateFromDecision>): SynthesisWithheld {
  return {
    at: new Date().toISOString(),
    reasons: gate.reasons,
    advisories: gate.advisories,
    citationCount: gate.citationCount,
    sourceTypeCount: gate.sourceTypeCount
  };
}

export function synthesisEvidenceGate(card: ColdStartCard, minCitations = analysisSynthesisMinCitations()) {
  if (minCitations <= 0) {
    return { ok: true as const };
  }

  const decision = synthesisGateDecision(card, minCitations);
  const gate = traceGateFromDecision(decision);

  return decision.blocked
    ? { ok: false as const, message: synthesisGateMessage, gate }
    : { ok: true as const, gate };
}

export type SynthesisGateOutcome = {
  blocked: boolean;
  card: ColdStartCard;
  tracePatch: GenerateCardTracePatch;
  gate?: ReturnType<typeof traceGateFromDecision>;
};

// Callable ahead of the synthesize/verify LLM calls so a gate-blocked run never pays for either.
// When blocked, attaches `synthesisWithheld` (with its own timestamp) to the returned card; when
// not blocked, returns the card unchanged. Consumed by the split Inngest step orchestration in
// apps/web between the generate-card and synthesize-card steps.
export function evaluateSynthesisGate(
  card: ColdStartCard,
  options: { synthesisRequired?: boolean } = {}
): SynthesisGateOutcome {
  const gateEvaluation = synthesisEvidenceGate(card);
  if (!gateEvaluation.ok) {
    const tracePatch: GenerateCardTracePatch = {
      synthesis: {
        required: options.synthesisRequired === true,
        produced: false,
        claimCountBeforeVerify: 0,
        claimCountAfterVerify: 0,
        gateMessage: gateEvaluation.message,
        ...(gateEvaluation.gate ? { gate: gateEvaluation.gate } : {})
      }
    };
    const nextCard = gateEvaluation.gate
      ? { ...card, synthesisWithheld: synthesisWithheldFromGate(gateEvaluation.gate) }
      : card;
    return {
      blocked: true,
      card: nextCard,
      tracePatch,
      ...(gateEvaluation.gate ? { gate: gateEvaluation.gate } : {})
    };
  }

  return {
    blocked: false,
    card,
    tracePatch: {},
    ...(gateEvaluation.gate ? { gate: gateEvaluation.gate } : {})
  };
}

function citationDedupeKey(url: string) {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    parsed.search = "";
    parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/";
    return parsed.toString().toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

function nextBlockCitationId(citations: ColdStartCard["citations"], index: number) {
  let nextIndex = index;
  let id = `b${nextIndex}`;

  while (citations.some((citation) => citation.id === id)) {
    nextIndex += 1;
    id = `b${nextIndex}`;
  }

  return { id, nextIndex: nextIndex + 1 };
}

function mergeBlockCitations(
  sections: ExtractedCardSections,
  patch: BlockEnrichmentPatch
): { citations: ColdStartCard["citations"]; idMap: Map<string, string>; addedCount: number } {
  const citations = [...sections.citations];
  const idsByUrl = new Map(citations.map((citation) => [citationDedupeKey(citation.url), citation.id]));
  const idMap = new Map<string, string>();
  let nextIndex = 1;
  let addedCount = 0;

  for (const citation of patch.citations) {
    const key = citationDedupeKey(citation.url);
    const existingId = idsByUrl.get(key);
    if (existingId) {
      idMap.set(citation.id, existingId);
      continue;
    }

    const next = nextBlockCitationId(citations, nextIndex);
    nextIndex = next.nextIndex;
    citations.push({ ...citation, id: next.id });
    idsByUrl.set(key, next.id);
    idMap.set(citation.id, next.id);
    addedCount += 1;
  }

  return { citations, idMap, addedCount };
}

function remapCitationIds(citationIds: string[] | undefined, idMap: Map<string, string>) {
  const ids = citationIds ?? [];
  return Array.from(new Set(ids.map((id) => idMap.get(id) ?? id).filter(Boolean)));
}

function remapFact<T>(fact: ResolvedFact<T> | undefined, idMap: Map<string, string>): ResolvedFact<T> | undefined {
  if (!fact) {
    return undefined;
  }

  if (fact.value === null) {
    return unknownFact<T>();
  }

  const citationIds = remapCitationIds(fact.citationIds, idMap);
  if (citationIds.length === 0) {
    return unknownFact<T>();
  }

  return { ...fact, citationIds };
}

function statusScore(status: ResolvedFact<unknown>["status"]) {
  switch (status) {
    case "verified":
      return 3;
    case "mixed":
      return 2;
    case "inferred":
      return 1;
    case "unknown":
      return 0;
  }
}

function confidenceScore(confidence: ResolvedFact<unknown>["confidence"]) {
  switch (confidence) {
    case "high":
      return 3;
    case "medium":
      return 2;
    case "low":
      return 1;
  }
}

function shouldUseCandidateFact<T>(existing: ResolvedFact<T>, candidate: ResolvedFact<T> | undefined) {
  if (!candidate || candidate.value === null || candidate.citationIds.length === 0) {
    return false;
  }

  if (existing.value === null || existing.citationIds.length === 0) {
    return true;
  }

  const candidateStatus = statusScore(candidate.status);
  const existingStatus = statusScore(existing.status);
  if (candidateStatus !== existingStatus) {
    return candidateStatus > existingStatus;
  }

  return confidenceScore(candidate.confidence) > confidenceScore(existing.confidence);
}

function mergeFact<T>(existing: ResolvedFact<T>, candidate: ResolvedFact<T> | undefined) {
  return shouldUseCandidateFact(existing, candidate) ? candidate as ResolvedFact<T> : existing;
}

function mergeCitationIdSets(...groups: string[][]) {
  return Array.from(new Set(groups.flat()));
}

function mergeDescriptionFact(
  existing: NonNullable<ColdStartCard["identity"]["description"]>,
  candidate: NonNullable<ColdStartCard["identity"]["description"]> | undefined
) {
  if (!candidate || candidate.value === null || candidate.citationIds.length === 0) {
    return existing;
  }

  if (existing.value === null || existing.citationIds.length === 0) {
    return candidate;
  }

  const mergedValue = {
    shortDescription: existing.value.shortDescription || candidate.value.shortDescription,
    expandedDescription: existing.value.expandedDescription ?? candidate.value.expandedDescription,
    concept: existing.value.concept ?? candidate.value.concept,
    serves: existing.value.serves ?? candidate.value.serves,
    mechanism: existing.value.mechanism ?? candidate.value.mechanism,
  };
  const addedBlockField =
    mergedValue.shortDescription !== existing.value.shortDescription ||
    mergedValue.expandedDescription !== existing.value.expandedDescription ||
    mergedValue.concept !== existing.value.concept ||
    mergedValue.serves !== existing.value.serves ||
    mergedValue.mechanism !== existing.value.mechanism;

  if (addedBlockField) {
    return {
      ...existing,
      value: mergedValue,
      citationIds: mergeCitationIdSets(existing.citationIds, candidate.citationIds),
      status: statusScore(candidate.status) > statusScore(existing.status) ? candidate.status : existing.status,
      confidence: confidenceScore(candidate.confidence) > confidenceScore(existing.confidence) ? candidate.confidence : existing.confidence,
    };
  }

  return shouldUseCandidateFact(existing, candidate) ? candidate : existing;
}

type CardPerson = NonNullable<ColdStartCard["team"]["founders"]["value"]>[number];

function personKey(person: CardPerson) {
  return person.name.trim().toLowerCase();
}

function mergePersonEmail(existing: CardPerson, candidate: CardPerson): Pick<CardPerson, "email" | "emailStatus"> | Record<string, never> {
  // Prefer an observed address over an inferred guess for the same person.
  const observed = [existing, candidate].find((person) => person.email && person.emailStatus === "observed");
  const chosen = observed ?? [existing, candidate].find((person) => person.email);
  if (!chosen?.email) {
    return {};
  }
  return { email: chosen.email, emailStatus: chosen.emailStatus ?? null };
}

function mergePersonChannel(key: "githubUrl" | "xUrl" | "personalUrl", existing: CardPerson, candidate: CardPerson): Partial<CardPerson> {
  const value = existing[key] ?? candidate[key];
  return value ? { [key]: value } : {};
}

function mergePerson(existing: CardPerson, candidate: CardPerson): CardPerson {
  return {
    name: existing.name,
    role: existing.role ?? candidate.role,
    sourceUrl: existing.sourceUrl ?? candidate.sourceUrl,
    ...mergePersonEmail(existing, candidate),
    ...mergePersonChannel("githubUrl", existing, candidate),
    ...mergePersonChannel("xUrl", existing, candidate),
    ...mergePersonChannel("personalUrl", existing, candidate),
  };
}

function mergePersonFact(
  existing: ResolvedFact<CardPerson[]>,
  candidate: ResolvedFact<CardPerson[]> | undefined
): ResolvedFact<CardPerson[]> {
  if (!candidate || candidate.value === null || candidate.citationIds.length === 0) {
    return existing;
  }

  if (existing.value === null || existing.citationIds.length === 0) {
    return candidate;
  }

  const byName = new Map(existing.value.map((person) => [personKey(person), person]));
  let changed = false;
  for (const person of candidate.value) {
    const key = personKey(person);
    const current = byName.get(key);
    if (!current) {
      byName.set(key, person);
      changed = true;
      continue;
    }

    const merged = mergePerson(current, person);
    if (
      merged.role !== current.role ||
      merged.sourceUrl !== current.sourceUrl ||
      merged.email !== current.email ||
      merged.emailStatus !== current.emailStatus ||
      merged.githubUrl !== current.githubUrl ||
      merged.xUrl !== current.xUrl ||
      merged.personalUrl !== current.personalUrl
    ) {
      changed = true;
    }
    byName.set(key, merged);
  }

  if (!changed && !shouldUseCandidateFact(existing, candidate)) {
    return existing;
  }

  return {
    value: Array.from(byName.values()),
    status: statusScore(candidate.status) > statusScore(existing.status) ? candidate.status : existing.status,
    confidence: confidenceScore(candidate.confidence) > confidenceScore(existing.confidence) ? candidate.confidence : existing.confidence,
    citationIds: mergeCitationIdSets(existing.citationIds, candidate.citationIds),
  };
}

function sameSignal(left: ColdStartCard["signals"][number], right: ColdStartCard["signals"][number]) {
  return citationDedupeKey(left.url) === citationDedupeKey(right.url) || left.title.trim().toLowerCase() === right.title.trim().toLowerCase();
}

function mergeSignals(
  existing: ColdStartCard["signals"],
  candidates: ColdStartCard["signals"] | undefined,
  idMap: Map<string, string>
) {
  if (!candidates || candidates.length === 0) {
    return existing;
  }

  const next = [...existing];
  for (const signal of candidates) {
    const citationIds = remapCitationIds(signal.citationIds, idMap);
    if (citationIds.length === 0 || next.some((current) => sameSignal(current, signal))) {
      continue;
    }

    next.push({ ...signal, citationIds });
  }

  return next.slice(0, 8);
}

function sameComparable(left: ColdStartCard["comparables"][number], right: ColdStartCard["comparables"][number]) {
  return left.domain.replace(/^www\./i, "").toLowerCase() === right.domain.replace(/^www\./i, "").toLowerCase();
}

function mergeComparables(
  existing: ColdStartCard["comparables"],
  candidates: ColdStartCard["comparables"] | undefined,
  idMap: Map<string, string>
) {
  if (!candidates || candidates.length === 0) {
    return existing;
  }

  const next = [...existing];
  for (const comparable of candidates) {
    const citationIds = remapCitationIds(comparable.citationIds ?? [], idMap);
    if (citationIds.length === 0 || next.some((current) => sameComparable(current, comparable))) {
      continue;
    }

    next.push({
      ...comparable,
      citationIds,
    });
  }

  return next.slice(0, 8);
}

function blockPatchHasContent(patch: BlockEnrichmentPatch) {
  return Boolean(
    patch.identity?.description?.value ||
      patch.identity?.oneLiner?.value ||
      patch.funding?.totalRaisedUsd?.value ||
      patch.funding?.lastRound?.value ||
      patch.funding?.rounds?.value?.length ||
      patch.funding?.investors?.value?.length ||
      patch.team?.founders?.value?.length ||
      patch.team?.keyExecs?.value?.length ||
      patch.team?.headcount?.value ||
      patch.signals?.length ||
      patch.comparables?.length ||
      patch.competitionFraming?.value
  );
}

function mergeBlockEnrichmentPatch(
  sections: ExtractedCardSections,
  patch: BlockEnrichmentPatch
): { sections: ExtractedCardSections; produced: boolean; citationCount: number } {
  const { citations, idMap, addedCount } = mergeBlockCitations(sections, patch);
  const identity = { ...sections.identity };
  const funding = { ...sections.funding };
  const team = { ...sections.team };

  const oneLiner = remapFact(patch.identity?.oneLiner, idMap);
  if (oneLiner) {
    identity.oneLiner = mergeFact(identity.oneLiner, oneLiner);
  }

  const description = remapFact(patch.identity?.description, idMap);
  if (description) {
    identity.description = mergeDescriptionFact(identity.description ?? unknownFact(), description);
    if (shouldUseCandidateFact(identity.oneLiner, oneLiner) || (identity.oneLiner.value === null && description.value?.shortDescription)) {
      identity.oneLiner = {
        ...description,
        value: description.value?.shortDescription ?? null,
      };
    }
  }

  funding.totalRaisedUsd = mergeFact(funding.totalRaisedUsd, remapFact(patch.funding?.totalRaisedUsd, idMap));
  funding.lastRound = mergeFact(funding.lastRound, remapFact(patch.funding?.lastRound, idMap));
  if (patch.funding?.rounds || funding.rounds) {
    funding.rounds = mergeFact(funding.rounds ?? unknownFact(), remapFact(patch.funding?.rounds, idMap));
  }
  funding.investors = mergeFact(funding.investors, remapFact(patch.funding?.investors, idMap));

  team.founders = mergePersonFact(team.founders, remapFact(patch.team?.founders, idMap));
  team.keyExecs = mergePersonFact(team.keyExecs, remapFact(patch.team?.keyExecs, idMap));
  team.headcount = mergeFact(team.headcount, remapFact(patch.team?.headcount, idMap));

  let competitionFraming = sections.competitionFraming;
  if (patch.competitionFraming || competitionFraming) {
    competitionFraming = mergeFact(competitionFraming ?? unknownFact<string>(), remapFact(patch.competitionFraming, idMap));
  }

  return {
    sections: {
      identity,
      funding,
      team,
      signals: mergeSignals(sections.signals, patch.signals, idMap),
      comparables: mergeComparables(sections.comparables, patch.comparables, idMap),
      ...(competitionFraming ? { competitionFraming } : {}),
      citations,
    },
    produced: blockPatchHasContent(patch),
    citationCount: addedCount,
  };
}

const blockIntents: Record<BlockEnrichmentId, Array<NonNullable<ProviderSource["intent"]>>> = {
  description: ["homepage", "company_profile", "independent_analysis", "product_proof"],
  funding: ["funding"],
  team: ["management_team", "firmographics", "company_profile", "homepage"],
  signals: ["recent_signals", "funding", "independent_analysis", "customer_proof"],
  comparables: ["comparables", "independent_analysis", "company_profile", "product_proof"],
};

function sourcesForBlock(block: BlockEnrichmentId, sources: ProviderSource[]) {
  const intents = new Set(blockIntents[block]);
  const selected = sources.filter((source) => source.intent && intents.has(source.intent));
  return selected.length > 0 ? selected : sources;
}

function blockNeedsEnrichment(block: BlockEnrichmentId, sections: ExtractedCardSections) {
  switch (block) {
    case "description": {
      const description = sections.identity.description?.value;
      return !description || !description.expandedDescription || !description.concept || !description.serves || !description.mechanism;
    }
    case "funding":
      return (
        sections.funding.lastRound.value === null ||
        sections.funding.investors.value === null ||
        sections.funding.rounds?.value === null
      );
    case "team": {
      const people = [...(sections.team.founders.value ?? []), ...(sections.team.keyExecs.value ?? [])];
      return people.length === 0 || people.some((person) => !person.role || !person.sourceUrl);
    }
    case "signals":
      return sections.signals.length < 2;
    case "comparables":
      return sections.comparables.length < 3 || sections.comparables.some((company) => !company.citationIds?.length);
  }
}

export function blocksNeedingEnrichmentForSections(sections: ExtractedCardSections): BlockEnrichmentId[] {
  return BLOCK_ENRICHMENT_IDS.filter((block) => blockNeedsEnrichment(block, sections));
}

async function runBlockEnrichments(
  sections: ExtractedCardSections,
  input: {
    domain: string;
    researchPlan?: ProviderResearchPlan;
    sources: ProviderSource[];
    enrichSections?: GenerateCardDeps["enrichSections"];
  }
): Promise<{
  sections: ExtractedCardSections;
  trace?: NonNullable<NonNullable<GenerationTrace["extraction"]>["blockEnrichment"]>;
}> {
  if (!input.enrichSections || input.sources.length === 0) {
    return { sections };
  }

  const requestedBlocks = blocksNeedingEnrichmentForSections(sections);
  if (requestedBlocks.length === 0) {
    return { sections };
  }

  const errors: Record<string, string> = {};
  const patches = await Promise.all(
    requestedBlocks.map(async (block) => {
      const sources = sourcesForBlock(block, input.sources);
      const evidenceLedger = buildEvidenceLedger({ domain: input.domain, sources });
      let patch: BlockEnrichmentPatch | null | undefined = null;

      try {
        patch = await input.enrichSections?.({
          block,
          domain: input.domain,
          ...(input.researchPlan ? { researchPlan: input.researchPlan } : {}),
          sources,
          evidenceLedger,
          currentSections: sections,
        });
      } catch (error) {
        patch = null;
        errors[block] = (error instanceof Error ? error.message : String(error)).slice(0, 200);
      }

      return { block, patch };
    })
  );

  let next = sections;
  const produced: string[] = [];
  let citationCount = 0;

  for (const { block, patch } of patches) {
    if (!patch) {
      continue;
    }

    const merged = mergeBlockEnrichmentPatch(next, patch);
    next = merged.sections;
    citationCount += merged.citationCount;
    if (merged.produced) {
      produced.push(block);
    }
  }

  return {
    sections: next,
    trace: {
      requested: [...requestedBlocks],
      produced,
      citationCount,
      ...(Object.keys(errors).length > 0 ? { errors } : {}),
    },
  };
}

const marketStructureFields: MarketStructureField[] = [
  "buyerBudget",
  "painSeverity",
  "adoptionTrigger",
  "marketStructure",
  "profitPool",
  "expansionPath",
  "timingRisk"
];

function synthesisClaims(synthesis: CardSynthesis): SourcedText[] {
  return [synthesis.whyItMatters, ...synthesis.bullCase, ...synthesis.bearCase];
}

function marketStructureClaims(synthesis: CardSynthesis): SourcedText[] {
  const market = synthesis.marketStructureAndTiming;
  return market ? marketStructureFields.flatMap((field) => market[field] ? [market[field]] : []) : [];
}

function allSynthesisClaims(synthesis: CardSynthesis): SourcedText[] {
  return [...synthesisClaims(synthesis), ...marketStructureClaims(synthesis)];
}

function verifiedMarketStructureAndTiming(
  synthesis: CardSynthesis,
  results: VerificationResult[],
  indexOffset: number
): MarketStructureAndTiming | undefined {
  if (!synthesis.marketStructureAndTiming) {
    return undefined;
  }

  let offset = indexOffset;
  const filtered: MarketStructureAndTiming = {
    buyerBudget: null,
    painSeverity: null,
    adoptionTrigger: null,
    marketStructure: null,
    profitPool: null,
    expansionPath: null,
    timingRisk: null
  };

  for (const field of marketStructureFields) {
    const claim = synthesis.marketStructureAndTiming[field];
    if (!claim) {
      continue;
    }

    filtered[field] = applyVerifierResults([claim], results, offset)[0] ?? null;
    offset += 1;
  }

  return Object.values(filtered).some(Boolean) ? filtered : undefined;
}

export type SynthesisDraft = {
  synthesis: CardSynthesis;
  claimCountBeforeVerify: number;
};

// Callable without verify: the ~42s Sonnet synthesis call, memoizable on its own (Inngest step
// `synthesize-card`, Phase 4 Task 5.2) so a verify retry never re-pays for it.
export async function synthesizeCardDraft(
  card: ColdStartCard,
  deps: { synthesize: SynthesizeCardFn }
): Promise<SynthesisDraft> {
  const synthesis = synthesisSchema.parse(await deps.synthesize(card));
  const claimCountBeforeVerify = allSynthesisClaims(synthesis).length;
  return { synthesis, claimCountBeforeVerify };
}

// Callable with a stored synthesis draft (the verifier pass plus the usefulness gate). Takes the
// draft produced by synthesizeCardDraft, which may come from a separately memoized Inngest step
// (`verify-synthesis`, Phase 4 Task 5.2) rather than being re-derived in the same call.
export async function verifyCardSynthesisDraft(
  card: ColdStartCard,
  draft: SynthesisDraft,
  deps: { verify: VerifySynthesisFn; synthesisRequired?: boolean }
): Promise<{ synthesis?: CardSynthesis; tracePatch: GenerateCardTracePatch }> {
  const { synthesis, claimCountBeforeVerify } = draft;
  const citationSources = card.citations.map((citation) => ({
    id: citation.id,
    url: citation.url,
    title: citation.title,
    ...(citation.snippet ? { snippet: citation.snippet } : {})
  }));
  const results = await deps.verify(allSynthesisClaims(synthesis), citationSources);
  const verifiedWhyItMatters = applyVerifierResults([synthesis.whyItMatters], results);
  const bullCaseOffset = 1;
  const bearCaseOffset = bullCaseOffset + synthesis.bullCase.length;
  const marketOffset = bearCaseOffset + synthesis.bearCase.length;
  let bullCase = applyVerifierResults(synthesis.bullCase, results, bullCaseOffset);
  let bearCase = applyVerifierResults(synthesis.bearCase, results, bearCaseOffset);
  const marketStructureAndTiming = verifiedMarketStructureAndTiming(synthesis, results, marketOffset);
  let whyItMatters = verifiedWhyItMatters[0];

  if (!whyItMatters) {
    whyItMatters = bullCase[0] ?? bearCase[0];
    if (bullCase[0] === whyItMatters) {
      bullCase = bullCase.slice(1);
    } else if (bearCase[0] === whyItMatters) {
      bearCase = bearCase.slice(1);
    }
  }
  const tracePatch: GenerateCardTracePatch = {
    synthesis: {
      required: deps.synthesisRequired === true,
      produced: Boolean(whyItMatters),
      claimCountBeforeVerify,
      claimCountAfterVerify: 0
    }
  };

  if (!whyItMatters) {
    return { tracePatch };
  }

  const gated = applySynthesisUsefulnessGate({
    whyItMatters,
    bullCase,
    bearCase,
    openQuestions: synthesis.openQuestions,
    ...(marketStructureAndTiming ? { marketStructureAndTiming } : {})
  });
  if (tracePatch.synthesis) {
    tracePatch.synthesis.claimCountAfterVerify = 1 + gated.synthesis.bullCase.length + gated.synthesis.bearCase.length +
      marketStructureClaims(gated.synthesis).length;
    tracePatch.synthesis.usefulnessDroppedClaims = gated.droppedClaimCount;
  }
  return { tracePatch, synthesis: gated.synthesis };
}

export async function generateCardForDomainWithTrace(
  domain: string,
  deps: GenerateCardDeps
): Promise<{ card: ColdStartCard; tracePatch: GenerateCardTracePatch; sections: ExtractedCardSections; sources: ProviderSource[] }> {
  const skeleton = buildSkeletonCard(domain);
  const sources = await deps.fetchSources(skeleton.domain, deps.researchPlan);
  const evidenceLedger = buildEvidenceLedger({ domain: skeleton.domain, sources });
  let fallbackUsed = false;
  const tracePatch: GenerateCardTracePatch = {};
  const extractionInput = {
    domain: skeleton.domain,
    ...(deps.researchPlan ? { researchPlan: deps.researchPlan } : {}),
    sources,
    evidenceLedger
  };
  let sections = extractedCardSectionsSchema.parse(
    await deps.extractSections(extractionInput)
  );
  const providerFactMerge = applyProviderFactCandidates(sections, deps.providerFacts ?? []);
  sections = extractedCardSectionsSchema.parse(providerFactMerge.sections);
  const blockEnrichment = deps.skipBlockEnrichment
    ? { sections }
    : await runBlockEnrichments(sections, {
        domain: skeleton.domain,
        ...(deps.researchPlan ? { researchPlan: deps.researchPlan } : {}),
        sources,
        enrichSections: deps.enrichSections,
      });
  sections = extractedCardSectionsSchema.parse(blockEnrichment.sections);

  if (sections.citations.length === 0) {
    const fallbackSections = fallbackSectionsFromEvidence(skeleton, evidenceLedger);
    if (!fallbackSections) {
      tracePatch.extraction = {
          sourceCount: sources.length,
          evidenceCount: evidenceLedger.length,
          citationCount: 0,
          fallbackUsed: false,
          providerFactCandidateCount: providerFactMerge.trace.candidateCount,
          providerFactAppliedCount: providerFactMerge.trace.appliedCount,
          providerFactPaths: providerFactMerge.trace.paths,
          providerFactAppliedByEndpoint: providerFactMerge.trace.appliedByEndpoint,
          ...(blockEnrichment.trace ? { blockEnrichment: blockEnrichment.trace } : {})
      };

      throw new GenerateCardTraceError("No cited sources survived extraction", tracePatch);
    }

    fallbackUsed = true;
    sections = fallbackSections;
  }

  tracePatch.extraction = {
    sourceCount: sources.length,
    evidenceCount: evidenceLedger.length,
    citationCount: sections.citations.length,
    fallbackUsed,
    providerFactCandidateCount: providerFactMerge.trace.candidateCount,
    providerFactAppliedCount: providerFactMerge.trace.appliedCount,
    providerFactPaths: providerFactMerge.trace.paths,
    providerFactAppliedByEndpoint: providerFactMerge.trace.appliedByEndpoint,
    ...(blockEnrichment.trace ? { blockEnrichment: blockEnrichment.trace } : {})
  };

  let card: ColdStartCard = coldStartCardSchema.parse(
    withResolvedCitationRefs({
      slug: skeleton.slug,
      domain: skeleton.domain,
      generatedAt: new Date().toISOString(),
      generationCostUsd: totalGenerationCost(deps.costLines ?? []),
      cacheStatus: skeleton.cacheStatus,
      identity: sections.identity,
      funding: sections.funding,
      team: sections.team,
      signals: sections.signals,
      comparables: sections.comparables,
      ...(sections.competitionFraming ? { competitionFraming: sections.competitionFraming } : {}),
      citations: sections.citations
    } as ColdStartCard)
  );

  card = coldStartCardSchema.parse(
    withResolvedCitationRefs({
      ...card,
      generationCostUsd: totalGenerationCost(deps.costLines ?? [])
    })
  );

  return {
    card: finalizeGeneratedCard(card),
    tracePatch,
    sections,
    sources
  };
}

export async function enrichExtractedSectionsForDomain(input: {
  domain: string;
  researchPlan?: ProviderResearchPlan;
  sections: ExtractedCardSections;
  sources: ProviderSource[];
  enrichSections?: GenerateCardDeps["enrichSections"];
}) {
  const blockEnrichment = await runBlockEnrichments(input.sections, {
    domain: input.domain,
    ...(input.researchPlan ? { researchPlan: input.researchPlan } : {}),
    sources: input.sources,
    enrichSections: input.enrichSections
  });

  return {
    sections: extractedCardSectionsSchema.parse(blockEnrichment.sections),
    trace: blockEnrichment.trace
  };
}

export function cardWithExtractedSections(card: ColdStartCard, sections: ExtractedCardSections): ColdStartCard {
  return coldStartCardSchema.parse(
    withResolvedCitationRefs({
      ...card,
      generatedAt: new Date().toISOString(),
      identity: sections.identity,
      funding: sections.funding,
      team: sections.team,
      signals: clusterSignals(sections.signals, { companyDomain: card.domain, companyName: sections.identity.name.value }),
      comparables: sections.comparables,
      ...(sections.competitionFraming ? { competitionFraming: sections.competitionFraming } : {}),
      citations: sections.citations
    })
  );
}

export async function generateCardForDomain(domain: string, deps: GenerateCardDeps): Promise<ColdStartCard> {
  const result = await generateCardForDomainWithTrace(domain, deps);
  return result.card;
}
