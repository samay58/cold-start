import {
  RESEARCH_SECTION_DEFINITIONS_BY_ID,
  hasUsablePublicProfile,
  mergeStoredResearchSectionsWithLegacy,
  placeholderResearchSectionsForCard,
  publicProfileQuality,
  type ColdStartCard,
  type ResearchSection,
  type ResearchSectionId
} from "@cold-start/core";
import {
  ApiError,
  buildBootstrapRequest,
  buildCardRequest,
  buildGenerateRequest,
  buildGenerationStatusRequest,
  parseBootstrapResponse,
  parseCardResponse,
  parseGenerateResponse,
  parseGenerationStatusResponse,
  readableCompanyNameFromDomain,
  type ExtensionBootstrapResponse,
  type GenerationRunStatus,
  type GenerationStatus,
  type Settings
} from "./extension-config";
import { INSUFFICIENT_EVIDENCE_NOTICE } from "./extension-format";

const GENERATION_TIMEOUT_MS = 4 * 60 * 1000;

export type GenerationPollResult = {
  card: ColdStartCard;
  analysisNotice?: string;
};

export type SectionGenerationPollResult = GenerationPollResult & {
  sections: ResearchSection[];
};

export function markPerformance(name: string) {
  try {
    performance.mark(name);
  } catch {
    // Performance marks are diagnostic only.
  }
}

function underfilledBasicsMessage(card: ColdStartCard) {
  const quality = publicProfileQuality(card);
  const gaps = [
    !quality.hasCitations ? "citations" : null,
    !quality.hasName ? "name" : null,
    !quality.hasSummary ? "summary" : null,
    quality.structuredFactCount < quality.minimumStructuredFactCount ? "structured facts" : null,
    quality.visibleFactCount < quality.minimumVisibleFactCount ? "visible facts" : null
  ].filter(Boolean);
  return [
    "generated basics underfilled public profile",
    `(${quality.structuredFactCount}/${quality.minimumStructuredFactCount} structured facts,`,
    `${quality.visibleFactCount}/${quality.minimumVisibleFactCount} visible facts,`,
    `${card.citations.length} citations${gaps.length > 0 ? `; missing ${gaps.join(", ")}` : ""})`
  ].join(" ");
}

function assertUsableBasicsCard(mode: GenerationStatus["mode"], card: ColdStartCard) {
  if (mode === "basics" && !hasUsablePublicProfile(card)) {
    throw new ApiError(underfilledBasicsMessage(card), 500);
  }
}

async function fetchCard(domain: string, settings: Settings, signal: AbortSignal): Promise<ColdStartCard> {
  const request = buildCardRequest(domain, settings, signal, chrome.runtime.id);
  const response = await fetch(request.url, request.init);
  return parseCardResponse(response);
}

export async function fetchBootstrap(domain: string, settings: Settings, signal: AbortSignal) {
  const request = buildBootstrapRequest(domain, settings, signal, chrome.runtime.id);
  markPerformance("cold-start-bootstrap-start");
  try {
    const response = await fetch(request.url, request.init);
    const parsed = await parseBootstrapResponse(response);
    markPerformance("cold-start-bootstrap-end");
    if (!parsed.runs || !("card" in parsed)) {
      return fetchBootstrapSerially(domain, settings, signal);
    }
    return {
      ...parsed,
      sections: mergeStoredResearchSectionsWithLegacy({
        card: parsed.card ?? null,
        storedSections: parsed.sections ?? []
      })
    };
  } catch (caught) {
    if (caught instanceof ApiError && (caught.status === 404 || caught.status === 405)) {
      const fallback = await fetchBootstrapSerially(domain, settings, signal);
      markPerformance("cold-start-bootstrap-end");
      return fallback;
    }

    throw caught;
  }
}

async function requestRunStatusOrIdle(
  domain: string,
  settings: Settings,
  signal: AbortSignal,
  mode: GenerationRunStatus["mode"],
  slug: string
): Promise<GenerationRunStatus> {
  try {
    const runStatus = await requestGenerationStatus(domain, settings, signal, mode);
    return runStatus.mode === mode ? runStatus : { slug, domain, mode, status: "idle" };
  } catch (caught) {
    if (isMissingGenerationStatusRoute(caught) || isMissingCard(caught)) {
      return { slug, domain, mode, status: "idle" };
    }

    throw caught;
  }
}

