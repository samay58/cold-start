import { describe, expect, it } from "vitest";
import type { Citation, ColdStartCard, ResolvedFact } from "@cold-start/core";
import { emptyResearchSectionForCard } from "@cold-start/core";
import {
  buildCitationIndex,
  callNumber,
  evidenceStateForFact,
  headcountConflict,
  INVESTOR_READ_LABELS,
  isThinFile,
  moneyBullets,
  nextQuestionForCard,
  publicEvidenceText,
  resolvedEvidenceState,
  riskCaveats,
  signalEvidenceState,
  statSlots,
  vettedCounts,
  type PublicCardData
} from "../src/lib/card-face/model";
import { emptySectionsCard, richConflictCard, thinFileCard } from "./fixtures/gallery-cards";

// richConflictCard's only company-only-proof signal is cited solely by c5. Stripping it in
// isolation, rather than replacing the whole signals array, keeps the rest of the fixture
// (and the other three signals' citation classes) untouched.
function withoutCompanyOnlySignal(signals: ColdStartCard["signals"]): ColdStartCard["signals"] {
  return signals.filter((signal) => !(signal.citationIds.length === 1 && signal.citationIds[0] === "c5"));
}

// Helper for building bare ResolvedFact-shaped test values without pulling in the
// unexported `fact` helper from the gallery fixture file.
function resolvedFact<T>(
  value: T | null,
  citationIds: string[] = [],
  overrides: { status?: ResolvedFact<T>["status"]; confidence?: ResolvedFact<T>["confidence"] } = {}
): ResolvedFact<T> {
  return {
    value,
    status: overrides.status ?? (value === null ? "unknown" : "verified"),
    confidence: overrides.confidence ?? (value === null ? "low" : "high"),
    citationIds
  };
}

describe("INVESTOR_READ_LABELS", () => {
  it("lists all six locked categories, ending with Pay attention to", () => {
    expect(INVESTOR_READ_LABELS).toHaveLength(6);
    expect(INVESTOR_READ_LABELS[5]).toBe("Pay attention to");
  });
});

describe("buildCitationIndex", () => {
  it("renumbers in card order, not ledger quality order, and dedups repeats", () => {
    // c6 (enrichment, lowest quality tier) leads and c1 (highest tier) trails: if this were
    // ledger-sorted the order would flip. Also repeats c6 to check dedup keeps the first slot.
    const citations = richConflictCard.citations;
    const reordered: Citation[] = [citations[5]!, citations[5]!, citations[0]!, citations[2]!];
    const card: PublicCardData = { ...richConflictCard, citations: reordered };

    const index = buildCitationIndex(card);

    expect(index.ordered.map((citation) => citation.id)).toEqual(["c6", "c1", "c3"]);
    expect(index.displayNumber("c6")).toBe(1);
    expect(index.displayNumber("c1")).toBe(2);
    expect(index.displayNumber("c3")).toBe(3);
  });

  it("returns null for an id not present on the card", () => {
    const index = buildCitationIndex(richConflictCard);
    expect(index.displayNumber("nonexistent")).toBeNull();
  });
});

describe("callNumber", () => {
  it("builds CS·{DOMAIN LABEL}·{YY} from the domain's first label and generatedAt's year", () => {
    expect(callNumber(richConflictCard)).toBe("CS·VOXLATHE·26");
  });
});

describe("isThinFile", () => {
  it("is true for thinFileCard (fewer than 3 citations)", () => {
    expect(isThinFile(thinFileCard)).toBe(true);
  });

  it("is false for richConflictCard (6 citations, several independent/reporting)", () => {
    expect(isThinFile(richConflictCard)).toBe(false);
  });

  it("is true when there are 3+ citations but none is independent- or reporting-class", () => {
    const allCompanyCitations: Citation[] = Array.from({ length: 5 }, (_, index) => ({
      id: `co${index}`,
      url: `https://vendor${index}.example/about`,
      title: `Vendor ${index} — About`,
      fetchedAt: "2026-04-01T09:00:00.000Z",
      sourceType: "company_site"
    }));
    const card: ColdStartCard = { ...thinFileCard, citations: allCompanyCitations };

    expect(isThinFile(card)).toBe(true);
  });
});

describe("vettedCounts", () => {
  it("counts independent/reporting citations against the deduped total", () => {
    // c1 independent, c2 independent, c3 reporting, c4 reporting, c5 company, c6 vendor.
    expect(vettedCounts(richConflictCard)).toEqual({ verified: 4, total: 6 });
  });
});

