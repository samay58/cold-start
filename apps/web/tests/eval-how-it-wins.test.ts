import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { POST } from "../src/app/eval/api/ledger/route";
import HowItWinsPage from "../src/app/eval/how-it-wins/page";

// The verdict form is a client component; rendering the page for real needs a router to exist.
// Mocking the router rather than the form keeps the form's own markup inside the assertion.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined }) }));
import { nextHowItWinsSlug, readHowItWinsReads } from "../src/app/eval/rig-data";
import type { LedgerEvent } from "../src/app/eval/types";

const indexRow = (slug: string) => ({
  slug,
  name: slug.toUpperCase(),
  domain: `${slug}.com`,
  createdAt: "2026-08-01T00:00:00Z",
  updatedAt: "2026-08-01T00:00:00Z",
  eraBucket: "august-current",
  hasSynthesis: true,
  sourceCount: 12,
  sourceQuality: {},
  citationCount: 14,
  bullCount: 3,
  bearCount: 3,
  openQuestionCount: 3,
  sectionsPresent: [],
  richnessScore: 9,
  richnessBand: "rich",
  routing: null,
  costUsd: null
});

const read = {
  status: "read" as const,
  sentence: "Two frontier labs cite its evaluations by name.",
  running: [
    { strategy: "prestige" as const, meaning: "Authoritative sources vouch for it.", note: "Cited by name [c1]. Observed.", citationIds: ["c1"] },
    { strategy: "specialization" as const, meaning: "It is strong in one narrow place.", note: "Only evaluations [c2]. Observed.", citationIds: ["c2"] }
  ],
  pair: null,
  next: [],
  wrongIf: "The citations turn out to be paid placements.",
  inQuestion: []
};

const armFile = (slug: string) => ({
  slug,
  name: slug.toUpperCase(),
  domain: `${slug}.com`,
  editor: "deepseek/deepseek-v4-pro",
  arms: {
    A: {
      writer: "claude-sonnet-5",
      preVerify: read,
      read,
      editorSkipped: false,
      fitRetried: false,
      styleIssues: [],
      usage: { inputTokens: 100, outputTokens: 200, estimatedCostUsd: 0.25, durationMs: 1000 }
    },
    B: {
      writer: "claude-sonnet-4-6",
      preVerify: read,
      read,
      editorSkipped: false,
      fitRetried: false,
      styleIssues: [],
      usage: { inputTokens: 100, outputTokens: 200, estimatedCostUsd: 0.2, durationMs: 900 }
    }
  },
  key: { A: "claude-sonnet-5", B: "claude-sonnet-4-6" }
});

// The failure text names the writer's provider in real runs, so it is the thing that must not
// reach the arm column. Both the parser test and the blindness tests file the same card.
const FAILURE_TEXT = "how-it-wins draft invalid: running strategies must be distinct";

async function writeHalfFailedAlpha() {
  const halfFailed = armFile("alpha");
  halfFailed.arms.B = {
    writer: "claude-sonnet-4-6",
    preVerify: { status: "nothing_stands_out" },
    read: { status: "nothing_stands_out" },
    failure: FAILURE_TEXT,
    editorSkipped: false,
    fitRetried: false,
    styleIssues: [],
    usage: { inputTokens: 90, outputTokens: 10, estimatedCostUsd: 0.02, durationMs: 800 }
  } as (typeof halfFailed)["arms"]["B"];
  await writeFile(path.join(dir, "how-it-wins", "alpha.json"), JSON.stringify(halfFailed));
}

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "rig-hiw-"));
  vi.stubEnv("EVAL_RIG_ENABLED", "true");
  vi.stubEnv("EVAL_RIG_DATA_DIR", dir);
  await mkdir(path.join(dir, "corpus"), { recursive: true });
  await mkdir(path.join(dir, "how-it-wins"), { recursive: true });
  await writeFile(
    path.join(dir, "corpus", "index.json"),
    JSON.stringify([indexRow("alpha"), indexRow("beta")])
  );
  await writeFile(
    path.join(dir, "how-it-wins", "index.json"),
    JSON.stringify([
      { slug: "alpha", name: "ALPHA", domain: "alpha.com", createdAt: "2026-08-19T00:00:00Z" },
      { slug: "beta", name: "BETA", domain: "beta.com", createdAt: "2026-08-19T00:01:00Z" }
    ])
  );
  await writeFile(path.join(dir, "how-it-wins", "alpha.json"), JSON.stringify(armFile("alpha")));
  await writeFile(path.join(dir, "how-it-wins", "beta.json"), JSON.stringify(armFile("beta")));
});

