#!/usr/bin/env tsx
/*
 * Two "How it wins" reads per corpus card, from frozen evidence, on the path production runs:
 * one judge per card, then the frozen writer twice over that one verdict. The arms differ by
 * writer model, or with --prompt-arms by writer prompt; which arm sits in slot A is a seeded
 * per-card flip so the rig's reader cannot learn the key from position. Output goes to
 * eval/curation/how-it-wins/, which is gitignored: these files hold synthesis.
 */
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type Anthropic from "@anthropic-ai/sdk";
import {
  coldStartCardSchema,
  howItWinsThinFileReason,
  type ColdStartCard,
  type GenerationLlmCallTrace,
  type HowItWins,
  type HowItWinsJudgment,
  type HowItWinsRead
} from "@cold-start/core";
import {
  createAnthropicClient,
  isTransientLlmError,
  modelForStage,
  synthesizeHowItWins,
  HOW_IT_WINS_DEFAULT_EDITOR_MODEL,
  HOW_IT_WINS_FROZEN_WRITER_PROMPT
} from "@cold-start/llm";

import { createSeededRng, shuffled, type RichnessBand } from "./eval-curation-lib";
import {
  compactCalls,
  hashBenchmarkValue,
  loadOrRunJudgment,
  loadRootEnv,
  slopcheck,
  usageFromCalls,
  verifyRead,
  type CompactCall
} from "./how-it-wins-eval-shared";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore score.mjs is plain JS shared with the node:test suite
import { strategyFrequency, strategyFrequencyGate } from "../eval/investor-lens/score.mjs";

const execFileAsync = promisify(execFile);

const DEFAULT_WRITERS: [string, string] = ["claude-sonnet-5", "claude-sonnet-4-6"];
const DEFAULT_JUDGE = "claude-opus-5";
const DEFAULT_SEED = "how-it-wins-1";
const DEFAULT_LIMIT = 20;
const DEFAULT_OUT = path.join("eval", "curation", "how-it-wins");
const CORPUS = path.join("eval", "curation", "corpus");
const FROZEN_WRITER_PROMPT_PATTERN = /export const HOW_IT_WINS_FROZEN_WRITER_PROMPT = `([\s\S]*?)`;/;

export type HowItWinsCandidate = {
  slug: string;
  richnessBand: RichnessBand;
  hasSynthesis: boolean;
  thinFileReason: string | null;
};

type ArmLabel = "A" | "B";

export type ArmResult = {
  // What the rig groups and reveals this arm by. It is the writer model in a model comparison and
  // the writer prompt version in a prompt comparison; the field name is the rig's, not a claim.
  writer: string;
  preVerify: HowItWins;
  read: HowItWins;
  dropReason?: "running-dropped" | "pair-dropped";
  // Set only when this arm threw. The card still files with both arms, because the other arm's
  // result is already paid for and a one-sided comparison is better than no comparison.
  failure?: string;
  editorSkipped: boolean;
  fitRetried: boolean;
  styleIssues: string[];
  usage: { inputTokens: number; outputTokens: number; estimatedCostUsd: number; durationMs: number };
  // Per-call rows behind that total, so a later pass can tell the writer's price from the
  // verifier's without paying for the read a second time.
  calls: CompactCall[];
};

type IndexRow = { slug: string; name: string; domain: string; createdAt: string };

// Bands in preference order. Thin still runs when rich and medium cannot fill the limit; the
// thin-file gate, not the richness band, is what keeps an unreadable card out.
const BAND_ORDER: RichnessBand[] = ["rich", "medium", "thin"];

export function selectHowItWinsSlugs(
  candidates: HowItWinsCandidate[],
  input: { seed: string; limit: number }
): string[] {
  const rng = createSeededRng(input.seed);
  const eligible = candidates.filter(
    (entry) => entry.hasSynthesis && entry.thinFileReason === null
  );
  const ordered: string[] = [];
  for (const band of BAND_ORDER) {
    const inBand = eligible.filter((entry) => entry.richnessBand === band);
    ordered.push(...shuffled(inBand, rng).map((entry) => entry.slug));
  }
  return ordered.slice(0, input.limit);
}

