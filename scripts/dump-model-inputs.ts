// Prints the exact request every model stage would send for one stored card, without calling a
// model. Each stage runs through its production function with a stub client that records the
// request and then stops the call, so the dump cannot drift from what production sends.
//
// Read-only. Loads .env.production.migrate.local (then .env.local) for DATABASE_URL, reads the
// card and its stored sources, and writes one JSON file per stage under
// .cold-start/model-inputs/<slug>/ (gitignored: the files carry source page text).
//
//   npm run qa:model-inputs -- --slug notion [--out <dir>]
//
// Stages the dump cannot reproduce from stored rows are written with a `gap` note instead:
// person reads also draw on provider fact candidates that are never stored, and the emphasis
// read adds a fresh founder-voice fetch that costs money.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import type Anthropic from "@anthropic-ai/sdk";
import { emphasisSourceDigests, RESEARCH_SECTION_DEFINITIONS, type ColdStartCard } from "@cold-start/core";
import { createDb, findCardBySlug, findSourcesBySlug } from "@cold-start/db";
import {
  extractCompanyClaims,
  fallbackResearchPlan,
  howItWinsEvidencePacketFromCard,
  judgeHowItWinsForAnalysis,
  loadHowItWinsJudgeRules,
  screenHowItWins,
  synthesizeCard,
  synthesizeEmphasisRead,
  synthesizeExpandedDescription,
  synthesizePersonReads,
  synthesizeResearchSection,
  verifySynthesis
} from "@cold-start/llm";
import {
  buildEvidenceLedger,
  buildExpandedDescriptionEvidence,
  buildPersonReadEvidence,
  expandedDescriptionCardFacts,
  verifyCardSynthesisDraft
} from "@cold-start/pipeline";
import { evidenceForSection } from "../apps/web/src/inngest/research-section-generation";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Any priced Anthropic model: the stub never sends it anywhere.
const STUB_MODEL = "claude-sonnet-4-6";
const STUB_JUDGE_MODEL = "claude-opus-5";

class DumpStop extends Error {
  constructor() {
    super("dump-model-inputs stops every call before it is sent");
  }
}

function loadEnvFile(file: string) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!match || process.env[match[1]!]) continue;
    process.env[match[1]!] = match[2]!.trim().replace(/^['"]|['"]$/g, "");
  }
}

type Captured = { label: string; params: unknown };

function stubClient(captured: Captured[], label: () => string): Anthropic {
  const record = (params: unknown) => {
    captured.push({ label: label(), params });
    throw new DumpStop();
  };
  return {
    messages: {
      create: async (params: unknown) => record(params),
      stream: (params: unknown) => {
        captured.push({ label: label(), params });
        return { finalMessage: async () => { throw new DumpStop(); } };
      }
    }
  } as unknown as Anthropic;
}

async function capture(name: string, captured: Captured[], run: () => Promise<unknown>) {
  const before = captured.length;
  try {
    await run();
  } catch (error) {
    if (!(error instanceof DumpStop) && captured.length === before) {
      return { stage: name, error: error instanceof Error ? error.message : String(error) };
    }
  }
  return { stage: name, requests: captured.slice(before) };
}

function parseArgs(argv: string[]) {
  let slug = "";
  let out = "";
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--slug") slug = argv[++i] ?? "";
    else if (argv[i] === "--out") out = argv[++i] ?? "";
  }
  if (!slug) throw new Error("usage: dump-model-inputs --slug <slug> [--out <dir>]");
  return { slug, out: out || path.join(ROOT, ".cold-start", "model-inputs", slug) };
}

