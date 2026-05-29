import assert from "node:assert/strict";
import { test } from "node:test";

import { scoreCitationIntegrity } from "./score.mjs";

const bundle = {
  sources: [
    { id: "e1", text: "OpenAI closed a funding round at an $852 billion valuation backed by Amazon and Nvidia." },
    { id: "e2", text: "The company was founded in 2015 and is headquartered in San Francisco." },
    { id: "e3", text: "Analysts note OpenAI competes with Anthropic and Google DeepMind across frontier models." },
  ],
};

function truth(rank, text, sourceIds) {
  return { rank, truth: text, whyRanked: "x", evidenceStrong: ["a"], evidenceWeakOrConflicted: ["b"], sourceIds };
}

test("clean output: refs resolve and cited source contains the asserted number", () => {
  const output = {
    truths: [
      truth(1, "OpenAI reached an $852 billion valuation.", ["e1"]),
      truth(2, "OpenAI was founded in 2015 in San Francisco.", ["e2"]),
      truth(3, "OpenAI competes with Anthropic and Google DeepMind.", ["e3"]),
    ],
    excludedClaims: [{ claim: "x", whyExcluded: "y", sourceIds: ["e1"] }],
  };
  const integrity = scoreCitationIntegrity(output, bundle);
  assert.equal(integrity.fabricationFree, true);
  assert.equal(integrity.fabricatedIds.length, 0);
  assert.equal(integrity.truthsCited, 3);
  assert.equal(integrity.truthsSupported, 3);
  assert.equal(integrity.score, 3);
});

test("fabricated ref caps the score and is flagged", () => {
  const output = {
    truths: [truth(1, "OpenAI reached an $852 billion valuation.", ["e9"])],
    excludedClaims: [{ claim: "x", whyExcluded: "y", sourceIds: ["e1"] }],
  };
  const integrity = scoreCitationIntegrity(output, bundle);
  assert.equal(integrity.fabricationFree, false);
  assert.deepEqual(integrity.fabricatedIds, ["e9"]);
  assert.ok(integrity.score <= 1);
});

test("number asserted but absent from cited source counts as unsupported", () => {
  const output = {
    truths: [
      truth(1, "OpenAI raised $122 billion in its latest round.", ["e1"]), // e1 says 852, not 122
      truth(2, "OpenAI was founded in 2015.", ["e2"]),
      truth(3, "OpenAI competes with Anthropic.", ["e3"]),
    ],
    excludedClaims: [{ claim: "x", whyExcluded: "y", sourceIds: ["e2"] }],
  };
  const integrity = scoreCitationIntegrity(output, bundle);
  assert.equal(integrity.fabricationFree, true);
  assert.equal(integrity.truthsCited, 3);
  assert.ok(integrity.truthsSupported < 3, "the 122 claim should not be supported by an 852 source");
});
