import { describe, expect, it } from "vitest";
import type { Citation, ColdStartCard, EmphasisReadFiled, SourceQualityTier } from "@cold-start/core";
import {
  investorLensCategories,
  investorReadForCard,
  sourcePostureForCitation,
  timingIsNotFound
} from "../src/research/investor-lens";
import { EMPHASIS_EMPTY_COPY } from "../src/research/investor-read-copy";
import { minimalWarpCard } from "./lens-card-fixtures";

// A minimal filed emphasis read fixture: loud/read carry a citation marker so the
// display-model stripping tests have something real to strip.
const emphasisReadFiled: EmphasisReadFiled = {
  status: "read",
  loud: {
    text: "The team talks constantly about developer love and daily active usage [c2].",
    citationIds: ["c2"]
  },
  quiet: "Nothing filed shows a pricing page or a paying-customer count.",
  read: {
    text: "The company is selling adoption momentum, not revenue durability, and the read should weight usage growth over monetization proof [c2].",
    citationIds: ["c2"]
  },
  wouldChangeIf: "A public pricing page or a named paying customer appears in the filed record."
};

function citationWithTier(tier: SourceQualityTier): Citation {
  return {
    id: "c-founder",
    url: "https://x.com/founder/status/123",
    title: "Founder thread on pricing",
    fetchedAt: "2026-06-23T12:00:00.000Z",
    sourceType: "other",
    sourceQuality: {
      tier,
      label: "Founder voice",
      rationale: "Direct statement from a named founder.",
      incentive: "Founder has an incentive to promote the company."
    }
  };
}

