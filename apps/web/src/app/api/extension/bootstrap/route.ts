import { companySlugFromDomain, deriveResearchSectionsFromCard } from "@cold-start/core";
import {
  createDb,
  findCardBySlug,
  findLatestGenerationRunStatusBySlug,
  findResearchSectionsBySlug,
  retireStaleResearchSections,
  retireStaleGenerationRuns,
  type GenerationRunStatusSummary
} from "@cold-start/db";
import { apiJsonWithTiming, type ServerTimingMetric } from "../../../../lib/api-response";
import { canonicalCompanyDomain } from "../../../../lib/domain";
import { webEnv } from "../../../../lib/env";
import { boundedErrorMessage } from "../../../../lib/errors";
import { assertExtensionRequest } from "../../../../lib/extension-auth";

type GenerationMode = "basics" | "analysis";

function elapsedMs(startedAt: number) {
  return performance.now() - startedAt;
}

function serializeRun(input: {
  slug: string;
  domain: string;
  mode: GenerationMode;
  status: "idle" | GenerationRunStatusSummary["status"];
} & Omit<Partial<GenerationRunStatusSummary>, "slug" | "domain" | "mode" | "status">) {
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

function idleRun(slug: string, domain: string, mode: GenerationMode) {
  return serializeRun({ slug, domain, mode, status: "idle" });
}

export async function GET(request: Request) {
  const startedAt = performance.now();
  const auth = assertExtensionRequest(request.headers);

  if (!auth.ok) {
    return apiJsonWithTiming(
      { error: auth.error },
      [{ name: "total", durationMs: elapsedMs(startedAt) }],
      { status: auth.status }
    );
  }

  let domain: string;
  try {
    domain = canonicalCompanyDomain(new URL(request.url).searchParams.get("domain"));
  } catch (error) {
    return apiJsonWithTiming(
      { error: boundedErrorMessage(error) },
      [{ name: "total", durationMs: elapsedMs(startedAt) }],
      { status: 400 }
    );
  }

  const slug = companySlugFromDomain(domain);
  const dbStartedAt = performance.now();
  const db = createDb(webEnv().DATABASE_URL);

  await Promise.all([
    retireStaleGenerationRuns(db, { slug, mode: "basics" }),
    retireStaleGenerationRuns(db, { slug, mode: "analysis" }),
    retireStaleResearchSections(db, { slug })
  ]);

  const [card, storedSections, basicsRun, analysisRun] = await Promise.all([
    findCardBySlug(db, slug, { allowStale: true }),
    findResearchSectionsBySlug(db, slug),
    findLatestGenerationRunStatusBySlug(db, slug, "basics"),
    findLatestGenerationRunStatusBySlug(db, slug, "analysis")
  ]);
  const sections = storedSections.length > 0 ? storedSections : card ? deriveResearchSectionsFromCard(card) : [];
  const metrics: ServerTimingMetric[] = [
    { name: "db", durationMs: elapsedMs(dbStartedAt) },
    { name: "total", durationMs: elapsedMs(startedAt) }
  ];

  return apiJsonWithTiming(
    {
      domain,
      slug,
      card,
      sections,
      runs: {
        basics: basicsRun ? serializeRun(basicsRun) : idleRun(slug, domain, "basics"),
        analysis: analysisRun ? serializeRun(analysisRun) : idleRun(slug, domain, "analysis")
      }
    },
    metrics
  );
}
