import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import Anthropic from "@anthropic-ai/sdk";

import { scoreTopTruthsOutput } from "./score.mjs";

export function extractResponseText(payload) {
  if (typeof payload?.output_text === "string") {
    return payload.output_text;
  }

  const parts = [];
  for (const item of payload?.output ?? []) {
    for (const content of item?.content ?? []) {
      if ((content?.type === "output_text" || content?.type === "text") && typeof content.text === "string") {
        parts.push(content.text);
      }
    }
  }
  return parts.join("\n").trim();
}

export function metricsFromResponse(payload, { latencyMs }) {
  const usage = payload?.usage ?? {};
  return {
    responseId: typeof payload?.id === "string" ? payload.id : undefined,
    model: typeof payload?.model === "string" ? payload.model : undefined,
    latencyMs,
    inputTokens: numberOrUndefined(usage.input_tokens),
    outputTokens: numberOrUndefined(usage.output_tokens),
    totalTokens: numberOrUndefined(usage.total_tokens),
    estimatedCostUsd: null,
  };
}

export function metricsFromError({ model, latencyMs }) {
  return {
    model,
    latencyMs,
    inputTokens: undefined,
    outputTokens: undefined,
    totalTokens: undefined,
    estimatedCostUsd: null,
  };
}

export function parseJsonOutput(text) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) {
    throw new Error("empty model output");
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error("model output did not contain a JSON object");
    }
    return JSON.parse(match[0]);
  }
}

export async function callSakanaResponses({ model, prompt, apiKey = process.env.SAKANA_API_KEY, timeoutMs }) {
  if (!apiKey) {
    throw new Error("SAKANA_API_KEY is required");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs ?? (model === "fugu-ultra" ? 180_000 : 45_000));
  const startedAt = Date.now();

  try {
    const response = await fetch("https://api.sakana.ai/v1/responses", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, input: prompt }),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    const latencyMs = Date.now() - startedAt;

    if (!response.ok) {
      throw new Error(payload?.error?.message ?? payload?.error ?? `Sakana request failed with ${response.status}`);
    }

    return {
      raw: payload,
      text: extractResponseText(payload),
      metrics: metricsFromResponse(payload, { latencyMs }),
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function callAnthropicBaseline({
  prompt,
  apiKey = process.env.ANTHROPIC_API_KEY,
  model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6",
  timeoutMs = 120_000,
}) {
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is required for baseline runs");
  }

  const startedAt = Date.now();
  const client = new Anthropic({ apiKey, timeout: timeoutMs });
  const response = await client.messages.create({
    model,
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });
  const text = response.content
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("\n")
    .trim();
  const usage = response.usage ?? {};

  return {
    raw: response,
    text,
    metrics: {
      responseId: response.id,
      model,
      latencyMs: Date.now() - startedAt,
      inputTokens: numberOrUndefined(usage.input_tokens),
      outputTokens: numberOrUndefined(usage.output_tokens),
      totalTokens:
        Number.isFinite(usage.input_tokens) && Number.isFinite(usage.output_tokens)
          ? usage.input_tokens + usage.output_tokens
          : undefined,
      estimatedCostUsd: null,
    },
  };
}

export async function writeRunArtifacts({ runDir, run, results }) {
  const rawDir = path.join(runDir, "raw");
  await mkdir(rawDir, { recursive: true });

  const scoredResults = [];
  for (const result of results) {
    const rawPath = path.join(rawDir, `${result.label}.json`);
    const textPath = path.join(rawDir, `${result.label}.txt`);
    await writeFile(rawPath, JSON.stringify(result.raw, null, 2));
    await writeFile(textPath, result.text);
    scoredResults.push({ ...result, artifactPath: rawPath });
  }

  const summary = { run, results: scoredResults };
  await writeFile(path.join(runDir, "summary.json"), JSON.stringify(summary, null, 2));
  await writeFile(path.join(runDir, "summary.md"), renderMarkdownReport(summary));
  return summary;
}

export function renderMarkdownReport({ run, results }) {
  const lines = [
    "# Fugu Top-5 Truths Eval",
    "",
    `Generated: ${run.generatedAt}`,
    `Company: ${run.company.name} (${run.company.domain})`,
    `Source bundle hash: ${run.sourceBundleHash}`,
    `Prompt hash: ${run.promptHash}`,
    "",
    "| Model | Score | Keep | Latency | Input tokens | Output tokens | Total tokens | Cost |",
    "|---|---:|---|---:|---:|---:|---:|---:|",
  ];

  for (const result of results) {
    const score = result.score ?? (result.output ? scoreTopTruthsOutput(result.output) : null);
    lines.push(
      [
        result.label,
        score ? `${score.total}/${score.maxTotal}` : "parse failed",
        score?.keepSignal ?? "no",
        result.metrics?.latencyMs ?? "",
        result.metrics?.inputTokens ?? "",
        result.metrics?.outputTokens ?? "",
        result.metrics?.totalTokens ?? "",
        result.metrics?.estimatedCostUsd === null || result.metrics?.estimatedCostUsd === undefined
          ? "unknown"
          : `$${result.metrics.estimatedCostUsd.toFixed(4)}`,
      ].join(" | ").replace(/^/, "| ").replace(/$/, " |"),
    );
  }

  for (const result of results) {
    lines.push("", `## ${result.label}`, "");
    if (result.error) {
      lines.push(`Error: ${result.error}`, "");
      continue;
    }

    const score = result.score ?? scoreTopTruthsOutput(result.output);
    lines.push(`Score: ${score.total}/${score.maxTotal}`, `Keep signal: ${score.keepSignal}`, "");

    lines.push("### Truths", "");
    for (const truth of result.output.truths ?? []) {
      lines.push(
        `${truth.rank}. ${truth.truth}`,
        `Why ranked: ${truth.whyRanked}`,
        `Strong: ${(truth.evidenceStrong ?? []).join("; ") || "-"}`,
        `Weak or conflicted: ${(truth.evidenceWeakOrConflicted ?? []).join("; ") || "-"}`,
        `Sources: ${(truth.sourceIds ?? []).join(", ") || "-"}`,
        "",
      );
    }

    lines.push("### Excluded Claims", "");
    for (const claim of result.output.excludedClaims ?? []) {
      lines.push(`- ${claim.claim}: ${claim.whyExcluded}`);
    }

    lines.push(
      "",
      "### Hardest Conflict",
      "",
      `Conflict: ${result.output.hardestConflict?.conflict ?? "-"}`,
      `Why hard: ${result.output.hardestConflict?.whyHard ?? "-"}`,
      `Working resolution: ${result.output.hardestConflict?.workingResolution ?? "-"}`,
    );
  }

  return `${lines.join("\n")}\n`;
}

function numberOrUndefined(value) {
  return Number.isFinite(value) ? value : undefined;
}