async function fetchBootstrapSerially(
  domain: string,
  settings: Settings,
  signal: AbortSignal
): Promise<ExtensionBootstrapResponse> {
  let card: ColdStartCard | null = null;
  let slug = "";

  try {
    card = await fetchCard(domain, settings, signal);
    slug = card.slug;
  } catch (caught) {
    if (!isMissingCard(caught)) {
      throw caught;
    }
  }

  const safeSlug = slug || readableCompanyNameFromDomain(domain).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || domain;
  const [basics, analysis] = await Promise.all([
    requestRunStatusOrIdle(domain, settings, signal, "basics", safeSlug),
    requestRunStatusOrIdle(domain, settings, signal, "analysis", safeSlug)
  ]);

  return {
    domain,
    slug: card?.slug ?? safeSlug,
    card,
    sections: card ? mergeStoredResearchSectionsWithLegacy({ card, storedSections: [] }) : [],
    runs: { basics, analysis }
  };
}

async function requestGeneration(
  domain: string,
  settings: Settings,
  signal: AbortSignal,
  mode: GenerationStatus["mode"],
  confirmStart: boolean,
  forceRefresh = false,
  sectionId?: string
): Promise<GenerationStatus> {
  const request = buildGenerateRequest(domain, settings, signal, mode, confirmStart, chrome.runtime.id, forceRefresh, sectionId);
  markPerformance("cold-start-generation-post");
  const response = await fetch(request.url, request.init);
  return parseGenerateResponse(response);
}

async function requestGenerationStatus(
  domain: string,
  settings: Settings,
  signal: AbortSignal,
  mode: GenerationRunStatus["mode"],
  sectionId?: ResearchSectionId
): Promise<GenerationRunStatus> {
  const request = buildGenerationStatusRequest(domain, settings, signal, mode, chrome.runtime.id, sectionId);
  const response = await fetch(request.url, request.init);
  return parseGenerationStatusResponse(response);
}

function isMissingCard(caught: unknown) {
  return caught instanceof ApiError && caught.status === 404 && caught.message === "card not found";
}

function isMissingGenerationStatusRoute(caught: unknown) {
  return caught instanceof ApiError && caught.status === 405;
}

export function isActiveRun(status: GenerationRunStatus["status"]): status is "queued" | "running" {
  return status === "queued" || status === "running";
}

function analysisCardIsComplete(card: ColdStartCard, requiresMarketStructure: boolean) {
  if (!card.synthesis) {
    return false;
  }

  return !requiresMarketStructure || Boolean(card.synthesis.marketStructureAndTiming);
}

function modeForSection(sectionId: ResearchSectionId): GenerationStatus["mode"] {
  return RESEARCH_SECTION_DEFINITIONS_BY_ID[sectionId].visibility === "gated" ? "analysis" : "basics";
}

function sectionFromList(sections: ResearchSection[] | undefined, sectionId: ResearchSectionId) {
  return sections?.find((section) => section.sectionId === sectionId) ?? null;
}

function sectionIsSettled(section: ResearchSection | null) {
  return Boolean(section && section.status !== "running" && section.status !== "not_started");
}

function localFailedSection(card: ColdStartCard, sectionId: ResearchSectionId, error: string): ResearchSection {
  const definition = RESEARCH_SECTION_DEFINITIONS_BY_ID[sectionId];
  return {
    slug: card.slug,
    domain: card.domain,
    sectionId,
    visibility: definition.visibility,
    status: "failed",
    content: null,
    citationIds: [],
    sourceIds: [],
    runId: null,
    error,
    generatedAt: null,
    staleAt: null
  };
}

function withLocalSectionFailure(
  card: ColdStartCard,
  sections: ResearchSection[],
  sectionId: ResearchSectionId,
  error: string
): ResearchSection[] {
  const failedSection = localFailedSection(card, sectionId, error);
  const hasSection = sections.some((section) => section.sectionId === sectionId);

  return hasSection
    ? sections.map((section) => section.sectionId === sectionId ? failedSection : section)
    : [...sections, failedSection];
}

