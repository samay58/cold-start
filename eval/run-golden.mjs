import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { DEFAULT_PER_RUN_COST_CEILING_USD, markdownSummary, runGoldenEval } from "./harness.mjs";
import contract from "../packages/core/api-contract.json" with { type: "json" };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const seedPath = path.join(__dirname, "golden-companies.seed.json");

function argValue(name, fallback = undefined) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
}

function hasArg(name) {
  return process.argv.includes(name);
}

async function loadSeed() {
  return JSON.parse(await readFile(seedPath, "utf8"));
}

function jsonHeaders(token, extensionId) {
  return {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
    [contract.clientHeader]: contract.version,
    "x-cold-start-extension-id": extensionId
  };
}

async function jsonFetch(url, init) {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const detail = body?.error ?? `request failed with ${response.status}`;
    throw new Error(String(detail));
  }

  if (response.headers.get(contract.apiHeader) !== contract.version) {
    throw new Error("api deployment out of date");
  }

  return body;
}

function liveClient({ origin, token, extensionId }) {
  return {
    async generateAndFetch(company) {
      const startedAt = Date.now();
      let runStatus = null;
      let providerFailureReason = null;

      try {
        await jsonFetch(`${origin}/api/generate`, {
          method: "POST",
          headers: jsonHeaders(token, extensionId),
          body: JSON.stringify({ domain: company.domain, mode: "basics", confirmStart: true })
        });
        await waitForCard({ origin, token, extensionId, domain: company.domain, slug: firstLabelSlug(company.domain), mode: "basics" });
        await jsonFetch(`${origin}/api/generate`, {
          method: "POST",
          headers: jsonHeaders(token, extensionId),
          body: JSON.stringify({ domain: company.domain, mode: "analysis", confirmStart: true })
        });
        runStatus = await waitForCard({ origin, token, extensionId, domain: company.domain, slug: firstLabelSlug(company.domain), mode: "analysis" });
      } catch (error) {
        providerFailureReason = error instanceof Error ? error.message : String(error);
      }

      const publicCard = await jsonFetch(`${origin}/api/cards/${encodeURIComponent(firstLabelSlug(company.domain))}`)
        .catch((error) => {
          providerFailureReason ??= error instanceof Error ? error.message : String(error);
          return null;
        });
      const extensionCard = await jsonFetch(`${origin}/api/extension/cards/${encodeURIComponent(firstLabelSlug(company.domain))}`, {
        headers: jsonHeaders(token, extensionId)
      }).catch((error) => {
        providerFailureReason ??= error instanceof Error ? error.message : String(error);
        return null;
      });

      return {
        company,
        latencyMs: Date.now() - startedAt,
        publicCard,
        extensionCard,
        runStatus,
        providerFailureReason
      };
    }
  };
}

function firstLabelSlug(domain) {
  return domain.split(".")[0].toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "unknown";
}

async function waitForCard({ origin, token, extensionId, domain, slug, mode }) {
  const deadline = Date.now() + 4 * 60 * 1000;

  while (Date.now() < deadline) {
    const extensionCard = await jsonFetch(`${origin}/api/extension/cards/${encodeURIComponent(slug)}`, {
      headers: jsonHeaders(token, extensionId)
    }).catch(() => null);

    if (extensionCard && (mode === "basics" || extensionCard.synthesis)) {
      return { status: "complete" };
    }

    const status = await jsonFetch(`${origin}/api/generate?${new URLSearchParams({ domain, mode })}`, {
      headers: jsonHeaders(token, extensionId)
    }).catch(() => null);

    if (status?.status === "failed") {
      return status;
    }

    await new Promise((resolve) => setTimeout(resolve, 2500));
  }

  throw new Error(`${mode} generation timed out`);
}

async function main() {
  const companies = await loadSeed();
  const limit = Number(argValue("--limit", "10"));

  if (hasArg("--dry-run")) {
    console.log(companies.slice(0, limit).map((company) => `${company.name} <${company.domain}>`).join("\n"));
    return;
  }

  const origin = argValue("--origin", process.env.COLD_START_API_ORIGIN ?? "http://localhost:3000");
  const token = argValue("--token", process.env.COLD_START_EXTENSION_TOKEN);
  const extensionId = argValue("--extension-id", process.env.COLD_START_EXTENSION_ID ?? "local-dev");
  const perRunCostCeilingUsd = Number(
    argValue("--cost-ceiling-usd", process.env.COLD_START_COST_CEILING_USD ?? String(DEFAULT_PER_RUN_COST_CEILING_USD))
  );

  if (!token) {
    throw new Error("Set COLD_START_EXTENSION_TOKEN or pass --token before running the live eval.");
  }

  const run = await runGoldenEval({
    companies,
    limit,
    client: liveClient({ origin, token, extensionId }),
    perRunCostCeilingUsd: Number.isFinite(perRunCostCeilingUsd) ? perRunCostCeilingUsd : undefined
  });
  const outputDir = path.join(__dirname, "runs");
  const stamp = run.generatedAt.replace(/[:.]/g, "-");

  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, `${stamp}.json`), JSON.stringify(run, null, 2));
  await writeFile(path.join(outputDir, `${stamp}.md`), markdownSummary(run));
  console.log(markdownSummary(run));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
