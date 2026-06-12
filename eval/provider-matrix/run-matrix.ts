#!/usr/bin/env tsx
// Provider price/performance matrix: replays the REAL production stage functions
// (extractCompanyClaims, extractCompanyBlockClaims, verifySynthesis) over frozen fixtures from
// build-bundles.ts, across a set of models, and scores each cell. Retrieval already happened in
// production, so a matrix run spends LLM tokens only — no AgentCash, no Exa.
//
// Usage:
//   set -a; source .env.local; set +a    # ANTHROPIC_API_KEY + DEEPSEEK_API_KEY as needed
//   npm run eval:providers:matrix -- \
//     --models "claude-sonnet-4-6,claude-haiku-4-5,deepseek/deepseek-v4-flash" \
//     --stages extract_full,extract_block,verify --k 3 --concurrency 4 --limit 10

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore plain JS helper shared with scripts/run-next.mjs
import { loadRepoRootEnv } from "../../scripts/load-root-env.mjs";
import type Anthropic from "@anthropic-ai/sdk";
import type { GenerationLlmCallTrace, SourcedText } from "@cold-start/core";
import {
  createAnthropicClient,
  extractCompanyBlockClaims,
  extractCompanyClaims,
  fallbackResearchPlan,
  parseModelString,
  verifySynthesis,
  type BlockEnrichmentId,
} from "@cold-start/llm";
import { buildEvidenceLedger } from "@cold-start/pipeline";
import type { ProviderSource } from "@cold-start/providers";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore score.mjs is plain JS shared with the node:test suite
import { aggregate, scoreExtraction, scoreVerify } from "./score.mjs";
import type { ProviderMatrixFixture } from "./build-bundles";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, "fixtures");
const runsDir = path.join(__dirname, "runs");

function argValue(name: string, fallback: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
}

function listArg(name: string, fallback: string[]) {
  const raw = argValue(name, "");
  const values = raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return values.length > 0 ? values : fallback;
}

type Stage = "extract_full" | "extract_block" | "verify";

type CellResult = {
  slug: string;
  model: string;
  stage: Stage;
  block?: string;
  attempt: number;
  ok: boolean;
  retried: boolean;
  error?: string;
  durationMs: number;
  costUsd: number | null;
  score?: ReturnType<typeof scoreExtraction> | ReturnType<typeof scoreVerify>;
};

function synthesisClaims(card: ProviderMatrixFixture["card"]): SourcedText[] {
  const synthesis = card.synthesis;
  if (!synthesis) {
    return [];
  }
  const market = synthesis.marketStructureAndTiming;
  const marketClaims = market
    ? [market.buyerBudget, market.painSeverity, market.adoptionTrigger, market.marketStructure, market.profitPool, market.expansionPath, market.timingRisk].filter(
        (claim): claim is SourcedText => claim !== null && claim !== undefined
      )
    : [];
  return [synthesis.whyItMatters, ...synthesis.bullCase, ...synthesis.bearCase, ...marketClaims];
}

async function runPool<T>(tasks: Array<() => Promise<T>>, concurrency: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, async () => {
    while (next < tasks.length) {
      const index = next;
      next += 1;
      results[index] = await tasks[index]();
    }
  });
  await Promise.all(workers);
  return results;
}