afterEach(() => vi.unstubAllEnvs());

const post = (payload: unknown) =>
  POST(
    new Request("http://rig/eval/api/ledger", {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "content-type": "application/json" }
    })
  );

const verdict = {
  kind: "how-it-wins",
  slug: "alpha",
  pick: "A",
  ratings: { A: "ship", B: "weak" },
  note: ""
};

describe("how-it-wins rig data", () => {
  it("reads the index in run order with both arms and the key", async () => {
    const reads = await readHowItWinsReads();
    expect(reads.map((entry) => entry.slug)).toEqual(["alpha", "beta"]);
    expect(reads[0].arms.A.writer).toBe("claude-sonnet-5");
    expect(reads[0].key.B).toBe("claude-sonnet-4-6");
  });

  // The judge-then-writer path on main names its critic and judge instead of a hostile editor,
  // and never sets editorSkipped or fitRetried; both go back to the retired four-pass writer.
  it("reads a production-path file with no editor, editorSkipped, or fitRetried", async () => {
    const productionPathFile = {
      slug: "gamma",
      name: "GAMMA",
      domain: "gamma.com",
      writerModel: "claude-sonnet-5",
      critic: "deepseek/deepseek-v4-pro",
      judge: { model: "claude-opus-5" },
      prompts: { writer: "current" },
      arms: {
        A: {
          writer: "claude-sonnet-5",
          preVerify: read,
          read,
          styleIssues: [],
          usage: { inputTokens: 100, outputTokens: 200, estimatedCostUsd: 0.25, durationMs: 1000 },
          calls: [
            {
              label: "how-it-wins-frozen-writer",
              model: "claude-sonnet-5",
              status: "ok",
              inputTokens: 100,
              outputTokens: 200,
              durationMs: 1000,
              estimatedCostUsd: 0.25
            }
          ]
        },
        B: {
          writer: "claude-sonnet-4-6",
          preVerify: read,
          read,
          styleIssues: [],
          usage: { inputTokens: 100, outputTokens: 200, estimatedCostUsd: 0.2, durationMs: 900 },
          calls: []
        }
      },
      key: { A: "claude-sonnet-5", B: "claude-sonnet-4-6" }
    };
    await writeFile(
      path.join(dir, "how-it-wins", "index.json"),
      JSON.stringify([
        { slug: "alpha", name: "ALPHA", domain: "alpha.com", createdAt: "2026-08-19T00:00:00Z" },
        { slug: "beta", name: "BETA", domain: "beta.com", createdAt: "2026-08-19T00:01:00Z" },
        { slug: "gamma", name: "GAMMA", domain: "gamma.com", createdAt: "2026-08-19T00:02:00Z" }
      ])
    );
    await writeFile(path.join(dir, "how-it-wins", "gamma.json"), JSON.stringify(productionPathFile));

    const reads = await readHowItWinsReads();
    const gamma = reads.find((entry) => entry.slug === "gamma");
    expect(gamma?.editor).toBeUndefined();
    expect(gamma?.arms.A.editorSkipped).toBeUndefined();
    expect(gamma?.arms.A.fitRetried).toBeUndefined();
    expect(gamma?.arms.A.writer).toBe("claude-sonnet-5");
  });

  it("accepts an arm that failed, carrying its message and its spent tokens", async () => {
    await writeHalfFailedAlpha();

    const reads = await readHowItWinsReads();
    expect(reads[0].arms.B.failure).toContain("must be distinct");
    expect(reads[0].arms.B.usage.estimatedCostUsd).toBe(0.02);
    expect(reads[0].arms.A.failure).toBeUndefined();
  });

  it("returns the first slug with no how-it-wins event", () => {
    const reads = [
      { slug: "alpha", name: "ALPHA", domain: "alpha.com" },
      { slug: "beta", name: "BETA", domain: "beta.com" }
    ];
    const judgedAlpha = [{ kind: "how-it-wins", slug: "alpha" } as unknown as LedgerEvent];
    expect(nextHowItWinsSlug(reads, [])).toBe("alpha");
    expect(nextHowItWinsSlug(reads, judgedAlpha)).toBe("beta");
    expect(
      nextHowItWinsSlug(reads, [
        ...judgedAlpha,
        { kind: "how-it-wins", slug: "beta" } as unknown as LedgerEvent
      ])
    ).toBeNull();
  });

  it("ignores other event kinds when deciding what is unjudged", () => {
    const reads = [{ slug: "alpha", name: "ALPHA", domain: "alpha.com" }];
    const other = [{ kind: "deep-single", slug: "alpha" } as unknown as LedgerEvent];
    expect(nextHowItWinsSlug(reads, other)).toBe("alpha");
  });
});

