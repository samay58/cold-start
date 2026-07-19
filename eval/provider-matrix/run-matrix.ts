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

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore plain JS helper shared with scripts/run-next.mjs
import { loadRepoRootEnv } from "../../scripts/load-root-env.mjs";
import type Anthropic from "@anthropic-ai/sdk";
import {
  RESEARCH_SECTION_DEFINITIONS_BY_ID,
  type GenerationLlmCallTrace,
  type ResearchSectionContent,
  type ResearchSectionId,
  type SourcedText,
} from "@cold-start/core";
import {
  createAnthropicClient,
  extractCompanyBlockClaims,
  extractCompanyClaims,
  fallbackResearchPlan,
  parseModelString,
  synthesizeCard,
  synthesizeResearchSection,
  verifySynthesis,
  type BlockEnrichmentId,
} from "@cold-start/llm";
import { buildEvidenceLedger } from "@cold-start/pipeline";
import type { ProviderSource } from "@cold-start/providers";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore score.mjs is plain JS shared with the node:test suite
import { aggregate, scoreExtraction, scoreResearchSection, scoreSynthesis, scoreVerify } from "./score.mjs";
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

type Stage = "extract_full" | "extract_block" | "verify" | "synthesis" | "research_section";

// VERIFY_JUDGE_MODEL is the fixed judge for the synthesis stage's paired synthesis+verify replay
// (see the synthesis cell below): every candidate's fresh synthesis gets judged by the SAME
// model, so the judge is never a variable when comparing candidates against each other. Override
// via --judge for a different fixed judge; deepseek-v4-flash is cheap enough that judge cost
// never dominates the comparison.
const VERIFY_JUDGE_MODEL = "deepseek/deepseek-v4-flash";

type CellResult = {
  slug: string;
  model: string;
  stage: Stage;
  block?: string;
  section?: string;
  attempt: number;
  ok: boolean;
  retried: boolean;
  error?: string;
  durationMs: number;
  costUsd: number | null;
  // Set only on synthesis cells: the paired verify judge's own cost, kept separate from costUsd
  // (candidate cost) so a model's price/performance row never silently includes judge spend.
  judgeCostUsd?: number | null;
  score?: ReturnType<typeof scoreExtraction> | ReturnType<typeof scoreVerify> | ReturnType<typeof scoreSynthesis> | ReturnType<typeof scoreResearchSection>;
  // Set only on synthesis and research_section cells (captureOutput): the raw generated content,
  // read by writeSideBySide for the blind read. Extraction cells never carry this; their sections
  // objects are large enough that persisting them per cell would bloat results.json for no reader.
  output?: unknown;
};

// Takes the synthesis object directly (not the whole card) so the same helper covers both the
// verify stage's production-card claims and the synthesis stage's freshly generated claims.
function synthesisClaims(synthesis: ProviderMatrixFixture["card"]["synthesis"]): SourcedText[] {
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

function normalizedUrlKey(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    url.search = "";
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.toString().toLowerCase();
  } catch {
    return value.toLowerCase();
  }
}

