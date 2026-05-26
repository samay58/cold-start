import assert from "node:assert/strict";
import test from "node:test";

import { runGoldenEval, scoreEvalResult } from "./harness.mjs";

const companies = [
  { name: "Cartesia", domain: "cartesia.ai", category: "ai-infra" },
  { name: "Linear", domain: "linear.app", category: "productivity" }
];

test("scoreEvalResult flags route leaks, missing synthesis, and missing core facts", () => {
  const score = scoreEvalResult({
    company: companies[0],
    latencyMs: 1250,
    publicCard: {
      slug: "cartesia",
      domain: "cartesia.ai",
      identity: {
        name: { value: "Cartesia" },
        oneLiner: { value: null }
      },
      funding: {
        totalRaisedUsd: { value: null }
      },
      team: {
        founders: { value: [] }
      },
      citations: []
    },
    extensionCard: {
      slug: "cartesia",
      domain: "cartesia.ai"
    }
  });

  assert.equal(score.publicSynthesisLeak, false);
  assert.equal(score.extensionSynthesisPresent, false);
  assert.deepEqual(score.missingCoreFields, ["identity.oneLiner", "funding.totalRaisedUsd", "team.founders"]);
  assert.equal(score.citationUrlFailures, 0);
});

test("scoreEvalResult flags cost-ceiling breaches and tracks the observed cost", () => {
  const score = scoreEvalResult(
    {
      company: companies[0],
      latencyMs: 1250,
      publicCard: {
        slug: "cartesia",
        domain: "cartesia.ai",
        generationCostUsd: 0.75,
        identity: {
          name: { value: "Cartesia" },
          oneLiner: { value: "Voice AI" }
        },
        funding: {
          totalRaisedUsd: { value: 91000000 }
        },
        team: {
          founders: { value: [{ name: "Founder" }] }
        },
        citations: []
      },
      extensionCard: {
        slug: "cartesia",
        domain: "cartesia.ai",
        generationCostUsd: 0.75,
        synthesis: {
          whyItMatters: { text: "Supported [c1].", citationIds: ["c1"] }
        }
      }
    },
    { perRunCostCeilingUsd: 0.5 }
  );

  assert.equal(score.generationCostUsd, 0.75);
  assert.equal(score.perRunCostCeilingUsd, 0.5);
  assert.equal(score.costCeilingExceeded, true);
  assert.equal(score.needsManualReview, true);
});

test("scoreEvalResult passes when generation cost stays under the ceiling", () => {
  const score = scoreEvalResult(
    {
      company: companies[0],
      latencyMs: 1100,
      publicCard: {
        slug: "cartesia",
        domain: "cartesia.ai",
        generationCostUsd: 0.05,
        identity: {
          name: { value: "Cartesia" },
          oneLiner: { value: "Voice AI" }
        },
        funding: { totalRaisedUsd: { value: 91000000 } },
        team: { founders: { value: [{ name: "Founder" }] } },
        citations: []
      },
      extensionCard: {
        slug: "cartesia",
        domain: "cartesia.ai",
        generationCostUsd: 0.05,
        synthesis: {
          whyItMatters: { text: "Supported [c1].", citationIds: ["c1"] }
        }
      }
    },
    { perRunCostCeilingUsd: 0.5 }
  );

  assert.equal(score.costCeilingExceeded, false);
  assert.equal(score.needsManualReview, false);
});

test("runGoldenEval limits the seed set and returns scored rows plus summary totals", async () => {
  const seen = [];
  const run = await runGoldenEval({
    companies,
    limit: 1,
    client: {
      async generateAndFetch(company) {
        seen.push(company.domain);
        return {
          company,
          latencyMs: 900,
          publicCard: {
            slug: "cartesia",
            domain: "cartesia.ai",
            identity: {
              name: { value: "Cartesia" },
              oneLiner: { value: "Voice AI" }
            },
            funding: {
              totalRaisedUsd: { value: 91000000 }
            },
            team: {
              founders: { value: [{ name: "Founder" }] }
            },
            citations: [{ url: "https://cartesia.ai" }]
          },
          extensionCard: {
            slug: "cartesia",
            domain: "cartesia.ai",
            synthesis: {
              whyItMatters: { text: "Supported [c1].", citationIds: ["c1"] },
              bullCase: [],
              bearCase: [],
              openQuestions: []
            }
          }
        };
      }
    }
  });

  assert.deepEqual(seen, ["cartesia.ai"]);
  assert.equal(run.rows.length, 1);
  assert.equal(run.summary.total, 1);
  assert.equal(run.summary.publicSynthesisLeaks, 0);
  assert.equal(run.summary.extensionSynthesisMissing, 0);
  assert.equal(run.summary.rowsNeedingManualReview, 0);
});
