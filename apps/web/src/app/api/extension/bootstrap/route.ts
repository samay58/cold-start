import { companySlugFromDomain, mergeStoredResearchSectionsWithLegacy } from "@cold-start/core";
import {
  createDb,
  findCardBySlug,
  getAlphaAllowanceSnapshot,
  findLatestGenerationRunStatusBySlug,
  findResearchRunEventsBySlug,
  findResearchSectionsBySlug,
  findSourceSummariesBySlug,
  retireStaleResearchSections,
  type GenerationRunStatusSummary,
  type SourceSummary
} from "@cold-start/db";
import { apiJsonWithTiming, type ServerTimingMetric } from "../../../../lib/api-response";
import { alphaGenerationEnabled } from "../../../../lib/alpha-config";
import { canonicalCompanyDomain } from "../../../../lib/domain";
import { webEnv } from "../../../../lib/web-env";
import { boundedErrorMessage } from "../../../../lib/errors";
import {
  authenticateExtensionRequest,
  principalHasScope
} from "../../../../lib/extension-auth";
import { retireAndSettleStaleGenerationRuns, retireDeadGenerationRun } from "../../../../lib/generation-run-watchdog";

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

function compactSnippet(value: string | undefined, maxLength = 360) {
  const normalized = value?.replace(/\s+/g, " ").trim() ?? "";
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength).trimEnd()}...`;
}

function sourceDomain(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function citationSourceSummaries(card: Awaited<ReturnType<typeof findCardBySlug>>): SourceSummary[] {
  if (!card) {
    return [];
  }

  const citations = Array.isArray(card.citations) ? card.citations : [];
  return citations.map((citation) => ({
    id: `citation:${citation.id}`,
    url: citation.url,
    title: citation.title,
    domain: sourceDomain(citation.url),
    sourceType: citation.sourceType,
    fetchedAt: citation.fetchedAt,
    snippet: compactSnippet(citation.snippet)
  }));
}

function mergeSourceSummaries(primary: SourceSummary[], fallback: SourceSummary[], limit = 24) {
  const byUrl = new Map<string, SourceSummary>();
  for (const source of [...primary, ...fallback]) {
    if (!byUrl.has(source.url)) {
      byUrl.set(source.url, source);
    }
  }

  return Array.from(byUrl.values()).slice(0, limit);
}

export async function GET(request: Request) {
  const startedAt = performance.now();
  const db = createDb(webEnv().DATABASE_URL);
  const auth = await authenticateExtensionRequest(request.headers, db);

  if (!auth.ok) {
    return apiJsonWithTiming(
      { error: auth.error, code: auth.code },
      [{ name: "total", durationMs: elapsedMs(startedAt) }],
      { status: auth.status }
    );
  }
  if (!principalHasScope(auth.principal, "cards:read")) {
    return apiJsonWithTiming(
      { error: "card access is not allowed for this installation", code: "authorization" },
      [{ name: "total", durationMs: elapsedMs(startedAt) }],
      { status: 403 }
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

  await Promise.all([
    retireAndSettleStaleGenerationRuns(db, { slug, mode: "basics" }),
    retireAndSettleStaleGenerationRuns(db, { slug, mode: "analysis" }),
    retireStaleResearchSections(db, { slug })
  ]);

  const [card, storedSections, basicsRun, analysisRun, sources, events, allowance] = await Promise.all([
    findCardBySlug(db, slug, { allowStale: true }),
    findResearchSectionsBySlug(db, slug),
    findLatestGenerationRunStatusBySlug(db, slug, "basics", "basics"),
    findLatestGenerationRunStatusBySlug(db, slug, "analysis", "analysis"),
    findSourceSummariesBySlug(db, slug, { limit: 24 }),
    findResearchRunEventsBySlug(db, slug, { limit: 30 }).catch(() => []),
    auth.principal.kind === "alpha" && auth.principal.inviteId
      ? getAlphaAllowanceSnapshot(db, auth.principal.inviteId)
      : Promise.resolve(null)
  ]);
  const conflictingDomain = [
    card?.domain,
    basicsRun?.domain,
    analysisRun?.domain,
    ...storedSections.map((section) => section.domain)
  ].find((candidate) => candidate && candidate !== domain);
  if (conflictingDomain) {
    return apiJsonWithTiming(
      { error: "company domain conflicts with an existing card identity" },
      [
        { name: "db", durationMs: elapsedMs(dbStartedAt) },
        { name: "total", durationMs: elapsedMs(startedAt) }
      ],
      { status: 409 }
    );
  }
  const [settledBasics, settledAnalysis] = await Promise.all([
    basicsRun ? retireDeadGenerationRun(db, basicsRun) : null,
    analysisRun ? retireDeadGenerationRun(db, analysisRun) : null
  ]);
  const sections = mergeStoredResearchSectionsWithLegacy({ card, storedSections });
  const sourceSummaries = mergeSourceSummaries(sources, citationSourceSummaries(card));
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
      sources: sourceSummaries,
      events,
      ...(auth.principal.kind === "alpha"
        ? {
            alpha: {
              generationEnabled: alphaGenerationEnabled(),
              profile: allowance?.profile ?? null,
              lens: allowance?.lens ?? null
            }
          }
        : {}),
      runs: {
        basics: settledBasics ? serializeRun(settledBasics.run) : idleRun(slug, domain, "basics"),
        analysis: settledAnalysis ? serializeRun(settledAnalysis.run) : idleRun(slug, domain, "analysis")
      }
    },
    metrics
  );
}
