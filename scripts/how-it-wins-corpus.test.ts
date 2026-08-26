import { test } from "node:test";
import assert from "node:assert/strict";
import type { GenerationLlmCallTrace, HowItWinsRead, HowItWinsStrategyId } from "@cold-start/core";
import {
  armAssignment,
  buildPromptArms,
  failedArmResult,
  frozenWriterPromptFromSource,
  parseFlags,
  promptVersionId,
  selectHowItWinsSlugs,
  strategyGateLines,
  type HowItWinsArmFile,
  type HowItWinsCandidate
} from "./how-it-wins-corpus";

function candidate(slug: string, over: Partial<HowItWinsCandidate> = {}): HowItWinsCandidate {
  return { slug, richnessBand: "rich", hasSynthesis: true, thinFileReason: null, ...over };
}

test("selection skips cards with no synthesis and cards the thin-file gate rejects", () => {
  const picked = selectHowItWinsSlugs(
    [
      candidate("kept"),
      candidate("no-synthesis", { hasSynthesis: false }),
      candidate("too-few", { thinFileReason: "too-few-sources" }),
      candidate("no-company", { thinFileReason: "no-company-authored" })
    ],
    { seed: "how-it-wins-1", limit: 20 }
  );
  assert.deepEqual(picked, ["kept"]);
});

test("selection prefers rich, then medium, then thin", () => {
  const picked = selectHowItWinsSlugs(
    [
      candidate("t1", { richnessBand: "thin" }),
      candidate("m1", { richnessBand: "medium" }),
      candidate("r1", { richnessBand: "rich" }),
      candidate("m2", { richnessBand: "medium" }),
      candidate("r2", { richnessBand: "rich" })
    ],
    { seed: "how-it-wins-1", limit: 5 }
  );
  assert.deepEqual(picked.slice(0, 2).sort(), ["r1", "r2"]);
  assert.deepEqual(picked.slice(2, 4).sort(), ["m1", "m2"]);
  assert.equal(picked[4], "t1");
});

test("selection takes the limit off the front of the preferred order", () => {
  const candidates = [
    candidate("r1"),
    candidate("r2"),
    candidate("r3"),
    candidate("m1", { richnessBand: "medium" })
  ];
  const picked = selectHowItWinsSlugs(candidates, { seed: "how-it-wins-1", limit: 2 });
  assert.equal(picked.length, 2);
  assert.ok(picked.every((slug) => slug.startsWith("r")));
});

test("selection is deterministic per seed and moves with the seed", () => {
  const candidates = Array.from({ length: 12 }, (_, i) => candidate(`r${i}`));
  const a = selectHowItWinsSlugs(candidates, { seed: "how-it-wins-1", limit: 6 });
  const b = selectHowItWinsSlugs(candidates, { seed: "how-it-wins-1", limit: 6 });
  const c = selectHowItWinsSlugs(candidates, { seed: "how-it-wins-2", limit: 6 });
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
});

test("arm assignment is a seeded per-card flip that keeps both writers", () => {
  const writers: [string, string] = ["claude-sonnet-5", "claude-sonnet-4-6"];
  const first = armAssignment("how-it-wins-1", "acme", writers);
  assert.deepEqual(first, armAssignment("how-it-wins-1", "acme", writers));
  assert.deepEqual([first.A, first.B].sort(), [...writers].sort());

  const slugs = Array.from({ length: 20 }, (_, i) => `card-${i}`);
  const assignments = slugs.map((slug) => armAssignment("how-it-wins-1", slug, writers).A);
  assert.ok(new Set(assignments).size === 2, "both writers should land in slot A across cards");
});

test("the verifier is on by default and both --verify and --no-verify are accepted", () => {
  assert.equal(parseFlags([]).verify, true);
  assert.equal(parseFlags(["--verify"]).verify, true);
  assert.equal(parseFlags(["--no-verify"]).verify, false);
  assert.equal(parseFlags(["--no-verify", "--verify"]).verify, true);
  assert.throws(() => parseFlags(["--verifyy"]), /unknown flag/);
});

