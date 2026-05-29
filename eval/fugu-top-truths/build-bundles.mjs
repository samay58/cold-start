import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Builds frozen source bundles for the Fugu top-truths burn by hitting the same Exa
// /search endpoint production uses, plus extra conflict-surfacing queries (valuation,
// competitors, customers). Retrieval happens once here so the model comparison downstream
// is retrieval-fair: every model reads the identical frozen bundle. See part 7 of
// docs/product/slow-work/2026-05-29-fugu-the-read-card-wedge.md.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXA_URL = (process.env.DIRECT_EXA_BASE_URL?.trim() || "https://api.exa.ai").replace(/\/+$/, "") + "/search";

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
}

function slugForDomain(domain) {
  return String(domain).replace(/^https?:\/\//i, "").replace(/^www\./i, "").split("/")[0].split(".")[0].toLowerCase();
}

const relevanceStopwords = new Set(["the", "ai", "inc", "llc", "ltd", "labs", "app", "com", "co", "io"]);

function relevanceTokens(company) {
  const fromName = company.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((token) => token.length > 2 && !relevanceStopwords.has(token));
  return Array.from(new Set([...fromName, slugForDomain(company.domain)].filter(Boolean)));
}

// Real retrieval pulls in wrong-company pages (a loose "people" query for openai.com surfaces
// xAI / OpenBB profiles). Require a source to actually mention the target before it enters the
// frozen bundle, so the eval tests conflict adjudication, not company disambiguation.
function isRelevant(title, text, tokens) {
  const hay = `${title} ${text}`.toLowerCase();
  return tokens.some((token) => hay.includes(token));
}

// Port of packages/core/src/source-quality.ts tier ranking, so bundle authorityScores match
// what production would assign. The top-truths task leans on these to adjudicate conflicts.
const tierRank = {
  independent_technical: 7,
  independent_analysis: 6,
  independent_report: 5,
  primary_company: 4,
  press_release: 2,
  enrichment: 1,
  unknown: 0,
};
const independentTechnicalHosts = ["substack.com", "stratechery.com", "latentspace.ai", "interconnects.ai", "newsletter.pragmaticengineer.com", "semianalysis.com"];
const pressReleaseHosts = ["prnewswire.com", "businesswire.com", "globenewswire.com", "accesswire.com", "einpresswire.com"];
// Startup-data aggregators: useful for coverage, weak for judgment, frequently stale or
// conflicting on funding/valuation. Treated as enrichment tier so the bundle carries the
// low-authority-vs-high-authority tension the top-truths task is meant to adjudicate.
const enrichmentHosts = ["crunchbase.com", "tracxn.com", "cbinsights.com", "growjo.com", "getlatka.com", "latka.com", "craft.co", "owler.com", "zoominfo.com", "rocketreach.co", "leadiq.com", "apollo.io", "pitchbook.com", "datanyze.com", "6sense.com", "explodingtopics.com", "stockanalysis.com", "wellfound.com", "clay.com"];

function hostnameForUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function classify(url, title, domain) {
  const host = hostnameForUrl(url);
  const normalizedDomain = String(domain).replace(/^www\./i, "").toLowerCase();
  const isCompanySite = host === normalizedDomain || host.endsWith(`.${normalizedDomain}`);
  const searchable = `${url} ${title}`.toLowerCase();

  if (enrichmentHosts.some((h) => host === h || host.endsWith(`.${h}`))) {
    return { sourceType: "enrichment", tier: "enrichment" };
  }
  if (pressReleaseHosts.some((h) => host.endsWith(h)) || /\bpress release\b/.test(searchable)) {
    return { sourceType: "news", tier: "press_release" };
  }
  if (independentTechnicalHosts.some((h) => host.endsWith(h)) || /\b(technical deep dive|architecture|benchmark|teardown|field notes)\b/.test(searchable)) {
    return { sourceType: "news", tier: "independent_technical" };
  }
  if (/\b(sacra|analysis|deep dive|market map|thesis|memo)\b/.test(searchable)) {
    return { sourceType: "other", tier: "independent_analysis" };
  }
  if (isCompanySite) {
    return { sourceType: "company_site", tier: "primary_company" };
  }
  return { sourceType: "news", tier: "independent_report" };
}

function cleanText(record) {
  const parts = [];
  if (typeof record.text === "string") parts.push(record.text);
  if (Array.isArray(record.highlights)) parts.push(...record.highlights.filter((h) => typeof h === "string"));
  if (typeof record.summary === "string") parts.push(record.summary);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function queriesFor(domain) {
  const contents = { text: true, highlights: { highlightsPerUrl: 3, numSentences: 3 } };
  return [
    { label: "company", body: { query: `${domain} company profile what does the company do headquarters founded`, type: "instant", category: "company", numResults: 5, contents } },
    { label: "funding", body: { query: `${domain} funding rounds investors total raised valuation latest round`, type: "fast", category: "news", numResults: 8, contents } },
    { label: "valuation", body: { query: `${domain} valuation 2025 2026 billion reported investors led round`, type: "fast", category: "news", numResults: 8, contents } },
    { label: "leadership", body: { query: `${domain} CEO founder departure leadership change`, type: "fast", category: "news", numResults: 5, contents } },
    { label: "traction", body: { query: `${domain} customers revenue ARR users growth traction`, type: "fast", category: "news", numResults: 6, contents } },
    { label: "competition", body: { query: `${domain} competitors versus alternatives market`, type: "fast", category: "news", numResults: 5, contents } },
    { label: "signals", body: { query: `${domain} recent launch acquisition restructuring news`, type: "fast", category: "news", numResults: 6, contents } },
  ];
}

async function exaSearch(apiKey, body) {
  const response = await fetch(EXA_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Exa ${body.category ?? "search"} failed with ${response.status}`);
  }
  const payload = await response.json().catch(() => ({}));
  return Array.isArray(payload?.results) ? payload.results : [];
}

async function buildBundle({ company, apiKey, maxSources, textChars }) {
  const { domain } = company;
  const tokens = relevanceTokens(company);
  const byUrl = new Map();
  let droppedIrrelevant = 0;

  for (const query of queriesFor(domain)) {
    let results = [];
    try {
      results = await exaSearch(apiKey, query.body);
    } catch (error) {
      console.warn(`  [${domain}] ${query.label} query failed: ${error instanceof Error ? error.message : error}`);
      continue;
    }
    for (const record of results) {
      const url = typeof record.url === "string" ? record.url : null;
      if (!url || !url.startsWith("http") || byUrl.has(url)) continue;
      const text = cleanText(record);
      if (text.length < 80) continue;
      const title = typeof record.title === "string" ? record.title : "";
      if (!isRelevant(title, text, tokens)) {
        droppedIrrelevant += 1;
        continue;
      }
      byUrl.set(url, { record, url, text, queryLabel: query.label });
    }
  }
  if (droppedIrrelevant > 0) {
    process.stdout.write(`(dropped ${droppedIrrelevant} off-target) `);
  }

  const classified = Array.from(byUrl.values()).map((entry) => {
    const title = typeof entry.record.title === "string" && entry.record.title.trim() ? entry.record.title.trim() : entry.url;
    const { sourceType, tier } = classify(entry.url, title, domain);
    const publishedAt = typeof entry.record.publishedDate === "string" ? entry.record.publishedDate : (typeof entry.record.publishedAt === "string" ? entry.record.publishedAt : undefined);
    return {
      title,
      url: entry.url,
      sourceType,
      authorityScore: tierRank[tier],
      tier,
      ...(publishedAt ? { publishedAt } : {}),
      text: entry.text.slice(0, textChars),
    };
  });

  // Select up to maxSources preserving tier diversity: round-robin across tier buckets ordered
  // high authority -> low, so low-authority aggregator sources survive to create the
  // adjudication tension the top-truths task is meant to resolve.
  const tierOrder = ["independent_technical", "independent_analysis", "independent_report", "primary_company", "press_release", "enrichment", "unknown"];
  const buckets = new Map();
  for (const source of classified) {
    if (!buckets.has(source.tier)) buckets.set(source.tier, []);
    buckets.get(source.tier).push(source);
  }
  const ordered = tierOrder.filter((tier) => buckets.has(tier)).map((tier) => buckets.get(tier));
  const selected = [];
  let added = true;
  while (selected.length < maxSources && added) {
    added = false;
    for (const bucket of ordered) {
      if (bucket.length === 0) continue;
      selected.push(bucket.shift());
      added = true;
      if (selected.length >= maxSources) break;
    }
  }
  const ranked = selected.map((source, index) => ({ id: `e${index + 1}`, ...source }));

  return {
    company: { name: company.name, domain, category: company.category },
    builtAt: new Date().toISOString(),
    sources: ranked,
  };
}

async function main() {
  const apiKey = process.env.DIRECT_EXA_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("DIRECT_EXA_API_KEY is required. Run: set -a; source .env.local; set +a");
  }

  const companiesPath = path.resolve(argValue("--companies", path.join(__dirname, "companies.messy.json")));
  const outDir = path.resolve(argValue("--out", path.join(__dirname, "fixtures")));
  const maxSources = Number(argValue("--max-sources", "16"));
  const textChars = Number(argValue("--text-chars", "1200"));
  const limit = Number(argValue("--limit", "0"));

  const parsed = JSON.parse(await readFile(companiesPath, "utf8"));
  let companies = Array.isArray(parsed) ? parsed : parsed.companies ?? [];
  if (limit > 0) companies = companies.slice(0, limit);

  await mkdir(outDir, { recursive: true });
  console.log(`Building ${companies.length} bundle(s) -> ${outDir}\n`);

  const manifest = [];
  for (const company of companies) {
    const slug = slugForDomain(company.domain);
    process.stdout.write(`${company.name} (${company.domain})... `);
    try {
      const bundle = await buildBundle({ company, apiKey, maxSources, textChars });
      const outPath = path.join(outDir, `${slug}-source-bundle.json`);
      await writeFile(outPath, JSON.stringify(bundle, null, 2));
      const chars = bundle.sources.reduce((sum, s) => sum + s.text.length, 0);
      const authSpread = `${Math.min(...bundle.sources.map((s) => s.authorityScore))}-${Math.max(...bundle.sources.map((s) => s.authorityScore))}`;
      console.log(`${bundle.sources.length} sources, ${chars} chars, authority ${authSpread} -> ${slug}-source-bundle.json`);
      manifest.push({ slug, name: company.name, domain: company.domain, sources: bundle.sources.length, chars });
    } catch (error) {
      console.log(`FAILED: ${error instanceof Error ? error.message : error}`);
      manifest.push({ slug, name: company.name, domain: company.domain, error: String(error instanceof Error ? error.message : error) });
    }
  }

  await writeFile(path.join(outDir, "messy-manifest.json"), JSON.stringify({ builtAt: new Date().toISOString(), bundles: manifest }, null, 2));
  const ok = manifest.filter((m) => !m.error).length;
  console.log(`\nDone. ${ok}/${manifest.length} bundles built. Manifest: ${path.join(outDir, "messy-manifest.json")}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
