import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { callAnthropicBaseline, callSakanaResponses, metricsFromError, parseJsonOutput, writeRunArtifacts } from "./harness.mjs";
import { buildTopTruthsPrompt, hashJson, normalizeSourceBundle } from "./prompt.mjs";
import { scoreTopTruthsOutput } from "./score.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultModels = ["baseline", "fugu-mini", "fugu-ultra"];

function argValue(name, fallback = undefined) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
}

function hasArg(name) {
  return process.argv.includes(name);
}

function listArg(name, fallback) {
  return String(argValue(name, fallback.join(",")))
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

async function loadFixture(slug) {
  const fixturePath = path.join(__dirname, "fixtures", `${slug}-source-bundle.json`);
  const bundle = JSON.parse(await readFile(fixturePath, "utf8"));
  return { fixturePath, bundle: normalizeSourceBundle(bundle) };
}

async function runModel({ label, prompt, timeouts }) {
  const startedAt = Date.now();
  try {
    const response =
      label === "baseline"
        ? await callAnthropicBaseline({ prompt, timeoutMs: timeouts.baseline })
        : await callSakanaResponses({ model: label, prompt, timeoutMs: timeouts[label] });
    const output = parseJsonOutput(response.text);
    const score = scoreTopTruthsOutput(output);
    return {
      label,
      model: response.metrics.model ?? label,
      raw: response.raw,
      text: response.text,
      output,
      score,
      metrics: response.metrics,
    };
  } catch (error) {
    return {
      label,
      model: label,
      raw: { error: error instanceof Error ? error.message : String(error) },
      text: "",
      error: error instanceof Error ? error.message : String(error),
      metrics: metricsFromError({ model: label, latencyMs: Date.now() - startedAt }),
    };
  }
}

async function main() {
  const fixture = argValue("--fixture", "browserbase");
  const models = listArg("--models", defaultModels);
  const { fixturePath, bundle } = await loadFixture(fixture);
  const prompt = buildTopTruthsPrompt(bundle);
  const sourceBundleHash = hashJson(bundle);
  const promptHash = hashJson({ prompt });
  const runId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${fixture}`;
  const outputRoot = argValue("--output-dir", path.join(__dirname, "runs"));
  const runDir = path.join(outputRoot, runId);
  const timeouts = {
    baseline: Number(argValue("--timeout-baseline-ms", "120000")),
    "fugu-mini": Number(argValue("--timeout-mini-ms", "45000")),
    "fugu-ultra": Number(argValue("--timeout-ultra-ms", "300000")),
  };

  const run = {
    id: runId,
    company: bundle.company,
    fixturePath,
    models,
    sourceBundleHash,
    promptHash,
    generatedAt: new Date().toISOString(),
  };

  if (hasArg("--dry-run")) {
    console.log(
      JSON.stringify(
        {
          run,
          sourceCount: bundle.sources.length,
          promptChars: prompt.length,
          dryRun: true,
        },
        null,
        2,
      ),
    );
    if (hasArg("--print-prompt")) {
      console.log("\n--- PROMPT ---\n");
      console.log(prompt);
    }
    return;
  }

  await mkdir(runDir, { recursive: true });
  const results = await Promise.all(models.map((label) => runModel({ label, prompt, timeouts })));
  const summary = await writeRunArtifacts({ runDir, run, results });
  console.log(`Wrote ${path.join(runDir, "summary.md")}`);
  console.log(
    summary.results
      .map((result) => {
        const score = result.score ? `${result.score.total}/${result.score.maxTotal}` : "parse failed";
        return `${result.label}: ${score}`;
      })
      .join("\n"),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