test("writer flags take exactly two models", () => {
  assert.deepEqual(parseFlags(["--writers", "one,two"]).writers, ["one", "two"]);
  assert.throws(() => parseFlags(["--writers", "one"]), /exactly two/);
  assert.throws(() => parseFlags(["--writers", "one,two,three"]), /exactly two/);
});

test("a failed arm keeps its writer, its spent tokens, and a bounded message", () => {
  const calls: GenerationLlmCallTrace[] = [
    { stage: "how_it_wins", label: "how-it-wins-reason", model: "m", provider: "anthropic",
      status: "ok", durationMs: 900, inputTokens: 120, outputTokens: 40, estimatedCostUsd: 0.01 },
    { stage: "how_it_wins", label: "how-it-wins-edit", model: "m", provider: "anthropic",
      status: "failed", durationMs: 100, inputTokens: 30, outputTokens: 0 }
  ];
  const arm = failedArmResult("claude-sonnet-5", new Error("how-it-wins draft invalid: no running"), calls);

  assert.equal(arm.writer, "claude-sonnet-5");
  assert.equal(arm.read.status, "nothing_stands_out");
  assert.equal(arm.preVerify.status, "nothing_stands_out");
  assert.equal(arm.failure, "how-it-wins draft invalid: no running");
  assert.equal(arm.editorSkipped, false);
  assert.equal(arm.fitRetried, false);
  assert.deepEqual(arm.styleIssues, []);
  assert.deepEqual(arm.usage, { inputTokens: 150, outputTokens: 40, estimatedCostUsd: 0.01, durationMs: 1000 });
  assert.deepEqual(arm.calls.map((row) => [row.label, row.status]), [
    ["how-it-wins-reason", "ok"],
    ["how-it-wins-edit", "failed"]
  ]);
});

test("a failed arm bounds a runaway message and survives a non-Error throw", () => {
  const long = failedArmResult("w", new Error("x".repeat(500)), []);
  assert.equal(long.failure?.length, 300);
  assert.equal(failedArmResult("w", "plain string blew up", []).failure, "plain string blew up");
});

function filedRead(strategies: HowItWinsStrategyId[]): HowItWinsRead {
  return {
    status: "read",
    sentence: "It wins on one narrow surface its buyers already stand on.",
    running: strategies.map((strategy) => ({
      strategy,
      meaning: "It goes deep on one surface instead of the whole toolchain.",
      note: "Every shipped feature lands there [c1].",
      citationIds: ["c1"]
    })),
    pair: null,
    next: [],
    inQuestion: [],
    wrongIf: "A competitor ships the same surface with no switching cost."
  };
}

// writer-a leans on chokepoint in all 12 reads, which is the staleness the gate exists to catch.
// writer-b spreads across three, none past the half-share ceiling.
function sittingFiles(): HowItWinsArmFile[] {
  const bWays: HowItWinsStrategyId[][] = [
    ...Array.from({ length: 5 }, () => ["chokepoint"] as HowItWinsStrategyId[]),
    ...Array.from({ length: 4 }, () => ["hybrid"] as HowItWinsStrategyId[]),
    ...Array.from({ length: 3 }, () => ["prestige"] as HowItWinsStrategyId[])
  ];
  return bWays.map((ways, index) => ({
    arms: {
      A: { writer: "writer-a", read: filedRead(["chokepoint", index < 6 ? "hybrid" : "prestige"]) },
      B: { writer: "writer-b", read: filedRead(ways) }
    }
  }));
}

test("gate lines fail a writer leaning on one way and pass a writer that spreads", () => {
  assert.deepEqual(strategyGateLines(sittingFiles()), [
    "gate writer-a: failed over 12 reads; top strategies: chokepoint 1.00, hybrid 0.50, prestige 0.50",
    "gate writer-b: passed over 12 reads; top strategies: chokepoint 0.42, hybrid 0.33, prestige 0.25"
  ]);
});

test("gate lines count only filed reads and still name a writer that filed none", () => {
  assert.deepEqual(
    strategyGateLines([
      {
        arms: {
          A: { writer: "quiet", read: { status: "nothing_stands_out", inQuestion: [] } },
          B: { writer: "loud", read: filedRead(["hybrid"]) }
        }
      },
      { arms: { A: { writer: "quiet", read: { status: "thin_file" } } } },
      { arms: {} },
      {}
    ]),
    [
      "gate loud: passed over 1 reads; top strategies: hybrid 1.00",
      "gate quiet: passed over 0 reads; top strategies: none"
    ]
  );
});

