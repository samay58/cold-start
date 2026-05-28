import assert from "node:assert/strict";
import test from "node:test";

import { extractResponseText, metricsFromError, metricsFromResponse, renderMarkdownReport } from "./harness.mjs";
import { buildTopTruthsPrompt, hashJson, normalizeSourceBundle } from "./prompt.mjs";
import { scoreTopTruthsOutput, validateTopTruthsOutput } from "./score.mjs";

const sourceBundle = {
  company: { name: "Browserbase", domain: "browserbase.com" },
  sources: [
    {
      id: "e1",
      title: "Browserbase profile",
      url: "https://browserbase.com/",
      sourceType: "company_site",
      authorityScore: 4,
      text: "Browserbase provides browser infrastructure for agents and automation.",
    },
    {
      id: "e2",
      title: "Series B report",
      url: "https://example.com/series-b",
      sourceType: "news",
      authorityScore: 6,
      text: "Browserbase raised a $40 million Series B and launched Director.",
    },
    {
      id: "e3",
      title: "Conflicting funding profile",
      url: "https://example.com/profile",
      sourceType: "other",
      authorityScore: 2,
      text: "A profile says Browserbase has raised $128.5 million in total funding.",
    },
  ],
};

const strongOutput = {
  truths: [
    {
      rank: 1,
      truth: "Browserbase is infrastructure for web-browsing agents, not a generic automation app.",
      whyRanked: "This is the highest-leverage read because it defines the buyer, workflow, and competitive frame.",
      evidenceStrong: ["Company product copy and independent funding coverage both point to browser infrastructure."],
      evidenceWeakOrConflicted: ["The exact breadth of non-agent automation adoption is less directly evidenced."],
      sourceIds: ["e1", "e2"],
    },
    {
      rank: 2,
      truth: "The June Series B and Director launch are the cleanest current momentum signals.",
      whyRanked: "They are recent, independently reported, and tie financing to product expansion.",
      evidenceStrong: ["The Series B report states the round and product launch."],
      evidenceWeakOrConflicted: ["Customer impact from Director is not yet proven."],
      sourceIds: ["e2"],
    },
    {
      rank: 3,
      truth: "Funding totals are material but should be treated as conflicted.",
      whyRanked: "The total affects stage read, but the evidence bundle has inconsistent totals.",
      evidenceStrong: ["The Series B amount is supported."],
      evidenceWeakOrConflicted: ["The cumulative $128.5 million figure is not reconciled against individual rounds."],
      sourceIds: ["e2", "e3"],
    },
    {
      rank: 4,
      truth: "The company is trying to abstract browser execution complexity for developers.",
      whyRanked: "This explains why the product may matter operationally beyond headline AI-agent demand.",
      evidenceStrong: ["Company copy names browser infrastructure and automation."],
      evidenceWeakOrConflicted: ["The bundle does not quantify reliability or unit economics."],
      sourceIds: ["e1"],
    },
    {
      rank: 5,
      truth: "Director broadens the product surface, but its adoption should not outrank core infrastructure proof.",
      whyRanked: "It is strategically relevant, yet weaker than the core infrastructure and financing evidence.",
      evidenceStrong: ["Director is tied to the Series B report."],
      evidenceWeakOrConflicted: ["No usage metrics for Director appear in the frozen bundle."],
      sourceIds: ["e2"],
    },
  ],
  excludedClaims: [
    {
      claim: "Browserbase has definitively raised $128.5 million.",
      whyExcluded: "The bundle contains the figure, but it is not reconciled with round-level evidence.",
      sourceIds: ["e3"],
    },
    {
      claim: "Director already has strong customer adoption.",
      whyExcluded: "The bundle supports launch, not adoption.",
      sourceIds: ["e2"],
    },
  ],
  evidenceStrong: ["The product category and Series B are directly supported."],
  evidenceConflictedOrWeak: ["Total funding and Director adoption are weaker than the launch facts."],
  hardestConflict: {
    conflict: "Whether to accept the cumulative funding total.",
    whyHard: "It changes stage read, but the source bundle does not reconcile every round.",
    workingResolution: "Use the Series B amount confidently and mark cumulative funding unresolved.",
  },
};

