import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { aggregate, scoreCitationDiscipline, scoreFillRate, scoreFundingFaithfulness, scoreVerify } from "./score.mjs";

const fact = (value, citationIds = ["c1"]) => ({ value, status: "verified", confidence: "high", citationIds });

const sections = {
  identity: {
    name: fact("Acme"),
    oneLiner: fact("Acme sells anvils to coyotes."),
    description: fact({ shortDescription: "Acme sells anvils." }),
    hq: fact({ city: "Phoenix", country: "US" }),
    foundedYear: fact(2020),
    logoUrl: null,
    status: "private",
  },
  funding: {
    totalRaisedUsd: fact(175_000_000),
    lastRound: fact({ name: "Series B", amountUsd: 100_000_000, announcedAt: "2026-01-01", leadInvestors: [] }),
    rounds: fact([{ name: "Series A", amountUsd: 75_000_000, announcedAt: "2024-06-01", leadInvestors: [] }]),
    investors: fact([{ name: "Coyote Capital", domain: null }]),
  },
  team: {
    founders: fact([{ name: "Wile E.", role: "CEO", sourceUrl: null, email: null }]),
    keyExecs: { value: null, status: "unknown", confidence: "low", citationIds: [] },
    headcount: fact({ value: 50, asOf: "2026-01-01" }),
  },
  signals: [],
  comparables: [],
  citations: [{ id: "c1", url: "https://acme.dev", title: "Acme", fetchedAt: "2026-01-01T00:00:00Z", sourceType: "company_site" }],
};

describe("scoreCitationDiscipline", () => {
  it("passes a clean output whose citations resolve to the bundle", () => {
    const score = scoreCitationDiscipline(sections, ["https://acme.dev"]);
    assert.equal(score.violations.length, 0);
    assert.equal(score.unresolvedUrls, 0);
  });

  it("flags invented citation urls and dangling citation ids", () => {
    const dirty = {
      ...sections,
      identity: { ...sections.identity, name: fact("Acme", ["ghost"]) },
      citations: [...sections.citations, { id: "c9", url: "https://invented.example", title: "x", fetchedAt: "2026-01-01T00:00:00Z", sourceType: "news" }],
    };
    const score = scoreCitationDiscipline(dirty, ["https://acme.dev"]);
    assert.ok(score.violations.some((violation) => violation.includes("ghost")));
    assert.equal(score.unresolvedUrls, 1);
  });
});

describe("scoreFundingFaithfulness", () => {
  it("matches raw, comma, and humanized amounts", () => {
    const text = "Acme raised $100 million in a Series B, with a 75,000,000 Series A, totaling $175M to date.";
    const score = scoreFundingFaithfulness(sections, text);
    assert.equal(score.checked, 3);
    assert.equal(score.matched, 3);
  });

  it("reports misses for amounts absent from the bundle", () => {
    const score = scoreFundingFaithfulness(sections, "Acme raised an undisclosed amount.");
    assert.equal(score.matched, 0);
    assert.equal(score.misses.length, 3);
  });
});

describe("scoreFillRate", () => {
  it("counts non-null facts including non-empty arrays", () => {
    const score = scoreFillRate(sections);
    assert.equal(score.filled, 10);
    assert.equal(score.total, 10);
  });

  it("skips null facts and empty arrays", () => {
    const sparse = {
      ...sections,
      funding: {
        ...sections.funding,
        totalRaisedUsd: { value: null, status: "unknown", confidence: "low", citationIds: [] },
        investors: fact([]),
      },
    };
    assert.equal(scoreFillRate(sparse).filled, 8);
  });
});

describe("scoreVerify", () => {
  const claims = [
    { text: "Claim A [c1].", citationIds: ["c1"] },
    { text: "Claim B [c1].", citationIds: ["c1"] },
  ];

  it("scores full agreement with echoed citations", () => {
    const score = scoreVerify({
      results: [
        { claimIndex: 0, text: "Claim A [c1].", citationIds: ["c1"], status: "supported" },
        { claimIndex: 1, text: "Claim B [c1].", citationIds: ["c1"], status: "supported" },
      ],
      claims,
    });
    assert.equal(score.supportedRate, 1);
    assert.equal(score.falseDropRate, 0);
    assert.equal(score.echoViolations, 0);
    assert.equal(score.claimIndexCoverage, 1);
  });

  it("counts drops, echo violations, and missing claimIndex", () => {
    const score = scoreVerify({
      results: [
        { claimIndex: 0, text: "Claim A [c1].", citationIds: ["c2"], status: "unsupported" },
        { text: "Claim B [c1].", citationIds: ["c1"], status: "supported" },
      ],
      claims,
    });
    assert.equal(score.supportedRate, 0);
    assert.equal(score.falseDropRate, 1);
    assert.equal(score.echoViolations, 1);
    assert.equal(score.claimIndexCoverage, 0.5);
  });
});

describe("aggregate", () => {
  it("returns median and spread, ignoring non-numbers", () => {
    const stats = aggregate([3, 1, 2, null, undefined, Number.NaN]);
    assert.equal(stats.n, 3);
    assert.equal(stats.median, 2);
    assert.equal(stats.min, 1);
    assert.equal(stats.max, 3);
  });

  it("returns null for empty input", () => {
    assert.equal(aggregate([]), null);
  });
});
