import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { POST } from "../src/app/eval/api/ledger/route";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "rig-ledger-"));
  vi.stubEnv("EVAL_RIG_ENABLED", "true");
  vi.stubEnv("EVAL_RIG_DATA_DIR", dir);
  await mkdir(path.join(dir, "corpus"), { recursive: true });
  await writeFile(path.join(dir, "corpus", "index.json"), JSON.stringify([
    { slug: "a", name: "A", domain: "a.com", createdAt: "2026-05-01T00:00:00Z", updatedAt: "2026-05-01T00:00:00Z",
      eraBucket: "may-pre-gate", hasSynthesis: true, sourceCount: 5, sourceQuality: {}, citationCount: 9,
      bullCount: 2, bearCount: 2, openQuestionCount: 3, sectionsPresent: [], richnessScore: 5,
      richnessBand: "thin", routing: null, costUsd: null }
  ]));
});
afterEach(() => vi.unstubAllEnvs());

const body = { kind: "quick-pick", roundIndex: 0, group: ["a", "b", "c", "d"], winner: "a",
  chips: ["better-comps"], note: "", knowsSpace: false };
const post = (payload: unknown) => POST(new Request("http://rig/eval/api/ledger", {
  method: "POST", body: JSON.stringify(payload), headers: { "content-type": "application/json" } }));

describe("ledger route", () => {
  it("404s when the rig is disabled", async () => {
    vi.stubEnv("EVAL_RIG_ENABLED", "");
    expect((await post(body)).status).toBe(404);
  });

  it("rejects a winner outside the group", async () => {
    expect((await post({ ...body, winner: "zzz" })).status).toBe(400);
  });

  it("appends one line per event and returns the reveal", async () => {
    const first = await post(body);
    expect(first.status).toBe(200);
    const reveal = (await first.json()).reveal;
    expect(reveal.find((r: { slug: string }) => r.slug === "a").eraBucket).toBe("may-pre-gate");
    await post({ ...body, roundIndex: 1 });
    const lines = (await readFile(path.join(dir, "ledger", "picks.jsonl"), "utf8")).trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).ts).toBeTruthy();
  });
});
