import { describe, expect, it } from "vitest";
import type { ColdStartCard } from "@cold-start/core";
import {
  investorReadForCard,
  sourcePostureForCitation,
  timingIsNotFound
} from "../src/investor-lens";

function card(overrides: Partial<ColdStartCard> = {}): ColdStartCard {
  return {
    slug: "warp",
    domain: "warp.dev",
    generatedAt: "2026-06-23T12:00:00.000Z",
    generationCostUsd: 0,
    cacheStatus: "hit",
    identity: {
      name: { value: "Warp", status: "verified", confidence: "high", citationIds: ["c1"] },
      logoUrl: null,
      oneLiner: { value: "AI terminal for developers.", status: "verified", confidence: "high", citationIds: ["c1"] },
      description: {
        value: {
          shortDescription: "AI terminal for developers.",
          concept: "A terminal workflow layer for engineering teams.",
          serves: "Developers and engineering teams.",
          mechanism: "Combines command execution, collaboration, and AI context."
        },
        status: "verified",
        confidence: "medium",
        citationIds: ["c1"]
      },
      hq: { value: { city: "San Francisco", country: "US" }, status: "verified", confidence: "medium", citationIds: ["c1"] },
      foundedYear: { value: 2021, status: "verified", confidence: "medium", citationIds: ["c1"] },
      status: "private"
    },
    funding: {
      totalRaisedUsd: { value: null, status: "unknown", confidence: "low", citationIds: [] },
      lastRound: { value: null, status: "unknown", confidence: "low", citationIds: [] },
      investors: { value: [], status: "unknown", confidence: "low", citationIds: [] }
    },
    team: {
      founders: { value: [], status: "unknown", confidence: "low", citationIds: [] },
      keyExecs: { value: [], status: "unknown", confidence: "low", citationIds: [] },
      headcount: { value: null, status: "unknown", confidence: "low", citationIds: [] }
    },
    signals: [],
    comparables: [],
    citations: [
      {
        id: "c1",
        url: "https://warp.dev",
        title: "Warp",
        fetchedAt: "2026-06-23T12:00:00.000Z",
        sourceType: "company_site"
      },
      {
        id: "c2",
        url: "https://example.com/warp-deep-dive",
        title: "Independent Warp deep dive",
        fetchedAt: "2026-06-23T12:00:00.000Z",
        sourceType: "news",
        sourceQuality: {
          tier: "independent_analysis",
          label: "Independent analysis",
          rationale: "Independent product analysis.",
          incentive: "No direct company incentive."
        }
      }
    ],
    ...overrides
  };
}

