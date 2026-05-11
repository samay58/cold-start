import { canRunInvestorAnalysis, hasCitedSources, companySlugFromDomain } from "@cold-start/core";
import {
  createDb,
  findActiveGenerationRunBySlug,
  findCardBySlug,
  findLatestGenerationRunBySlug,
  findPublicCardBySlug,
  markGenerationRun,
  retireStaleGenerationRuns,
  type GenerationRunSummary
} from "@cold-start/db";
import { inngest } from "../../../inngest/client";
import { boundedErrorMessage } from "../../../lib/errors";
import { canonicalCompanyDomain } from "../../../lib/domain";
import { webEnv } from "../../../lib/env";
import { apiJson } from "../../../lib/api-response";
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
    status: "idle" | "cached" | GenerationRunSummary["status"];
  } & Omit<Partial<GenerationRunSummary>, "slug" | "domain" | "mode" | "status">
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

export async function GET(request: Request) {
  const extensionAuth = assertExtensionRequest(request.headers);

  if (!extensionAuth.ok) {
    return apiJson({ error: extensionAuth.error }, { status: extensionAuth.status });
  }

  const url = new URL(request.url);
  const mode = generationMode(url.searchParams.get("mode"));
  let domain: string;

  try {
    domain = canonicalCompanyDomain(url.searchParams.get("domain"));
  } catch (error) {
    return apiJson({ error: boundedErrorMessage(error) }, { status: 400 });
  }

  const slug = companySlugFromDomain(domain);
  const db = createDb(webEnv().DATABASE_URL);
  await retireStaleGenerationRuns(db, { slug, mode });
  const latestRun = await findLatestGenerationRunBySlug(db, slug, mode);

  if (!latestRun) {
    return apiJson(serializeGenerationRun({ slug, domain, mode, status: "idle" }), { status: 200 });
  }

  return apiJson(serializeGenerationRun(latestRun), { status: 200 });
}

export async function POST(request: Request) {
  let body: { domain?: unknown; confirmStart?: unknown; mode?: unknown };

  try {
    body = (await request.json()) as { domain?: unknown; confirmStart?: unknown; mode?: unknown };
  } catch {
    return apiJson({ error: "invalid json body" }, { status: 400 });
  }

  const mode = generationMode(body.mode);
  const extensionAuth = assertExtensionRequest(request.headers);
  const confirmed = body.confirmStart === true;

  if (mode === "analysis" && !extensionAuth.ok) {
    return apiJson({ error: extensionAuth.error }, { status: extensionAuth.status });
  }

  if (!confirmed && !(mode === "basics" && extensionAuth.ok)) {
    return apiJson({ error: "generation start confirmation required" }, { status: 400 });
  }

  if (mode === "basics" && !extensionAuth.ok && !publicGenerationEnabled()) {
    return apiJson({ error: "extension identity required" }, { status: 403 });
  }

  let domain: string;

  try {
    domain = canonicalCompanyDomain(body.domain);
  } catch (error) {
    return apiJson({ error: boundedErrorMessage(error) }, { status: 400 });
  }

  const slug = companySlugFromDomain(domain);
  const db = createDb(webEnv().DATABASE_URL);
  const cached = mode === "analysis" ? await findCardBySlug(db, slug) : await findPublicCardBySlug(db, slug);

  if (mode === "analysis" && !cached) {
    return apiJson({ error: "profile not found" }, { status: 404 });
  }

  if (mode === "analysis" && cached && !canRunInvestorAnalysis(cached)) {
    return apiJson({ error: "profile needs cited sources before analysis" }, { status: 409 });
  }

  if (cached && (mode === "basics" ? hasCitedSources(cached) : ("synthesis" in cached && cached.synthesis))) {
    return apiJson(serializeGenerationRun({ slug, domain, mode, status: "cached" }), { status: 200 });
  }

  await retireStaleGenerationRuns(db, { slug, mode });
  const activeRun = await findActiveGenerationRunBySlug(db, slug, mode);

  if (activeRun) {
    return apiJson(serializeGenerationRun({ ...activeRun, slug, domain, mode }), { status: 202 });
  }

  // The DB partial unique index is the final guard if two fresh POSTs pass the read above.
  let queuedRun: Awaited<ReturnType<typeof markGenerationRun>>;

  try {
    queuedRun = await markGenerationRun(db, { slug, domain, mode, status: "queued" });
  } catch (error) {
    if (isUniqueGenerationRunConflict(error)) {
      const runAfterConflict = await findActiveGenerationRunBySlug(db, slug, mode);

      if (runAfterConflict) {
        return apiJson(serializeGenerationRun({ ...runAfterConflict, slug, domain, mode }), { status: 202 });
      }
    }

    throw error;
  }

  try {
    await inngest.send({
      name: "card/generate.requested",
      data: { domain, slug, mode },
    });
  } catch (error) {
    await markGenerationRun(db, { slug, domain, mode, status: "failed", error: boundedErrorMessage(error) });
    return apiJson({ error: "failed to queue generation" }, { status: 500 });
  }

  return apiJson(
    serializeGenerationRun({
      slug,
      domain,
      mode,
      status: "queued",
      ...(queuedRun?.id ? { id: queuedRun.id } : {}),
      ...(queuedRun?.startedAt ? { startedAt: queuedRun.startedAt } : {})
    }),
    { status: 202 }
  );
}