describe("ledger route, how-it-wins verdicts", () => {
  it("appends the verdict and reveals which model wrote each arm", async () => {
    const response = await post(verdict);
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.key).toEqual({ A: "claude-sonnet-5", B: "claude-sonnet-4-6" });
    const lines = (await readFile(path.join(dir, "ledger", "picks.jsonl"), "utf8")).trim().split("\n");
    expect(lines).toHaveLength(1);
    const logged = JSON.parse(lines[0]);
    expect(logged.kind).toBe("how-it-wins");
    expect(logged.pick).toBe("A");
    expect(logged.ratings).toEqual({ A: "ship", B: "weak" });
    expect(logged.ts).toBeTruthy();
  });

  it("accepts neither as a pick", async () => {
    expect((await post({ ...verdict, pick: "neither" })).status).toBe(200);
  });

  it("rejects a rating outside ship, weak, slop", async () => {
    expect((await post({ ...verdict, ratings: { A: "great", B: "weak" } })).status).toBe(400);
  });

  it("rejects a verdict for a slug with no filed read, and writes nothing", async () => {
    const response = await post({ ...verdict, slug: "gamma" });
    expect(response.status).toBe(400);
    await expect(readFile(path.join(dir, "ledger", "picks.jsonl"), "utf8")).rejects.toThrow();
  });

  it("still accepts a verdict for the second filed read", async () => {
    const response = await post({ ...verdict, slug: "beta", pick: "neither" });
    expect(response.status).toBe(200);
    expect((await response.json()).key).toEqual({ A: "claude-sonnet-5", B: "claude-sonnet-4-6" });
  });
});

describe("a failed arm stays blind until the verdict", () => {
  it("keeps the failure text out of the pre-verdict page", async () => {
    await writeHalfFailedAlpha();
    const html = renderToStaticMarkup(await HowItWinsPage());

    expect(html).toContain("This read did not come back.");
    expect(html).not.toContain(FAILURE_TEXT);
    expect(html).not.toContain("claude-sonnet-4-6");
    expect(html).not.toContain("claude-sonnet-5");
  });

  it("returns the failure text with the key once the verdict is logged", async () => {
    await writeHalfFailedAlpha();
    const payload = await (await post(verdict)).json();

    expect(payload.key).toEqual({ A: "claude-sonnet-5", B: "claude-sonnet-4-6" });
    expect(payload.failures).toEqual({ B: FAILURE_TEXT });
  });

  it("omits failures entirely when both arms filed", async () => {
    const payload = await (await post(verdict)).json();
    expect(payload.key).toBeTruthy();
    expect(payload.failures).toBeUndefined();
  });
});
