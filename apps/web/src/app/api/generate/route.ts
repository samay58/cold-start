import {
  RESEARCH_SECTION_DEFINITIONS_BY_ID,
  analysisBlockedReason,
  companySlugFromDomain,
  researchSectionJobKind,
  hasUsablePublicProfile,
  isSynthesisOnlySectionId,
  researchSectionIdSchema,
  synthesisEvidenceSignals,
  type ColdStartCard,
  type GenerationJobKind,
  type ResearchSectionId
} from "@cold-start/core";
import {
  createDb,
  findActiveGenerationRunStatusBySlug,
  findCardBySlug,
  findLatestGenerationRunStatusBySlug,
  findPublicCardBySlug,
  findResearchRunEventsByRunId,
  markGenerationRun,
  markResearchSectionFailed,
  markResearchSectionRunning,
  recordResearchRunEvent,
  retireStaleGenerationRuns,
  type ColdStartDb,
  type GenerationRunStatusSummary,
  type ResearchRunEvent
} from "@cold-start/db";
import { inngest } from "../../../inngest/client";
import { boundedErrorMessage } from "../../../lib/errors";
import { canonicalCompanyDomain } from "../../../lib/domain";
import { webEnv } from "../../../lib/web-env";
import { apiJsonWithTiming, type ServerTimingMetric } from "../../../lib/api-response";
import { assertExtensionRequest } from "../../../lib/extension-auth";

type GenerationMode = "basics" | "analysis";

function generationMode(input: unknown): GenerationMode {
  if (input === undefined || input === null || input === "") {
    return "basics";
  }
  if (input === "analysis" || input === "basics") {
    return input;
  }

  throw new Error(`invalid generation mode: ${String(input).slice(0, 80)}`);
}

function hasExplicitGenerationMode(input: unknown) {
  return input !== undefined && input !== null && input !== "";
}

function parseSectionId(input: unknown): ResearchSectionId | null {
  if (input === undefined || input === null || input === "") {
    return null;
  }

  const sectionId = researchSectionIdSchema.parse(input);
  if (isSynthesisOnlySectionId(sectionId)) {
    throw new Error(`section ${sectionId} renders from synthesis and cannot run as a standalone section job`);
  }

  return sectionId;
}

function modeForSection(sectionId: ResearchSectionId): GenerationMode {
  return RESEARCH_SECTION_DEFINITIONS_BY_ID[sectionId].visibility === "gated" ? "analysis" : "basics";
}

function jobKindForRequest(mode: GenerationMode, sectionId: ResearchSectionId | null): GenerationJobKind {
  return sectionId ? researchSectionJobKind(sectionId) : mode;
}

function publicGenerationEnabled() {
  return process.env.NODE_ENV !== "production" || process.env.PUBLIC_GENERATION_ENABLED === "true";
}

function isUniqueGenerationRunConflict(error: unknown) {
  const record = error as { code?: unknown; constraint?: unknown } | null;
  return (
    record?.code === "23505" &&
    (record.constraint === undefined ||
      record.constraint === "generation_runs_active_slug_mode_idx" ||
      String(record.constraint).includes("generation_runs"))
  );
}

function serializeGenerationRun(
  input: {
    slug: string;
    domain: string;
    mode: GenerationMode;
    status: "idle" | "cached" | GenerationRunStatusSummary["status"];
    events?: ResearchRunEvent[];
  } & Omit<Partial<GenerationRunStatusSummary>, "slug" | "domain" | "mode" | "status">
) {
  const costUsd = input.costUsd === undefined || input.costUsd === null ? undefined : Number(input.costUsd);

  return {
    slug: input.slug,
    domain: input.domain,
    mode: input.mode,
    status: input.status,
    ...(input.id ? { runId: input.id } : {}),
    ...(input.error ? { error: input.error } : {}),
    ...(costUsd !== undefined && Number.isFinite(costUsd) ? { costUsd } : {}),
    ...(input.startedAt ? { startedAt: input.startedAt.toISOString() } : {}),
    ...(input.completedAt ? { completedAt: input.completedAt.toISOString() } : {}),
    ...(input.events && input.events.length > 0 ? { events: input.events } : {})
  };
}