describe("statSlots", () => {
  it("always returns 5 slots in order, with Valuation permanently absent and Founded from foundedYear", () => {
    const slots = statSlots(richConflictCard);

    expect(slots.map((slot) => slot.key)).toEqual(["stage", "raised", "headcount", "valuation", "founded"]);

    const valuation = slots.find((slot) => slot.key === "valuation")!;
    expect(valuation.value).toBeNull();
    expect(valuation.detail).toBe("no source in ledger");
    expect(valuation.state).toBeNull();

    const founded = slots.find((slot) => slot.key === "founded")!;
    expect(founded.value).toBe("2023");
    expect(founded.detail).toBe("");
    expect(founded.state).toBe("company");
    expect(founded.citationIds).toEqual(["c5"]);
  });

  it("shows Valuation absent even on a card with no funding data at all", () => {
    const slots = statSlots(thinFileCard);
    expect(slots.find((slot) => slot.key === "valuation")!.value).toBeNull();
  });

  it("shows Founded absent, with the same honest-ledger detail as Valuation, on a card with no founded year on record", () => {
    const founded = statSlots(thinFileCard).find((slot) => slot.key === "founded")!;
    expect(founded.value).toBeNull();
    expect(founded.detail).toBe("no source in ledger");
    expect(founded.state).toBeNull();
    expect(founded.citationIds).toEqual([]);
  });

  it("flags the headcount slot as a conflict, with the 'see below' detail, on the mixed fixture", () => {
    const headcount = statSlots(richConflictCard).find((slot) => slot.key === "headcount")!;
    expect(headcount.conflict).toBe(true);
    expect(headcount.detail).toBe("sources disagree, see below");
    expect(headcount.value).toBe("90");
    expect(headcount.state).toBe("conflict");
  });

  it("formats the raised slot through formatCompactCurrency", () => {
    const raised = statSlots(richConflictCard).find((slot) => slot.key === "raised")!;
    expect(raised.value).toBe("$58M");
    expect(raised.citationIds).toEqual(["c3"]);
  });
});

describe("moneyBullets", () => {
  it("composes the raised sentence, the round sentence with lead and month, and a muted missing trailer", () => {
    const bullets = moneyBullets(richConflictCard);

    expect(bullets).toEqual([
      { text: "Raised $58M across disclosed rounds.", state: "reported", citationIds: ["c3"] },
      { text: "Series B closed March 2026, led by Root Ventures.", state: "reported", citationIds: ["c3"] },
      { text: "post-money valuation is not publicly disclosed.", state: "unknown", citationIds: [], muted: true }
    ]);
  });

  it("returns nothing when neither total raised nor a last round is known", () => {
    expect(moneyBullets(thinFileCard)).toEqual([]);
  });
});

describe("headcountConflict", () => {
  it("returns null when the headcount fact is not mixed", () => {
    expect(headcountConflict(thinFileCard)).toBeNull();
    expect(headcountConflict(emptySectionsCard)).toBeNull();
  });

  it("returns the stored value and per-source attribution (title, then hostname) on the mixed fixture", () => {
    expect(headcountConflict(richConflictCard)).toEqual({
      value: 90,
      asOf: "2026-05-02",
      sources: [
        { label: "Voxlathe raises $42M Series B led by Root Ventures", date: "Mar 2026", citationId: "c3" },
        { label: "Voxlathe headcount hits 90 as it scales sales", date: "May 2026", citationId: "c4" }
      ]
    });
  });
});

