// Rebuilds stored cards' citation snippets from their stored sources with the current builders,
// without writing to the database. Task 2 E1 and E2 of
// docs/superpowers/plans/2026-09-23-evidence-and-judgment-remediation.md.
//
// Reads production (.env.production.migrate.local, then .env.local) and writes, per slug:
//   <out>/cards/<slug>.json     the card with rebuilt snippets
//   <out>/sources/<slug>.json   the stored sources it was rebuilt from (page text; gitignored)
//
//   npm run qa:rebuild-snippets -- --slugs notion,deepinfra [--out <dir>]
//   npm run qa:rebuild-snippets -- --slugs notion --refetch --budget-usd 3
//
// --refetch pays for each card's stableenrich Exa searches again, now with page text, then fetches
// the page text of every cited page still without it by URL (Exa contents, about $0.001 a page).
// Every raw response is cached under <out>/raw/<slug>/ so nothing is paid twice. Refetched rows
// replace stored rows with the same URL. Nothing is written to the database either way.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { coldStartCardSchema, readableSourceText, type ColdStartCard } from "@cold-start/core";
import { createDb, findCardBySlug, findSourcesBySlug } from "@cold-start/db";
import { fallbackResearchPlan } from "@cold-start/llm";
import { buildEvidenceLedger, withSourcePageDetails } from "@cold-start/pipeline";
import { agentcashJson, buildStableenrichRequests, fetchStableenrichSources, type ProviderSource } from "@cold-start/providers";
import { providerSourcesFromStoredSources } from "../apps/web/src/inngest/source-fetching";
import { stableenrichEnvFromProcess } from "../apps/web/src/inngest/worker-env";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_OUT = path.join(ROOT, "eval", "curation", "remediation-2026-09");
const EXA_SEARCH_COST_USD = 0.01;
const EXA_CONTENTS_URL = "https://stableenrich.dev/api/exa/contents";
const EXA_CONTENTS_COST_PER_PAGE_USD = 0.001;

function loadEnvFile(file: string) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!match || process.env[match[1]!]) continue;
    process.env[match[1]!] = match[2]!.trim().replace(/^['"]|['"]$/g, "");
  }
}

function parseArgs(argv: string[]) {
  const flags = { slugs: [] as string[], out: DEFAULT_OUT, refetch: false, budgetUsd: 0 };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--slugs") flags.slugs = (argv[++i] ?? "").split(",").map((slug) => slug.trim()).filter(Boolean);
    else if (arg === "--out") flags.out = path.resolve(argv[++i] ?? "");
    else if (arg === "--refetch") flags.refetch = true;
    else if (arg === "--budget-usd") flags.budgetUsd = Number.parseFloat(argv[++i] ?? "");
    else throw new Error(`unknown flag: ${arg}`);
  }
  if (flags.slugs.length === 0) throw new Error("usage: rebuild-card-snippets --slugs a,b [--out dir] [--refetch --budget-usd N]");
  if (flags.refetch && !(flags.budgetUsd > 0)) throw new Error("--refetch needs --budget-usd");
  return flags;
}

// Wraps the production AgentCash transport with a disk cache keyed by endpoint and body.
function cachingAgentcashFetch(dir: string, ledger: { paidCalls: number; spentUsd: number }, costUsd = EXA_SEARCH_COST_USD) {
  return async (input: { url: string; body: Record<string, unknown>; timeoutMs?: number }) => {
    const key = createHash("sha256").update(`${input.url}\n${JSON.stringify(input.body)}`).digest("hex").slice(0, 16);
    const file = path.join(dir, `${key}.json`);
    if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8")).response;
    const response = await agentcashJson<unknown>({ url: input.url, body: input.body, ...(input.timeoutMs ? { timeoutMs: input.timeoutMs } : {}) });
    ledger.paidCalls += 1;
    ledger.spentUsd += costUsd;
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, JSON.stringify({ url: input.url, body: input.body, response }, null, 2));
    return response;
  };
}

async function refetchExaSources(domain: string, rawDir: string, ledger: { paidCalls: number; spentUsd: number }): Promise<ProviderSource[]> {
  const env = stableenrichEnvFromProcess();
  const researchPlan = fallbackResearchPlan(domain);
  const probes = buildStableenrichRequests(env, domain, researchPlan);
  const exaProbes = probes.filter((probe) => probe.name.startsWith("exa_"));
  const result = await fetchStableenrichSources({
    env,
    domain,
    researchPlan,
    skipProbeNames: probes.filter((probe) => !probe.name.startsWith("exa_")).map((probe) => probe.name),
    // Exactly the Exa searches: the ceiling leaves no room for people follow-ups.
    maxBudgetUsd: exaProbes.length * EXA_SEARCH_COST_USD,
    agentcashFetch: cachingAgentcashFetch(rawDir, ledger)
  });
  return result.sources;
}

