import test from "node:test";
import assert from "node:assert/strict";
import { scoreInvestorLens } from "./score.mjs";

const extensionCard = {
  synthesis: {
    whyItMatters: { text: "The buyer workflow is daily incident response for platform teams [c1].", citationIds: ["c1"] },
    bullCase: [{ text: "Platform teams already use the workflow where the budget owner sits [c1].", citationIds: ["c1"] }],
    bearCase: [{ text: "It breaks if incumbent observability tools bundle the same workflow [c1].", citationIds: ["c1"] }],
    openQuestions: [{ question: "Which buyer owns the expansion budget for incident workflows?", category: "buyer_budget" }]
  }
};

test("passes a concrete extension card and public card pair", () => {
  const result = scoreInvestorLens({
    extensionCard,
    publicCard: { slug: "acme" }
  });

  assert.equal(result.passed, true);
  assert.equal(result.genericPhraseCount, 0);
});

test("fails generic synthesis and public synthesis leakage", () => {
  const result = scoreInvestorLens({
    extensionCard: {
      synthesis: {
        ...extensionCard.synthesis,
        whyItMatters: { text: "The company is well positioned in a massive market [c1].", citationIds: ["c1"] },
        bullCase: [{ text: "The category has clear enterprise demand [c1].", citationIds: ["c1"] }],
        bearCase: []
      }
    },
    publicCard: { slug: "acme", synthesis: extensionCard.synthesis }
  });

  assert.equal(result.passed, false);
  assert.equal(result.checks.publicOmitsSynthesis, false);
  assert.equal(result.checks.caseHasTension, false);
  assert.equal(result.checks.genericPhraseCountLow, false);
});