test("buildTopTruthsPrompt freezes the exact task against the normalized source bundle", () => {
  const normalized = normalizeSourceBundle(sourceBundle);
  const prompt = buildTopTruthsPrompt(normalized);

  assert.match(prompt, /Using only this frozen source bundle/);
  assert.match(prompt, /The 5 truths in rank order/);
  assert.match(prompt, /Do not optimize for prose/);
  assert.match(prompt, /SOURCE_BUNDLE_JSON/);
  assert.equal(normalized.sources[0].id, "e1");
  assert.equal(hashJson(normalized), hashJson(normalizeSourceBundle(sourceBundle)));
});

test("validateTopTruthsOutput requires exact ranking, exclusions, and a real hardest conflict", () => {
  assert.deepEqual(validateTopTruthsOutput(strongOutput), []);

  const weakOutput = {
    truths: [{ rank: 1, truth: "Browserbase is an AI company.", whyRanked: "Important." }],
    excludedClaims: [],
    evidenceStrong: [],
    evidenceConflictedOrWeak: [],
    hardestConflict: { conflict: "", whyHard: "", workingResolution: "" },
  };

  assert.deepEqual(
    validateTopTruthsOutput(weakOutput).map((issue) => issue.code),
    [
      "truth_count",
      "truth_support",
      "excluded_claim_count",
      "strong_evidence_missing",
      "weak_evidence_missing",
      "hardest_conflict_missing",
    ],
  );
});

test("scoreTopTruthsOutput rewards judgment, exclusion, and conflict handling over summary shape", () => {
  const strongScore = scoreTopTruthsOutput(strongOutput);
  const weakScore = scoreTopTruthsOutput({
    truths: Array.from({ length: 5 }, (_, index) => ({
      rank: index + 1,
      truth: `Browserbase fact ${index + 1}`,
      whyRanked: "It is important.",
      evidenceStrong: [],
      evidenceWeakOrConflicted: [],
      sourceIds: [],
    })),
    excludedClaims: [],
    evidenceStrong: [],
    evidenceConflictedOrWeak: [],
    hardestConflict: { conflict: "None", whyHard: "None", workingResolution: "None" },
  });

  assert.equal(strongScore.total, 15);
  assert.ok(strongScore.total > weakScore.total);
  assert.equal(strongScore.dimensions.exclusionDiscipline.score, 3);
  assert.equal(strongScore.dimensions.conflictHandling.score, 3);
});

test("metricsFromResponse extracts output text and token usage without guessing cost", () => {
  const payload = {
    id: "resp-test",
    model: "fugu-mini",
    output: [
      {
        type: "message",
        content: [{ type: "output_text", text: "hello" }],
      },
    ],
    usage: {
      input_tokens: 82,
      output_tokens: 9,
      total_tokens: 91,
    },
  };

  assert.equal(extractResponseText(payload), "hello");
  assert.deepEqual(metricsFromResponse(payload, { latencyMs: 1234 }), {
    responseId: "resp-test",
    model: "fugu-mini",
    latencyMs: 1234,
    inputTokens: 82,
    outputTokens: 9,
    totalTokens: 91,
    estimatedCostUsd: null,
  });
});

test("metricsFromError records failed model latency without guessing cost", () => {
  assert.deepEqual(metricsFromError({ model: "fugu-ultra", latencyMs: 180001 }), {
    model: "fugu-ultra",
    latencyMs: 180001,
    inputTokens: undefined,
    outputTokens: undefined,
    totalTokens: undefined,
    estimatedCostUsd: null,
  });
});

test("renderMarkdownReport keeps the eval scannable and includes exclusions", () => {
  const report = renderMarkdownReport({
    run: {
      id: "2026-05-28-browserbase",
      company: sourceBundle.company,
      sourceBundleHash: "bundle-hash",
      promptHash: "prompt-hash",
      generatedAt: "2026-05-28T00:00:00.000Z",
    },
    results: [
      {
        label: "fugu-mini",
        model: "fugu-mini",
        output: strongOutput,
        score: scoreTopTruthsOutput(strongOutput),
        metrics: { latencyMs: 1000, inputTokens: 10, outputTokens: 20, totalTokens: 30, estimatedCostUsd: null },
        artifactPath: "runs/raw/fugu-mini.json",
      },
    ],
  });

  assert.match(report, /# Fugu Top-5 Truths Eval/);
  assert.match(report, /Browserbase/);
  assert.match(report, /Excluded Claims/);
  assert.match(report, /cumulative funding total/);
  assert.doesNotMatch(report, /\u2014/);
});