export function startedAtMs(value?: string): number {
  if (!value) {
    return Date.now();
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function generationPollDelay(startedAt: number) {
  if (document.visibilityState === "hidden") {
    return 5000;
  }

  const elapsed = Date.now() - startedAt;
  if (elapsed < 3000) {
    return 350;
  }

  return elapsed < 15000 ? 800 : 1600;
}

function waitForNextPoll(signal: AbortSignal, delayMs: number) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error("request aborted"));
      return;
    }

    const timeout = window.setTimeout(() => {
      signal.removeEventListener("abort", handleAbort);
      resolve();
    }, delayMs);

    function handleAbort() {
      window.clearTimeout(timeout);
      reject(new Error("request aborted"));
    }

    signal.addEventListener("abort", handleAbort, { once: true });
  });
}

export async function pollGenerationUntilCard(
  domain: string,
  settings: Settings,
  signal: AbortSignal,
  mode: GenerationStatus["mode"],
  onGenerationStatus: (status: GenerationStatus["status"]) => void,
  latestCard: ColdStartCard | null = null,
  waitForRunCompletion = false,
  onInterimCard?: (card: ColdStartCard) => void
): Promise<GenerationPollResult> {
  const deadline = Date.now() + GENERATION_TIMEOUT_MS;
  const pollStartedAt = Date.now();
  let pollCount = 0;
  let currentCard = latestCard;
  let requireRunCompletion = waitForRunCompletion;
  const requiresMarketStructure = Boolean(
    mode === "analysis" && latestCard?.synthesis && !latestCard.synthesis.marketStructureAndTiming
  );

  async function fetchAvailableCard() {
    try {
      return await fetchCard(domain, settings, signal);
    } catch (caught) {
      if (isMissingCard(caught)) {
        return null;
      }

      throw caught;
    }
  }

  while (Date.now() < deadline) {
    if (pollCount > 0) {
      await waitForNextPoll(signal, generationPollDelay(pollStartedAt));
    }
    if (pollCount === 0) {
      markPerformance("cold-start-generation-first-poll");
    }
    pollCount += 1;

    if (mode === "basics" && requireRunCompletion) {
      let runStatus: GenerationRunStatus | null = null;
      try {
        runStatus = await requestGenerationStatus(domain, settings, signal, mode);
      } catch (caught) {
        if (isMissingGenerationStatusRoute(caught)) {
          requireRunCompletion = false;
        } else {
          throw caught;
        }
      }

      if (!requireRunCompletion || !runStatus) {
        continue;
      }

      if (isActiveRun(runStatus.status)) {
        onGenerationStatus(runStatus.status);
        const card = await fetchAvailableCard();
        if (card && hasUsablePublicProfile(card)) {
          currentCard = card;
          onInterimCard?.(card);
        }
        continue;
      }

      if (runStatus.status === "failed") {
        const card = await fetchAvailableCard();
        if (card && hasUsablePublicProfile(card)) {
          return { card };
        }

        throw new ApiError(runStatus.error ?? "Generation failed before a card was produced.", 500);
      }

      if (runStatus.status === "complete") {
        const card = await fetchCard(domain, settings, signal);
        assertUsableBasicsCard(mode, card);
        return { card };
      }

      continue;
    }

    try {
      const card = await fetchCard(domain, settings, signal);

      if (mode === "basics") {
        if (hasUsablePublicProfile(card)) {
          return { card };
        }
      } else if (analysisCardIsComplete(card, requiresMarketStructure)) {
        return { card };
      }

      if (mode !== "basics") {
        currentCard = card;
      }
    } catch (caught) {
      if (!isMissingCard(caught)) {
        throw caught;
      }
    }

    let runStatus: GenerationRunStatus;
    try {
      runStatus = await requestGenerationStatus(domain, settings, signal, mode);
    } catch (caught) {
      if (isMissingGenerationStatusRoute(caught)) {
        continue;
      }

      throw caught;
    }

    if (isActiveRun(runStatus.status)) {
      onGenerationStatus(runStatus.status);
    } else if (runStatus.status === "failed") {
      if (mode === "analysis" && currentCard) {
        return {
          card: currentCard,
          analysisNotice: INSUFFICIENT_EVIDENCE_NOTICE
        };
      }

      const card = await fetchAvailableCard();
      if (card && mode === "basics" && hasUsablePublicProfile(card)) {
        return { card };
      }

      throw new ApiError(runStatus.error ?? "Generation failed before a card was produced.", 500);
    } else if (mode === "basics" && runStatus.status === "complete") {
      const card = await fetchCard(domain, settings, signal);
      assertUsableBasicsCard(mode, card);
      return { card };
    } else if (mode === "analysis" && runStatus.status === "complete" && currentCard && analysisCardIsComplete(currentCard, requiresMarketStructure)) {
      return {
        card: currentCard,
        analysisNotice: INSUFFICIENT_EVIDENCE_NOTICE
      };
    }
  }

  throw new ApiError("Card generation is taking longer than expected. Keep the local worker running, then reopen Cold Start.", 202);
}