export function armAssignment(
  seed: string,
  slug: string,
  arms: readonly [string, string]
): Record<ArmLabel, string> {
  const flip = createSeededRng(`${seed}:${slug}`)() < 0.5;
  return flip ? { A: arms[0], B: arms[1] } : { A: arms[1], B: arms[0] };
}

// ---- prompt arms ------------------------------------------------------------------------------

// One judge per card, then the frozen writer twice over that one verdict, once under a previous
// writer prompt and once under the one in the tree. The writer model is held fixed, so the only
// thing the reader compares is the prose the two prompts ask for.
export type PromptArms = {
  versions: [string, string];
  promptById: Record<string, string>;
  manifest: Record<string, { hash: string; source: string }>;
};

// Accepts either the prompt module (the constant is pulled out of it) or a file holding nothing
// but the prompt text.
export function frozenWriterPromptFromSource(source: string): string {
  const matched = FROZEN_WRITER_PROMPT_PATTERN.exec(source)?.[1];
  if (matched) return matched;
  if (source.includes("HOW_IT_WINS_FROZEN_WRITER_PROMPT")) {
    throw new Error("the source names HOW_IT_WINS_FROZEN_WRITER_PROMPT but no prompt literal parsed out of it");
  }
  const bare = source.trim();
  if (bare === "") throw new Error("the previous writer prompt source is empty");
  return bare;
}

export function promptVersionId(name: string, prompt: string): string {
  return `prompt-${name}-${hashBenchmarkValue(prompt).slice(0, 8)}`;
}

export function buildPromptArms(input: {
  previousSource: string;
  currentPrompt: string;
  origin: string;
}): PromptArms {
  const previous = frozenWriterPromptFromSource(input.previousSource);
  if (previous === input.currentPrompt) {
    throw new Error(`the writer prompt at ${input.origin} matches the shipped one; there is nothing to compare`);
  }
  const previousId = promptVersionId("previous", previous);
  const currentId = promptVersionId("current", input.currentPrompt);
  return {
    versions: [previousId, currentId],
    promptById: { [previousId]: previous, [currentId]: input.currentPrompt },
    manifest: {
      [previousId]: { hash: hashBenchmarkValue(previous), source: input.origin },
      [currentId]: { hash: hashBenchmarkValue(input.currentPrompt), source: "packages/llm/src/how-it-wins-judge-prompts.ts" }
    }
  };
}

// A path on disk wins over a git ref, so a working copy can be compared without committing it.
async function loadPromptArms(spec: string): Promise<PromptArms> {
  if (existsSync(spec)) {
    return buildPromptArms({
      previousSource: await readFile(spec, "utf8"),
      currentPrompt: HOW_IT_WINS_FROZEN_WRITER_PROMPT,
      origin: spec
    });
  }
  if (!spec.includes(":")) {
    throw new Error(`--previous-prompt ${spec} is neither a file on disk nor a <git-ref>:<path>`);
  }
  const { stdout } = await execFileAsync("git", ["show", spec], {
    cwd: process.cwd(),
    maxBuffer: 4 * 1024 * 1024
  });
  return buildPromptArms({
    previousSource: stdout,
    currentPrompt: HOW_IT_WINS_FROZEN_WRITER_PROMPT,
    origin: spec
  });
}

// ---- flags ------------------------------------------------------------------------------------

export type Flags = {
  limit: number;
  slugs: string[] | null;
  seed: string;
  writers: [string, string];
  judge: string | null;
  editor: string | null;
  out: string;
  verify: boolean;
  // Compare two writer prompts over one frozen verdict instead of two writer models. The writer
  // model is then writers[0] for both arms.
  promptArms: boolean;
  previousPrompt: string | null;
  // Absolute cumulative spend approved for this run, in USD. Required before any paid call:
  // main() rejects an unset cap, and parseFlags validates the value only when one is given, so a
  // caller who wants to unit-test the rest of Flags without a spend opinion still can.
  cap: number | null;
};