describe("riskCaveats", () => {
  it("fires the company-only-proof rule via the signal fallback on richConflictCard", () => {
    const caveats = riskCaveats(richConflictCard, []);
    expect(caveats).toEqual([
      {
        text: "The customer proof is company-sourced only. No independent source in this ledger confirms it.",
        state: "company",
        citationIds: ["c5"]
      }
    ]);
  });

  it("prefers a passed customer_proof section over the signal fallback", () => {
    // emptySectionsCard carries no signals at all, so this only passes if the section path
    // itself fires (the fallback has nothing to find).
    const section = {
      ...emptyResearchSectionForCard(emptySectionsCard, "customer_proof", "available"),
      citationIds: ["c1"]
    };

    const caveats = riskCaveats(emptySectionsCard, [section]);
    expect(caveats).toEqual([
      {
        text: "The customer proof is company-sourced only. No independent source in this ledger confirms it.",
        state: "company",
        citationIds: ["c1"]
      }
    ]);
  });

  it("fires the stale rule when a passed section has status: stale", () => {
    const staleSection = emptyResearchSectionForCard(emptySectionsCard, "financing", "stale");

    const caveats = riskCaveats(emptySectionsCard, [staleSection]);
    expect(caveats).toEqual([
      {
        text: "The Financing section is stale. Its sources predate the last successful refresh.",
        state: "unknown",
        citationIds: []
      }
    ]);
  });

  it("is empty when neither rule fires", () => {
    expect(riskCaveats(emptySectionsCard, [])).toEqual([]);
  });

  it("does not let an empty placeholder customer_proof section foreclose the signal fallback", () => {
    // deriveLegacyResearchSectionsFromCard always emits a customer_proof section, even an empty
    // one with no items, no summary, and no citations. That placeholder must not read as
    // authoritative and block the signal fallback from finding richConflictCard's company-only
    // signal (c5) the way a real, populated section would.
    const emptyCustomerProofSection = emptyResearchSectionForCard(richConflictCard, "customer_proof");

    expect(riskCaveats(richConflictCard, [emptyCustomerProofSection])).toEqual([
      {
        text: "The customer proof is company-sourced only. No independent source in this ledger confirms it.",
        state: "company",
        citationIds: ["c5"]
      }
    ]);
  });

  it("does not fall back to the signal check when a customer_proof section has content but isn't company-only", () => {
    // c1 is an independent citation on richConflictCard, so this section fails to qualify as
    // company-only on its own. Because the section has real content (a non-empty citationIds
    // list), the rule must not fall through to the signal fallback, which would otherwise find
    // richConflictCard's company-only signal (c5) and fire a caveat anyway.
    const nonCompanyOnlySection = {
      ...emptyResearchSectionForCard(richConflictCard, "customer_proof", "available"),
      citationIds: ["c1"]
    };

    expect(riskCaveats(richConflictCard, [nonCompanyOnlySection])).toEqual([]);
  });
});

describe("nextQuestionForCard", () => {
  it("prioritizes company-only proof over a simultaneous headcount conflict on richConflictCard", () => {
    expect(nextQuestionForCard(richConflictCard, [])).toEqual({
      question: "Ask for one referenceable production customer.",
      subline: "Not a recommendation. The first thing this ledger cannot answer."
    });
  });

  it("still asks for a referenceable customer when the only passed customer_proof section is an empty placeholder", () => {
    const emptyCustomerProofSection = emptyResearchSectionForCard(richConflictCard, "customer_proof");

    expect(nextQuestionForCard(richConflictCard, [emptyCustomerProofSection])).toEqual({
      question: "Ask for one referenceable production customer.",
      subline: "Not a recommendation. The first thing this ledger cannot answer."
    });
  });

  it("falls through to the conflict question once the company-only signal is removed", () => {
    const card: ColdStartCard = {
      ...richConflictCard,
      signals: withoutCompanyOnlySignal(richConflictCard.signals)
    };

    expect(nextQuestionForCard(card, [])).toEqual({
      question: "Ask the company for a current headcount and the date it was counted.",
      subline: "Not a recommendation. The first thing this ledger cannot answer."
    });
  });

  it("asks about funding when nothing is company-only, conflicted, or raised", () => {
    expect(nextQuestionForCard(emptySectionsCard, [])).toEqual({
      question: "Ask what the company has raised and from whom.",
      subline: "Not a recommendation. The first thing this ledger cannot answer."
    });
  });

  it("asks who funds the company when the file is thin but not conflicted, company-only, or fundless", () => {
    const card: ColdStartCard = {
      ...richConflictCard,
      citations: richConflictCard.citations.slice(0, 2),
      signals: [],
      funding: {
        ...richConflictCard.funding,
        totalRaisedUsd: resolvedFact<number>(null),
        lastRound: resolvedFact(
          { name: "Seed", amountUsd: 1_000_000, announcedAt: "2025-01-10", leadInvestors: ["Basecamp Fund"] },
          ["c1"]
        )
      },
      team: {
        ...richConflictCard.team,
        headcount: resolvedFact<{ value: number; asOf: string }>(null)
      }
    };

    expect(isThinFile(card)).toBe(true);
    expect(nextQuestionForCard(card, [])).toEqual({
      question: "Ask who funds the company and on what terms.",
      subline: "Thin file, not a verdict."
    });
  });

  it("is null when nothing fires", () => {
    const card: ColdStartCard = {
      ...richConflictCard,
      signals: withoutCompanyOnlySignal(richConflictCard.signals),
      team: {
        ...richConflictCard.team,
        headcount: resolvedFact({ value: 58, asOf: "2026-03-14" }, ["c3", "c4"])
      }
    };

    expect(isThinFile(card)).toBe(false);
    expect(nextQuestionForCard(card, [])).toBeNull();
  });
});

