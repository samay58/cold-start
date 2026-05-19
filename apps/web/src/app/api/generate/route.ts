import { analysisBlockedReason, companySlugFromDomain, hasUsablePublicProfile } from "@cold-start/core";
import {
  createDb,
  findActiveGenerationRunStatusBySlug,
  findCardBySlug,
  findLatestGenerationRunStatusBySlug,
  findPublicCardBySlug,
  markGenerationRun,
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
  const latestRun = await findLatestGenerationRunStatusBySlug(db, slug, mode);
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
  let body: { domain?: unknown; confirmStart?: unknown; forceRefresh?: unknown; mode?: unknown };

  try {
    body = (await request.json()) as { domain?: unknown; confirmStart?: unknown; forceRefresh?: unknown; mode?: unknown };
  } catch {
    return timedJson({ error: "invalid json body" }, { status: 400 });
  }

  const mode = generationMode(body.mode);
  const extensionAuth = assertExtensionRequest(request.headers);
  const confirmed = body.confirmStart === true;
  const forceRefresh = body.forceRefresh === true;

  if (mode === "analysis" && !extensionAuth.ok) {
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

  if (!forceRefresh && cached && (mode === "basics" ? hasUsablePublicProfile(cached) : ("synthesis" in cached && cached.synthesis))) {
    return timedJson(serializeGenerationRun({ slug, domain, mode, status: "cached" }), { status: 200 }, [{ name: "db", durationMs: cacheLookupMs }]);
  }

  const runLookupStartedAt = performance.now();
  await retireStaleGenerationRuns(db, { slug, mode });
  const activeRun = await findActiveGenerationRunStatusBySlug(db, slug, mode);
  const runLookupMs = elapsedMs(runLookupStartedAt);

  if (activeRun) {
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
    queuedRun = await markGenerationRun(db, { slug, domain, mode, status: "queued" });
  } catch (error) {
    if (isUniqueGenerationRunConflict(error)) {
      const runAfterConflict = await findActiveGenerationRunStatusBySlug(db, slug, mode);

      if (runAfterConflict) {
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
      data: { domain, slug, mode },
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
    await markGenerationRun(db, { slug, domain, mode, status: "failed", error: boundedErrorMessage(error) });
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