export function parseFlags(argv: string[]): Flags {
  const flags: Flags = {
    limit: DEFAULT_LIMIT,
    slugs: null,
    seed: DEFAULT_SEED,
    writers: DEFAULT_WRITERS,
    judge: null,
    editor: null,
    out: DEFAULT_OUT,
    verify: true,
    promptArms: false,
    previousPrompt: null,
    cap: null
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? "";
    const value = () => argv[++i] ?? "";
    if (arg === "--limit") flags.limit = Number.parseInt(value(), 10);
    else if (arg === "--slugs") flags.slugs = value().split(",").map((s) => s.trim()).filter(Boolean);
    else if (arg === "--seed") flags.seed = value();
    else if (arg === "--judge") flags.judge = value();
    else if (arg === "--editor") flags.editor = value();
    else if (arg === "--out") flags.out = value();
    else if (arg === "--verify") flags.verify = true;
    else if (arg === "--no-verify") flags.verify = false;
    else if (arg === "--cap") flags.cap = Number(value());
    else if (arg === "--prompt-arms") flags.promptArms = true;
    else if (arg === "--previous-prompt") flags.previousPrompt = value();
    else if (arg === "--writers") {
      const [first, second, ...rest] = value().split(",").map((s) => s.trim()).filter(Boolean);
      if (!first || !second || rest.length > 0) {
        throw new Error("--writers takes exactly two comma-separated models");
      }
      flags.writers = [first, second];
    } else if (arg.startsWith("--")) {
      throw new Error(`unknown flag: ${arg}`);
    }
  }
  if (!Number.isFinite(flags.limit) || flags.limit < 1) throw new Error("--limit must be a positive integer");
  if (flags.cap !== null && (!Number.isFinite(flags.cap) || flags.cap <= 0)) {
    throw new Error("--cap must be a positive number");
  }
  if (flags.promptArms && !flags.previousPrompt?.trim()) {
    throw new Error("--prompt-arms needs --previous-prompt <git-ref>:<path> or a file");
  }
  return flags;
}

export function requireCap(cap: number | null): number {
  if (cap === null) {
    throw new Error("this script requires an explicit --cap <usd>; there is no default spend approval");
  }
  return cap;
}

// ---- cap --------------------------------------------------------------------------------------

export class CapExceededError extends Error {}

// Checked before each paid stage against spend already tallied from telemetry, projecting the
// next stage off what the last one of its kind actually cost. The first stage of a run has no
// prior cost to project from and always clears: spend is zero and --cap is validated positive.
export function assertWithinCap(input: {
  stage: string;
  capUsd: number;
  spentUsd: number;
  nextCostUsd: number | null;
}) {
  const projectedUsd = input.spentUsd + (input.nextCostUsd ?? 0);
  if (projectedUsd > input.capUsd) {
    throw new CapExceededError(
      `--cap $${input.capUsd.toFixed(2)} would be exceeded by the next ${input.stage}: ` +
        `$${input.spentUsd.toFixed(4)} spent plus $${(input.nextCostUsd ?? 0).toFixed(4)} projects to $${projectedUsd.toFixed(4)}`
    );
  }
}

// ---- corpus -------------------------------------------------------------------------------------

type CorpusEntry = { row: IndexRow; band: RichnessBand; card: ColdStartCard };

async function loadCorpus(): Promise<Map<string, CorpusEntry>> {
  const indexPath = path.join(process.cwd(), CORPUS, "index.json");
  if (!existsSync(indexPath)) {
    throw new Error(`no corpus at ${CORPUS}; run "npm run eval:snapshot" first`);
  }
  const rows = JSON.parse(await readFile(indexPath, "utf8")) as Array<
    IndexRow & { richnessBand: RichnessBand; hasSynthesis: boolean }
  >;
  const entries = new Map<string, CorpusEntry>();
  for (const row of rows) {
    if (!row.hasSynthesis) continue;
    const file = JSON.parse(
      await readFile(path.join(process.cwd(), CORPUS, "cards", `${row.slug}.json`), "utf8")
    ) as { card: unknown };
    const parsed = coldStartCardSchema.safeParse(file.card);
    if (!parsed.success) {
      console.warn(`skip ${row.slug}: frozen card does not parse`);
      continue;
    }
    entries.set(row.slug, {
      row: { slug: row.slug, name: row.name, domain: row.domain, createdAt: row.createdAt },
      band: row.richnessBand,
      card: parsed.data
    });
  }
  return entries;
}

