#!/usr/bin/env tsx
// Read-only contact-yield measurement for the free GitHub reachability layer.
//
// Runs the SAME provider the pipeline uses (fetchGithubContacts) over the golden set, so the
// numbers reflect production behavior, not a one-off spike. Reports how often a company exposes
// a real @company-domain human commit email (which both gives a named contact and derives the
// domain email pattern) and, when DATABASE_URL is set, how often that maps to an already-extracted
// founder/exec (direct hit) versus is only inferable from the pattern.
//
// No writes. GITHUB_TOKEN (5,000 req/hr) strongly recommended; without it the GitHub API caps at
// 60 req/hr and most companies will read as "no org".
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { applyEmailPattern, companySlugFromDomain } from "@cold-start/core";
import { fetchGithubContacts, isGithubContactsResult } from "@cold-start/providers";

function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, "");
  }
}

function loadEnv() {
  loadEnvFile(resolve(process.cwd(), ".env.local"));
  loadEnvFile(resolve(process.cwd(), ".env.production.migrate.local"));
}

function argValue(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function compact(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

type GoldenCompany = { name: string; domain: string; category: string };

type StoredPeople = {
  people: Array<{ name: string; emailStatus: "observed" | "inferred" | null }>;
};

type Row = {
  name: string;
  domain: string;
  orgFound: boolean;
  humanAnchor: boolean;
  pattern: string | null;
  directHits: number | null;
  inferable: number | null;
  extractedPeople: number | null;
  storedObserved: boolean | null;
  storedInferred: boolean | null;
  storedWithEmail: boolean | null;
};

async function loadExtractedPeople(domain: string): Promise<StoredPeople | null> {
  if (!process.env.DATABASE_URL) return null;
  try {
    const db = await import("@cold-start/db");
    const client = db.createDb(process.env.DATABASE_URL);
    const card = await db.findCardBySlug(client, companySlugFromDomain(domain), { allowStale: true });
    if (!card) return { people: [] };
    return {
      people: [...(card.team.founders.value ?? []), ...(card.team.keyExecs.value ?? [])].map((person) => ({
        name: person.name,
        emailStatus: person.email ? (person.emailStatus ?? null) : null
      }))
    };
  } catch {
    return null;
  }
}

async function loadFallbackTraceMeasurement(limit: number) {
  if (!process.env.DATABASE_URL) return null;
  try {
    const [{ createDb, generationRuns }, { desc }] = await Promise.all([
      import("@cold-start/db"),
      import("drizzle-orm")
    ]);
    const db = createDb(process.env.DATABASE_URL);
    const rows = await db
      .select({ traceJson: generationRuns.traceJson })
      .from(generationRuns)
      .orderBy(desc(generationRuns.startedAt))
      .limit(limit);
    const instrumented = rows.flatMap((row) => {
      const trace = row.traceJson as {
        steps?: Record<string, unknown>;
        providers?: {
          stableenrich?: {
            emailPatternFallback?: { fired?: boolean; hit?: boolean; spendUsd?: number };
          };
        };
      } | null;
      if (!trace?.steps || !("email-pattern-fallback" in trace.steps)) return [];
      return [trace.providers?.stableenrich?.emailPatternFallback ?? null];
    });
    const fired = instrumented.filter((fallback) => fallback?.fired).length;
    const hits = instrumented.filter((fallback) => fallback?.fired && fallback.hit).length;
    const spendUsd = instrumented.reduce((sum, fallback) => sum + (fallback?.spendUsd ?? 0), 0);
    return { scanned: rows.length, instrumented: instrumented.length, fired, hits, spendUsd };
  } catch {
    return null;
  }
}

async function main() {
  loadEnv();
  const limit = Number(argValue("--limit") ?? "50");
  const goldenPath = resolve(process.cwd(), "eval/golden-companies.seed.json");
  const golden = (JSON.parse(readFileSync(goldenPath, "utf8")) as GoldenCompany[]).slice(0, limit);

  if (!process.env.GITHUB_TOKEN && !process.env.GITHUB_PAT) {
    console.warn("[measure-contact-yield] no GITHUB_TOKEN set: GitHub API is capped at 60 req/hr; results will understate yield.\n");
  }

  const rows: Row[] = [];
  for (const company of golden) {
    const result = await fetchGithubContacts({ domain: company.domain, companyName: company.name });
    const stored = await loadExtractedPeople(company.domain);
    const people = stored?.people ?? null;
    const storedObserved = people ? people.some((person) => person.emailStatus === "observed") : null;
    const storedInferred = people ? people.some((person) => person.emailStatus === "inferred") : null;
    const storedWithEmail = people ? people.some((person) => person.emailStatus !== null) : null;

    if (!isGithubContactsResult(result)) {
      rows.push({ name: company.name, domain: company.domain, orgFound: false, humanAnchor: false, pattern: null, directHits: null, inferable: null, extractedPeople: people?.length ?? null, storedObserved, storedInferred, storedWithEmail });
      process.stderr.write(`- ${company.name.padEnd(16)} no org\n`);
      continue;
    }

    const observedByName = new Set(result.observed.filter((o) => o.fullName).map((o) => compact(o.fullName as string)));
    let directHits: number | null = null;
    let inferable: number | null = null;
    if (people) {
      directHits = people.filter((person) => observedByName.has(compact(person.name))).length;
      inferable = result.pattern
        ? people.filter((person) => !person.hasEmail && !observedByName.has(compact(person.name)) && applyEmailPattern(result.pattern!, person.name, company.domain)).length
        : 0;
    }

    rows.push({
      name: company.name,
      domain: company.domain,
      orgFound: true,
      humanAnchor: result.observed.length > 0,
      pattern: result.pattern,
      directHits,
      inferable,
      extractedPeople: people?.length ?? null,
      storedObserved,
      storedInferred,
      storedWithEmail
    });
    process.stderr.write(
      `- ${company.name.padEnd(16)} org=${result.org.padEnd(18)} anchors=${String(result.observed.length).padEnd(3)} pattern=${result.pattern ?? "-"}` +
      (people ? ` direct=${directHits} inferable=${inferable}/${people.length}` : "") + "\n"
    );
  }

  const n = rows.length;
  const pct = (count: number) => `${((count / n) * 100).toFixed(0)}%`;
  const orgFound = rows.filter((r) => r.orgFound).length;
  const withAnchor = rows.filter((r) => r.humanAnchor).length;
  const withPattern = rows.filter((r) => r.pattern).length;

  console.log("\n================ CONTACT YIELD (free GitHub layer) ================");
  console.log(`companies:                    ${n}`);
  console.log(`GitHub org found:             ${orgFound} (${pct(orgFound)})`);
  console.log(`>=1 human @domain anchor:     ${withAnchor} (${pct(withAnchor)})`);
  console.log(`domain email pattern derived: ${withPattern} (${pct(withPattern)})`);

  const dbRows = rows.filter((r) => r.extractedPeople !== null && (r.extractedPeople ?? 0) > 0);
  if (dbRows.length > 0) {
    const totalPeople = dbRows.reduce((sum, r) => sum + (r.extractedPeople ?? 0), 0);
    const totalDirect = dbRows.reduce((sum, r) => sum + (r.directHits ?? 0), 0);
    const totalInferable = dbRows.reduce((sum, r) => sum + (r.inferable ?? 0), 0);
    console.log(`\nAgainst extracted people (${dbRows.length} companies with stored cards, ${totalPeople} people):`);
    console.log(`  founder/exec direct hits:   ${totalDirect} (${((totalDirect / totalPeople) * 100).toFixed(0)}% of people)`);
    console.log(`  pattern-inferable emails:   ${totalInferable} (${((totalInferable / totalPeople) * 100).toFixed(0)}% of people)`);
    console.log(`  reachable (direct+inferred): ${((((totalDirect + totalInferable) / totalPeople) * 100)).toFixed(0)}% of extracted people`);
    const cardsWithEmail = dbRows.filter((row) => row.storedWithEmail).length;
    const cardsWithObserved = dbRows.filter((row) => row.storedObserved).length;
    const cardsWithInferred = dbRows.filter((row) => row.storedInferred).length;
    const cardPct = (count: number) => `${((count / dbRows.length) * 100).toFixed(0)}%`;
    console.log(`  cards with >=1 stored email: ${cardsWithEmail}/${dbRows.length} (${cardPct(cardsWithEmail)})`);
    console.log(`    carrying observed email:   ${cardsWithObserved}/${dbRows.length} (${cardPct(cardsWithObserved)})`);
    console.log(`    carrying inferred email:   ${cardsWithInferred}/${dbRows.length} (${cardPct(cardsWithInferred)})`);
  } else {
    console.log("\n(no DATABASE_URL / no stored cards: founder-direct-hit rate not measured. Set env to include it.)");
  }

  const fallback = await loadFallbackTraceMeasurement(Number(argValue("--trace-limit") ?? "100"));
  if (fallback && fallback.instrumented > 0) {
    const fireRate = ((fallback.fired / fallback.instrumented) * 100).toFixed(0);
    const hitRate = fallback.fired > 0 ? ((fallback.hits / fallback.fired) * 100).toFixed(0) : "0";
    console.log(`\nFallback traces (${fallback.instrumented} instrumented of ${fallback.scanned} recent runs):`);
    console.log(`  fired:                       ${fallback.fired} (${fireRate}%)`);
    console.log(`  recovered a pattern:         ${fallback.hits} (${hitRate}% of fired)`);
    console.log(`  recorded spend:              $${fallback.spendUsd.toFixed(4)}`);
  } else if (fallback) {
    console.log(`\nFallback traces: no instrumented runs among ${fallback.scanned} recent production rows.`);
  }
  console.log("\nnote: no writes performed. Raw addresses are not printed to keep this output shareable.");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
