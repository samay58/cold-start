import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { aggregate, scoreCitationDiscipline, scoreFillRate, scoreFundingFaithfulness, scoreResearchSection, scoreSignalRedundancy, scoreSynthesis, scoreVerify } from "./score.mjs";

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

  it("matches results without claimIndex by text and citations, like production applyVerifierResults", () => {
    const score = scoreVerify({
      results: [
        { text: "Claim A [c1].", citationIds: ["c1"], status: "supported" },
        { text: "Claim B [c1].", citationIds: ["c1"], status: "supported" },
      ],
      claims,
    });
    assert.equal(score.supportedRate, 1);
    assert.equal(score.falseDropRate, 0);
    assert.equal(score.claimIndexCoverage, 0);
  });

  it("counts drops and echo violations, crediting index-less results via the text fallback", () => {
    const score = scoreVerify({
      results: [
        { claimIndex: 0, text: "Claim A [c1].", citationIds: ["c2"], status: "unsupported" },
        { text: "Claim B [c1].", citationIds: ["c1"], status: "supported" },
      ],
      claims,
    });
    assert.equal(score.supportedRate, 0.5);
    assert.equal(score.falseDropRate, 0.5);
    assert.equal(score.echoViolations, 1);
    assert.equal(score.claimIndexCoverage, 0.5);
  });
});

describe("scoreSignalRedundancy", () => {
  const signal = (title, date, citationId, category = "funding") => ({
    title,
    url: `https://example.com/${citationId}`,
    date,
    source: "Outlet",
    category,
    citationIds: [citationId],
  });

  it("scores one-signal-per-article extraction well below 1", () => {
    const score = scoreSignalRedundancy(
      {
        signals: [
          signal("Acme raises $125M at $1.5B valuation", "2026-03-25", "e1"),
          signal("Acme raises $125M, hits $1.5B valuation", "2026-03-25", "e2"),
          signal("Acme Raises $125M, Achieves $1.5B Valuation", "2026-03-26", "e3"),
          signal("Acme launches workspace product", "2026-05-01", "e4", "launch"),
        ],
      },
      { companyDomain: "acme.com" }
    );
    assert.equal(score.signalCount, 4);
    assert.equal(score.eventCount, 2);
    assert.equal(score.distinctEventRatio, 0.5);
  });

  it("scores distinct events as 1", () => {
    const score = scoreSignalRedundancy({
      signals: [
        signal("Acme raises $20M Series A", "2024-05-07", "e1"),
        signal("Acme launches enterprise tier", "2026-02-01", "e2", "launch"),
      ],
    });
    assert.equal(score.distinctEventRatio, 1);
  });

  it("returns a null ratio when no signals were emitted", () => {
    assert.equal(scoreSignalRedundancy({ signals: [] }).distinctEventRatio, null);
    assert.equal(scoreSignalRedundancy({}).distinctEventRatio, null);
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

describe("scoreSynthesis", () => {
  const cardCitationIds = ["c1", "c2"];
  const baseSynthesis = () => ({
    whyItMatters: { text: "Acme sells anvils to a captured buyer with budget urgency [c1].", citationIds: ["c1"] },
    bullCase: [{ text: "Named customer proof beats claims [c1].", citationIds: ["c1"] }],
    bearCase: [{ text: "Adoption breaks if the incumbent undercuts price unless retention holds [c2].", citationIds: ["c2"] }],
    openQuestions: [{ question: "Which buyer owns budget for this workflow expansion?", category: "buyer_budget" }],
    marketStructureAndTiming: null
  });

  it("counts claims, finds no marker violations, and computes verifier survival", () => {
    const synthesis = baseSynthesis();
    const score = scoreSynthesis({
      synthesis,
      verifierResults: [
        { claimIndex: 0, text: synthesis.whyItMatters.text, citationIds: ["c1"], status: "supported" },
        { claimIndex: 1, text: synthesis.bullCase[0].text, citationIds: ["c1"], status: "unsupported" }
      ],
      cardCitationIds
    });
    assert.deepEqual(score.claimCounts, { bullCase: 1, bearCase: 1, openQuestions: 1 });
    assert.equal(score.citationMarkerViolations.length, 0);
    assert.equal(score.verifierSurvivalRate, 0.5);
    assert.equal(score.genericPhraseCount, 0);
    assert.equal(score.hasConcreteTension, true);
    assert.equal(score.hasTestableQuestion, true);
  });

  it("flags a citation marker that does not resolve to the card's citations", () => {
    const synthesis = baseSynthesis();
    synthesis.bearCase = [{ text: "Adoption breaks unless retention holds [ghost].", citationIds: ["ghost"] }];
    const score = scoreSynthesis({ synthesis, verifierResults: [], cardCitationIds });
    assert.deepEqual(score.citationMarkerViolations, ["ghost"]);
  });

  it("returns a null survival rate when nothing was judged", () => {
    const score = scoreSynthesis({ synthesis: baseSynthesis(), verifierResults: [], cardCitationIds });
    assert.equal(score.verifierSurvivalRate, null);
  });
});

describe("scoreResearchSection", () => {
  const evidenceCitationIds = ["c1", "c2"];

  it("counts items and flags citation ids outside the section's evidence set", () => {
    const content = {
      status: "available",
      summary: "Acme has named pilot customers with usage evidence.",
      items: [
        { label: "Pilot A", text: "Acme piloted with Globex starting Q1.", citationIds: ["c1"] },
        { label: "Pilot B", text: "Acme piloted with Initech in March.", citationIds: ["ghost"] }
      ],
      confidence: "medium"
    };
    const score = scoreResearchSection({ content, evidenceCitationIds });
    assert.equal(score.status, "available");
    assert.equal(score.itemCount, 2);
    assert.deepEqual(score.citationIdViolations, ["ghost"]);
    assert.equal(score.genericPhraseCount, 0);
    assert.ok(score.avgItemChars > 0);
  });

  it("flags generic phrases in the summary and item text", () => {
    const content = {
      status: "available",
      summary: "This is a massive market with clear enterprise demand.",
      items: [],
      confidence: "low"
    };
    const score = scoreResearchSection({ content, evidenceCitationIds });
    assert.equal(score.genericPhraseCount, 2);
  });

  it("handles an empty section with zero items", () => {
    const score = scoreResearchSection({
      content: { status: "empty", summary: null, items: [], confidence: "low" },
      evidenceCitationIds
    });
    assert.equal(score.itemCount, 0);
    assert.equal(score.avgItemChars, 0);
    assert.equal(score.citationIdViolations.length, 0);
  });
});