// ---- arms ---------------------------------------------------------------------------------------

// One arm that could not produce a read. The tokens it already spent stay on the record, so a
// half-failed card still accounts for what it cost. Bound matches buildLlmCallTrace's 300 chars.
export function failedArmResult(
  writer: string,
  error: unknown,
  calls: GenerationLlmCallTrace[]
): ArmResult {
  const message = error instanceof Error ? error.message : String(error);
  return {
    writer,
    preVerify: { status: "nothing_stands_out", inQuestion: [] },
    read: { status: "nothing_stands_out", inQuestion: [] },
    failure: message.slice(0, 300),
    editorSkipped: false,
    fitRetried: false,
    styleIssues: [],
    usage: usageFromCalls(calls),
    calls: compactCalls(calls)
  };
}

async function runArm(input: {
  client: Anthropic;
  card: ColdStartCard;
  judgeModel: string;
  writer: string;
  editor: string;
  verifyModel: string;
  verify: boolean;
  judgment: HowItWinsJudgment;
  // What the arm files itself under. The writer model in a model comparison, the prompt version
  // in a prompt comparison.
  armLabel: string;
  writerPrompt?: string;
  onCall: (call: GenerationLlmCallTrace) => void;
}): Promise<ArmResult> {
  const calls: GenerationLlmCallTrace[] = [];
  const telemetry = (call: GenerationLlmCallTrace) => {
    calls.push(call);
    input.onCall(call);
  };
  try {
    const result = await synthesizeHowItWins({
      client: input.client,
      models: { judge: input.judgeModel, writer: input.writer, editor: input.editor },
      card: input.card,
      telemetry,
      judgment: input.judgment,
      ...(input.writerPrompt ? { writerPrompt: input.writerPrompt } : {})
    });

    let read = result.read;
    let dropReason: ArmResult["dropReason"];
    if (input.verify && result.read.status === "read") {
      const verified = await verifyRead({
        client: input.client,
        model: input.verifyModel,
        card: input.card,
        read: result.read,
        telemetry
      });
      read = verified.howItWins;
      dropReason = verified.dropReason;
    }

    return {
      writer: input.armLabel,
      preVerify: result.read,
      read,
      ...(dropReason ? { dropReason } : {}),
      editorSkipped: result.editorSkipped,
      fitRetried: result.fitRetried,
      styleIssues: result.styleIssues,
      usage: usageFromCalls(calls),
      calls: compactCalls(calls)
    };
  } catch (error) {
    // A transient failure is worth retrying the whole card, so it still throws and skips it.
    // Anything else is this arm's outcome and must not cost the other arm its paid result.
    if (isTransientLlmError(error)) {
      throw error;
    }
    return failedArmResult(input.armLabel, error, calls);
  }
}

function statusLabel(arm: ArmResult): string {
  if (arm.failure) return "failed";
  if (arm.read.status !== "read") return arm.read.status;
  return `read/${arm.read.running.length}`;
}

// ---- gate ---------------------------------------------------------------------------------------

// The written arm file, read back loosely: a sitting can span versions of this script, and a
// field the gate does not need must never cost the whole summary.
export type HowItWinsArmFile = { arms?: Record<string, { writer?: string; read?: HowItWins } | undefined> };

type GateSummary = { writer: string; passed: boolean; reads: number; topStrategies: string };