describe("evidenceStateForFact", () => {
  it("is unknown when the fact's value is null", () => {
    expect(evidenceStateForFact(thinFileCard, thinFileCard.funding.totalRaisedUsd)).toBe("unknown");
  });

  it("is conflict when the fact's status is mixed, regardless of citation class", () => {
    expect(evidenceStateForFact(richConflictCard, richConflictCard.team.headcount)).toBe("conflict");
  });

  it("is company when the only citation is company-class", () => {
    expect(evidenceStateForFact(richConflictCard, richConflictCard.team.founders)).toBe("company");
  });

  it("is reported when a single independent- or reporting-class citation backs it", () => {
    expect(evidenceStateForFact(richConflictCard, richConflictCard.funding.totalRaisedUsd)).toBe("reported");
  });

  it("is verified when 2+ distinct citations include an independent- or reporting-class source", () => {
    const fact = resolvedFact("x", ["c1", "c3"]);
    expect(evidenceStateForFact(richConflictCard, fact)).toBe("verified");
  });

  it("is unknown when every backing citation is vendor-class", () => {
    const fact = resolvedFact("x", ["c6"]);
    expect(evidenceStateForFact(richConflictCard, fact)).toBe("unknown");
  });
});

describe("resolvedEvidenceState", () => {
  // The Money and Comps rows this guards build a synthetic fact with a hard-coded "verified"
  // status because they have no ResolvedFact of their own. evidenceStateForFact's own fallback
  // (publicEvidenceStatusForFact's `classes.length === 0` branch) would trust that hard-coded
  // status even when zero citations resolve; this guard exists to catch exactly that case.
  it("reports unknown when none of the fact's citationIds resolve in the citation index, despite a hard-coded verified status", () => {
    const index = buildCitationIndex(richConflictCard);
    const fact = resolvedFact("x", ["nonexistent"], { status: "verified", confidence: "high" });

    expect(resolvedEvidenceState(richConflictCard, index, fact)).toBe("unknown");
  });

  it("reports unknown when the fact carries no citationIds at all", () => {
    const index = buildCitationIndex(richConflictCard);
    const fact = resolvedFact("x", [], { status: "verified", confidence: "high" });

    expect(resolvedEvidenceState(richConflictCard, index, fact)).toBe("unknown");
  });

  it("defers to evidenceStateForFact once at least one citationId resolves", () => {
    const index = buildCitationIndex(richConflictCard);
    // c1 resolves (independent-class); the unresolved id alongside it must not suppress that.
    const fact = resolvedFact("x", ["c1", "nonexistent"], { status: "verified", confidence: "high" });

    expect(resolvedEvidenceState(richConflictCard, index, fact)).toBe(
      evidenceStateForFact(richConflictCard, fact)
    );
  });
});

describe("signalEvidenceState", () => {
  it("is company when every backing citation resolves to the company class", () => {
    // richConflictCard.signals[2] is cited solely by c5, the company-class citation.
    expect(signalEvidenceState(richConflictCard, richConflictCard.signals[2]!)).toBe("company");
  });

  it("is verified when any backing citation is independent-class, even mixed with weaker sources", () => {
    // richConflictCard.signals[1] is cited solely by c1 (independent).
    expect(signalEvidenceState(richConflictCard, richConflictCard.signals[1]!)).toBe("verified");
    // c5 (company) and c3 (reporting) alone would not clear "verified"; adding c1 does.
    expect(signalEvidenceState(richConflictCard, { citationIds: ["c5", "c3", "c1"] })).toBe("verified");
  });

  it("falls back to reported for a non-company mix with no independent source, and to unknown with no citations", () => {
    // richConflictCard.signals[0] is cited solely by c3 (reporting, not independent, not company).
    expect(signalEvidenceState(richConflictCard, richConflictCard.signals[0]!)).toBe("reported");
    expect(signalEvidenceState(richConflictCard, { citationIds: [] })).toBe("unknown");
  });
});

describe("publicEvidenceText", () => {
  it("returns short text unchanged", () => {
    expect(publicEvidenceText("A short claim.")).toBe("A short claim.");
  });

  it("clips long text at a sentence or word boundary and appends an ellipsis when needed", () => {
    const long = `${"Sentence one is fairly long and keeps going for a while. ".repeat(6)}Final sentence.`;
    const clipped = publicEvidenceText(long, 80);
    expect(clipped.length).toBeLessThanOrEqual(83);
    expect(clipped.endsWith("...") || long.startsWith(clipped)).toBe(true);
  });
});
