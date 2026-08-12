import test from "node:test";
import assert from "node:assert/strict";
import { scoreInvestorLens, genericPhraseCount, emphasisIsSpecificOrEmpty } from "./score.mjs";

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

test("generic phrases inside the emphasis read count against the card", () => {
  const card = {
    synthesis: {
      ...extensionCard.synthesis,
      emphasisRead: {
        status: "read",
        loud: { text: "The founders are well positioned to defend pricing [c1].", citationIds: ["c1"] },
        quiet: "Nothing filed shows a named enterprise customer.",
        read: { text: "The company leans on category-defining language in every interview [c1].", citationIds: ["c1"] },
        wouldChangeIf: "A named enterprise logo appears in coverage."
      }
    }
  };

  assert.ok(genericPhraseCount(card) >= 1);
});

test("a pasted-anywhere emphasis read fails the specificity check", () => {
  const card = {
    identity: { name: { value: "Acme" } },
    synthesis: {
      ...extensionCard.synthesis,
      emphasisRead: {
        status: "read",
        loud: { text: "The founders talk about ambition constantly [c1].", citationIds: ["c1"] },
        quiet: "Nothing filed shows a pricing page.",
        read: { text: "They emphasize growth while staying quiet on economics.", citationIds: ["c1"] },
        wouldChangeIf: "A pricing page appears."
      }
    }
  };

  assert.equal(emphasisIsSpecificOrEmpty(card), false);

  const result = scoreInvestorLens({ extensionCard: card, publicCard: { slug: "acme" } });
  assert.equal(result.checks.emphasisSpecificOrEmpty, false);
  assert.equal(result.passed, false);
});

test("a concrete emphasis read passes", () => {
  const card = {
    identity: { name: { value: "Acme" } },
    synthesis: {
      ...extensionCard.synthesis,
      emphasisRead: {
        status: "read",
        loud: { text: "The founders repeat their throughput number in every interview [c1].", citationIds: ["c1"] },
        quiet: "Nothing filed shows churn or retention data.",
        read: { text: "Acme's loudest proof is latency benchmarks, not the revenue growth reporters keep asking about [c1].", citationIds: ["c1"] },
        wouldChangeIf: "A revenue or retention figure appears in coverage."
      }
    }
  };

  assert.equal(emphasisIsSpecificOrEmpty(card), true);

  const result = scoreInvestorLens({ extensionCard: card, publicCard: { slug: "acme" } });
  assert.equal(result.passed, true);
});

test("empty states and legacy cards pass the specificity check", () => {
  assert.equal(emphasisIsSpecificOrEmpty({ synthesis: { emphasisRead: { status: "thin_file" } } }), true);
  assert.equal(emphasisIsSpecificOrEmpty({ synthesis: { emphasisRead: { status: "nothing_notable" } } }), true);
  assert.equal(emphasisIsSpecificOrEmpty({ synthesis: {} }), true);
  assert.equal(emphasisIsSpecificOrEmpty({}), true);
});
