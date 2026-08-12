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

test("a pasted-anywhere emphasis read fails the specificity check, marker and all", () => {
  // Production-shaped: a filed read's text always carries a citation marker. [fv3] is the
  // founder-voice tier's real id shape (apps/web/src/inngest/emphasis-read.ts), and it is the
  // exact case that made the pre-fix /[\d$%]/ probe vacuous: the "3" inside the marker satisfied
  // the digit test on its own, so a sentence with nothing specific in its own prose still passed.
  const card = {
    identity: { name: { value: "Acme" } },
    synthesis: {
      ...extensionCard.synthesis,
      emphasisRead: {
        status: "read",
        loud: { text: "The founders talk about ambition constantly [fv3].", citationIds: ["fv3"] },
        quiet: "Nothing filed shows a pricing page.",
        read: { text: "They emphasize growth while staying quiet on economics [fv3].", citationIds: ["fv3"] },
        wouldChangeIf: "A pricing page appears."
      }
    }
  };

  assert.equal(emphasisIsSpecificOrEmpty(card), false);

  const result = scoreInvestorLens({ extensionCard: card, publicCard: { slug: "acme" } });
  assert.equal(result.checks.emphasisSpecificOrEmpty, false);
  assert.equal(result.passed, false);
});

test("a generic marked read fails even though its own citation marker contains a digit", () => {
  const card = {
    identity: { name: { value: "Acme" } },
    synthesis: {
      ...extensionCard.synthesis,
      emphasisRead: {
        status: "read",
        loud: { text: "The founders are loud about momentum [fv12].", citationIds: ["fv12"] },
        quiet: "Nothing filed shows a pricing page.",
        read: { text: "The company leans on ambition and momentum in every interview [fv12].", citationIds: ["fv12"] },
        wouldChangeIf: "A pricing page appears."
      }
    }
  };

  assert.equal(emphasisIsSpecificOrEmpty(card), false);
});

test("company name match requires a word boundary, not a substring", () => {
  // "Exa" is a substring of "exacting" but names nothing; with no digit/$/% anywhere in the
  // prose either, this must fail rather than false-pass on the substring hit.
  const card = {
    identity: { name: { value: "Exa" } },
    synthesis: {
      ...extensionCard.synthesis,
      emphasisRead: {
        status: "read",
        loud: { text: "The founders describe their approach as exacting [fv1].", citationIds: ["fv1"] },
        quiet: "Nothing filed shows a pricing page.",
        read: { text: "The team is exacting about product quality and stays quiet on pricing [fv1].", citationIds: ["fv1"] },
        wouldChangeIf: "A pricing page appears."
      }
    }
  };

  assert.equal(emphasisIsSpecificOrEmpty(card), false);
});

test("a genuine word-boundary company name mention passes", () => {
  const card = {
    identity: { name: { value: "Exa" } },
    synthesis: {
      ...extensionCard.synthesis,
      emphasisRead: {
        status: "read",
        loud: { text: "The founders name Exa directly in every interview [fv1].", citationIds: ["fv1"] },
        quiet: "Nothing filed shows a pricing page.",
        read: { text: "Exa is named directly by its founders as the loudest proof point, ahead of any pricing detail [fv1].", citationIds: ["fv1"] },
        wouldChangeIf: "A pricing page appears."
      }
    }
  };

  assert.equal(emphasisIsSpecificOrEmpty(card), true);
});

test("a concrete emphasis read with real specificity in its own prose passes", () => {
  const card = {
    identity: { name: { value: "Acme" } },
    synthesis: {
      ...extensionCard.synthesis,
      emphasisRead: {
        status: "read",
        loud: { text: "The founders repeat their throughput number in every interview [fv2].", citationIds: ["fv2"] },
        quiet: "Nothing filed shows churn or retention data.",
        read: { text: "Acme's loudest proof is a 10x throughput claim, not the revenue growth reporters keep asking about [fv2].", citationIds: ["fv2"] },
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
