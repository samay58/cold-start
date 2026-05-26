import {
  RESEARCH_SECTION_DEFINITIONS_BY_ID,
  analysisBlockedReason,
  companySlugFromDomain,
  hasUsablePublicProfile,
  researchSectionIdSchema,
  type GenerationJobKind,
  type ResearchSectionId
} from "@cold-start/core";
import {
  createDb,
  findActiveGenerationRunStatusBySlug,
  findCardBySlug,
  findLatestGenerationRunStatusBySlug,
  findPublicCardBySlug,
  markGenerationRun,
  markResearchSectionFailed,
  markResearchSectionRunning,
  retireStaleGenerationRuns,
  type GenerationRunStatusSummary
} from "@cold-start/db";
import { inngest } from "../../../inngest/client";
import { boundedErrorMessage } from "../../../lib/errors";
import { canonicalCompanyDomain } from "../../../lib/domain";
import { webEnv } from "../../../lib/env";
import { apiJsonWithTiming, type ServerTimingMetric } from "../../../lib/api-response";
import { assertExtensionRequest } from "../../../lib/extension-auth";

type GenerationMode = "basics" | "analysis";

function generationMode(input: unknown): GenerationMode {
  return input === "analysis" || input === "basics" ? input : "basics";
}

function parseSectionId(input: unknown): ResearchSectionId | null {
  if (input === undefined || input === null || input === "") {
    return null;
  }

  return researchSectionIdSchema.parse(input);
}

function modeForSection(sectionId: ResearchSectionId): GenerationMode {
  return RESEARCH_SECTION_DEFINITIONS_BY_ID[sectionId].visibility === "gated" ? "analysis" : "basics";
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
    ...(input.completedAt ? { completedAt: input.completedAt.toISOString() } : {})
  };
}

function sectionJobKind(sectionId: ResearchSectionId): GenerationJobKind {
  return `section:${sectionId}`;
}

function activeRunMatchesSection(activeRun: GenerationRunStatusSummary, sectionId: ResearchSectionId) {
  return activeRun.jobKind === sectionJobKind(sectionId);
}

function elapsedMs(startedAt: number) {
  return performance.now() - startedAt;
}

