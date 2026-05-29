import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { callAnthropicBaseline, callSakanaResponses, metricsFromError, parseJsonOutput } from "./harness.mjs";
import { buildTopTruthsPrompt, hashJson, normalizeSourceBundle } from "./prompt.mjs";
import { scoreTopTruthsOutput } from "./score.mjs";

// The pre-June-7 Fugu burn. Runs every messy fixture through baseline + fugu-mini + fugu-ultra,
// k repeats each, on the IDENTICAL frozen bundle per company (retrieval-fair, part 7). Separates
// model quality from run variance by reporting median + spread, and tracks Fugu token consumption
// so we can see how much of the expiring beta quota each pass spends.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_MODELS = ["baseline", "fugu-mini", "fugu-ultra"];

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
}
function listArg(name, fallback) {
  return String(argValue(name, fallback.join(","))).split(",").map((item) => item.trim()).filter(Boolean);
}
function slugForDomain(domain) {
  return String(domain).replace(/^https?:\/\//i, "").replace(/^www\./i, "").split("/")[0].split(".")[0].toLowerCase();
}

const TIMEOUTS = {
  baseline: Number(argValue("--timeout-baseline-ms", "120000")),
  "fugu-mini": Number(argValue("--timeout-mini-ms", "60000")),
  "fugu-ultra": Number(argValue("--timeout-ultra-ms", "300000")),
};

async function callModel(label, prompt) {
  if (label === "baseline") return callAnthropicBaseline({ prompt, timeoutMs: TIMEOUTS.baseline });
  return callSakanaResponses({ model: label, prompt, timeoutMs: TIMEOUTS[label] });
}

async function runCell(task) {
  const startedAt = Date.now();
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await callModel(task.model, task.prompt);
      const output = parseJsonOutput(response.text);
      const score = scoreTopTruthsOutput(output, task.bundle);
      return { ...task.meta, ok: true, score, metrics: response.metrics, text: response.text, raw: response.raw };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const transient = /timeout|aborted|fetch failed|ECONN|network|50\d|429/i.test(message);
      if (attempt === 0 && transient) continue;
      return { ...task.meta, ok: false, error: message, metrics: metricsFromError({ model: task.model, latencyMs: Date.now() - startedAt }) };
    }
  }
  return { ...task.meta, ok: false, error: "exhausted retries", metrics: metricsFromError({ model: task.model, latencyMs: Date.now() - startedAt }) };
}

