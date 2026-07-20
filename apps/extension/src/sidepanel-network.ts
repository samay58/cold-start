import {
  RESEARCH_SECTION_DEFINITIONS_BY_ID,
  hasUsablePublicProfile,
  mergeStoredResearchSectionsWithLegacy,
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
  type ExtensionResearchRunEvent,
  type GenerationRunStatus,
  type GenerationStatus,
  type Settings
} from "./shared/extension-config";
import { INSUFFICIENT_EVIDENCE_NOTICE } from "./shared/extension-format";

// Production analysis/basics runs can legitimately take 4-7 minutes (observed p95 well above the
// old 4-minute wall, max ~414s). The card now persists server-side near the end of a run, so when
// this deadline is hit on a still-active run the panel shows a calm "still researching" state and a
// recheck loads the cached card, rather than a hard failure.
const GENERATION_TIMEOUT_MS = 7 * 60 * 1000;
const CARD_READY_EVENT_TYPES = new Set(["card.partial", "card.saved", "card.enriched", "generation.complete"]);
const ACTIVE_BASICS_CARD_FETCH_FALLBACK_INTERVAL = 6;

export type GenerationPollResult = {
  card: ColdStartCard;
  sections: ResearchSection[];
  analysisNotice?: string;
};

export type SectionGenerationPollResult = GenerationPollResult;

export type GenerationStatusListener = (
  status: GenerationStatus["status"],
  update?: { events?: ExtensionResearchRunEvent[] | undefined }
) => void;

export function markPerformance(name: string) {
  try {
    performance.mark(name);
  } catch {
    // Performance marks are diagnostic only.
  }
}

export function sectionsForCard(card: ColdStartCard, storedSections: ResearchSection[] = []): ResearchSection[] {
  return mergeStoredResearchSectionsWithLegacy({
    card,
    storedSections
  });
}