// Cited pages that still have no readable text, fetched by URL. People-database and enrichment
// records have no page to fetch.
async function fetchCitedPageText(
  card: ColdStartCard,
  sources: ProviderSource[],
  rawDir: string,
  ledger: { paidCalls: number; spentUsd: number }
): Promise<ProviderSource[]> {
  const withText = new Set(sources.filter((source) => readableSourceText(source.rawText)).map((source) => source.url));
  const missing = card.citations.filter(
    (citation) => citation.url.startsWith("http") && citation.sourceType !== "enrichment" && !withText.has(citation.url)
  );
  if (missing.length === 0) return [];
  const fetchContents = cachingAgentcashFetch(rawDir, ledger, missing.length * EXA_CONTENTS_COST_PER_PAGE_USD);
  const response = (await fetchContents({ url: EXA_CONTENTS_URL, body: { urls: missing.map((citation) => citation.url), text: true } })) as {
    results?: Array<Record<string, unknown>>;
  };
  const fetchedAt = new Date().toISOString();
  return (response.results ?? []).flatMap((record) => {
    const citation = missing.find((candidate) => candidate.url === record.url || candidate.url === record.id);
    if (!citation || typeof record.text !== "string" || !record.text.trim()) return [];
    return [{ url: citation.url, title: citation.title, sourceType: citation.sourceType, fetchedAt, rawText: JSON.stringify(record) }];
  });
}

function snippetCounts(card: ColdStartCard) {
  const withSnippet = card.citations.filter((citation) => citation.snippet?.trim()).length;
  return { citations: card.citations.length, withSnippet, titleOnly: card.citations.length - withSnippet };
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  loadEnvFile(path.join(ROOT, ".env.production.migrate.local"));
  if (!process.env.DATABASE_URL) loadEnvFile(path.join(ROOT, ".env.local"));
  const db = createDb();
  const ledger = { paidCalls: 0, spentUsd: 0 };

  for (const slug of flags.slugs) {
    const card = await findCardBySlug(db, slug, { allowStale: true });
    if (!card) {
      console.log(`${slug}: no card`);
      continue;
    }
    const stored = await findSourcesBySlug(db, slug);
    let sources = providerSourcesFromStoredSources(stored);
    if (flags.refetch) {
      const exaSearchCount = buildStableenrichRequests({}, card.domain).filter((probe) => probe.name.startsWith("exa_")).length;
      if (ledger.spentUsd + exaSearchCount * EXA_SEARCH_COST_USD + card.citations.length * EXA_CONTENTS_COST_PER_PAGE_USD > flags.budgetUsd) {
        console.log(`${slug}: budget reached, not refetched`);
      } else {
        const fetched = await refetchExaSources(card.domain, path.join(flags.out, "raw", slug), ledger);
        const fetchedUrls = new Set(fetched.map((source) => source.url));
        sources = [...fetched, ...sources.filter((source) => !fetchedUrls.has(source.url))];
        const pages = await fetchCitedPageText(card, sources, path.join(flags.out, "raw", slug), ledger);
        const pageUrls = new Set(pages.map((source) => source.url));
        sources = [...pages, ...sources.filter((source) => !pageUrls.has(source.url))];
      }
    }

    const evidenceLedger = buildEvidenceLedger({ domain: card.domain, sources });
    const rebuilt = coldStartCardSchema.parse({ ...card, citations: withSourcePageDetails(card.citations, evidenceLedger) });
    for (const [folder, value] of [["cards", rebuilt], ["sources", sources]] as const) {
      mkdirSync(path.join(flags.out, folder), { recursive: true });
      writeFileSync(path.join(flags.out, folder, `${slug}.json`), `${JSON.stringify(value, null, 2)}\n`);
    }
    const before = snippetCounts(card);
    const after = snippetCounts(rebuilt);
    console.log(`${slug.padEnd(12)} citations ${after.citations}; title only ${before.titleOnly} -> ${after.titleOnly}; sources ${sources.length}`);
  }
  if (flags.refetch) console.log(`paid Exa calls this run: ${ledger.paidCalls} (about $${ledger.spentUsd.toFixed(3)})`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