function profileJobKind(mode: GenerationMode): GenerationJobKind {
  return mode;
}

function elapsedMs(startedAt: number) {
  return performance.now() - startedAt;
}

async function markQueuedGenerationFailed(
  db: ColdStartDb,
  input: {
    slug: string;
    domain: string;
    mode: GenerationMode;
    sectionId: ResearchSectionId | null;
    queuedRun: Awaited<ReturnType<typeof markGenerationRun>> | null;
    error: unknown;
  }
) {
  const errorMessage = boundedErrorMessage(input.error);
  const jobKind = jobKindForRequest(input.mode, input.sectionId);
  await markGenerationRun(db, {
    slug: input.slug,
    domain: input.domain,
    mode: input.mode,
    jobKind,
    status: "failed",
    error: errorMessage
  });
  await recordResearchRunEvent(db, {
    runId: input.queuedRun?.id ?? `${input.slug}:${jobKind}`,
    slug: input.slug,
    domain: input.domain,
    sectionId: input.sectionId,
    type: input.sectionId ? "section.failed" : "generation.failed",
    message: "Failed to queue generation",
    metadata: { mode: input.mode, error: errorMessage, ...(input.sectionId ? { sectionId: input.sectionId } : {}) }
  }).catch(() => null);
  if (input.sectionId) {
    await markResearchSectionFailed(db, {
      slug: input.slug,
      domain: input.domain,
      sectionId: input.sectionId,
      visibility: RESEARCH_SECTION_DEFINITIONS_BY_ID[input.sectionId].visibility,
      error: errorMessage,
      runId: input.queuedRun?.id ?? null
    }).catch(() => null);
  }
}

export async function GET(request: Request) {
  const startedAt = performance.now();
  const extensionAuth = assertExtensionRequest(request.headers);

  if (!extensionAuth.ok) {
    return apiJsonWithTiming({ error: extensionAuth.error }, [{ name: "total", durationMs: elapsedMs(startedAt) }], { status: extensionAuth.status });
  }

  const url = new URL(request.url);
  const rawMode = url.searchParams.get("mode");
  let requestedMode: GenerationMode;
  let sectionId: ResearchSectionId | null;

  try {
    requestedMode = generationMode(rawMode);
    sectionId = parseSectionId(url.searchParams.get("sectionId"));
  } catch (error) {
    return apiJsonWithTiming({ error: boundedErrorMessage(error) }, [{ name: "total", durationMs: elapsedMs(startedAt) }], { status: 400 });
  }

  const mode = sectionId ? modeForSection(sectionId) : requestedMode;
  if (sectionId && hasExplicitGenerationMode(rawMode) && requestedMode !== mode) {
    return apiJsonWithTiming({ error: "section mode does not match requested mode" }, [{ name: "total", durationMs: elapsedMs(startedAt) }], { status: 400 });
  }

  const jobKind = jobKindForRequest(mode, sectionId);
  let domain: string;

  try {
    domain = canonicalCompanyDomain(url.searchParams.get("domain"));
  } catch (error) {
    return apiJsonWithTiming({ error: boundedErrorMessage(error) }, [{ name: "total", durationMs: elapsedMs(startedAt) }], { status: 400 });
  }

  const slug = companySlugFromDomain(domain);
  const dbStartedAt = performance.now();
  const db = createDb(webEnv().DATABASE_URL);
  await retireStaleGenerationRuns(db, { slug, mode, jobKind });
  const latestRun = await findLatestGenerationRunStatusBySlug(db, slug, mode, jobKind);
  const metrics: ServerTimingMetric[] = [
    { name: "db", durationMs: elapsedMs(dbStartedAt) },
    { name: "total", durationMs: elapsedMs(startedAt) }
  ];

  if (!latestRun) {
    return apiJsonWithTiming(serializeGenerationRun({ slug, domain, mode, status: "idle" }), metrics, { status: 200 });
  }

  const events = latestRun.id ? await findResearchRunEventsByRunId(db, latestRun.id, { limit: 12 }).catch(() => []) : [];
  return apiJsonWithTiming(serializeGenerationRun({ ...latestRun, events }), metrics, { status: 200 });
}