export async function GET(request: Request) {
  const startedAt = performance.now();
  const extensionAuth = assertExtensionRequest(request.headers);

  if (!extensionAuth.ok) {
    return apiJsonWithTiming({ error: extensionAuth.error }, [{ name: "total", durationMs: elapsedMs(startedAt) }], { status: extensionAuth.status });
  }

  const url = new URL(request.url);
  const mode = generationMode(url.searchParams.get("mode"));
  let sectionId: ResearchSectionId | null;

  try {
    sectionId = parseSectionId(url.searchParams.get("sectionId"));
  } catch (error) {
    return apiJsonWithTiming({ error: boundedErrorMessage(error) }, [{ name: "total", durationMs: elapsedMs(startedAt) }], { status: 400 });
  }

  const jobKind = sectionId ? sectionJobKind(sectionId) : undefined;
  let domain: string;

  try {
    domain = canonicalCompanyDomain(url.searchParams.get("domain"));
  } catch (error) {
    return apiJsonWithTiming({ error: boundedErrorMessage(error) }, [{ name: "total", durationMs: elapsedMs(startedAt) }], { status: 400 });
  }

  const slug = companySlugFromDomain(domain);
  const dbStartedAt = performance.now();
  const db = createDb(webEnv().DATABASE_URL);
  await retireStaleGenerationRuns(db, { slug, mode });
  const latestRun = await findLatestGenerationRunStatusBySlug(db, slug, mode, jobKind);
  const metrics: ServerTimingMetric[] = [
    { name: "db", durationMs: elapsedMs(dbStartedAt) },
    { name: "total", durationMs: elapsedMs(startedAt) }
  ];

  if (!latestRun) {
    return apiJsonWithTiming(serializeGenerationRun({ slug, domain, mode, status: "idle" }), metrics, { status: 200 });
  }

  return apiJsonWithTiming(serializeGenerationRun(latestRun), metrics, { status: 200 });
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
  try {
    sectionId = parseSectionId(body.sectionId);
  } catch (error) {
    return timedJson({ error: boundedErrorMessage(error) }, { status: 400 });
  }

  const requestedMode = generationMode(body.mode);
  const mode = sectionId ? modeForSection(sectionId) : requestedMode;
  if (sectionId && body.mode !== undefined && requestedMode !== mode) {
    return timedJson({ error: "section mode does not match requested mode" }, { status: 400 });
  }
  const extensionAuth = assertExtensionRequest(request.headers);
  const confirmed = body.confirmStart === true;
  const forceRefresh = body.forceRefresh === true;

  if ((mode === "analysis" || sectionId) && !extensionAuth.ok) {
    return timedJson({ error: extensionAuth.error }, { status: extensionAuth.status });
  }

  if (!confirmed && !(mode === "basics" && extensionAuth.ok)) {
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
  const cached = mode === "analysis" ? await findCardBySlug(db, slug) : await findPublicCardBySlug(db, slug);
  const cacheLookupMs = elapsedMs(dbStartedAt);

  if (mode === "analysis" && !cached) {
    return timedJson({ error: "profile not found" }, { status: 404 }, [{ name: "db", durationMs: cacheLookupMs }]);
  }

  if (mode === "analysis" && cached) {
    const blockedReason = analysisBlockedReason(cached);
    if (blockedReason) {
      return timedJson({ error: blockedReason }, { status: 409 }, [{ name: "db", durationMs: cacheLookupMs }]);
    }
  }

  if (!sectionId && !forceRefresh && cached && (mode === "basics" ? hasUsablePublicProfile(cached) : ("synthesis" in cached && cached.synthesis))) {
    return timedJson(serializeGenerationRun({ slug, domain, mode, status: "cached" }), { status: 200 }, [{ name: "db", durationMs: cacheLookupMs }]);
  }

  const runLookupStartedAt = performance.now();
  await retireStaleGenerationRuns(db, { slug, mode });
  const activeRun = await findActiveGenerationRunStatusBySlug(db, slug, mode);
  const runLookupMs = elapsedMs(runLookupStartedAt);

  if (activeRun) {
    if (sectionId && !activeRunMatchesSection(activeRun, sectionId)) {
      return timedJson(
        { error: "another generation is already running for this company" },
        { status: 409 },
        [
          { name: "db-cache", durationMs: cacheLookupMs },
          { name: "db-run", durationMs: runLookupMs }
        ]
      );
    }

    return timedJson(
      serializeGenerationRun({ ...activeRun, slug, domain, mode }),
      { status: 202 },
      [
        { name: "db-cache", durationMs: cacheLookupMs },
        { name: "db-run", durationMs: runLookupMs }
      ]
    );
  }

  // The DB partial unique index is the final guard if two fresh POSTs pass the read above.
  let queuedRun: Awaited<ReturnType<typeof markGenerationRun>>;

  try {
    queuedRun = await markGenerationRun(db, { slug, domain, mode, ...(sectionId ? { jobKind: sectionJobKind(sectionId) } : {}), status: "queued" });
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
        if (sectionId && !activeRunMatchesSection(runAfterConflict, sectionId)) {
          return timedJson(
            { error: "another generation is already running for this company" },
            { status: 409 },
            [
              { name: "db-cache", durationMs: cacheLookupMs },
              { name: "db-run", durationMs: runLookupMs }
            ]
          );
        }

        return timedJson(
          serializeGenerationRun({ ...runAfterConflict, slug, domain, mode }),
          { status: 202 },
          [
            { name: "db-cache", durationMs: cacheLookupMs },
            { name: "db-run", durationMs: runLookupMs }
          ]
        );
      }
    }

    throw error;
  }

  try {
    const queueStartedAt = performance.now();
    await inngest.send({
      name: "card/generate.requested",
      data: { domain, slug, mode, ...(sectionId ? { sectionId } : {}) },
    });
    const queueMs = elapsedMs(queueStartedAt);
    return timedJson(
      serializeGenerationRun({
        slug,
        domain,
        mode,
        status: "queued",
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
    await markGenerationRun(db, { slug, domain, mode, ...(sectionId ? { jobKind: sectionJobKind(sectionId) } : {}), status: "failed", error: boundedErrorMessage(error) });
    if (sectionId) {
      await markResearchSectionFailed(db, {
        slug,
        domain,
        sectionId,
        visibility: RESEARCH_SECTION_DEFINITIONS_BY_ID[sectionId].visibility,
        error: boundedErrorMessage(error),
        runId: queuedRun?.id ?? null
      });
    }
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