// The frequency gate is the only check that needs the whole sitting rather than one card, so it
// runs once at the end over every arm file on disk. Pure, so the test feeds it arm files directly.
function strategyGateSummaries(files: HowItWinsArmFile[]): GateSummary[] {
  const byWriter = new Map<string, Array<{ synthesis: { howItWins: HowItWinsRead } }>>();
  for (const file of files) {
    for (const arm of Object.values(file.arms ?? {})) {
      if (!arm?.writer) continue;
      const cards = byWriter.get(arm.writer) ?? [];
      byWriter.set(arm.writer, cards);
      if (arm.read?.status === "read") cards.push({ synthesis: { howItWins: arm.read } });
    }
  }

  return [...byWriter.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([writer, cards]) => {
      const gate = strategyFrequencyGate(cards) as { passed: boolean; reads: number };
      const { share } = strategyFrequency(cards) as { share: Record<string, number> };
      const top = Object.entries(share)
        .sort(([leftName, left], [rightName, right]) => right - left || leftName.localeCompare(rightName))
        .slice(0, 3)
        .map(([strategy, value]) => `${strategy} ${value.toFixed(2)}`);
      return {
        writer,
        passed: gate.passed,
        reads: gate.reads,
        topStrategies: top.length > 0 ? top.join(", ") : "none"
      };
    });
}

export function strategyGateLines(files: HowItWinsArmFile[]): string[] {
  return strategyGateSummaries(files).map(
    (summary) =>
      `gate ${summary.writer}: ${summary.passed ? "passed" : "failed"} over ${summary.reads} reads; top strategies: ${summary.topStrategies}`
  );
}

export function anyStrategyGateFailed(files: HowItWinsArmFile[]): boolean {
  return strategyGateSummaries(files).some((summary) => !summary.passed);
}

async function armFilesInOutDir(outDir: string): Promise<{ files: HowItWinsArmFile[]; skipped: number }> {
  const names = (await readdir(outDir)).filter((name) => name.endsWith(".json") && name !== "index.json");
  const files: HowItWinsArmFile[] = [];
  let skipped = 0;
  for (const name of names.sort()) {
    try {
      files.push(JSON.parse(await readFile(path.join(outDir, name), "utf8")) as HowItWinsArmFile);
    } catch {
      skipped += 1;
      console.log(`skip ${name}: not readable as an arm file`);
    }
  }
  return { files, skipped };
}

async function writeIndex(outDir: string, row: IndexRow) {
  const indexPath = path.join(outDir, "index.json");
  let rows: IndexRow[] = [];
  if (existsSync(indexPath)) {
    rows = JSON.parse(await readFile(indexPath, "utf8")) as IndexRow[];
  }
  const existing = rows.findIndex((entry) => entry.slug === row.slug);
  if (existing >= 0) rows[existing] = row;
  else rows.push(row);
  await writeFile(indexPath, `${JSON.stringify(rows, null, 2)}\n`);
}

// ---- run -----------------------------------------------------------------------------------------

