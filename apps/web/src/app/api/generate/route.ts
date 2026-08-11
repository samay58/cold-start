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
import { synthesisEvidenceFingerprint } from "@cold-start/pipeline";
import { z } from "zod";
import {
  createDb,
  findActiveGenerationRunStatusBySlug,
  findGenerationRunById,
  findCardBySlug,
  findLatestGenerationRunBySlug,
  findLatestGenerationRunStatusBySlug,
  findPublicCardBySlug,
  findResearchRunEventsByRunId,
  findResearchSectionsBySlug,
  markGenerationRun,
  markResearchSectionFailed,
  markResearchSectionRunning,
  recordAlphaRunDisposition,
  recordResearchRunEvent,
  reserveAlphaRunRequest,
  settleAlphaRunRequest,
  type ColdStartDb,
  type GenerationRunStatusSummary,
  type ResearchRunEvent
} from "@cold-start/db";
import { inngest } from "../../../inngest/client";
import { startInlineGeneration } from "../../../inngest/inline-dispatch";
import { generationDispatchModeFromProcess } from "../../../inngest/worker-env";
import { alphaGenerationEnabled } from "../../../lib/alpha-config";
import { boundedErrorMessage } from "../../../lib/errors";
import { generationFailureCode } from "../../../lib/failure-code";
import { retireAndSettleStaleGenerationRuns, retireDeadGenerationRun } from "../../../lib/generation-run-watchdog";
import { canonicalCompanyDomain } from "../../../lib/domain";
import { webEnv } from "../../../lib/web-env";
import { apiJsonWithTiming, type ServerTimingMetric } from "../../../lib/api-response";
import { readBoundedJson } from "../../../lib/bounded-json";
import {
  assertExtensionRequest,
  authenticateExtensionRequest,
  operatorPrincipal as buildOperatorPrincipal,
  principalHasScope
} from "../../../lib/extension-auth";

// Inline-dispatched profile runs execute inside this invocation past the 202 (via `after` in
// inline-dispatch.ts): basics runs ~45-90s, analysis ~85s, so 300s covers both with margin.
// A run that outlives the instance anyway is retired by the dead-run watchdog below.
export const maxDuration = 300;
const GENERATE_REQUEST_MAX_BYTES = 2_048;

const generateRequestSchema = z.object({
  domain: z.string().min(1).max(253),
  confirmStart: z.boolean().optional(),
  forceRefresh: z.boolean().optional(),
  interactionId: z.string().max(128).optional(),
  mode: z.string().max(20).nullable().optional(),
  sectionId: z.string().max(80).nullable().optional()
}).strict();

type GenerationMode = "basics" | "analysis";
type QueuedGenerationRun = NonNullable<Awaited<ReturnType<typeof markGenerationRun>>>;

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

function hasBearerCredential(headers: Headers) {
  return (headers.get("authorization") ?? "").startsWith("Bearer ");
}

function operatorPrincipal() {
  return {
    ok: true as const,
    principal: buildOperatorPrincipal()
  };
}

function interactionId(input: unknown) {
  if (typeof input !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input)) {
    return null;
  }
  return input;
}

function alphaReservationRejection(reason: string | null) {
  switch (reason) {
    case "allowance_exhausted":
      return {
        status: 429,
        error: "No fresh runs remain for this allowance. Cached work is still available."
      };
    case "rate_limited":
      return {
        status: 429,
        error: "Too many requests arrived together. Wait a minute, then try once more."
      };
    case "domain_failure_breaker":
      return {
        status: 503,
        error: "New work is paused for this company after repeated failures. Try another company or contact support."
      };
    case "invite_failure_breaker":
      return {
        status: 503,
        error: "New work is paused for this invitation after repeated failures. Contact support."
      };
    case "generation_busy":
      return {
        status: 409,
        error: "Another research job is running for this company. Try again when it finishes."
      };
    case "access_inactive":
      return {
        status: 401,
        error: "This extension connection is no longer active. Reconnect from the invitation page."
      };
    default:
      return {
        status: 403,
        error: "This run could not be started."
      };
  }
}

