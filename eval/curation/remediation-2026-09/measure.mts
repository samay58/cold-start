// Real-data counts for the September 24 review remediation. Run from the repo root:
//   npx tsx eval/curation/remediation-2026-09/measure.mts <label>
// It reads the gitignored cards/ and sources/ beside it and writes to .cold-start/measure/<label>/.
// Dumps every model stage for the 12 rebuilt cards (stubbed, free), then counts person-read
// fragments, judge attribution disagreements, JSON-looking text in model inputs and card
// fields, and per-card source bytes.
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const label = process.argv[2] ?? "run";
const base = path.join(root, "eval/curation/remediation-2026-09");
const outRoot = path.join(root, ".cold-start", "measure", label);
mkdirSync(outRoot, { recursive: true });

const { buildPersonReadEvidence, buildSeedProfileCard } = await import(path.join(root, "packages/pipeline/src/index.ts"));
const { howItWinsEvidencePacketFromCard } = await import(path.join(root, "packages/llm/src/index.ts"));

// A leaf string that reads like a serialized provider record rather than prose.
const jsonLike = (value: string) => /^\s*[{[]\s*"/.test(value) || /\{"(id|url|title|text|rawText|publishedDate|highlights)":/.test(value);

function leaves(value: unknown, out: string[]) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if ((trimmed.startsWith("{") || trimmed.startsWith("[")) && trimmed.length > 1) {
      try {
        leaves(JSON.parse(trimmed), out);
        return;
      } catch {
        /* not JSON: a leaf */
      }
    }
    // Prompts often carry label lines and JSON blocks ("Rules:\n{...}\n\nCard:\n{...}"); read
    // each balanced block as JSON and the rest as prose.
    const blocks = jsonBlocks(value);
    if (blocks.length > 0) {
      let prose = value;
      for (const block of blocks) {
        prose = prose.replace(block.text, " ");
        leaves(block.parsed, out);
      }
      out.push(prose);
      return;
    }
    out.push(value);
  } else if (Array.isArray(value)) value.forEach((item) => leaves(item, out));
  else if (value && typeof value === "object") Object.values(value).forEach((item) => leaves(item, out));
}

function jsonBlocks(value: string): Array<{ text: string; parsed: unknown }> {
  const found: Array<{ text: string; parsed: unknown }> = [];
  const re = /(^|\n)([{[])/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(value))) {
    const open = match.index + match[1]!.length;
    let depth = 0, inString = false, escaped = false, end = -1;
    for (let i = open; i < value.length; i++) {
      const ch = value[i]!;
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === "{" || ch === "[") depth++;
      else if (ch === "}" || ch === "]") { depth--; if (depth === 0) { end = i + 1; break; } }
    }
    if (end < 0) continue;
    try {
      const text = value.slice(open, end);
      found.push({ text, parsed: JSON.parse(text) });
      re.lastIndex = end;
    } catch {
      /* not JSON */
    }
  }
  return found;
}

const rows: string[] = [];
let seedJson = 0, seedEmptySnippet = 0;
const seedOneLiners: string[] = [];
let totalItems = 0, fragments = 0, people = 0, peopleWithEvidence = 0, citationsSeen = 0, disagreements = 0, jsonInputs = 0, jsonCard = 0;
const fragmentSamples: string[] = [];
const disagreementSamples: string[] = [];
const jsonSamples: string[] = [];

