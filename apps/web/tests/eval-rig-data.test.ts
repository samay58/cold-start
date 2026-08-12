import { describe, expect, it, vi, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { nextQuickPickRound, nextDeepSlug, readLedger, readCardFile } from "../src/app/eval/rig-data";

const plan = { seed: "s", groupSize: 4, rounds: [
  { index: 0, slugs: ["a", "b", "c", "d"], mixedBand: false },
  { index: 1, slugs: ["e", "f", "g", "h"], mixedBand: false }
]};
const pick = (roundIndex: number) => ({
  kind: "quick-pick" as const, roundIndex, group: ["a", "b", "c", "d"],
  winner: "a", chips: [], note: "", knowsSpace: false, ts: "2026-08-11T00:00:00Z"
});

afterEach(() => vi.unstubAllEnvs());

describe("round progression", () => {
  it("serves the first unanswered round and null when done", () => {
    expect(nextQuickPickRound(plan, [])?.index).toBe(0);
    expect(nextQuickPickRound(plan, [pick(0)])?.index).toBe(1);
    expect(nextQuickPickRound(plan, [pick(0), pick(1)])).toBeNull();
  });

  it("deep singles progress by finalist order", () => {
    const done = { kind: "deep-single" as const, slug: "a", tier: "S" as const, layers: "both" as const,
      chips: [], missingComps: [], note: "", knowsSpace: false, ts: "2026-08-11T00:00:00Z" };
    expect(nextDeepSlug(["a", "b"], [])).toBe("a");
    expect(nextDeepSlug(["a", "b"], [done])).toBe("b");
  });
});

describe("ledger and card reads", () => {
  it("reads events back and rejects traversal slugs", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "rig-"));
    vi.stubEnv("EVAL_RIG_DATA_DIR", dir);
    await mkdir(path.join(dir, "ledger"), { recursive: true });
    await writeFile(path.join(dir, "ledger", "picks.jsonl"), JSON.stringify(pick(0)) + "\n");
    const events = await readLedger();
    expect(events).toHaveLength(1);
    await expect(readCardFile("../secrets")).rejects.toThrow();
  });
});