export async function POST(request: Request) {
  const startedAt = performance.now();
  const timedJson = (body: unknown, init?: ResponseInit, extraMetrics: ServerTimingMetric[] = []) =>
    apiJsonWithTiming(body, [...extraMetrics, { name: "total", durationMs: elapsedMs(startedAt) }], init);
  let body: { domain?: unknown; confirmStart?: unknown; forceRefresh?: unknown; mode?: unknown; sectionId?: unknown };

  try {
    body = (await request.json()) as { domain?: unknown; confirmStart?: unknown; forceRefresh?: unknown; mode?: unknown; sectionId?: unknown };
  } catch {
    return timedJson({ error: "invalid json body" }, { status: 400 });
  }

  let sectionId: ResearchSectionId | null;
  let requestedMode: GenerationMode;
  try {
    sectionId = parseSectionId(body.sectionId);
    requestedMode = generationMode(body.mode);
  } catch (error) {
    return timedJson({ error: boundedErrorMessage(error) }, { status: 400 });
  }

  const mode = sectionId ? modeForSection(sectionId) : requestedMode;
  if (sectionId && hasExplicitGenerationMode(body.mode) && requestedMode !== mode) {
    return timedJson({ error: "section mode does not match requested mode" }, { status: 400 });
  }
  const extensionAuth = assertExtensionRequest(request.headers);
  const confirmed = body.confirmStart === true;
  const forceRefresh = body.forceRefresh === true;
  const acceptsUnconfirmedExtensionBasics = !sectionId && mode === "basics" && extensionAuth.ok;

  if ((mode === "analysis" || sectionId) && !extensionAuth.ok) {
    return timedJson({ error: extensionAuth.error }, { status: extensionAuth.status });
  }

  if (!confirmed && !acceptsUnconfirmedExtensionBasics) {
    return timedJson({ error: "generation start confirmation required" }, { status: 400 });
  }

  if (mode === "basics" && !extensionAuth.ok && !publicGenerationEnabled()) {
    return timedJson({ error: "extension identity required" }, { status: 403 });
  }

  if (forceRefresh && (!extensionAuth.ok || !confirmed)) {
    return timedJson({ error: "extension refresh requires confirmation" }, { status: 400 });
  }

  let domain: string;

  try {
    domain = canonicalCompanyDomain(body.domain);
  } catch (error) {
    return timedJson({ error: boundedErrorMessage(error) }, { status: 400 });
  }

  const slug = companySlugFromDomain(domain);
  const dbStartedAt = performance.now();
  const db = createDb(webEnv().DATABASE_URL);
  // allowStale: an analysis existence check must not run the TTL-freshness gate, or a card whose
  // TTL lapsed reads as absent and 404s instead of queueing a refresh (the stale-TTL dead end).
  const cached = mode === "analysis" ? await findCardBySlug(db, slug, { allowStale: true }) : await findPublicCardBySlug(db, slug);
  const cacheLookupMs = elapsedMs(dbStartedAt);

  if (mode === "analysis" && !cached) {
    return timedJson({ error: "profile not found" }, { status: 404 }, [{ name: "db", durationMs: cacheLookupMs }]);
  }

  if (sectionId) {
    if (!cached) {
      return timedJson({ error: "profile not found" }, { status: 404 }, [{ name: "db", durationMs: cacheLookupMs }]);
    }

    const blockedReason = mode === "analysis"
      ? analysisBlockedReason(cached)
      : hasUsablePublicProfile(cached) ? null : "profile needs more structured facts before section generation";
    if (blockedReason) {
      return timedJson({ error: blockedReason }, { status: 409 }, [{ name: "db", durationMs: cacheLookupMs }]);
    }
  } else if (mode === "analysis" && cached) {
    const blockedReason = analysisBlockedReason(cached);
    if (blockedReason) {
      return timedJson({ error: blockedReason }, { status: 409 }, [{ name: "db", durationMs: cacheLookupMs }]);
    }
  }

  // Free pre-check: a withheld card whose evidence hasn't moved since the last verdict costs
  // nothing to re-answer. This runs before the active-run check further below so a queued
  // duplicate of a run that will just re-hit the same gate is structurally impossible.
  // forceRefresh always bypasses it. Only the analysis branch's fetch (findCardBySlug) can ever
  // carry synthesisWithheld; the basics branch's PublicCard type structurally omits it.
  // The comparison is evidence-content-based (citation count plus non-enrichment source-type
  // count), not timestamp-based: synthesisWithheld.at is stamped mid-pipeline during card
  // assembly, before upsertCard sets cards.updated_at at persist time, so updated_at is always
  // later than at in production and a `updated_at <= at` comparison can never pass.
  const analysisCard = mode === "analysis" ? (cached as ColdStartCard | null) : null;
  const withheldRecord = analysisCard?.synthesisWithheld;

  if (!sectionId && mode === "analysis" && !forceRefresh && analysisCard && withheldRecord) {
    const liveSignals = synthesisEvidenceSignals(analysisCard);
    const evidenceUnchanged =
      liveSignals.citationCount === withheldRecord.citationCount &&
      liveSignals.nonEnrichmentSourceTypes.length === withheldRecord.sourceTypeCount;

    if (evidenceUnchanged) {
      return timedJson(
        { slug, domain, mode, status: "withheld" as const, card: cached },
        { status: 200 },
        [{ name: "db-cache", durationMs: cacheLookupMs }]
      );
    }
  }

  if (
    !sectionId &&
    !forceRefresh &&
    cached &&
    (mode === "basics"
      ? hasUsablePublicProfile(cached)
      : cached.cacheStatus !== "stale" && "synthesis" in cached && cached.synthesis)
  ) {
    return timedJson(serializeGenerationRun({ slug, domain, mode, status: "cached" }), { status: 200 }, [{ name: "db", durationMs: cacheLookupMs }]);
  }

  const runLookupStartedAt = performance.now();
  await retireStaleGenerationRuns(db, { slug, mode });
  const oppositeProfileMode = mode === "basics" ? "analysis" : "basics";
  if (sectionId) {
    await retireStaleGenerationRuns(db, {
      slug,
      mode: oppositeProfileMode,
      jobKind: profileJobKind(oppositeProfileMode)
    });
  }
  const [activeRun, activeOppositeProfileRun] = await Promise.all([
    findActiveGenerationRunStatusBySlug(db, slug, mode),
    sectionId
      ? findActiveGenerationRunStatusBySlug(db, slug, oppositeProfileMode, profileJobKind(oppositeProfileMode))
      : Promise.resolve(null)
  ]);
  const runLookupMs = elapsedMs(runLookupStartedAt);

  if (sectionId && (activeRun?.jobKind === profileJobKind(mode) || activeOppositeProfileRun)) {
    return timedJson(
      { error: "company profile is still generating" },
      { status: 409 },
      [
        { name: "db-cache", durationMs: cacheLookupMs },
        { name: "db-run", durationMs: runLookupMs }
      ]
    );
  }

  // forceRefresh bypasses the cache-hit checks above but not this one: an in-flight run for the
  // same slug/mode is joined below, never superseded. A forceRefresh request never starts a
  // second concurrent run against the same target; it attaches to whatever is already running.
  if (activeRun) {
    if (activeRun.jobKind !== jobKindForRequest(mode, sectionId)) {
      return timedJson(
        { error: "another generation is already running for this company" },
        { status: 409 },
        [
          { name: "db-cache", durationMs: cacheLookupMs },
          { name: "db-run", durationMs: runLookupMs }
        ]
      );
    }

    const events = activeRun.id ? await findResearchRunEventsByRunId(db, activeRun.id, { limit: 12 }).catch(() => []) : [];
    return timedJson(
      serializeGenerationRun({ ...activeRun, slug, domain, mode, events }),
      { status: 202 },
      [
        { name: "db-cache", durationMs: cacheLookupMs },
        { name: "db-run", durationMs: runLookupMs }
      ]
    );
  }

  // The DB partial unique index is the final guard if two fresh POSTs pass the read above.
  let queuedRun: Awaited<ReturnType<typeof markGenerationRun>> | null = null;
  let queuedEvent: ResearchRunEvent | null = null;

  try {
    queuedRun = await markGenerationRun(db, { slug, domain, mode, jobKind: jobKindForRequest(mode, sectionId), status: "queued" });
    queuedEvent = await recordResearchRunEvent(db, {
      runId: queuedRun?.id ?? `${slug}:${jobKindForRequest(mode, sectionId)}`,
      slug,
      domain,
      sectionId,
      type: sectionId ? "section.queued" : "generation.queued",
      message: sectionId
        ? `Queued ${RESEARCH_SECTION_DEFINITIONS_BY_ID[sectionId].title}`
        : `Queued ${mode === "analysis" ? "investor analysis" : "company profile"}`,
      metadata: { mode, ...(sectionId ? { sectionId } : {}) }
    }).catch(() => null);
    if (sectionId) {
      await markResearchSectionRunning(db, {
        slug,
        domain,
        sectionId,
        visibility: RESEARCH_SECTION_DEFINITIONS_BY_ID[sectionId].visibility,
        runId: queuedRun?.id ?? null
      });
    }
  } catch (error) {
    if (isUniqueGenerationRunConflict(error)) {
      const runAfterConflict = await findActiveGenerationRunStatusBySlug(db, slug, mode);

      if (runAfterConflict) {
        if (runAfterConflict.jobKind !== jobKindForRequest(mode, sectionId)) {
          return timedJson(
            { error: "another generation is already running for this company" },
            { status: 409 },
            [
              { name: "db-cache", durationMs: cacheLookupMs },
              { name: "db-run", durationMs: runLookupMs }
            ]
          );
        }

        const events = runAfterConflict.id ? await findResearchRunEventsByRunId(db, runAfterConflict.id, { limit: 12 }).catch(() => []) : [];
        return timedJson(
          serializeGenerationRun({ ...runAfterConflict, slug, domain, mode, events }),
          { status: 202 },
          [
            { name: "db-cache", durationMs: cacheLookupMs },
            { name: "db-run", durationMs: runLookupMs }
          ]
        );
      }
    }

    if (queuedRun) {
      await markQueuedGenerationFailed(db, { slug, domain, mode, sectionId, queuedRun, error });
      return timedJson(
        { error: "failed to queue generation" },
        { status: 500 },
        [
          { name: "db-cache", durationMs: cacheLookupMs },
          { name: "db-run", durationMs: runLookupMs }
        ]
      );
    }

    throw error;
  }

  try {
    const queueStartedAt = performance.now();
    const requestedAtMs = queuedRun?.startedAt?.getTime() ?? Date.now();
    await inngest.send({
      name: "card/generate.requested",
      ts: requestedAtMs,
      data: {
        domain,
        slug,
        mode,
        requestedAtMs,
        ...(sectionId ? { sectionId } : {})
      },
    });
    const queueMs = elapsedMs(queueStartedAt);
    return timedJson(
      serializeGenerationRun({
        slug,
        domain,
        mode,
        status: "queued",
        ...(queuedEvent ? { events: [queuedEvent] } : {}),
        ...(queuedRun?.id ? { id: queuedRun.id } : {}),
        ...(queuedRun?.startedAt ? { startedAt: queuedRun.startedAt } : {})
      }),
      { status: 202 },
      [
        { name: "db-cache", durationMs: cacheLookupMs },
        { name: "db-run", durationMs: runLookupMs },
        { name: "queue", durationMs: queueMs }
      ]
    );
  } catch (error) {
    await markQueuedGenerationFailed(db, { slug, domain, mode, sectionId, queuedRun, error });
    return timedJson(
      { error: "failed to queue generation" },
      { status: 500 },
      [
        { name: "db-cache", durationMs: cacheLookupMs },
        { name: "db-run", durationMs: runLookupMs }
      ]
    );
  }
}