async function main() {
  loadRepoRootEnv();

  const models = listArg("--models", ["claude-sonnet-4-6", "claude-haiku-4-5", "deepseek/deepseek-v4-flash"]);
  const stages = listArg("--stages", ["extract_full", "extract_block", "verify"]) as Stage[];
  const k = Number(argValue("--k", "1"));
  const concurrency = Number(argValue("--concurrency", "4"));
  const limit = Number(argValue("--limit", "100"));

  if (!existsSync(fixturesDir)) {
    throw new Error(`No fixtures in ${fixturesDir}. Run eval:providers:bundles first.`);
  }
  const fixtureFiles = readdirSync(fixturesDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => path.join(fixturesDir, entry.name))
    .slice(0, limit);
  if (fixtureFiles.length === 0) {
    throw new Error(`No fixtures in ${fixturesDir}. Run eval:providers:bundles first.`);
  }
  const fixtures = fixtureFiles.map((file) => JSON.parse(readFileSync(file, "utf8")) as ProviderMatrixFixture);

  const needsAnthropic = models.some((model) => parseModelString(model).provider === "anthropic");
  // The chokepoint ignores `client` on non-Anthropic routes; a stub keeps all-DeepSeek runs
  // from demanding an ANTHROPIC_API_KEY they will not use.
  const anthropic = needsAnthropic ? createAnthropicClient() : ({} as Anthropic);

  const tasks: Array<() => Promise<CellResult>> = [];

  for (const fixture of fixtures) {
    const providerSources = fixture.sources as ProviderSource[];
    const evidenceLedger = buildEvidenceLedger({ domain: fixture.domain, sources: providerSources });
    const researchPlan = fallbackResearchPlan(fixture.domain);
    const bundleSourceUrls = fixture.sources.map((source) => source.url);
    const bundleText = fixture.sources.map((source) => source.rawText).join("\n");
    const claims = synthesisClaims(fixture.card);
    const citationSources = fixture.card.citations.map((citation) => ({
      id: citation.id,
      url: citation.url,
      title: citation.title,
      ...(citation.snippet ? { snippet: citation.snippet } : {}),
    }));
    const blocks = (fixture.reference.blocksRun.length > 0 ? fixture.reference.blocksRun : ["funding"]) as BlockEnrichmentId[];

    for (const model of models) {
      for (let attempt = 0; attempt < k; attempt += 1) {
        const makeCell = (stage: Stage, block: BlockEnrichmentId | undefined, run: (telemetry: (call: GenerationLlmCallTrace) => void) => Promise<unknown>) => {
          tasks.push(async (): Promise<CellResult> => {
            const calls: GenerationLlmCallTrace[] = [];
            const startedAt = Date.now();
            const base = {
              slug: fixture.slug,
              model,
              stage,
              ...(block ? { block } : {}),
              attempt,
            };
            try {
              const output = await run((call) => calls.push(call));
              const costs = calls.map((call) => call.estimatedCostUsd).filter((cost): cost is number => typeof cost === "number");
              const score =
                stage === "verify"
                  ? scoreVerify({ results: output, claims })
                  : scoreExtraction({ sections: output, bundleSourceUrls, bundleText });
              return {
                ...base,
                ok: true,
                retried: calls.filter((call) => call.status === "ok").length > 1,
                durationMs: Date.now() - startedAt,
                costUsd: costs.length > 0 ? Number(costs.reduce((sum, cost) => sum + cost, 0).toFixed(6)) : null,
                score,
              };
            } catch (error) {
              const costs = calls.map((call) => call.estimatedCostUsd).filter((cost): cost is number => typeof cost === "number");
              return {
                ...base,
                ok: false,
                retried: calls.length > 1,
                error: (error instanceof Error ? error.message : String(error)).slice(0, 300),
                durationMs: Date.now() - startedAt,
                costUsd: costs.length > 0 ? Number(costs.reduce((sum, cost) => sum + cost, 0).toFixed(6)) : null,
              };
            }
          });
        };

        if (stages.includes("extract_full")) {
          makeCell("extract_full", undefined, (telemetry) =>
            extractCompanyClaims({
              client: anthropic,
              model,
              evidence: { domain: fixture.domain, researchPlan, sources: providerSources, evidenceLedger },
              telemetry,
            })
          );
        }

        if (stages.includes("extract_block")) {
          for (const block of blocks) {
            makeCell("extract_block", block, (telemetry) =>
              extractCompanyBlockClaims({
                client: anthropic,
                model,
                block,
                evidence: { domain: fixture.domain, researchPlan, sources: providerSources, evidenceLedger },
                telemetry,
              })
            );
          }
        }

        if (stages.includes("verify") && claims.length > 0) {
          makeCell("verify", undefined, (telemetry) =>
            verifySynthesis({ client: anthropic, model, claims, sources: citationSources, telemetry })
          );
        }
      }
    }
  }

  console.log(`${tasks.length} cells: ${fixtures.length} fixtures x ${models.length} models, stages [${stages.join(", ")}], k=${k}`);
  const results = await runPool(tasks, concurrency);

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const runDir = path.join(runsDir, stamp);
  await mkdir(runDir, { recursive: true });
  await writeFile(path.join(runDir, "results.json"), JSON.stringify({ models, stages, k, fixtures: fixtures.map((fixture) => fixture.slug), results }, null, 2));

  const lines = [
    "# Provider Matrix Report",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Fixtures: ${fixtures.map((fixture) => fixture.slug).join(", ")}`,
    `Repeats per cell: ${k}`,
    "",
    "| Model | Stage | Cells | Parse ok | Retried | Median cost | Median latency | Citation violations (med) | Funding match (med) | Fill rate (med) | False-drop (med) |",
    "|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
  ];

  for (const model of models) {
    for (const stage of stages) {
      const cells = results.filter((result) => result.model === model && result.stage === stage);
      if (cells.length === 0) {
        continue;
      }
      const okCells = cells.filter((cell) => cell.ok);
      const extractionScores = okCells.map((cell) => cell.score).filter((score): score is ReturnType<typeof scoreExtraction> => Boolean(score) && stage !== "verify");
      const verifyScores = okCells.map((cell) => cell.score).filter((score): score is ReturnType<typeof scoreVerify> => Boolean(score) && stage === "verify");
      const fmt = (stats: { median: number } | null, digits = 4) => (stats ? stats.median.toFixed(digits) : "-");
      lines.push(
        [
          model,
          stage,
          String(cells.length),
          `${okCells.length}/${cells.length}`,
          String(cells.filter((cell) => cell.retried).length),
          fmt(aggregate(okCells.map((cell) => cell.costUsd)), 5),
          `${fmt(aggregate(okCells.map((cell) => cell.durationMs)), 0)}ms`,
          fmt(aggregate(extractionScores.map((score) => score.citationDiscipline.violationRate))),
          fmt(aggregate(extractionScores.map((score) => score.fundingFaithfulness.matchRate))),
          // Fill rate measures whole-card coverage; a single-block patch fills its block only.
          stage === "extract_full" ? fmt(aggregate(extractionScores.map((score) => score.fillRate.fillRate))) : "-",
          fmt(aggregate(verifyScores.map((score) => score.falseDropRate))),
        ].join(" | ").replace(/^/, "| ").replace(/$/, " |")
      );
    }
  }

  const failures = results.filter((result) => !result.ok);
  if (failures.length > 0) {
    lines.push("", "## Failures", "");
    for (const failure of failures) {
      lines.push(`- ${failure.model} / ${failure.stage}${failure.block ? `:${failure.block}` : ""} / ${failure.slug} (attempt ${failure.attempt}): ${failure.error}`);
    }
  }

  lines.push(
    "",
    "## Notes",
    "",
    "- Verify replays run against the production card's surviving synthesis claims, so disagreement is the false-DROP direction; false-keep needs a paired synthesis+verify replay.",
    "- Reference production baseline: see reference.llmCalls in each fixture for the original model, cost, and latency.",
    ""
  );

  await writeFile(path.join(runDir, "report.md"), lines.join("\n"));
  console.log(`\nreport: ${path.join(runDir, "report.md")}`);

  const totalCost = results.reduce((sum, result) => sum + (result.costUsd ?? 0), 0);
  console.log(`total matrix spend: $${totalCost.toFixed(4)} across ${results.length} cells (${failures.length} failures)`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