export async function startGenerationAndPoll(
  domain: string,
  settings: Settings,
  signal: AbortSignal,
  mode: GenerationStatus["mode"],
  confirmStart: boolean,
  onGenerationStatus: (status: GenerationStatus["status"]) => void,
  options: { forceRefresh?: boolean; latestCard?: ColdStartCard | null; waitForRunCompletion?: boolean } = {}
): Promise<GenerationPollResult> {
  let latestCard = options.latestCard ?? null;
  if (mode === "analysis" && !latestCard) {
    try {
      latestCard = await fetchCard(domain, settings, signal);
    } catch (caught) {
      if (!isMissingCard(caught)) {
        throw caught;
      }
    }
  }

  const generation = await requestGeneration(domain, settings, signal, mode, confirmStart, options.forceRefresh);
  onGenerationStatus(generation.status);

  if (generation.status === "cached") {
    const card = await fetchCard(domain, settings, signal);
    assertUsableBasicsCard(mode, card);
    return { card };
  }

  return pollGenerationUntilCard(
    domain,
    settings,
    signal,
    mode,
    onGenerationStatus,
    latestCard,
    options.waitForRunCompletion ?? false
  );
}

export async function startSectionGenerationAndPoll(
  domain: string,
  settings: Settings,
  signal: AbortSignal,
  sectionId: ResearchSectionId,
  latestCard: ColdStartCard,
  onGenerationStatus: (status: GenerationStatus["status"]) => void
): Promise<SectionGenerationPollResult> {
  const mode = modeForSection(sectionId);
  const deadline = Date.now() + GENERATION_TIMEOUT_MS;
  const pollStartedAt = Date.now();
  let pollCount = 0;
  let currentCard = latestCard;
  let currentSections = placeholderResearchSectionsForCard(latestCard);

  const generation = await requestGeneration(domain, settings, signal, mode, true, false, sectionId);
  onGenerationStatus(generation.status);

  while (Date.now() < deadline) {
    if (pollCount > 0) {
      await waitForNextPoll(signal, generationPollDelay(pollStartedAt));
    }
    pollCount += 1;

    const bootstrap = await fetchBootstrap(domain, settings, signal);
    if (bootstrap.card) {
      currentCard = bootstrap.card;
      currentSections = bootstrap.sections ?? mergeStoredResearchSectionsWithLegacy({ card: bootstrap.card, storedSections: [] });
    }

    const section = sectionFromList(currentSections, sectionId);
    if (sectionIsSettled(section)) {
      return {
        card: currentCard,
        sections: currentSections,
        ...(section?.status === "failed" ? { analysisNotice: section.error ?? "Section generation failed." } : {})
      };
    }

    let runStatus: GenerationRunStatus | null = null;
    try {
      runStatus = await requestGenerationStatus(domain, settings, signal, mode, sectionId);
    } catch (caught) {
      if (!isMissingGenerationStatusRoute(caught)) {
        throw caught;
      }
    }

    if (runStatus && isActiveRun(runStatus.status)) {
      onGenerationStatus(runStatus.status);
      continue;
    }

    if (runStatus?.status === "failed") {
      const sections = withLocalSectionFailure(
        currentCard,
        currentSections,
        sectionId,
        runStatus.error ?? "Section generation failed before a section was saved."
      );
      return { card: currentCard, sections, analysisNotice: runStatus.error ?? "Section generation failed." };
    }

    if (runStatus?.status === "complete") {
      const sections = withLocalSectionFailure(
        currentCard,
        currentSections,
        sectionId,
        "Section run completed, but no saved section result was returned."
      );
      return { card: currentCard, sections };
    }
  }

  throw new ApiError("Section generation is taking longer than expected. Reopen Cold Start in a minute.", 202);
}