function carryForwardSections(sections: ResearchSection[]) {
  return sections.filter((section) => {
    if (section.status === "not_started") {
      return false;
    }

    if (section.status === "empty") {
      return Boolean(section.generatedAt || section.runId);
    }

    return true;
  });
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

export async function fetchBootstrap(domain: string, settings: Settings, signal: AbortSignal, storedSections: ResearchSection[] = []) {
  const request = buildBootstrapRequest(domain, settings, signal, chrome.runtime.id);
  markPerformance("cold-start-bootstrap-start");
  try {
    const response = await fetch(request.url, request.init);
    const parsed = await parseBootstrapResponse(response);
    markPerformance("cold-start-bootstrap-end");
    if (!parsed.runs || !("card" in parsed)) {
      return fetchBootstrapSerially(domain, settings, signal, storedSections);
    }
    return {
      ...parsed,
      sections: parsed.card ? sectionsForCard(parsed.card, parsed.sections ?? carryForwardSections(storedSections)) : []
    };
  } catch (caught) {
    if (caught instanceof ApiError && (caught.status === 404 || caught.status === 405)) {
      const fallback = await fetchBootstrapSerially(domain, settings, signal, storedSections);
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
  signal: AbortSignal,
  storedSections: ResearchSection[] = []
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
    sections: card ? sectionsForCard(card, carryForwardSections(storedSections)) : [],
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

function cardReadyEventKey(event: ExtensionResearchRunEvent) {
  return `${event.id}:${event.type}:${event.createdAt}`;
}

function latestCardReadyEvent(events: ExtensionResearchRunEvent[] | undefined) {
  return events
    ?.filter((event) => CARD_READY_EVENT_TYPES.has(event.type))
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id))
    .at(-1) ?? null;
}

function shouldFetchCardForActiveBasics(
  runStatus: GenerationRunStatus,
  pollCount: number,
  lastFetchedCardReadyEventKey: string | null
) {
  const latestReadyEvent = latestCardReadyEvent(runStatus.events);
  const latestReadyEventKey = latestReadyEvent ? cardReadyEventKey(latestReadyEvent) : null;
  if (latestReadyEventKey && latestReadyEventKey !== lastFetchedCardReadyEventKey) {
    return { shouldFetch: true, readyEventKey: latestReadyEventKey };
  }

  return {
    shouldFetch: pollCount % ACTIVE_BASICS_CARD_FETCH_FALLBACK_INTERVAL === 0,
    readyEventKey: latestReadyEventKey
  };
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

function sectionIsSettled(section: ResearchSection | null, pollCount: number) {
  if (!section) {
    return false;
  }

  if (section.status === "available" || section.status === "stale" || section.status === "failed") {
    return true;
  }

  return section.status === "empty" && pollCount > 1;
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
  onGenerationStatus: GenerationStatusListener,
  latestCard: ColdStartCard | null = null,
  waitForRunCompletion = false,
  onInterimCard?: (result: GenerationPollResult) => void,
  latestSections: ResearchSection[] = []
): Promise<GenerationPollResult> {
  const deadline = Date.now() + GENERATION_TIMEOUT_MS;
  const pollStartedAt = Date.now();
  let pollCount = 0;
  let currentCard = latestCard;
  let currentSections = latestCard ? sectionsForCard(latestCard, latestSections) : latestSections;
  let lastFetchedCardReadyEventKey: string | null = null;
  const requireRunCompletion = waitForRunCompletion;
  const requiresMarketStructure = Boolean(
    mode === "analysis" && latestCard?.synthesis && !latestCard.synthesis.marketStructureAndTiming
  );

  function updateCurrentCard(card: ColdStartCard) {
    currentCard = card;
    currentSections = sectionsForCard(card, currentSections);
    return currentSections;
  }

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

    if (mode === "basics") {
      let runStatus: GenerationRunStatus | null = null;
      try {
        runStatus = await requestGenerationStatus(domain, settings, signal, mode);
      } catch (caught) {
        if (isMissingGenerationStatusRoute(caught)) {
          const card = await fetchAvailableCard();
          if (card && hasUsablePublicProfile(card)) {
            const sections = updateCurrentCard(card);
            return { card, sections };
          }

          continue;
        } else {
          throw caught;
        }
      }

      if (runStatus && isActiveRun(runStatus.status)) {
        onGenerationStatus(runStatus.status, { events: runStatus.events });

        const cardFetch = shouldFetchCardForActiveBasics(runStatus, pollCount, lastFetchedCardReadyEventKey);
        if (cardFetch.shouldFetch) {
          const card = await fetchAvailableCard();
          if (card && hasUsablePublicProfile(card)) {
            if (cardFetch.readyEventKey) {
              lastFetchedCardReadyEventKey = cardFetch.readyEventKey;
            }
            const sections = updateCurrentCard(card);
            if (requireRunCompletion) {
              onInterimCard?.({ card, sections });
              continue;
            }

            return { card, sections };
          }
        }

        continue;
      }

      if (runStatus?.status === "failed") {
        const card = await fetchAvailableCard();
        if (card && hasUsablePublicProfile(card)) {
          return { card, sections: updateCurrentCard(card) };
        }

        throw new ApiError(runStatus.error ?? "Generation failed before a card was produced.", 500);
      }

      if (runStatus?.status === "complete") {
        const card = await fetchCard(domain, settings, signal);
        assertUsableBasicsCard(mode, card);
        return { card, sections: updateCurrentCard(card) };
      }

      const card = await fetchAvailableCard();
      if (card && hasUsablePublicProfile(card)) {
        return { card, sections: updateCurrentCard(card) };
      }

      continue;
    }

    try {
      const card = await fetchCard(domain, settings, signal);

      if (analysisCardIsComplete(card, requiresMarketStructure)) {
        return { card, sections: updateCurrentCard(card) };
      }

      updateCurrentCard(card);
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
      onGenerationStatus(runStatus.status, { events: runStatus.events });
    } else if (runStatus.status === "failed") {
      if (currentCard) {
        return {
          card: currentCard,
          sections: currentSections,
          analysisNotice: INSUFFICIENT_EVIDENCE_NOTICE
        };
      }

      throw new ApiError(runStatus.error ?? "Generation failed before a card was produced.", 500);
    } else if (runStatus.status === "complete" && currentCard && analysisCardIsComplete(currentCard, requiresMarketStructure)) {
      return {
        card: currentCard,
        sections: currentSections,
        analysisNotice: INSUFFICIENT_EVIDENCE_NOTICE
      };
    }
  }

  throw new ApiError("Still researching this company. It is taking longer than usual; check again in a moment and the card will be ready.", 202);
}

export async function startBasicsGenerationAndPoll(
  domain: string,
  settings: Settings,
  signal: AbortSignal,
  confirmStart: boolean,
  onGenerationStatus: GenerationStatusListener
): Promise<GenerationPollResult> {
  const generation = await requestGeneration(domain, settings, signal, "basics", confirmStart);
  onGenerationStatus(generation.status, { events: generation.events });

  if (generation.status === "cached") {
    const card = await fetchCard(domain, settings, signal);
    assertUsableBasicsCard("basics", card);
    return { card, sections: sectionsForCard(card) };
  }

  return pollGenerationUntilCard(
    domain,
    settings,
    signal,
    "basics",
    onGenerationStatus
  );
}

export async function startAnalysisGenerationAndPoll(
  domain: string,
  settings: Settings,
  signal: AbortSignal,
  confirmStart: boolean,
  latestCard: ColdStartCard,
  latestSections: ResearchSection[],
  onGenerationStatus: GenerationStatusListener
): Promise<GenerationPollResult> {
  const generation = await requestGeneration(domain, settings, signal, "analysis", confirmStart);
  onGenerationStatus(generation.status, { events: generation.events });

  if (generation.status === "cached") {
    const card = await fetchCard(domain, settings, signal);
    return { card, sections: sectionsForCard(card, latestSections) };
  }

  return pollGenerationUntilCard(
    domain,
    settings,
    signal,
    "analysis",
    onGenerationStatus,
    latestCard,
    false,
    undefined,
    latestSections
  );
}

export async function startSectionGenerationAndPoll(
  domain: string,
  settings: Settings,
  signal: AbortSignal,
  sectionId: ResearchSectionId,
  latestCard: ColdStartCard,
  latestSections: ResearchSection[],
  onGenerationStatus: GenerationStatusListener
): Promise<SectionGenerationPollResult> {
  const mode = modeForSection(sectionId);
  const generation = await requestGeneration(domain, settings, signal, mode, true, false, sectionId);
  onGenerationStatus(generation.status, { events: generation.events });

  return pollSectionGenerationUntilSettled(domain, settings, signal, sectionId, latestCard, onGenerationStatus, latestSections);
}

export async function resumeSectionGenerationAndPoll(
  domain: string,
  settings: Settings,
  signal: AbortSignal,
  sectionId: ResearchSectionId,
  latestCard: ColdStartCard,
  latestSections: ResearchSection[],
  onGenerationStatus: GenerationStatusListener
): Promise<SectionGenerationPollResult> {
  onGenerationStatus("running");
  return pollSectionGenerationUntilSettled(domain, settings, signal, sectionId, latestCard, onGenerationStatus, latestSections);
}

async function pollSectionGenerationUntilSettled(
  domain: string,
  settings: Settings,
  signal: AbortSignal,
  sectionId: ResearchSectionId,
  latestCard: ColdStartCard,
  onGenerationStatus: GenerationStatusListener,
  latestSections: ResearchSection[] = []
): Promise<SectionGenerationPollResult> {
  const mode = modeForSection(sectionId);
  const deadline = Date.now() + GENERATION_TIMEOUT_MS;
  const pollStartedAt = Date.now();
  let pollCount = 0;
  let currentCard = latestCard;
  let currentSections = sectionsForCard(latestCard, latestSections);

  while (Date.now() < deadline) {
    if (pollCount > 0) {
      await waitForNextPoll(signal, generationPollDelay(pollStartedAt));
    }
    pollCount += 1;

    const bootstrap = await fetchBootstrap(domain, settings, signal, currentSections);
    if (bootstrap.card) {
      currentCard = bootstrap.card;
      currentSections = bootstrap.sections ?? sectionsForCard(bootstrap.card, currentSections);
    }

    const section = sectionFromList(currentSections, sectionId);
    if (sectionIsSettled(section, pollCount)) {
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
      onGenerationStatus(runStatus.status, { events: runStatus.events });
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
      const message = "Section run completed, but no saved section result was returned.";
      const sections = withLocalSectionFailure(
        currentCard,
        currentSections,
        sectionId,
        message
      );
      return { card: currentCard, sections, analysisNotice: message };
    }
  }

  throw new ApiError("Section generation is taking longer than expected. Reopen Cold Start in a minute.", 202);
}
