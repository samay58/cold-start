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

  it("derives a compact investor read from synthesis", () => {
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
            category: "buyer_budget"
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
      whyItMightMatter: "Warp could matter if terminal work becomes the control plane for engineering agents.",
      whatCouldBreak: "It breaks if IDE agents absorb terminal workflows before Warp owns team budgets.",
      bestNextQuestion: "Who owns the budget if Warp moves from individual developers into team workflows?",
      supportedClaimCount: 4,
      timingNotFound: false
    });
    expect(display?.evidenceThatHolds).toEqual([
      {
        label: "The wedge is a daily developer workflow rather than a separate planning surface.",
        sourcePosture: "independent"
      }
    ]);
    expect(display?.evidenceStatus).toBe("Lens filed · 4 supported claims · independent evidence");
  });

  it("uses the thesis as proof only when no sharper bull claim survived", () => {
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

    expect(display?.evidenceThatHolds).toEqual([
      {
        label: "Warp could matter if terminal work becomes the control plane for engineering agents.",
        sourcePosture: "independent"
      }
    ]);
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
    expect(display?.timingNotFound).toBe(true);
    expect(display?.evidenceStatus).toBe("Lens filed · 1 supported claim · company-authored evidence · Timing not found");
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