// ---- prompt arms ------------------------------------------------------------------------------------

const PROMPT_MODULE_SOURCE = [
  'export const HOW_IT_WINS_SOMETHING_ELSE = `not this one`;',
  "",
  "export const HOW_IT_WINS_FROZEN_WRITER_PROMPT = `Write the judgment up.",
  "",
  "Two paragraphs, no slogans.`;",
  "",
  "export const AFTER = 1;"
].join("\n");

test("--prompt-arms needs a prompt to compare against", () => {
  assert.throws(() => parseFlags(["--prompt-arms"]), /--previous-prompt/);
  assert.throws(() => parseFlags(["--prompt-arms", "--previous-prompt", "  "]), /--previous-prompt/);
  const flags = parseFlags(["--prompt-arms", "--previous-prompt", "abc123:packages/llm/src/how-it-wins-judge-prompts.ts"]);
  assert.equal(flags.promptArms, true);
  assert.equal(flags.previousPrompt, "abc123:packages/llm/src/how-it-wins-judge-prompts.ts");
  assert.equal(parseFlags([]).promptArms, false);
});

test("the previous prompt comes out of a prompt module or straight out of a plain file", () => {
  assert.equal(
    frozenWriterPromptFromSource(PROMPT_MODULE_SOURCE),
    "Write the judgment up.\n\nTwo paragraphs, no slogans."
  );
  assert.equal(frozenWriterPromptFromSource("  Just the prompt text.  "), "Just the prompt text.");
  assert.throws(() => frozenWriterPromptFromSource("   "), /empty/);
  assert.throws(
    () => frozenWriterPromptFromSource("export const HOW_IT_WINS_FROZEN_WRITER_PROMPT = readFile();"),
    /no prompt literal/
  );
});

test("prompt arms name both versions, carry both prompts, and record where each came from", () => {
  const arms = buildPromptArms({
    previousSource: PROMPT_MODULE_SOURCE,
    currentPrompt: "Write the judgment up at the bar of the rest of the lens.",
    origin: "abc123:packages/llm/src/how-it-wins-judge-prompts.ts"
  });
  const [previousId, currentId] = arms.versions;
  assert.equal(previousId, promptVersionId("previous", "Write the judgment up.\n\nTwo paragraphs, no slogans."));
  assert.match(currentId, /^prompt-current-[0-9a-f]{8}$/);
  assert.equal(arms.promptById[previousId], "Write the judgment up.\n\nTwo paragraphs, no slogans.");
  assert.equal(arms.promptById[currentId], "Write the judgment up at the bar of the rest of the lens.");
  assert.equal(arms.manifest[previousId]?.source, "abc123:packages/llm/src/how-it-wins-judge-prompts.ts");
  assert.equal(arms.manifest[currentId]?.source, "packages/llm/src/how-it-wins-judge-prompts.ts");
  assert.notEqual(arms.manifest[previousId]?.hash, arms.manifest[currentId]?.hash);
});

test("two identical prompts are refused rather than read as a comparison", () => {
  assert.throws(
    () => buildPromptArms({ previousSource: "Same prompt.", currentPrompt: "Same prompt.", origin: "HEAD:x.ts" }),
    /nothing to compare/
  );
});

test("prompt versions are assigned to slots the same seeded way writer models are", () => {
  const versions: [string, string] = ["prompt-previous-aaaaaaaa", "prompt-current-bbbbbbbb"];
  const first = armAssignment("how-it-wins-1", "acme", versions);
  assert.deepEqual(first, armAssignment("how-it-wins-1", "acme", versions));
  assert.deepEqual([first.A, first.B].sort(), [...versions].sort());

  const slots = Array.from({ length: 20 }, (_, i) => armAssignment("how-it-wins-1", `card-${i}`, versions).A);
  assert.equal(new Set(slots).size, 2, "both prompt versions should land in slot A across cards");
});