// minimalWarpCard (lens-card-fixtures.ts) carries the same warp.dev body; this adds back the
// identity.description block this suite's synthesis-display assertions rely on.
function card(overrides: Partial<ColdStartCard> = {}): ColdStartCard {
  const base = minimalWarpCard();
  return {
    ...base,
    identity: {
      ...base.identity,
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
      }
    },
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
      receiptLine: "Updated Jun 23",
      lede: {
        text: "Warp could matter if terminal work becomes the control plane for engineering agents."
      },
      holds: {
        text: "The wedge is a daily developer workflow rather than a separate planning surface."
      },
      breaks: {
        text: "It breaks if IDE agents absorb terminal workflows before Warp owns team budgets."
      },
      timing: {
        field: "Buyer budget",
        text: "The budget appears to sit with engineering productivity owners.",
        moreFields: []
      },
      nextQuestion: {
        question: "Who owns the budget if Warp moves from individual developers into team workflows?",
        categoryLabel: "Buyer & budget",
        changesReadIf: "A named platform team pays for seats out of a tooling budget."
      },
      independentlyBacked: true
    });
    expect(display?.sources.map((source) => source.id)).toEqual(["c2"]);
  });

  it("keeps the lead bull and bear claim in the card and files the rest behind moreClaims", () => {
    const display = investorReadForCard(card({
      synthesis: {
        whyItMatters: { text: "Warp has a developer workflow wedge [c1].", citationIds: ["c1"] },
        bullCase: [
          { text: "Developers already show daily usage [c1].", citationIds: ["c1"] },
          { text: "Teams standardize on it once one engineer adopts it [c1].", citationIds: ["c1"] },
          { text: "Expansion revenue follows seat growth [c1].", citationIds: ["c1"] }
        ],
        bearCase: [
          { text: "IDEs could bundle a comparable terminal agent [c1].", citationIds: ["c1"] },
          { text: "Switching cost is low for a CLI tool [c1].", citationIds: ["c1"] }
        ],
        openQuestions: [{ question: "Can this reach team budgets?", category: "buyer_budget" }]
      }
    }));

    expect(display?.holds).toMatchObject({
      text: "Developers already show daily usage.",
      moreClaims: [
        { text: "Teams standardize on it once one engineer adopts it." },
        { text: "Expansion revenue follows seat growth." }
      ]
    });
    expect(display?.breaks).toMatchObject({
      text: "IDEs could bundle a comparable terminal agent.",
      moreClaims: [{ text: "Switching cost is low for a CLI tool." }]
    });

    if (!display) {
      throw new Error("fixture must produce a filed read");
    }
    expect(investorLensCategories(display)).toEqual([
      {
        id: "why-care",
        label: "Why care",
        preview: "Warp has a developer workflow wedge."
      },
      {
        id: "must-be-true",
        label: "What must be true",
        preview: "Developers already show daily usage."
      },
      {
        id: "could-break",
        label: "What could break",
        preview: "IDEs could bundle a comparable terminal agent."
      },
      {
        id: "why-now",
        label: "Why now",
        preview: "No clear timing signal yet."
      },
      {
        id: "learn-next",
        label: "What to learn next",
        preview: "Can this reach team budgets?"
      },
      {
        id: "pay-attention",
        label: "Pay attention to",
        preview: EMPHASIS_EMPTY_COPY.notRead
      }
    ]);
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
  });

  it("shows the top-ranked question and files the rest behind moreQuestions, rewriting a generic revenue ask", () => {
    const display = investorReadForCard(card({
      synthesis: {
        whyItMatters: { text: "Warp turns terminal work into a collaboration layer [c1].", citationIds: ["c1"] },
        bullCase: [{ text: "Developers already show adoption [c1].", citationIds: ["c1"] }],
        bearCase: [{ text: "Distribution may be compressed by incumbent developer tools [c1].", citationIds: ["c1"] }],
        openQuestions: [
          { question: "Can Warp prove expansion beyond individual developers into team-wide workflow budgets?", category: "adoption_proof" },
          { question: "How durable is the wedge if IDEs and issue trackers bundle terminal agents?", category: "durability", wouldChangeReadIf: "IDE vendors ship a bundled terminal agent with real adoption." },
          { question: "ARR is not public; verify revenue.", category: "unit_economics" }
        ]
      }
    }));

    expect(display?.nextQuestion?.categoryLabel).toBe("Adoption & proof");
    expect(display?.nextQuestion?.question).toContain("expansion beyond individual developers");
    expect(display?.nextQuestion?.moreQuestions).toEqual([
      { question: "How durable is the wedge if IDEs and issue trackers bundle terminal agents?", categoryLabel: "Durability", changesReadIf: "IDE vendors ship a bundled terminal agent with real adoption." },
      { question: "What revenue quality, retention, and margin evidence would change the read?", categoryLabel: "Unit economics", changesReadIf: null }
    ]);
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
    expect(display?.receiptLine).toBe("Updated Jun 23");
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

  it("classifies a founder_authored citation as founder-authored posture", () => {
    expect(sourcePostureForCitation(citationWithTier("founder_authored"))).toBe("founder-authored");
  });

  it("returns six categories with Pay attention to last", () => {
    const display = investorReadForCard(card({
      synthesis: {
        whyItMatters: { text: "Warp has a developer workflow wedge [c1].", citationIds: ["c1"] },
        bullCase: [],
        bearCase: [],
        openQuestions: [{ question: "Can this reach team budgets?", category: "buyer_budget" }],
        emphasisRead: emphasisReadFiled
      }
    }));
    if (!display) {
      throw new Error("fixture must produce a filed read");
    }

    const categories = investorLensCategories(display);
    expect(categories).toHaveLength(6);
    expect(categories[5]).toMatchObject({ id: "pay-attention", label: "Pay attention to" });
  });

  it("previews the read text when the emphasis read is filed", () => {
    const display = investorReadForCard(card({
      synthesis: {
        whyItMatters: { text: "Warp has a developer workflow wedge [c1].", citationIds: ["c1"] },
        bullCase: [],
        bearCase: [],
        openQuestions: [{ question: "Can this reach team budgets?", category: "buyer_budget" }],
        emphasisRead: emphasisReadFiled
      }
    }));
    if (!display) {
      throw new Error("fixture must produce a filed read");
    }

    expect(display.emphasis).toMatchObject({
      state: "read",
      loud: "The team talks constantly about developer love and daily active usage.",
      quiet: emphasisReadFiled.quiet,
      read: "The company is selling adoption momentum, not revenue durability, and the read should weight usage growth over monetization proof.",
      wouldChangeIf: emphasisReadFiled.wouldChangeIf
    });
    expect(investorLensCategories(display)[5]?.preview).toBe(display.emphasis.read);
  });

  it("previews flat empty copy for thin_file, nothing_notable, and a legacy card", () => {
    const baseSynthesis = {
      whyItMatters: { text: "Warp has a developer workflow wedge [c1].", citationIds: ["c1"] },
      bullCase: [],
      bearCase: [],
      openQuestions: [{ question: "Can this reach team budgets?", category: "buyer_budget" as const }]
    };

    const thinFileDisplay = investorReadForCard(card({
      synthesis: { ...baseSynthesis, emphasisRead: { status: "thin_file" } }
    }));
    const nothingNotableDisplay = investorReadForCard(card({
      synthesis: { ...baseSynthesis, emphasisRead: { status: "nothing_notable" } }
    }));
    const legacyDisplay = investorReadForCard(card({ synthesis: baseSynthesis }));

    if (!thinFileDisplay || !nothingNotableDisplay || !legacyDisplay) {
      throw new Error("fixtures must produce filed reads");
    }

    expect(thinFileDisplay.emphasis.state).toBe("thin_file");
    expect(investorLensCategories(thinFileDisplay)[5]?.preview).toBe(EMPHASIS_EMPTY_COPY.thinFile);

    expect(nothingNotableDisplay.emphasis.state).toBe("nothing_notable");
    expect(investorLensCategories(nothingNotableDisplay)[5]?.preview).toBe(EMPHASIS_EMPTY_COPY.nothingNotable);

    expect(legacyDisplay.emphasis.state).toBe("not_read");
    expect(investorLensCategories(legacyDisplay)[5]?.preview).toBe(EMPHASIS_EMPTY_COPY.notRead);
  });

  it("strips citation markers from loud and read in the display model", () => {
    const display = investorReadForCard(card({
      synthesis: {
        whyItMatters: { text: "Warp has a developer workflow wedge [c1].", citationIds: ["c1"] },
        bullCase: [],
        bearCase: [],
        openQuestions: [{ question: "Can this reach team budgets?", category: "buyer_budget" }],
        emphasisRead: {
          status: "read",
          loud: { text: "Warp leans hard on developer love in every post [c1][c2].", citationIds: ["c1", "c2"] },
          quiet: "Nothing filed shows a pricing page.",
          read: { text: "The company sells growth, not monetization proof [c2].", citationIds: ["c2"] },
          wouldChangeIf: "A pricing page appears."
        }
      }
    }));
    if (!display) {
      throw new Error("fixture must produce a filed read");
    }

    expect(display.emphasis.loud).toBe("Warp leans hard on developer love in every post.");
    expect(display.emphasis.read).toBe("The company sells growth, not monetization proof.");
  });
});