async function main() {
  const { slug, out } = parseArgs(process.argv.slice(2));
  loadEnvFile(path.join(ROOT, ".env.production.migrate.local"));
  if (!process.env.DATABASE_URL) loadEnvFile(path.join(ROOT, ".env.local"));
  const db = createDb();
  const card: ColdStartCard | null = await findCardBySlug(db, slug, { allowStale: true });
  if (!card) throw new Error(`no card for ${slug}`);
  const stored = await findSourcesBySlug(db, slug);
  const sources = stored.map((source) => ({ ...source, sourceType: source.sourceType as never }));

  const captured: Captured[] = [];
  let current = "";
  const client = stubClient(captured, () => current);
  const stage = (name: string, run: () => Promise<unknown>) => {
    current = name;
    return capture(name, captured, run);
  };

  const evidenceLedger = buildEvidenceLedger({ domain: card.domain, sources });
  const company = { domain: card.domain, name: card.identity.name.value ?? card.domain };
  const results = [
    await stage("extract_full", () => extractCompanyClaims({
      client, model: STUB_MODEL,
      evidence: { domain: card.domain, researchPlan: fallbackResearchPlan(card.domain), sources, evidenceLedger }
    })),
    await stage("synthesis", () => synthesizeCard({ client, model: STUB_MODEL, card })),
    await stage("verify", async () => {
      if (!card.synthesis) throw new Error("card has no synthesis to verify");
      const claimCount = card.synthesis.bullCase.length + card.synthesis.bearCase.length;
      return verifyCardSynthesisDraft(card, { synthesis: card.synthesis, claimCountBeforeVerify: claimCount }, {
        verify: (claims, verifySources, evidenceFacts) =>
          verifySynthesis({ client, model: STUB_MODEL, claims, sources: verifySources, evidenceFacts }),
        synthesisRequired: false
      });
    }),
    // One section is enough: every section reads the same evidence builder.
    await stage("research_section", () => synthesizeResearchSection({
      client, model: STUB_MODEL, company,
      definition: RESEARCH_SECTION_DEFINITIONS[0]!,
      evidence: evidenceForSection(card, stored)
    })),
    await stage("person_read", () => synthesizePersonReads({
      client, model: STUB_MODEL, companyName: company.name, domain: card.domain,
      // Same people list as contact-enrichment's peopleFromSections.
      people: buildPersonReadEvidence({
        people: [...(card.team.founders.value ?? []), ...(card.team.keyExecs.value ?? [])],
        citations: card.citations, candidates: [], sources
      })
    })),
    await stage("expanded_description", () => synthesizeExpandedDescription({
      client, model: STUB_MODEL,
      evidence: {
        companyName: company.name, domain: card.domain,
        cardFacts: expandedDescriptionCardFacts(card),
        sources: buildExpandedDescriptionEvidence({ card, sources })
      }
    })),
    await stage("emphasis_read", () => synthesizeEmphasisRead({ client, model: STUB_MODEL, card, digests: emphasisSourceDigests(card) })),
    await stage("how_it_wins_screen", () => screenHowItWins({
      card, rules: loadHowItWinsJudgeRules(),
      ask: async (state, questions) => {
        captured.push({ label: "how_it_wins_screen", params: { state, questions } });
        throw new DumpStop();
      }
    })),
    await stage("how_it_wins_judge", () => judgeHowItWinsForAnalysis({
      card, client, refinement: false,
      models: { judge: STUB_JUDGE_MODEL, editor: "deepseek/deepseek-v4-pro", writer: STUB_JUDGE_MODEL }
    }))
  ];

  mkdirSync(out, { recursive: true });
  writeFileSync(path.join(out, "how_it_wins_packet.json"), JSON.stringify(howItWinsEvidencePacketFromCard(card), null, 2));
  writeFileSync(path.join(out, "stored_sources.json"), JSON.stringify(stored, null, 2));
  for (const result of results) {
    writeFileSync(path.join(out, `${result.stage}.json`), JSON.stringify(result, null, 2));
    const status = "error" in result ? `error: ${result.error}` : `${result.requests.length} request(s)`;
    console.log(`${result.stage.padEnd(22)} ${status}`);
  }
  console.log(`gap: person_read omits provider fact candidates; emphasis_read omits the fresh founder-voice fetch`);
  console.log(`wrote ${out}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