describe("investor lens display", () => {
  it("returns null before synthesis exists", () => {
    expect(investorReadForCard(card())).toBeNull();
  });

  it("derives a filed investor read with tension, timing, question, and posture", () => {
    const display = investorReadForCard(card({
      synthesis: {
        whyItMatters: {
          text: "Warp could matter if terminal work becomes the control plane for engineering agents [c2].",
          citationIds: ["c2"]
        },
        bullCase: [
          {
            text: "The wedge is a daily developer workflow rather than a separate planning surface [c2].",
            citationIds: ["c2"]
          }
        ],
        bearCase: [
          {
            text: "It breaks if IDE agents absorb terminal workflows before Warp owns team budgets [c2].",
            citationIds: ["c2"]
          }
        ],
        openQuestions: [
          {
            question: "Who owns the budget if Warp moves from individual developers into team workflows?",
            category: "buyer_budget",
            wouldChangeReadIf: "A named platform team pays for seats out of a tooling budget."
          }
        ],
        marketStructureAndTiming: {
          buyerBudget: {
            text: "The budget appears to sit with engineering productivity owners [c2].",
            citationIds: ["c2"]
          },
          painSeverity: null,
          adoptionTrigger: null,
          marketStructure: null,
          profitPool: null,
          expansionPath: null,
          timingRisk: null
        }
      }
    }));

    expect(display).toMatchObject({
      receiptLine: "Filed Jun 23",
      lede: {
        text: "Warp could matter if terminal work becomes the control plane for engineering agents.",
        sourcePosture: "independent"
      },
      holds: {
        text: "The wedge is a daily developer workflow rather than a separate planning surface.",
        sourcePosture: "independent"
      },
      breaks: {
        text: "It breaks if IDE agents absorb terminal workflows before Warp owns team budgets.",
        sourcePosture: "independent"
      },
      timing: {
        field: "Buyer budget",
        text: "The budget appears to sit with engineering productivity owners.",
        sourcePosture: "independent",
        moreFields: []
      },
      nextQuestion: {
        question: "Who owns the budget if Warp moves from individual developers into team workflows?",
        categoryLabel: "Buyer & budget",
        changesReadIf: "A named platform team pays for seats out of a tooling budget."
      },
      independentlyBacked: true,
      supportedClaimCount: 4,
      timingNotFound: false
    });
    expect(display?.postureMarks).toEqual([{ posture: "independent", label: "independent", count: 4 }]);
    expect(display?.sources.map((source) => source.id)).toEqual(["c2"]);
  });

  it("leaves the tension sides empty instead of restating the lede", () => {
    const display = investorReadForCard(card({
      synthesis: {
        whyItMatters: {
          text: "Warp could matter if terminal work becomes the control plane for engineering agents [c2].",
          citationIds: ["c2"]
        },
        bullCase: [],
        bearCase: [],
        openQuestions: [
          {
            question: "Who owns the budget if Warp moves from individual developers into team workflows?",
            category: "buyer_budget"
          }
        ]
      }
    }));

    expect(display?.holds).toBeNull();
    expect(display?.breaks).toBeNull();
    expect(display?.nextQuestion?.changesReadIf).toBeNull();
    expect(display?.supportedClaimCount).toBe(1);
  });

  it("prefers trigger and risk over structural fields for the timing row", () => {
    const display = investorReadForCard(card({
      synthesis: {
        whyItMatters: { text: "Warp has a developer workflow wedge [c1].", citationIds: ["c1"] },
        bullCase: [],
        bearCase: [],
        openQuestions: [{ question: "Can this reach team budgets?", category: "buyer_budget" }],
        marketStructureAndTiming: {
          buyerBudget: { text: "Budget sits with platform teams [c1].", citationIds: ["c1"] },
          painSeverity: null,
          adoptionTrigger: { text: "Agent rollouts are forcing terminal standardization [c2].", citationIds: ["c2"] },
          marketStructure: null,
          profitPool: null,
          expansionPath: null,
          timingRisk: null
        }
      }
    }));

    expect(display?.timing).toMatchObject({
      field: "Adoption trigger",
      text: "Agent rollouts are forcing terminal standardization.",
      sourcePosture: "independent",
      moreFields: [{ field: "Buyer budget", text: "Budget sits with platform teams." }]
    });
  });

  it("marks timing as not found when market timing is absent", () => {
    const noTimingCard = card({
      synthesis: {
        whyItMatters: { text: "Warp has a developer workflow wedge [c1].", citationIds: ["c1"] },
        bullCase: [],
        bearCase: [],
        openQuestions: [{ question: "Can this reach team budgets?", category: "buyer_budget" }]
      }
    });
    const display = investorReadForCard(noTimingCard);

    expect(timingIsNotFound(noTimingCard)).toBe(true);
    expect(display?.timing).toBeNull();
    expect(display?.timingNotFound).toBe(true);
    expect(display?.receiptLine).toBe("Filed Jun 23");
    expect(display?.postureMarks).toEqual([{ posture: "company-authored", label: "company", count: 1 }]);
    expect(display?.independentlyBacked).toBe(false);
  });

  it("classifies source posture from citation metadata", () => {
    const base = card();
    expect(sourcePostureForCitation(base.citations[0])).toBe("company-authored");
    expect(sourcePostureForCitation(base.citations[1])).toBe("independent");
    expect(sourcePostureForCitation({
      id: "c3",
      url: "https://enrich.example.com",
      title: "Enriched",
      fetchedAt: "2026-06-23T12:00:00.000Z",
      sourceType: "enrichment"
    })).toBe("enrichment");
    expect(sourcePostureForCitation(undefined)).toBe("unknown");
  });
});