for (const file of readdirSync(path.join(base, "cards")).sort()) {
  const slug = file.replace(/\.json$/, "");
  const cardPath = path.join(base, "cards", file);
  const sourcesPath = path.join(base, "sources", file);
  const card = JSON.parse(readFileSync(cardPath, "utf8"));
  const sources = JSON.parse(readFileSync(sourcesPath, "utf8")) as Array<{ url: string; title: string; rawText: string }>;

  // Person-read evidence: a fragment is an item no longer than the name plus three words.
  const cardPeople = [...(card.team.founders.value ?? []), ...(card.team.keyExecs.value ?? [])];
  const reads = buildPersonReadEvidence({ people: cardPeople, citations: card.citations, candidates: [], sources });
  for (const person of reads) {
    people++;
    if (person.evidence.length > 0) peopleWithEvidence++;
    for (const item of person.evidence) {
      totalItems++;
      if (item.text.trim().split(/\s+/).length <= person.name.split(/\s+/).length + 3) {
        fragments++;
        if (fragmentSamples.length < 10) fragmentSamples.push(`${slug} ${person.name}: "${item.text}"`);
      }
    }
  }

  // Judge: an evidence attribution that differs from any tier the context still carries.
  const packet = howItWinsEvidencePacketFromCard(card);
  for (const citation of packet.context.citations as Array<{ id: string; url: string; sourceQuality?: { tier: string } }>) {
    citationsSeen++;
    const evidence = packet.evidence.find((item: { evidenceId: string }) => item.evidenceId === citation.id);
    if (citation.sourceQuality && evidence && evidence.attribution !== citation.sourceQuality.tier) {
      disagreements++;
      if (disagreementSamples.length < 8) disagreementSamples.push(`${slug} ${citation.url} stored=${citation.sourceQuality.tier} judge=${evidence.attribution}`);
    }
  }

  // Seed card built from the stored sources, as the basics fallback does.
  const seed = buildSeedProfileCard({ domain: card.domain, sources: sources.map((s: Record<string, unknown>) => ({ ...s, sourceType: s.sourceType })), providerFacts: [] }).card;
  const seedLine = seed.identity.oneLiner.value ?? "";
  if (jsonLike(seedLine)) seedJson++;
  if (seed.citations[0] && !seed.citations[0].snippet) seedEmptySnippet++;
  seedOneLiners.push(`${slug}: ${seedLine.slice(0, 90)} | snippet ${JSON.stringify((seed.citations[0]?.snippet ?? "").slice(0, 50))}`);

  // Card fields a reader sees.
  const cardStrings: string[] = [];
  leaves({ identity: card.identity, citations: card.citations.map((c: { snippet?: string }) => c.snippet ?? "") }, cardStrings);
  for (const value of cardStrings) if (jsonLike(value)) { jsonCard++; if (jsonSamples.length < 8) jsonSamples.push(`${slug} card: ${value.slice(0, 100)}`); }

  // Model inputs, through the production functions with a stub client.
  const out = path.join(outRoot, slug);
  execFileSync("npx", ["tsx", "scripts/dump-model-inputs.ts", "--slug", slug, "--card", cardPath, "--sources", sourcesPath, "--out", out], { cwd: root, stdio: "pipe" });
  for (const stageFile of readdirSync(out)) {
    if (stageFile === "stored_sources.json") continue;
    const dumped = JSON.parse(readFileSync(path.join(out, stageFile), "utf8"));
    const strings: string[] = [];
    leaves(dumped.requests ?? dumped, strings);
    for (const value of strings) if (jsonLike(value)) { jsonInputs++; if (jsonSamples.length < 8) jsonSamples.push(`${slug} ${stageFile}: ${value.slice(0, 100)}`); }
  }

  const bytes = sources.reduce((sum, source) => sum + Buffer.byteLength(source.rawText ?? ""), 0);
  const largest = sources.reduce((max, source) => Math.max(max, Buffer.byteLength(source.rawText ?? "")), 0);
  rows.push(`${slug.padEnd(12)} sources=${String(sources.length).padStart(3)} bytes=${String(bytes).padStart(8)} largest=${String(largest).padStart(7)}`);
}

const report = [
  `label: ${label}`,
  `person-read items: ${totalItems}, fragments: ${fragments}, people ${people}, with evidence ${peopleWithEvidence}`,
  ...fragmentSamples.map((s) => `  ${s}`),
  `judge citations: ${citationsSeen}, attribution disagreements: ${disagreements}`,
  ...disagreementSamples.map((s) => `  ${s}`),
  `JSON-looking strings: model inputs ${jsonInputs}, card fields ${jsonCard}`,
  ...jsonSamples.map((s) => `  ${s}`),
  `seed cards: JSON oneLiners ${seedJson}, empty seed snippets ${seedEmptySnippet}`,
  ...seedOneLiners.map((s) => `  ${s}`),
  ...rows
].join("\n");
writeFileSync(path.join(outRoot, "report.txt"), report);
console.log(report);