async function main() {
  loadRootEnv(process.cwd());
  const flags = parseFlags(process.argv.slice(2));
  const cap = requireCap(flags.cap);
  const corpus = await loadCorpus();

  const candidates: HowItWinsCandidate[] = [...corpus.values()].map((entry) => ({
    slug: entry.row.slug,
    richnessBand: entry.band,
    hasSynthesis: true,
    thinFileReason: howItWinsThinFileReason(entry.card)
  }));
  const slugs = flags.slugs ?? selectHowItWinsSlugs(candidates, { seed: flags.seed, limit: flags.limit });
  if (slugs.length === 0) {
    console.log("nothing to read: no corpus card carries synthesis and clears the thin-file gate");
    return;
  }

  const client = createAnthropicClient();
  const judgeModel = flags.judge?.trim() || process.env.LLM_HOW_IT_WINS_JUDGE_MODEL?.trim() || DEFAULT_JUDGE;
  const editorModel = flags.editor?.trim() || process.env.LLM_HOW_IT_WINS_EDITOR_MODEL?.trim() || HOW_IT_WINS_DEFAULT_EDITOR_MODEL;
  const verifyModel = modelForStage("verify");
  const promptArms = flags.promptArms && flags.previousPrompt ? await loadPromptArms(flags.previousPrompt) : null;
  const writerModel = flags.writers[0];
  const outDir = path.resolve(process.cwd(), flags.out);
  await mkdir(outDir, { recursive: true });
  console.log(
    promptArms
      ? `${slugs.length} cards, judge ${judgeModel}, writer ${writerModel} on ${promptArms.versions.join(" and ")}, critic ${editorModel}, verifier ${flags.verify ? verifyModel : "off"}, cap $${cap.toFixed(2)}`
      : `${slugs.length} cards, judge ${judgeModel}, writers ${flags.writers.join(" and ")}, critic ${editorModel}, verifier ${flags.verify ? verifyModel : "off"}, cap $${cap.toFixed(2)}`
  );

  // Tallied from telemetry as calls return, so the cap is checked against money actually spent
  // rather than against cards actually finished.
  let spent = 0;
  const onCall = (call: GenerationLlmCallTrace) => {
    spent += call.estimatedCostUsd ?? 0;
  };
  let lastJudgeCostUsd: number | null = null;
  let lastArmsCostUsd: number | null = null;

  for (const slug of slugs) {
    const entry = corpus.get(slug);
    if (!entry) {
      console.log(`${slug}  not in corpus`);
      continue;
    }
    const key = armAssignment(flags.seed, slug, promptArms?.versions ?? flags.writers);
    const startedAt = Date.now();
    const spentBeforeCard = spent;
    try {
      // Outside every catch below: a cap breach stops the sitting, it does not skip a card.
      assertWithinCap({ stage: "judge", capUsd: cap, spentUsd: spent, nextCostUsd: lastJudgeCostUsd });
      const judgeCalls: GenerationLlmCallTrace[] = [];
      const spentBeforeJudge = spent;
      const { judgment, cached } = await loadOrRunJudgment({
        card: entry.card,
        client,
        models: { judge: judgeModel, writer: writerModel, editor: editorModel },
        telemetry: (call) => {
          judgeCalls.push(call);
          onCall(call);
        },
        refinement: true
      });
      if (!cached) lastJudgeCostUsd = spent - spentBeforeJudge;

      assertWithinCap({ stage: "arm pair", capUsd: cap, spentUsd: spent, nextCostUsd: lastArmsCostUsd });
      const spentBeforeArms = spent;
      // One card at a time (Anthropic rate limits), but its two arms are independent.
      const run = (label: ArmLabel) =>
        runArm({
          client,
          card: entry.card,
          judgeModel,
          writer: promptArms ? writerModel : key[label],
          editor: editorModel,
          verifyModel,
          verify: flags.verify,
          judgment,
          armLabel: key[label],
          ...(promptArms ? { writerPrompt: promptArms.promptById[key[label]]! } : {}),
          onCall
        });
      const [armA, armB] = await Promise.all([run("A"), run("B")]);
      lastArmsCostUsd = spent - spentBeforeArms;

      const file = {
        slug,
        name: entry.row.name,
        domain: entry.row.domain,
        editor: editorModel,
        judge: {
          model: judgeModel,
          cached,
          usage: usageFromCalls(judgeCalls),
          calls: compactCalls(judgeCalls)
        },
        // The whole verdict, every strategy row included, so field-level measurement can run
        // offline against what the writer was actually handed.
        judgment,
        ...(promptArms ? { writerModel, prompts: promptArms.manifest } : {}),
        arms: { A: armA, B: armB },
        key
      };
      const filePath = path.join(outDir, `${slug}.json`);
      await writeFile(filePath, `${JSON.stringify(file, null, 2)}\n`);
      await writeIndex(outDir, { ...entry.row, createdAt: new Date().toISOString() });
      console.log(
        `${slug}  A ${statusLabel(armA)}  B ${statusLabel(armB)}  ${cached ? "cached verdict" : "fresh verdict"}  $${(spent - spentBeforeCard).toFixed(4)}  ${Math.round((Date.now() - startedAt) / 1000)}s`
      );
      await slopcheck(slug, filePath);
    } catch (error) {
      if (error instanceof CapExceededError) {
        console.log(error.message);
        console.log("cap reached; the rest of the sitting did not run");
        break;
      }
      console.log(
        `${slug}  failed after ${Math.round((Date.now() - startedAt) / 1000)}s: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  const { files: armFiles, skipped } = await armFilesInOutDir(outDir);
  console.log(`${armFiles.length} arm files read, ${skipped} skipped as unreadable`);
  for (const line of strategyGateLines(armFiles)) {
    console.log(line);
  }
  if (anyStrategyGateFailed(armFiles)) process.exitCode = 1;
  console.log(`total $${spent.toFixed(4)}`);
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
