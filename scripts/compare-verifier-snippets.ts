// Reruns only the synthesis verifier on stored cards, once with the snippets production stored and
// once with the rebuilt page-text snippets, and counts the claims each keeps. Task 2 E5 of
// docs/superpowers/plans/2026-09-23-evidence-and-judgment-remediation.md.
//
// Inputs, both written by earlier steps and gitignored:
//   <dir>/raw/<slug>/card-before.json   the stored card_json as production read it
//   <dir>/cards/<slug>.json             the rebuilt card (npm run qa:rebuild-snippets)
//
//   npm run qa:verifier-snippets -- --slugs notion,deepinfra --runs 2 --budget-usd 2
//
// Both arms verify the same stored synthesis with the same model, so only the snippets differ.
// The stored synthesis already passed the verifier once; claims it cut were never stored.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { type ColdStartCard, type GenerationLlmCallTrace } from "@cold-start/core";
import { createAnthropicClient, verifySynthesis, type VerificationResult } from "@cold-start/llm";
import { verifyCardSynthesisDraft } from "@cold-start/pipeline";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_DIR = path.join(ROOT, "eval", "curation", "remediation-2026-09");
const MODEL = "deepseek/deepseek-v4-flash";

function loadEnvFile(file: string) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!match || process.env[match[1]!]) continue;
    process.env[match[1]!] = match[2]!.trim().replace(/^['"]|['"]$/g, "");
  }
}

function parseArgs(argv: string[]) {
  const flags = { slugs: [] as string[], runs: 2, budgetUsd: 0, dir: DEFAULT_DIR };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--slugs") flags.slugs = (argv[++i] ?? "").split(",").map((slug) => slug.trim()).filter(Boolean);
    else if (arg === "--runs") flags.runs = Number.parseInt(argv[++i] ?? "", 10);
    else if (arg === "--budget-usd") flags.budgetUsd = Number.parseFloat(argv[++i] ?? "");
    else if (arg === "--dir") flags.dir = path.resolve(argv[++i] ?? "");
    else throw new Error(`unknown flag: ${arg}`);
  }
  if (flags.slugs.length === 0 || !(flags.budgetUsd > 0) || !(flags.runs >= 1)) {
    throw new Error("usage: compare-verifier-snippets --slugs a,b --budget-usd N [--runs 2] [--dir dir]");
  }
  return flags;
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  loadEnvFile(path.join(ROOT, ".env.local"));
  const client = createAnthropicClient();
  const calls: GenerationLlmCallTrace[] = [];
  const spent = () => calls.reduce((sum, call) => sum + (call.estimatedCostUsd ?? 0), 0);
  const rows: Array<Record<string, unknown>> = [];

  for (const slug of flags.slugs) {
    // Deliberately not schema-parsed: parsing turns old JSON snippets into text, and the "before"
    // arm must see exactly what production's verifier saw.
    const before = JSON.parse(readFileSync(path.join(flags.dir, "raw", slug, "card-before.json"), "utf8")) as ColdStartCard;
    const after = JSON.parse(readFileSync(path.join(flags.dir, "cards", `${slug}.json`), "utf8")) as ColdStartCard;
    const synthesis = before.synthesis;
    if (!synthesis) {
      console.log(`${slug}: no synthesis`);
      continue;
    }
    for (const [arm, card] of [["before", before], ["after", after]] as const) {
      for (let run = 1; run <= flags.runs; run += 1) {
        if (spent() >= flags.budgetUsd) throw new Error(`budget reached at $${spent().toFixed(4)}`);
        let results: VerificationResult[] = [];
        await verifyCardSynthesisDraft({ ...card, synthesis }, { synthesis, claimCountBeforeVerify: 0 }, {
          verify: async (claims, sources, evidenceFacts) => {
            results = await verifySynthesis({ client, model: MODEL, claims, sources, evidenceFacts, telemetry: (call) => calls.push(call) });
            return results;
          }
        });
        const supported = results.filter((result) => result.status === "supported").length;
        rows.push({ slug, arm, run, claims: results.length, supported, results });
        console.log(`${slug.padEnd(12)} ${arm.padEnd(6)} run ${run}: ${supported} of ${results.length} supported`);
      }
    }
  }
  writeFileSync(path.join(flags.dir, "raw", "verifier-compare.json"), `${JSON.stringify(rows, null, 2)}\n`);
  console.log(`spent about $${spent().toFixed(4)} on ${calls.length} calls`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