function logAlphaReservationRejection(reason: string | null, status: number) {
  console.warn("[alpha-security]", {
    signal: "generation_reservation_rejected",
    reason: reason ?? "unknown",
    status
  });
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
    queuedRun: QueuedGenerationRun | null | undefined;
    error: unknown;
  }
) {
  const errorMessage = boundedErrorMessage(input.error);
  const jobKind = jobKindForRequest(input.mode, input.sectionId);
  const alphaSettlement = input.queuedRun?.id
    ? await settleAlphaRunRequest(db, {
      generationRunId: input.queuedRun.id,
      outcome: "failed",
      failureCode: generationFailureCode(input.error),
      error: errorMessage
    })
    : null;
  if (!alphaSettlement) {
    await markGenerationRun(db, {
      slug: input.slug,
      domain: input.domain,
      mode: input.mode,
      jobKind,
      status: "failed",
      error: errorMessage
    });
  }
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
  const operatorAuth = assertExtensionRequest(request.headers);
  if (!operatorAuth.ok && !hasBearerCredential(request.headers)) {
    return apiJsonWithTiming(
      { error: operatorAuth.error },
      [{ name: "total", durationMs: elapsedMs(startedAt) }],
      { status: operatorAuth.status }
    );
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
  const extensionAuth = operatorAuth.ok
    ? operatorPrincipal()
    : await authenticateExtensionRequest(request.headers, db);
  if (!extensionAuth.ok) {
    return apiJsonWithTiming(
      { error: extensionAuth.error },
      [{ name: "total", durationMs: elapsedMs(startedAt) }],
      { status: extensionAuth.status }
    );
  }
  if (!principalHasScope(extensionAuth.principal, "generation:write")) {
    return apiJsonWithTiming(
      { error: "generation access is not allowed for this installation", code: "authorization" },
      [{ name: "total", durationMs: elapsedMs(startedAt) }],
      { status: 403 }
    );
  }
  await retireAndSettleStaleGenerationRuns(db, { slug, mode, jobKind });
  const latestRun = await findLatestGenerationRunStatusBySlug(db, slug, mode, jobKind);

  if (!latestRun) {
    const metrics: ServerTimingMetric[] = [
      { name: "db", durationMs: elapsedMs(dbStartedAt) },
      { name: "total", durationMs: elapsedMs(startedAt) }
    ];
    return apiJsonWithTiming(serializeGenerationRun({ slug, domain, mode, status: "idle" }), metrics, { status: 200 });
  }
  if (latestRun.domain !== domain) {
    return apiJsonWithTiming(
      { error: "company domain conflicts with an existing card identity" },
      [
        { name: "db", durationMs: elapsedMs(dbStartedAt) },
        { name: "total", durationMs: elapsedMs(startedAt) }
      ],
      { status: 409 }
    );
  }

  const settled = await retireDeadGenerationRun(db, latestRun);
  const metrics: ServerTimingMetric[] = [
    { name: "db", durationMs: elapsedMs(dbStartedAt) },
    { name: "total", durationMs: elapsedMs(startedAt) }
  ];
  return apiJsonWithTiming(serializeGenerationRun({ ...settled.run, events: settled.events }), metrics, { status: 200 });
}

export async function POST(request: Request) {
  const startedAt = performance.now();
  const timedJson = (body: unknown, init?: ResponseInit, extraMetrics: ServerTimingMetric[] = []) =>
    apiJsonWithTiming(body, [...extraMetrics, { name: "total", durationMs: elapsedMs(startedAt) }], init);
  const operatorAuth = assertExtensionRequest(request.headers);
  const hasCredential = operatorAuth.ok || hasBearerCredential(request.headers);
  if (!hasCredential && !publicGenerationEnabled()) {
    return timedJson({ error: "extension identity required" }, { status: 403 });
  }

  const decoded = await readBoundedJson(request, GENERATE_REQUEST_MAX_BYTES);
  const parsedBody = generateRequestSchema.safeParse(decoded.ok ? decoded.value : null);
  if (!parsedBody.success) {
    return timedJson({ error: "invalid json body" }, { status: 400 });
  }
  const body = parsedBody.data;

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
  const confirmed = body.confirmStart === true;
  const forceRefresh = body.forceRefresh === true;
  const acceptsUnconfirmedExtensionBasics = !sectionId && mode === "basics" && hasCredential;

  if ((mode === "analysis" || sectionId) && !hasCredential) {
    return timedJson({ error: operatorAuth.error }, { status: operatorAuth.status });
  }

  if (!confirmed && !acceptsUnconfirmedExtensionBasics) {
    return timedJson({ error: "generation start confirmation required" }, { status: 400 });
  }

  if (mode === "basics" && !hasCredential && !publicGenerationEnabled()) {
    return timedJson({ error: "extension identity required" }, { status: 403 });
  }

  if (forceRefresh && (!hasCredential || !confirmed)) {
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
  const extensionAuth = operatorAuth.ok
    ? operatorPrincipal()
    : hasBearerCredential(request.headers)
      ? await authenticateExtensionRequest(request.headers, db)
      : operatorAuth;
  if (hasCredential && !extensionAuth.ok) {
    return timedJson({ error: extensionAuth.error }, { status: extensionAuth.status });
  }
  if (
    extensionAuth.ok &&
    hasCredential &&
    !principalHasScope(extensionAuth.principal, "generation:write")
  ) {
    return timedJson(
      { error: "generation access is not allowed for this installation", code: "authorization" },
      { status: 403 }
    );
  }
  const alphaPrincipal =
    extensionAuth.ok && extensionAuth.principal.kind === "alpha"
      ? extensionAuth.principal
      : null;
  const alphaInteractionId = alphaPrincipal ? interactionId(body.interactionId) : null;
  if (alphaPrincipal && !alphaInteractionId) {
    return timedJson(
      { error: "this extension needs an update before starting new work", code: "unsupported_client" },
      { status: 426 }
    );
  }
  const recordAlphaDisposition = async (
    disposition: "cached" | "withheld" | "blocked" | "rejected",
    reason?: string
  ) => {
    if (
      !alphaPrincipal?.inviteId ||
      !alphaPrincipal.installationId ||
      !alphaInteractionId
    ) {
      return null;
    }
    return recordAlphaRunDisposition(db, {
      inviteId: alphaPrincipal.inviteId,
      installationId: alphaPrincipal.installationId,
      interactionId: alphaInteractionId,
      kind: mode === "analysis" ? "lens" : "profile",
      slug,
      domain,
      disposition,
      ...(reason ? { reason } : {})
    });
  };
  // allowStale: an analysis existence check must not run the TTL-freshness gate, or a card whose
  // TTL lapsed reads as absent and 404s instead of queueing a refresh (the stale-TTL dead end).
  const cached = mode === "analysis" ? await findCardBySlug(db, slug, { allowStale: true }) : await findPublicCardBySlug(db, slug);
  let cacheLookupMs = elapsedMs(dbStartedAt);

  if (cached && cached.domain !== domain) {
    return timedJson(
      { error: "company domain conflicts with an existing card identity" },
      { status: 409 },
      [{ name: "db", durationMs: cacheLookupMs }]
    );
  }

  if (mode === "analysis" && !cached) {
    await recordAlphaDisposition("blocked", "profile_not_found");
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
      await recordAlphaDisposition("blocked", "quality_gate");
      return timedJson({ error: blockedReason }, { status: 409 }, [{ name: "db", durationMs: cacheLookupMs }]);
    }

    // Section jobs are idempotent per slug and section: a deep run that already settled and is
    // still inside its staleness window answers the request instead of dispatching a second
    // paid run (drinkpoppi paid twice for customer_proof ten seconds apart on 2026-07-26).
    // Only rows a deep run wrote carry generatedAt; card-derived rows leave it null and never
    // short-circuit, so a paid deep pass over a derived display stays possible. "empty" is a
    // settled outcome too: re-running an honest absence ten seconds later buys nothing. The
    // extension's section poll settles from the bootstrap read, so "cached" needs no
    // client-side handling. forceRefresh, failed, and stale sections still dispatch.
    if (!forceRefresh) {
      const sectionLookupStartedAt = performance.now();
      const storedSections = await findResearchSectionsBySlug(db, slug);
      cacheLookupMs += elapsedMs(sectionLookupStartedAt);
      const storedSection = storedSections.find((section) => section.sectionId === sectionId);
      const deepGeneratedAt = storedSection?.generatedAt ? new Date(storedSection.generatedAt) : null;
      const sectionSettled =
        storedSection !== undefined &&
        deepGeneratedAt !== null &&
        (storedSection.status === "available" || storedSection.status === "empty");
      const now = new Date();
      const sectionFresh = sectionSettled && (
        storedSection.staleAt
          ? new Date(storedSection.staleAt) > now
          : now.getTime() - deepGeneratedAt.getTime() < RESEARCH_SECTION_DEFINITIONS_BY_ID[sectionId].staleAfterMs
      );
      if (sectionFresh) {
        await recordAlphaDisposition("cached", "fresh_section");
        return timedJson(
          serializeGenerationRun({ slug, domain, mode, status: "cached" }),
          { status: 200 },
          [{ name: "db", durationMs: cacheLookupMs }]
        );
      }
    }
  } else if (mode === "analysis" && cached) {
    const blockedReason = analysisBlockedReason(cached);
    if (blockedReason) {
      await recordAlphaDisposition("blocked", "quality_gate");
      return timedJson({ error: blockedReason }, { status: 409 }, [{ name: "db", durationMs: cacheLookupMs }]);
    }
  }

  // Free pre-check: a withheld card whose evidence hasn't moved since the last verdict costs
  // nothing to re-answer. This runs before the active-run check further below so a queued
  // duplicate of a run that will just re-hit the same gate is structurally impossible.
  // forceRefresh always bypasses it. Only the analysis branch's fetch (findCardBySlug) can ever
  // carry synthesisWithheld; the basics branch's PublicCard type structurally omits it.
  // The comparison is evidence-content-based, not timestamp-based. The prior run keeps the
  // fingerprint in internal trace telemetry so this does not widen the card or API contract.
  const analysisCard = mode === "analysis" ? (cached as ColdStartCard | null) : null;
  const withheldRecord = analysisCard?.synthesisWithheld;

  if (!sectionId && mode === "analysis" && !forceRefresh && analysisCard && withheldRecord) {
    const traceLookupStartedAt = performance.now();
    const previousRun = await findLatestGenerationRunBySlug(db, slug, "analysis", "analysis");
    cacheLookupMs += elapsedMs(traceLookupStartedAt);
    const evidenceFingerprint = previousRun?.traceJson?.synthesis?.evidenceFingerprint;
    const liveSignals = synthesisEvidenceSignals(analysisCard);
    const evidenceUnchanged =
      evidenceFingerprint !== undefined &&
      synthesisEvidenceFingerprint(analysisCard) === evidenceFingerprint &&
      liveSignals.citationCount === withheldRecord.citationCount &&
      liveSignals.nonEnrichmentSourceTypes.length === withheldRecord.sourceTypeCount;

    if (evidenceUnchanged) {
      await recordAlphaDisposition("withheld", "evidence_unchanged");
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
    await recordAlphaDisposition("cached", "fresh_cache");
    return timedJson(serializeGenerationRun({ slug, domain, mode, status: "cached" }), { status: 200 }, [{ name: "db", durationMs: cacheLookupMs }]);
  }

  const runLookupStartedAt = performance.now();
  await retireAndSettleStaleGenerationRuns(db, { slug, mode });
  const oppositeProfileMode = mode === "basics" ? "analysis" : "basics";
  if (sectionId) {
    await retireAndSettleStaleGenerationRuns(db, {
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
    if (activeRun.domain !== domain) {
      return timedJson(
        { error: "company domain conflicts with an existing card identity" },
        { status: 409 },
        [
          { name: "db-cache", durationMs: cacheLookupMs },
          { name: "db-run", durationMs: runLookupMs }
        ]
      );
    }
    const activeRunEvents = activeRun.id ? await findResearchRunEventsByRunId(db, activeRun.id, { limit: 12 }).catch(() => []) : [];
    const settledActiveRun = await retireDeadGenerationRun(db, activeRun, activeRunEvents);
    const retiredDeadRun = settledActiveRun.run.status !== activeRun.status;

    if (!retiredDeadRun) {
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

      if (
        alphaPrincipal?.inviteId &&
        alphaPrincipal.installationId &&
        alphaInteractionId
      ) {
        const joined = await reserveAlphaRunRequest(db, {
          inviteId: alphaPrincipal.inviteId,
          installationId: alphaPrincipal.installationId,
          interactionId: alphaInteractionId,
          kind: mode === "analysis" ? "lens" : "profile",
          jobKind: jobKindForRequest(mode, sectionId),
          slug,
          domain
        });
        // A replayed `started` row means this interaction id already opened a run; attaching to
        // whatever is active now is the same answer a fresh join would give, and it never
        // reserves a second allowance.
        if (joined.disposition !== "joined" && !(joined.disposition === "started" && joined.replayed)) {
          const rejection = alphaReservationRejection(joined.dispositionReason);
          logAlphaReservationRejection(joined.dispositionReason, rejection.status);
          return timedJson(
            {
              error: rejection.error,
              code: joined.dispositionReason ?? "allowance_exhausted"
            },
            { status: rejection.status },
            [
              { name: "db-cache", durationMs: cacheLookupMs },
              { name: "db-run", durationMs: runLookupMs }
            ]
          );
        }
      }

      return timedJson(
        serializeGenerationRun({ ...activeRun, slug, domain, mode, events: activeRunEvents }),
        { status: 202 },
        [
          { name: "db-cache", durationMs: cacheLookupMs },
          { name: "db-run", durationMs: runLookupMs }
        ]
      );
    }
    // The dead run now holds a terminal status, so this request proceeds to start a fresh one.
  }

  if (alphaPrincipal && !alphaGenerationEnabled()) {
    await recordAlphaDisposition("blocked", "generation_disabled");
    return timedJson(
      {
        error: "New generation is temporarily paused. Cached profiles and filed Lens reads remain available.",
        code: "generation_disabled"
      },
      { status: 503 },
      [
        { name: "db-cache", durationMs: cacheLookupMs },
        { name: "db-run", durationMs: runLookupMs }
      ]
    );
  }

  // The DB partial unique index is the final guard if two fresh POSTs pass the read above.
  let queuedRun: QueuedGenerationRun | null | undefined = null;
  let queuedEvent: ResearchRunEvent | null = null;

  try {
    if (
      alphaPrincipal?.inviteId &&
      alphaPrincipal.installationId &&
      alphaInteractionId
    ) {
      const reservation = await reserveAlphaRunRequest(db, {
        inviteId: alphaPrincipal.inviteId,
        installationId: alphaPrincipal.installationId,
        interactionId: alphaInteractionId,
        kind: mode === "analysis" ? "lens" : "profile",
        jobKind: jobKindForRequest(mode, sectionId),
        slug,
        domain
      });
      if (reservation.disposition === "rejected") {
        const rejection = alphaReservationRejection(reservation.dispositionReason);
        logAlphaReservationRejection(reservation.dispositionReason, rejection.status);
        return timedJson(
          {
            error: rejection.error,
            code: reservation.dispositionReason ?? "allowance_exhausted"
          },
          { status: rejection.status },
          [
            { name: "db-cache", durationMs: cacheLookupMs },
            { name: "db-run", durationMs: runLookupMs }
          ]
        );
      }
      if (reservation.disposition === "joined") {
        const joinedRun = reservation.generationRunId
          ? await findGenerationRunById(db, reservation.generationRunId)
          : null;
        if (!joinedRun) {
          throw new Error("joined generation run was not found");
        }
        return timedJson(
          serializeGenerationRun(joinedRun),
          { status: 202 },
          [
            { name: "db-cache", durationMs: cacheLookupMs },
            { name: "db-run", durationMs: runLookupMs }
          ]
        );
      }
      const reservedRun = reservation.generationRunId
        ? await findGenerationRunById(db, reservation.generationRunId)
        : null;
      if (!reservedRun?.id) {
        throw new Error("reserved generation run was not found");
      }
      // A replayed reservation carries a request row this interaction id already owned, so the
      // work it describes is already under way or already finished. Starting a second execution
      // against it would re-pay the whole pipeline for one click. While the run is still active
      // this is an ordinary network retry, so attach to it; once it is terminal there is nothing
      // to attach to and the client needs a fresh interaction id.
      if (reservation.replayed) {
        const stillRunning = reservedRun.status === "queued" || reservedRun.status === "running";
        if (reservation.debited && stillRunning) {
          return timedJson(
            serializeGenerationRun(reservedRun),
            { status: 202 },
            [
              { name: "db-cache", durationMs: cacheLookupMs },
              { name: "db-run", durationMs: runLookupMs }
            ]
          );
        }
        logAlphaReservationRejection("interaction_replayed", 409);
        return timedJson(
          {
            error: "That request already finished. Start a new one from the panel.",
            code: "interaction_replayed"
          },
          { status: 409 },
          [
            { name: "db-cache", durationMs: cacheLookupMs },
            { name: "db-run", durationMs: runLookupMs }
          ]
        );
      }
      queuedRun = { ...reservedRun, id: reservedRun.id } as QueuedGenerationRun;
    } else {
      queuedRun = await markGenerationRun(db, {
        slug,
        domain,
        mode,
        jobKind: jobKindForRequest(mode, sectionId),
        status: "queued"
      });
    }
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
    if (!sectionId && generationDispatchModeFromProcess() === "inline") {
      // In-process dispatch: the run starts immediately in this invocation (kept alive past
      // the 202 by `after` inside startInlineGeneration) instead of waiting on Inngest's
      // dispatcher. GENERATION_DISPATCH=inngest restores queue dispatch without a deploy.
      // Section jobs always take the Inngest path below.
      if (!queuedRun?.id) {
        throw new Error("queued generation run is missing its id");
      }
      startInlineGeneration({ domain, generationRunId: queuedRun.id, slug, mode, requestedAtMs });
    } else {
      await inngest.send({
        name: "card/generate.requested",
        ts: requestedAtMs,
        data: {
          domain,
          ...(queuedRun?.id ? { generationRunId: queuedRun.id } : {}),
          slug,
          mode,
          requestedAtMs,
          ...(sectionId ? { sectionId } : {})
        },
      });
    }
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