async function runPool(tasks, concurrency, worker, onDone) {
  const results = new Array(tasks.length);
  let next = 0;
  let completed = 0;
  async function lane() {
    while (true) {
      const index = next++;
      if (index >= tasks.length) return;
      results[index] = await worker(tasks[index]);
      completed += 1;
      onDone?.(results[index], completed, tasks.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, lane));
  return results;
}

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const median = (xs) => {
  if (!xs.length) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const stdev = (xs) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
};
const round = (x, n = 2) => Number.isFinite(x) ? Number(x.toFixed(n)) : x;

function aggregateByModel(results, models) {
  const summary = {};
  for (const model of models) {
    const rows = results.filter((r) => r.model === model);
    const ok = rows.filter((r) => r.ok);
    const totals = ok.map((r) => r.score.total);
    const integrity = ok.map((r) => r.score.integrity?.score ?? 0);
    const latencies = ok.map((r) => r.metrics?.latencyMs).filter((x) => Number.isFinite(x));
    const totalTokens = rows.map((r) => r.metrics?.totalTokens).filter((x) => Number.isFinite(x));
    const reasoningTokens = ok.map((r) => r.raw?.usage?.output_tokens_details?.reasoning_tokens ?? 0);
    const keep = { yes: 0, conditional: 0, no: 0 };
    for (const r of ok) keep[r.score.keepSignal] = (keep[r.score.keepSignal] ?? 0) + 1;
    const dimMeans = {};
    for (const key of ["rankingDiscipline", "supportQuality", "exclusionDiscipline", "conflictHandling", "fillerControl"]) {
      dimMeans[key] = round(mean(ok.map((r) => r.score.dimensions[key]?.score ?? 0)));
    }
    summary[model] = {
      runs: rows.length,
      ok: ok.length,
      errors: rows.length - ok.length,
      total: { mean: round(mean(totals)), median: round(median(totals)), min: Math.min(...(totals.length ? totals : [0])), max: Math.max(...(totals.length ? totals : [0])), stdev: round(stdev(totals)) },
      dimensions: dimMeans,
      integrity: {
        meanScore: round(mean(integrity)),
        fabricationFreeRate: round(mean(ok.map((r) => (r.score.integrity?.fabricationFree ? 1 : 0)))),
        meanTruthsSupported: round(mean(ok.map((r) => r.score.integrity?.truthsSupported ?? 0))),
        meanTotalTruths: round(mean(ok.map((r) => r.score.integrity?.totalTruths ?? 0))),
      },
      keepSignal: keep,
      latencyMs: { mean: Math.round(mean(latencies)), median: Math.round(median(latencies)), min: latencies.length ? Math.min(...latencies) : 0, max: latencies.length ? Math.max(...latencies) : 0 },
      tokens: { sumTotal: totalTokens.reduce((a, b) => a + b, 0), sumReasoning: reasoningTokens.reduce((a, b) => a + b, 0), meanTotal: Math.round(mean(totalTokens)) },
    };
  }
  return summary;
}

function perCompanyTable(results, companies, models) {
  return companies.map((company) => {
    const row = { company: company.name, slug: company.slug };
    for (const model of models) {
      const ok = results.filter((r) => r.slug === company.slug && r.model === model && r.ok);
      row[model] = ok.length ? { medianTotal: round(median(ok.map((r) => r.score.total))), medianIntegrity: round(median(ok.map((r) => r.score.integrity?.score ?? 0))) } : null;
    }
    return row;
  });
}

function renderMarkdown({ run, summary, perCompany, models }) {
  const lines = [
    "# Fugu Top-Truths Burn (messy set)",
    "",
    `Generated: ${run.generatedAt}`,
    `Companies: ${run.companyCount} | Models: ${models.join(", ")} | Repeats: ${run.repeats} | Cells: ${run.cellCount}`,
    `Fairness: each company uses one frozen bundle reused across all models (retrieval held constant; deltas are model + run variance only).`,
    "",
    "## Fugu quota consumed this run",
    "",
    "| Model | runs | total tokens | reasoning tokens |",
    "|---|---:|---:|---:|",
  ];
  for (const model of models.filter((m) => m.startsWith("fugu"))) {
    const s = summary[model];
    lines.push(`| ${model} | ${s.ok}/${s.runs} | ${s.tokens.sumTotal.toLocaleString()} | ${s.tokens.sumReasoning.toLocaleString()} |`);
  }
  const fuguTotal = models.filter((m) => m.startsWith("fugu")).reduce((sum, m) => sum + summary[m].tokens.sumTotal, 0);
  lines.push("", `Fugu tokens this run: **${fuguTotal.toLocaleString()}**.`, "");

  lines.push(
    "## Leaderboard (median over repeats)",
    "",
    "| Model | n | median /15 | mean | spread (sd) | min-max | integrity /3 | fabrication-free | median latency | keep y/c/n |",
    "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
  );
  for (const model of models) {
    const s = summary[model];
    lines.push(
      `| ${model} | ${s.ok} | ${s.total.median} | ${s.total.mean} | ${s.total.stdev} | ${s.total.min}-${s.total.max} | ${s.integrity.meanScore} | ${(s.integrity.fabricationFreeRate * 100).toFixed(0)}% | ${(s.latencyMs.median / 1000).toFixed(1)}s | ${s.keepSignal.yes}/${s.keepSignal.conditional}/${s.keepSignal.no} |`,
    );
  }

  lines.push("", "### Dimension means (/3)", "", "| Model | ranking | support | exclusion | conflict | filler |", "|---|---:|---:|---:|---:|---:|");
  for (const model of models) {
    const d = summary[model].dimensions;
    lines.push(`| ${model} | ${d.rankingDiscipline} | ${d.supportQuality} | ${d.exclusionDiscipline} | ${d.conflictHandling} | ${d.fillerControl} |`);
  }

  lines.push("", "## Per-company median total (and integrity)", "", `| Company | ${models.join(" | ")} |`, `|---|${models.map(() => "---:").join("|")}|`);
  for (const row of perCompany) {
    const cells = models.map((m) => (row[m] ? `${row[m].medianTotal} (i${row[m].medianIntegrity})` : "—"));
    lines.push(`| ${row.company} | ${cells.join(" | ")} |`);
  }

  lines.push(
    "",
    "## How to read this",
    "",
    "- median /15 is the structural rubric (ranking, support, exclusion, conflict, filler). integrity /3 is the separate citation axis (no fabricated refs + cited sources actually contain the claim's numbers/terms). A model can win one and lose the other.",
    "- A total gap smaller than the spread (sd) is run noise, not a model difference. Only trust deltas larger than the spread.",
    "- baseline = the production section model (Sonnet). Fugu-ultra is the orchestration model; reasoning tokens show its hidden multi-pass work.",
    "",
  );
  return `${lines.join("\n")}\n`;
}

async function main() {
  const models = listArg("--models", DEFAULT_MODELS);
  const repeats = Number(argValue("--repeats", "5"));
  const concurrency = Number(argValue("--concurrency", "4"));
  const companiesPath = path.resolve(argValue("--companies", path.join(__dirname, "companies.messy.json")));
  const fixturesDir = path.resolve(argValue("--fixtures-dir", path.join(__dirname, "fixtures")));
  const limit = Number(argValue("--limit", "0"));

  const parsed = JSON.parse(await readFile(companiesPath, "utf8"));
  let companyList = (Array.isArray(parsed) ? parsed : parsed.companies ?? []).map((c) => ({ ...c, slug: slugForDomain(c.domain) }));
  if (limit > 0) companyList = companyList.slice(0, limit);

  // Load frozen bundles + build the prompt once per company.
  const companies = [];
  for (const company of companyList) {
    const fixturePath = path.join(fixturesDir, `${company.slug}-source-bundle.json`);
    try {
      const bundle = normalizeSourceBundle(JSON.parse(await readFile(fixturePath, "utf8")));
      companies.push({ ...company, bundle, prompt: buildTopTruthsPrompt(bundle), bundleHash: hashJson(bundle) });
    } catch (error) {
      console.warn(`Skipping ${company.slug}: ${error instanceof Error ? error.message : error}`);
    }
  }
  if (companies.length === 0) throw new Error("No bundles loaded. Run build-bundles.mjs first.");

  const tasks = [];
  for (const company of companies) {
    for (const model of models) {
      for (let repeat = 0; repeat < repeats; repeat += 1) {
        tasks.push({
          model,
          prompt: company.prompt,
          bundle: company.bundle,
          meta: { slug: company.slug, company: company.name, model, repeat, bundleHash: company.bundleHash },
        });
      }
    }
  }

  const runId = `${new Date().toISOString().replace(/[:.]/g, "-")}-messy-matrix`;
  const runDir = path.join(argValue("--output-dir", path.join(__dirname, "runs")), runId);
  const rawDir = path.join(runDir, "raw");
  await mkdir(rawDir, { recursive: true });

  console.log(`Burn: ${companies.length} companies x ${models.length} models x ${repeats} repeats = ${tasks.length} cells (concurrency ${concurrency})`);
  console.log(`Run dir: ${runDir}\n`);

  const startedAt = Date.now();
  const results = await runPool(tasks, concurrency, runCell, (result, done, total) => {
    const tag = result.ok ? `${result.score.total}/15 i${result.score.integrity?.score ?? "-"}` : `ERR ${String(result.error).slice(0, 40)}`;
    process.stdout.write(`[${done}/${total}] ${result.company} ${result.model} r${result.repeat}: ${tag}\n`);
  });

  // Persist raw outputs (text only, to keep the dir lean; full provider JSON for one repeat per cell).
  await Promise.all(results.map(async (result) => {
    const base = `${result.slug}__${result.model}__r${result.repeat}`;
    if (result.ok) {
      await writeFile(path.join(rawDir, `${base}.txt`), result.text ?? "");
      if (result.repeat === 0) await writeFile(path.join(rawDir, `${base}.json`), JSON.stringify(result.raw, null, 2));
    } else {
      await writeFile(path.join(rawDir, `${base}.error.txt`), String(result.error ?? "unknown"));
    }
  }));

  const summary = aggregateByModel(results, models);
  const perCompany = perCompanyTable(results, companies, models);
  const run = {
    id: runId,
    generatedAt: new Date().toISOString(),
    elapsedMs: Date.now() - startedAt,
    companyCount: companies.length,
    repeats,
    cellCount: tasks.length,
    models,
    bundleHashes: Object.fromEntries(companies.map((c) => [c.slug, c.bundleHash])),
  };

  const scored = results.map((r) => ({ slug: r.slug, company: r.company, model: r.model, repeat: r.repeat, ok: r.ok, total: r.ok ? r.score.total : null, integrity: r.ok ? r.score.integrity : null, dimensions: r.ok ? r.score.dimensions : null, keepSignal: r.ok ? r.score.keepSignal : null, issues: r.ok ? r.score.issues : null, error: r.error ?? null, metrics: r.metrics }));
  await writeFile(path.join(runDir, "results.json"), JSON.stringify({ run, scored }, null, 2));
  await writeFile(path.join(runDir, "aggregate.json"), JSON.stringify({ run, summary, perCompany }, null, 2));
  await writeFile(path.join(runDir, "aggregate.md"), renderMarkdown({ run, summary, perCompany, models }));

  console.log(`\nDone in ${(run.elapsedMs / 1000 / 60).toFixed(1)} min. Report: ${path.join(runDir, "aggregate.md")}`);
  for (const model of models) {
    const s = summary[model];
    console.log(`  ${model}: median ${s.total.median}/15 (sd ${s.total.stdev}), integrity ${s.integrity.meanScore}/3, ${(s.latencyMs.median / 1000).toFixed(1)}s, ${s.tokens.sumTotal.toLocaleString()} tokens, ${s.errors} errors`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