// Mirrors evidenceForSection in apps/web/src/inngest/research-section-generation.ts exactly: same
// URL-normalization key, same rawText-or-snippet fallback, same drop-when-blank rule. Kept as a
// faithful copy rather than a shared import because the production function is typed against the
// DB row shape (findSourcesBySlug) and this one runs offline against frozen fixture JSON; the two
// shapes are structurally compatible but not the same type.
function evidenceForSection(fixture: ProviderMatrixFixture) {
  const sourcesByUrl = new Map(fixture.sources.map((source) => [normalizedUrlKey(source.url), source]));

  return fixture.card.citations.flatMap((citation) => {
    const source = sourcesByUrl.get(normalizedUrlKey(citation.url));
    const text = source?.rawText || citation.snippet || "";
    if (!text.trim()) {
      return [];
    }

    return [
      {
        citationId: citation.id,
        url: citation.url,
        title: citation.title,
        sourceType: citation.sourceType,
        text,
      },
    ];
  });
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

function labelForIndex(index: number): string {
  return `Output ${String.fromCharCode(65 + index)}`;
}

function renderSynthesisOutput(synthesis: NonNullable<ProviderMatrixFixture["card"]["synthesis"]>): string {
  const lines = [`Why it matters: ${synthesis.whyItMatters.text}`, "", "Bull case:"];
  for (const claim of synthesis.bullCase) {
    lines.push(`- ${claim.text}`);
  }
  if (synthesis.bullCase.length === 0) {
    lines.push("- (none)");
  }
  lines.push("", "Bear case:");
  for (const claim of synthesis.bearCase) {
    lines.push(`- ${claim.text}`);
  }
  if (synthesis.bearCase.length === 0) {
    lines.push("- (none)");
  }
  lines.push("", "Open questions:");
  for (const question of synthesis.openQuestions) {
    lines.push(`- [${question.category ?? "uncategorized"}] ${question.question}`);
  }
  return lines.join("\n");
}

function renderResearchSectionOutput(content: ResearchSectionContent): string {
  const lines = [`Status: ${content.status}`, `Summary: ${content.summary ?? "(none)"}`, "", "Items:"];
  for (const item of content.items) {
    lines.push(`- ${item.label}: ${item.text}${item.meta ? ` (${item.meta})` : ""}`);
  }
  if (content.items.length === 0) {
    lines.push("- (none)");
  }
  return lines.join("\n");
}

type SideBySideEntry = { fixture: string; stage: string; section?: string; label: string; model: string };

// Blind quality eyeball before any routing decision: side-by-side.md groups every judgment-stage
// cell by (fixture, stage, section) and renders each participating model's output under an
// anonymous "Output A"/"Output B"/... label. Label order is a hash of (fixture slug + model), not
// alphabetical model name or arrival order, so nothing about the label hints at which model wrote
// it and the order differs across fixtures (a reader cannot learn "A is always Claude" from one
// fixture and carry that assumption into the next). answer-key.json is the only place the mapping
// is written; read the outputs before opening the key.
async function writeSideBySide(results: CellResult[], runDir: string): Promise<void> {
  const groups = new Map<string, CellResult[]>();
  for (const result of results) {
    if (!result.ok || result.attempt !== 0 || (result.stage !== "synthesis" && result.stage !== "research_section")) {
      continue;
    }
    const key = [result.slug, result.stage, result.section ?? ""].join("::");
    const bucket = groups.get(key) ?? [];
    bucket.push(result);
    groups.set(key, bucket);
  }

  if (groups.size === 0) {
    return;
  }

  const answerKey: SideBySideEntry[] = [];
  const lines = ["# Provider Matrix Blind Side-by-Side", "", "Blind quality eyeball before any routing decision. Read outputs before the key.", ""];

  for (const [key, cells] of groups) {
    const [slug, stage, section] = key.split("::");
    const ordered = [...cells].sort((a, b) => {
      const hashFor = (cell: CellResult) => createHash("sha1").update(`${slug}${cell.model}`).digest("hex");
      return hashFor(a).localeCompare(hashFor(b));
    });

    lines.push(`## ${slug} / ${stage}${section ? ` / ${section}` : ""}`, "");
    ordered.forEach((cell, index) => {
      const label = labelForIndex(index);
      answerKey.push({ fixture: slug, stage, ...(section ? { section } : {}), label, model: cell.model });
      const rendered =
        stage === "synthesis"
          ? renderSynthesisOutput((cell.output as { synthesis: NonNullable<ProviderMatrixFixture["card"]["synthesis"]> }).synthesis)
          : renderResearchSectionOutput(cell.output as ResearchSectionContent);
      lines.push(`### ${label}`, "", rendered, "");
    });
  }

  await writeFile(path.join(runDir, "side-by-side.md"), lines.join("\n"));
  await writeFile(path.join(runDir, "answer-key.json"), JSON.stringify(answerKey, null, 2));
}

async function main() {
  loadRepoRootEnv();

  const models = listArg("--models", ["claude-sonnet-4-6", "claude-haiku-4-5", "deepseek/deepseek-v4-flash"]);
  const stages = listArg("--stages", ["extract_full", "extract_block", "verify"]) as Stage[];
  const k = Number(argValue("--k", "1"));
  const concurrency = Number(argValue("--concurrency", "4"));
  const limit = Number(argValue("--limit", "100"));
  const judgeModel = argValue("--judge", VERIFY_JUDGE_MODEL);
  const sectionIds = listArg("--sections", ["customer_proof", "financing"]) as ResearchSectionId[];

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

  const needsAnthropic =
    models.some((model) => parseModelString(model).provider === "anthropic") ||
    (stages.includes("synthesis") && parseModelString(judgeModel).provider === "anthropic");
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
    const claims = synthesisClaims(fixture.card.synthesis);
    const citationSources = fixture.card.citations.map((citation) => ({
      id: citation.id,
      url: citation.url,
      title: citation.title,
      ...(citation.snippet ? { snippet: citation.snippet } : {}),
    }));
    const blocks = (fixture.reference.blocksRun.length > 0 ? fixture.reference.blocksRun : ["funding"]) as BlockEnrichmentId[];
    const researchSectionEvidence = stages.includes("research_section") ? evidenceForSection(fixture) : [];
    const researchSectionEvidenceCitationIds = researchSectionEvidence.map((source) => source.citationId);
    if (stages.includes("research_section") && researchSectionEvidence.length === 0) {
      console.log(`skip research_section for ${fixture.slug}: no evidence`);
    }

    for (const model of models) {
      for (let attempt = 0; attempt < k; attempt += 1) {
        const makeCell = (
          stage: Stage,
          block: BlockEnrichmentId | undefined,
          run: (telemetry: (call: GenerationLlmCallTrace) => void) => Promise<unknown>,
          options: { section?: string; captureOutput?: boolean } = {}
        ) => {
          tasks.push(async (): Promise<CellResult> => {
            const calls: GenerationLlmCallTrace[] = [];
            const startedAt = Date.now();
            const base = {
              slug: fixture.slug,
              model,
              stage,
              ...(block ? { block } : {}),
              ...(options.section ? { section: options.section } : {}),
              attempt,
            };
            try {
              const output = await run((call) => calls.push(call));
              const costs = calls.map((call) => call.estimatedCostUsd).filter((cost): cost is number => typeof cost === "number");
              const score =
                stage === "verify"
                  ? scoreVerify({ results: output, claims })
                  : stage === "research_section"
                    ? scoreResearchSection({ content: output, evidenceCitationIds: researchSectionEvidenceCitationIds })
                    : scoreExtraction({ sections: output, bundleSourceUrls, bundleText, companyDomain: fixture.domain });
              return {
                ...base,
                ok: true,
                retried: calls.filter((call) => call.status === "ok").length > 1,
                durationMs: Date.now() - startedAt,
                costUsd: costs.length > 0 ? Number(costs.reduce((sum, cost) => sum + cost, 0).toFixed(6)) : null,
                score,
                ...(options.captureOutput ? { output } : {}),
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

        // Paired synthesis+verify replay: a fresh synthesizeCard call, then an immediate
        // verifySynthesis judge pass over that candidate's OWN claims using a fixed judge model.
        // This is the false-keep direction the plain verify replay above cannot see: verify above
        // only replays the production card's SURVIVING claims, so it can only disagree by
        // dropping (false-drop). Here, a false-keep shows up as a high verifierSurvivalRate over
        // claims the judge should have rejected.
        if (stages.includes("synthesis")) {
          tasks.push(async (): Promise<CellResult> => {
            const candidateCalls: GenerationLlmCallTrace[] = [];
            const judgeCalls: GenerationLlmCallTrace[] = [];
            const startedAt = Date.now();
            const base = { slug: fixture.slug, model, stage: "synthesis" as const, attempt };
            const sumCost = (traces: GenerationLlmCallTrace[]) => {
              const costs = traces.map((call) => call.estimatedCostUsd).filter((cost): cost is number => typeof cost === "number");
              return costs.length > 0 ? Number(costs.reduce((sum, cost) => sum + cost, 0).toFixed(6)) : null;
            };
            try {
              const freshSynthesis = await synthesizeCard({
                client: anthropic,
                model,
                card: fixture.card,
                telemetry: (call) => candidateCalls.push(call),
              });
              const freshClaims = synthesisClaims(freshSynthesis);
              const verifierResults =
                freshClaims.length > 0
                  ? await verifySynthesis({
                      client: anthropic,
                      model: judgeModel,
                      claims: freshClaims,
                      sources: citationSources,
                      telemetry: (call) => judgeCalls.push(call),
                    })
                  : [];
              const cardCitationIds = fixture.card.citations.map((citation) => citation.id);
              return {
                ...base,
                ok: true,
                retried: candidateCalls.filter((call) => call.status === "ok").length > 1,
                durationMs: Date.now() - startedAt,
                costUsd: sumCost(candidateCalls),
                judgeCostUsd: sumCost(judgeCalls),
                score: scoreSynthesis({ synthesis: freshSynthesis, verifierResults, cardCitationIds }),
                output: { synthesis: freshSynthesis, verifierResults },
              };
            } catch (error) {
              return {
                ...base,
                ok: false,
                retried: candidateCalls.length > 1,
                error: (error instanceof Error ? error.message : String(error)).slice(0, 300),
                durationMs: Date.now() - startedAt,
                costUsd: sumCost(candidateCalls),
                judgeCostUsd: sumCost(judgeCalls),
              };
            }
          });
        }

        if (stages.includes("research_section") && researchSectionEvidence.length > 0) {
          for (const sectionId of sectionIds) {
            makeCell(
              "research_section",
              undefined,
              (telemetry) =>
                synthesizeResearchSection({
                  client: anthropic,
                  definition: RESEARCH_SECTION_DEFINITIONS_BY_ID[sectionId],
                  evidence: researchSectionEvidence,
                  model,
                  company: { domain: fixture.domain, name: fixture.card.identity.name.value ?? fixture.domain },
                  telemetry,
                }),
              { section: sectionId, captureOutput: true }
            );
          }
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

  await writeSideBySide(results, runDir);

  const lines = [
    "# Provider Matrix Report",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Fixtures: ${fixtures.map((fixture) => fixture.slug).join(", ")}`,
    `Repeats per cell: ${k}`,
    "",
    "| Model | Stage | Cells | Parse ok | Retried | Median cost | Median latency | Citation violations (med) | Funding match (med) | Fill rate (med) | Distinct events (med) | False-drop (med) |",
    "|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
  ];

  // Judgment-stage cells score with scoreSynthesis/scoreResearchSection shapes; they render in their own table below.
  const extractionTableStages = stages.filter(
    (stage) => stage === "extract_full" || stage === "extract_block" || stage === "verify"
  );

  for (const model of models) {
    for (const stage of extractionTableStages) {
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
          // Distinct-event ratio: 1 means one signal per event; one-signal-per-article regresses
          // toward 0 and must never pass the matrix silently again.
          fmt(aggregate(extractionScores.map((score) => score.signalRedundancy.distinctEventRatio))),
          fmt(aggregate(verifyScores.map((score) => score.falseDropRate))),
        ].join(" | ").replace(/^/, "| ").replace(/$/, " |")
      );
    }
  }

  const judgmentStages = stages.filter((stage): stage is "synthesis" | "research_section" => stage === "synthesis" || stage === "research_section");
  if (judgmentStages.length > 0) {
    lines.push(
      "",
      "## Judgment Stages",
      "",
      "| Model | Stage | Cells | Parse ok | Median candidate cost | Median latency | Survival (med) | Generic phrases (med) | Empty rate | Citation violations (med) |",
      "|---|---|---:|---:|---:|---:|---:|---:|---:|---:|"
    );

    for (const model of models) {
      for (const stage of judgmentStages) {
        const cells = results.filter((result) => result.model === model && result.stage === stage);
        if (cells.length === 0) {
          continue;
        }
        const okCells = cells.filter((cell) => cell.ok);
        const synthesisScores = okCells
          .map((cell) => cell.score)
          .filter((score): score is ReturnType<typeof scoreSynthesis> => Boolean(score) && stage === "synthesis");
        const sectionScores = okCells
          .map((cell) => cell.score)
          .filter((score): score is ReturnType<typeof scoreResearchSection> => Boolean(score) && stage === "research_section");
        const survivalStats = stage === "synthesis" ? aggregate(synthesisScores.map((score) => score.verifierSurvivalRate)) : null;
        const genericPhraseCounts = stage === "synthesis" ? synthesisScores.map((score) => score.genericPhraseCount) : sectionScores.map((score) => score.genericPhraseCount);
        const citationViolationCounts =
          stage === "synthesis"
            ? synthesisScores.map((score) => score.citationMarkerViolations.length)
            : sectionScores.map((score) => score.citationIdViolations.length);
        const emptyCount =
          stage === "synthesis"
            ? synthesisScores.filter((score) => score.claimCounts.bullCase === 0 && score.claimCounts.bearCase === 0).length
            : sectionScores.filter((score) => score.status === "empty").length;
        const emptyRate = okCells.length > 0 ? emptyCount / okCells.length : 0;
        const fmt = (stats: { median: number } | null, digits = 4) => (stats ? stats.median.toFixed(digits) : "-");

        lines.push(
          [
            model,
            stage,
            String(cells.length),
            `${okCells.length}/${cells.length}`,
            fmt(aggregate(okCells.map((cell) => cell.costUsd)), 5),
            `${fmt(aggregate(okCells.map((cell) => cell.durationMs)), 0)}ms`,
            fmt(survivalStats),
            fmt(aggregate(genericPhraseCounts), 1),
            `${(emptyRate * 100).toFixed(0)}%`,
            fmt(aggregate(citationViolationCounts), 1),
          ].join(" | ").replace(/^/, "| ").replace(/$/, " |")
        );
      }
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
    "- Verify replays (the `verify` stage) run against the production card's surviving synthesis claims, so disagreement there is the false-DROP direction only.",
    `- The \`synthesis\` stage closes the false-keep gap: it pairs a fresh synthesizeCard call with an immediate verifySynthesis judge pass (fixed judge: ${judgeModel}) over the candidate's own claims, so a false-keep shows up as a high verifierSurvivalRate over claims the judge should have rejected.`,
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
