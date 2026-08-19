import { describe, expect, it } from "vitest";
import type {
  Citation,
  ColdStartCard,
  EmphasisReadFiled,
  HowItWinsRead,
  SourceQualityTier
} from "@cold-start/core";
import {
  investorLensCategories,
  investorReadForCard,
  sourcePostureForCitation
} from "../src/research/investor-lens";
import { EMPHASIS_EMPTY_COPY, LENS_TENSION_EMPTY_COPY } from "../src/research/investor-read-copy";
import { minimalWarpCard } from "./lens-card-fixtures";

// A filed how-it-wins read: three running strategies, a pair drawn from two of them, one next,
// each note carrying a citation marker so the display model has something real to strip.
const howItWinsFiled: HowItWinsRead = {
  status: "read",
  sentence: "Warp wins by pairing a narrow terminal competence with the shell every engineer already opens [c1].",
  running: [
    {
      strategy: "specialization",
      meaning: "It goes deep on one surface instead of spreading across the whole toolchain [c1].",
      note: "Every shipped feature lands in the terminal itself [c1].",
      citationIds: ["c1"]
    },
    {
      strategy: "omnipresence",
      meaning: "It sits in the one window engineers keep open all day [c2].",
      note: "The shell is already open on every machine it runs on [c2].",
      citationIds: ["c2"]
    },
    {
      strategy: "usership",
      meaning: "Each new team makes the shared workflow worth more [c1].",
      note: "Teams adopt it after one engineer brings it in [c1].",
      citationIds: ["c1"]
    }
  ],
  pair: {
    strategies: ["specialization", "omnipresence"] as const,
    note: "Depth in one surface only pays because that surface is always open [c1][c2].",
    wrongIf: "Engineers move their daily work into an editor agent instead.",
    citationIds: ["c1", "c2"]
  },
  next: [
    {
      strategy: "standardization",
      note: "No platform team has made it the default shell yet.",
      citationIds: []
    }
  ],
  wrongIf: "Editors bundle a comparable terminal agent before team budgets move."
};

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

  it("derives a filed investor read with tension, question, and posture", () => {
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
        id: "the-case",
        label: "The case",
        preview: "Developers already show daily usage."
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

  it("previews the case with the bear line when no bull claim survived, and the empty copy when neither did", () => {
    const bearOnly = investorReadForCard(card({
      synthesis: {
        whyItMatters: { text: "Warp has a developer workflow wedge [c1].", citationIds: ["c1"] },
        bullCase: [],
        bearCase: [{ text: "Switching cost is low for a CLI tool [c1].", citationIds: ["c1"] }],
        openQuestions: [{ question: "Can this reach team budgets?", category: "buyer_budget" }]
      }
    }));
    const neither = investorReadForCard(card({
      synthesis: {
        whyItMatters: { text: "Warp has a developer workflow wedge [c1].", citationIds: ["c1"] },
        bullCase: [],
        bearCase: [],
        openQuestions: [{ question: "Can this reach team budgets?", category: "buyer_budget" }]
      }
    }));
    if (!bearOnly || !neither) {
      throw new Error("fixtures must produce filed reads");
    }

    expect(investorLensCategories(bearOnly)[1]?.preview).toBe("Switching cost is low for a CLI tool.");
    expect(investorLensCategories(neither)[1]?.preview).toBe(LENS_TENSION_EMPTY_COPY.holds);
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

  it("closes the Why care lede with the adoption trigger and the timing risk, in that order", () => {
    const display = investorReadForCard(card({
      synthesis: {
        whyItMatters: { text: "Warp has a developer workflow wedge [c1].", citationIds: ["c1"] },
        bullCase: [],
        bearCase: [],
        openQuestions: [{ question: "Can this reach team budgets?", category: "buyer_budget" }],
        marketStructureAndTiming: {
          // A structural field carries no timing weight, so it must not reach the lede.
          buyerBudget: { text: "Budget sits with platform teams [c1].", citationIds: ["c1"] },
          painSeverity: null,
          // No terminal period: the beat has to supply one before the next sentence joins on.
          adoptionTrigger: { text: "Agent rollouts are forcing terminal standardization [c2]", citationIds: ["c2"] },
          marketStructure: null,
          profitPool: null,
          expansionPath: null,
          timingRisk: { text: "The window closes if editors ship the same agent first [c2].", citationIds: ["c2"] }
        }
      }
    }));

    expect(display?.lede.text).toBe(
      "Warp has a developer workflow wedge. Agent rollouts are forcing terminal standardization. The window closes if editors ship the same agent first."
    );
    expect(display?.lede.text).not.toContain("Budget sits with platform teams");
    expect(investorLensCategories(display!)[0]?.preview).toBe(display?.lede.text);
  });

  it("keeps the lede bare when neither timing beat is supported", () => {
    const noTimingCard = card({
      synthesis: {
        whyItMatters: { text: "Warp has a developer workflow wedge [c1].", citationIds: ["c1"] },
        bullCase: [],
        bearCase: [],
        openQuestions: [{ question: "Can this reach team budgets?", category: "buyer_budget" }]
      }
    });
    const display = investorReadForCard(noTimingCard);

    expect(display?.lede.text).toBe("Warp has a developer workflow wedge.");
    expect(display?.receiptLine).toBe("Updated Jun 23");
    expect(display?.independentlyBacked).toBe(false);
  });

  it("adds the timing risk alone when no adoption trigger is filed", () => {
    const display = investorReadForCard(card({
      synthesis: {
        whyItMatters: { text: "Warp has a developer workflow wedge [c1].", citationIds: ["c1"] },
        bullCase: [],
        bearCase: [],
        openQuestions: [{ question: "Can this reach team budgets?", category: "buyer_budget" }],
        marketStructureAndTiming: {
          buyerBudget: null,
          painSeverity: null,
          adoptionTrigger: null,
          marketStructure: null,
          profitPool: null,
          expansionPath: null,
          timingRisk: { text: "The window closes if editors ship the same agent first [c2].", citationIds: ["c2"] }
        }
      }
    }));

    expect(display?.lede.text).toBe(
      "Warp has a developer workflow wedge. The window closes if editors ship the same agent first."
    );
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

  it("returns four categories with Pay attention to last", () => {
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
    expect(categories).toHaveLength(4);
    expect(categories.map((category) => category.id)).toEqual([
      "why-care",
      "the-case",
      "learn-next",
      "pay-attention"
    ]);
    expect(categories[3]).toMatchObject({ id: "pay-attention", label: "Pay attention to" });
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
    expect(investorLensCategories(display)[3]?.preview).toBe(display.emphasis.read);
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
    expect(investorLensCategories(thinFileDisplay)[3]?.preview).toBe(EMPHASIS_EMPTY_COPY.thinFile);

    expect(nothingNotableDisplay.emphasis.state).toBe("nothing_notable");
    expect(investorLensCategories(nothingNotableDisplay)[3]?.preview).toBe(EMPHASIS_EMPTY_COPY.nothingNotable);

    expect(legacyDisplay.emphasis.state).toBe("not_read");
    expect(investorLensCategories(legacyDisplay)[3]?.preview).toBe(EMPHASIS_EMPTY_COPY.notRead);
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

  // Fix wave (2026-08-12): supportedClaims (fed to lensSources) never included the emphasis
  // read's own loud/read claims, so the sixth card's citations never surfaced as footer source
  // chips even when the read was entirely backed by founder-voice evidence.
  it("surfaces founder-authored source chips for a filed read whose only citations are fv-prefixed", () => {
    const founderCitation: Citation = {
      id: "fv1",
      url: "https://x.com/founder/status/123",
      title: "Founder thread on adoption",
      fetchedAt: "2026-06-23T12:00:00.000Z",
      sourceType: "other",
      sourceQuality: {
        tier: "founder_authored",
        label: "Founder-authored",
        rationale: "Direct statement from a named founder.",
        incentive: "Founder has an incentive to promote the company."
      }
    };
    const display = investorReadForCard(card({
      citations: [...minimalWarpCard().citations, founderCitation],
      synthesis: {
        whyItMatters: { text: "Warp has a developer workflow wedge [c1].", citationIds: ["c1"] },
        bullCase: [],
        bearCase: [],
        openQuestions: [{ question: "Can this reach team budgets?", category: "buyer_budget" }],
        emphasisRead: {
          status: "read",
          loud: { text: "The founder posts constantly about daily active usage [fv1].", citationIds: ["fv1"] },
          quiet: "Nothing filed shows a pricing page.",
          read: { text: "The loudest proof is usage growth, not monetization [fv1].", citationIds: ["fv1"] },
          wouldChangeIf: "A pricing page appears."
        }
      }
    }));
    if (!display) {
      throw new Error("fixture must produce a filed read");
    }

    expect(display.sources.map((source) => source.id)).toContain("fv1");
    // independentlyBacked stays scoped to the original synthesis claims only, unaffected by the
    // fv-only emphasis read (whyItMatters here cites c1, not an independent/reporting source).
    expect(display.independentlyBacked).toBe(false);
  });

  it("resolves strategy names and strips markers for a filed how-it-wins read", () => {
    const display = investorReadForCard(card({
      synthesis: {
        whyItMatters: { text: "Warp has a developer workflow wedge [c1].", citationIds: ["c1"] },
        bullCase: [],
        bearCase: [],
        openQuestions: [{ question: "Can this reach team budgets?", category: "buyer_budget" }],
        howItWins: howItWinsFiled
      }
    }));
    if (!display) {
      throw new Error("fixture must produce a filed read");
    }

    expect(display.howItWins).toEqual({
      state: "read",
      sentence: "Warp wins by pairing a narrow terminal competence with the shell every engineer already opens.",
      running: [
        {
          id: "specialization",
          name: "Specialization",
          meaning: "It goes deep on one surface instead of spreading across the whole toolchain.",
          note: "Every shipped feature lands in the terminal itself."
        },
        {
          id: "omnipresence",
          name: "Omnipresence",
          meaning: "It sits in the one window engineers keep open all day.",
          note: "The shell is already open on every machine it runs on."
        },
        {
          id: "usership",
          name: "Usership",
          meaning: "Each new team makes the shared workflow worth more.",
          note: "Teams adopt it after one engineer brings it in."
        }
      ],
      pair: {
        strategies: ["specialization", "omnipresence"],
        names: ["Specialization", "Omnipresence"],
        note: "Depth in one surface only pays because that surface is always open.",
        wrongIf: "Engineers move their daily work into an editor agent instead."
      },
      next: [
        {
          id: "standardization",
          name: "Standardization",
          note: "No platform team has made it the default shell yet."
        }
      ],
      wrongIf: "Editors bundle a comparable terminal agent before team budgets move.",
      count: 3
    });
  });

  it("files the how-it-wins read's own cited notes as footer sources without moving the posture", () => {
    const display = investorReadForCard(card({
      synthesis: {
        whyItMatters: { text: "Warp has a developer workflow wedge [c1].", citationIds: ["c1"] },
        bullCase: [],
        bearCase: [],
        openQuestions: [{ question: "Can this reach team budgets?", category: "buyer_budget" }],
        howItWins: howItWinsFiled
      }
    }));
    if (!display) {
      throw new Error("fixture must produce a filed read");
    }

    // c2 reaches the footer only through the how-it-wins notes: whyItMatters cites c1 alone.
    expect(display.sources.map((source) => source.id)).toContain("c2");
    expect(display.independentlyBacked).toBe(false);
  });

  it("keeps the how-it-wins display honest for thin_file, nothing_stands_out, and a legacy card", () => {
    const baseSynthesis = {
      whyItMatters: { text: "Warp has a developer workflow wedge [c1].", citationIds: ["c1"] },
      bullCase: [],
      bearCase: [],
      openQuestions: [{ question: "Can this reach team budgets?", category: "buyer_budget" as const }]
    };
    const thinFile = investorReadForCard(card({
      synthesis: { ...baseSynthesis, howItWins: { status: "thin_file" } }
    }));
    const nothingWithSentence = investorReadForCard(card({
      synthesis: {
        ...baseSynthesis,
        howItWins: { status: "nothing_stands_out", sentence: "It competes the way most developer tools do [c1]." }
      }
    }));
    const nothingBare = investorReadForCard(card({
      synthesis: { ...baseSynthesis, howItWins: { status: "nothing_stands_out" } }
    }));
    const legacy = investorReadForCard(card({ synthesis: baseSynthesis }));
    if (!thinFile || !nothingWithSentence || !nothingBare || !legacy) {
      throw new Error("fixtures must produce filed reads");
    }

    const empty = { running: [], pair: null, next: [], wrongIf: null, count: 0 };
    expect(thinFile.howItWins).toEqual({ state: "thin_file", sentence: null, ...empty });
    expect(nothingWithSentence.howItWins).toEqual({
      state: "nothing_stands_out",
      sentence: "It competes the way most developer tools do.",
      ...empty
    });
    expect(nothingBare.howItWins).toEqual({ state: "nothing_stands_out", sentence: null, ...empty });
    expect(legacy.howItWins).toEqual({ state: "not_read", sentence: null, ...empty });
  });
});
