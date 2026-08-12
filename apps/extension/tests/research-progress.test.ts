import { describe, expect, it } from "vitest";
import {
  buildResearchProgressPlan,
  hasResearchProgressAttention,
  RESEARCH_PROGRESS_STAGES,
  sealLevelFromEvents,
  whisperCopyFromEvents
} from "../src/research/research-progress";
import type { ExtensionResearchRunEvent, ExtensionSourceSummary } from "../src/shared/extension-config";

function event(input: Partial<ExtensionResearchRunEvent> & Pick<ExtensionResearchRunEvent, "id" | "type">): ExtensionResearchRunEvent {
  return {
    createdAt: "2026-06-21T00:00:00.000Z",
    domain: "exa.ai",
    message: input.type,
    metadata: {},
    runId: "run-1",
    sectionId: null,
    slug: "exa",
    ...input
  };
}

function source(input: Partial<ExtensionSourceSummary> & Pick<ExtensionSourceSummary, "sourceType" | "domain">): ExtensionSourceSummary {
  return {
    fetchedAt: "2026-06-21T00:00:00.000Z",
    id: `${input.sourceType}-${input.domain}`,
    snippet: "",
    title: input.domain,
    url: `https://${input.domain}`,
    ...input
  };
}

describe("artifact-led research progress", () => {
  it("uses verb stage labels and honest waiting proof lines without events", () => {
    const plan = buildResearchProgressPlan({
      activeIndex: 0,
      events: [],
      stageNote: "unused",
      stages: RESEARCH_PROGRESS_STAGES
    });

    expect(plan.map((stage) => stage.label)).toEqual(["Find", "Read", "Build", "File"]);
    expect(plan.map((stage) => stage.proofLine)).toEqual([
      "Planning which sources to check",
      "Waiting for sources",
      "Waiting for evidence",
      "Waiting for profile"
    ]);
  });

  it("falls back to a source count when no categories are available", () => {
    const plan = buildResearchProgressPlan({
      activeIndex: 1,
      events: [
        event({
          id: "sources",
          message: "Found 12 accepted sources",
          metadata: { acceptedCount: 12 },
          type: "source.found"
        })
      ],
      stageNote: "unused",
      stages: RESEARCH_PROGRESS_STAGES
    });

    expect(plan[0]?.proofLine).toBe("12 sources found");
    expect(plan[0]?.substeps.map((substep) => substep.message)).toEqual([]);
  });

  it("uses source categories when they are available from visible sources", () => {
    const plan = buildResearchProgressPlan({
      activeIndex: 1,
      events: [
        event({
          id: "sources",
          message: "Found 12 accepted sources",
          metadata: { acceptedCount: 12 },
          type: "source.found"
        })
      ],
      sources: [
        source({ domain: "exa.ai", sourceType: "company_site" }),
        source({ domain: "docs.exa.ai", sourceType: "company_site" }),
        source({ domain: "techcrunch.com", sourceType: "news", title: "Exa funding" })
      ],
      stageNote: "unused",
      stages: RESEARCH_PROGRESS_STAGES
    });

    expect(plan[0]?.proofLine).toBe("Company site, docs, and funding coverage found");
    expect(plan[0]?.substeps.map((substep) => substep.message)).toEqual(["12 sources found"]);
  });

  it("uses bounded source category metadata when visible sources are not available", () => {
    const plan = buildResearchProgressPlan({
      activeIndex: 1,
      events: [
        event({
          id: "sources",
          message: "Found 3 accepted sources",
          metadata: { acceptedCount: 3, sourceCategories: ["company site", "docs", "funding coverage"] },
          type: "source.found"
        })
      ],
      stageNote: "unused",
      stages: RESEARCH_PROGRESS_STAGES
    });

    expect(plan[0]?.proofLine).toBe("Company site, docs, and funding coverage found");
  });

  it("turns source-only firstPayoff into a useful proof line without receipt copy", () => {
    const firstPayoff = {
      status: "receipt",
      slug: "exa",
      domain: "exa.ai",
      generatedAt: "2026-06-21T00:00:00.000Z",
      generatedAtMs: Date.parse("2026-06-21T00:00:00.000Z"),
      entityConfidence: "high",
      entityConfidenceReason: "Company-controlled source matches the current domain.",
      evidenceSoFar: [
        {
          sourceId: "company",
          url: "https://exa.ai",
          domain: "exa.ai",
          title: "Exa",
          sourceClass: "company_site",
          quality: "company",
          arrivedAtMs: Date.parse("2026-06-21T00:00:00.000Z"),
          entityMatched: true
        },
        {
          sourceId: "docs",
          url: "https://docs.exa.ai",
          domain: "docs.exa.ai",
          title: "Exa docs",
          sourceClass: "docs",
          quality: "company",
          arrivedAtMs: Date.parse("2026-06-21T00:00:01.000Z"),
          entityMatched: true
        },
        {
          sourceId: "funding",
          url: "https://techcrunch.com/exa",
          domain: "techcrunch.com",
          title: "Exa raises funding",
          sourceClass: "funding",
          quality: "reported",
          arrivedAtMs: Date.parse("2026-06-21T00:00:02.000Z"),
          entityMatched: true
        }
      ],
      stillChecking: { text: "Named customer proof.", missingEvidenceClass: "customer_proof" },
      suppressionReasons: ["no_incremental_claim"]
    };
    const plan = buildResearchProgressPlan({
      activeIndex: 1,
      events: [
        event({
          id: "sources",
          message: "Found 12 accepted sources",
          metadata: { acceptedCount: 12 },
          type: "source.found"
        }),
        event({
          id: "payoff",
          message: "Sources checked",
          metadata: { firstPayoff },
          type: "first_payoff.receipt"
        })
      ],
      stageNote: "unused",
      stages: RESEARCH_PROGRESS_STAGES
    });

    expect(plan[1]?.proofLine).toBe("Filed company site, docs, and funding; need named customer proof");
    expect(plan[1]?.substeps.map((substep) => substep.message)).toEqual([]);
  });

  it("shows first profile readiness with its reference count", () => {
    const plan = buildResearchProgressPlan({
      activeIndex: 2,
      events: [
        event({
          id: "profile",
          message: "Saved first usable company card",
          metadata: { citationCount: 7 },
          type: "card.partial"
        })
      ],
      stageNote: "unused",
      stages: RESEARCH_PROGRESS_STAGES
    });

    expect(plan[2]?.proofLine).toBe("First profile ready · 7 references");
    expect(plan[2]?.substeps.map((substep) => substep.message)).toEqual([]);
  });

  it("shows filed artifact copy after the profile is saved", () => {
    const plan = buildResearchProgressPlan({
      activeIndex: 3,
      events: [
        event({
          id: "saved",
          message: "Saved cited company card",
          metadata: { citationCount: 9, sourceCount: 14 },
          type: "card.saved"
        })
      ],
      stageNote: "unused",
      stages: RESEARCH_PROGRESS_STAGES
    });

    expect(plan[3]?.proofLine).toBe("Saved with sources attached");
    expect(plan[3]?.substeps.map((substep) => substep.message)).toEqual([]);
  });

  it("does not expose internal progress language in proof lines or substeps", () => {
    const plan = buildResearchProgressPlan({
      activeIndex: 1,
      events: [
        event({ id: "queued", message: "Queued this company", type: "generation.queued" }),
        event({ id: "plan", message: "Research plan ready", metadata: { queryCount: 4 }, type: "plan.ready" }),
        event({
          id: "sources",
          message: "Found 8 accepted sources",
          metadata: { acceptedCount: 8 },
          type: "source.found"
        })
      ],
      stageNote: "unused",
      stages: RESEARCH_PROGRESS_STAGES
    });

    const text = plan.flatMap((stage) => [stage.label, stage.proofLine, ...stage.substeps.map((substep) => substep.message)]).join(" ");

    // \b guards "search plan": "Research plan ready" is approved copy (Task 6) and must not
    // trip on the "search" substring inside "research".
    expect(text).not.toMatch(/\bsearch plan\b|\bquery plan\b|worker|pipeline|accepted sources|Looking for useful places|Pulling in what matters|Turning evidence|Saving the final profile/i);
  });

  it("shows plan.ready as a done substep so the pre-source hold has a visible movement", () => {
    const plan = buildResearchProgressPlan({
      activeIndex: 0,
      events: [
        event({ id: "started", type: "generation.started" }),
        event({ id: "plan", type: "plan.ready" })
      ],
      stageNote: "Checking company, product, funding, and proof sources",
      stages: RESEARCH_PROGRESS_STAGES
    });

    const findSubsteps = plan[0]?.substeps.map((substep) => substep.message);
    expect(findSubsteps).toContain("Research plan ready");
    expect(plan[0]?.substeps.find((substep) => substep.message === "Research plan ready")?.status).toBe("done");
  });

  it("advances the Find proof line from planning to checking on plan.ready", () => {
    const before = buildResearchProgressPlan({
      activeIndex: 0,
      events: [event({ id: "started", type: "generation.started" })],
      stageNote: "",
      stages: RESEARCH_PROGRESS_STAGES
    });
    expect(before[0]?.proofLine).toBe("Planning which sources to check");

    const after = buildResearchProgressPlan({
      activeIndex: 0,
      events: [
        event({ id: "started", type: "generation.started" }),
        event({ id: "plan", type: "plan.ready" })
      ],
      stageNote: "",
      stages: RESEARCH_PROGRESS_STAGES
    });
    expect(after[0]?.proofLine).toBe("Checking company, product, funding, and proof sources");
  });
});

describe("sealLevelFromEvents", () => {
  it("advances the seal in discrete steps as real stage events land", () => {
    expect(sealLevelFromEvents([])).toBe(0);
    expect(sealLevelFromEvents([event({ id: "queued", type: "generation.queued" })])).toBe(0);
    expect(sealLevelFromEvents([event({ id: "plan", type: "plan.ready" })])).toBe(1);
    expect(
      sealLevelFromEvents([
        event({ id: "plan", type: "plan.ready" }),
        event({ id: "sources", type: "source.found", metadata: { acceptedCount: 8 } })
      ])
    ).toBe(2);
    expect(
      sealLevelFromEvents([event({ id: "payoff", type: "first_payoff.ready" })])
    ).toBe(3);
    expect(sealLevelFromEvents([event({ id: "partial", type: "card.partial" })])).toBe(3);
    expect(sealLevelFromEvents([event({ id: "saved", type: "card.saved" })])).toBe(4);
    expect(sealLevelFromEvents([event({ id: "complete", type: "generation.complete" })])).toBe(4);
  });

  it("takes the highest level reached, not the last event", () => {
    expect(
      sealLevelFromEvents([
        event({ id: "saved", type: "card.saved" }),
        event({ id: "sources", type: "source.found", metadata: { acceptedCount: 8 } })
      ])
    ).toBe(4);
  });
});

describe("whisperCopyFromEvents", () => {
  it("moves from queued to reading to building to filed on real events", () => {
    expect(whisperCopyFromEvents([], "exa.ai")).toBe("Queued");
    expect(whisperCopyFromEvents([event({ id: "plan", type: "plan.ready" })], "exa.ai")).toBe("Reading exa.ai");
    expect(
      whisperCopyFromEvents(
        [event({ id: "sources", type: "source.found", metadata: { acceptedCount: 8 } })],
        "exa.ai"
      )
    ).toBe("8 sources, building profile");
    expect(
      whisperCopyFromEvents(
        [event({ id: "sources", type: "source.found", metadata: { acceptedCount: 1 } })],
        "exa.ai"
      )
    ).toBe("1 source, building profile");
    expect(whisperCopyFromEvents([event({ id: "saved", type: "card.saved" })], "exa.ai")).toBe("Filed");
  });

  const receiptPayoff = {
    status: "receipt",
    slug: "exa",
    domain: "exa.ai",
    generatedAt: "2026-06-21T00:00:00.000Z",
    generatedAtMs: Date.parse("2026-06-21T00:00:00.000Z"),
    entityConfidence: "high",
    entityConfidenceReason: "Current domain and source text match Exa.",
    evidenceSoFar: [],
    stillChecking: { text: "Named customer proof.", missingEvidenceClass: "customer_proof" },
    suppressionReasons: []
  };

  it("says it is confirming the company while the entity match is unchecked", () => {
    const events = [
      event({ id: "sources", type: "source.found", metadata: { acceptedCount: 3 } }),
      event({
        id: "receipt",
        type: "first_payoff.withheld",
        metadata: {
          firstPayoff: {
            ...receiptPayoff,
            status: "withheld",
            entityConfidence: "needs_check",
            suppressionReasons: ["entity_needs_check"]
          }
        }
      })
    ];
    expect(whisperCopyFromEvents(events, "exa.ai")).toBe("Confirming this is the right company");
  });

  it("says no solid sources honestly instead of a generic building line", () => {
    const events = [
      event({ id: "plan", type: "plan.ready" }),
      event({ id: "receipt", type: "first_payoff.receipt", metadata: { firstPayoff: receiptPayoff } })
    ];
    expect(whisperCopyFromEvents(events, "exa.ai")).toBe("No solid sources yet, still looking");
  });

  it("returns to the standard voice once the read is substantive or filed", () => {
    const substantive = {
      ...receiptPayoff,
      status: "substantive_first_read",
      whatItDoes: {
        text: "Exa builds search infrastructure for AI applications.",
        supportingText: "Exa builds search infrastructure for AI applications.",
        sourceIds: ["company_site-exa.ai"],
        citationIds: [],
        sourceClass: "company_site",
        claimKind: "what_it_does"
      }
    };
    const events = [
      event({ id: "sources", type: "source.found", metadata: { acceptedCount: 8 } }),
      event({ id: "ready", type: "first_payoff.ready", metadata: { firstPayoff: substantive } })
    ];
    expect(whisperCopyFromEvents(events, "exa.ai")).toBe("8 sources, building profile");
    expect(
      whisperCopyFromEvents([...events, event({ id: "saved", type: "card.saved" })], "exa.ai")
    ).toBe("Filed");
  });
});

describe("hasResearchProgressAttention", () => {
  it("is false for clean events and true when a stage event fails or needs attention", () => {
    expect(
      hasResearchProgressAttention([event({ id: "sources", type: "source.found", metadata: { acceptedCount: 8 } })])
    ).toBe(false);
    expect(
      hasResearchProgressAttention([
        event({ id: "sources", type: "source.found", message: "Sources not found", metadata: {} })
      ])
    ).toBe(true);
    expect(
      hasResearchProgressAttention([event({ id: "saved", type: "card.saved", message: "Save failed" })])
    ).toBe(true);
  });

  it("flips to attention on a generation.failed event even without failure language in the message", () => {
    expect(
      hasResearchProgressAttention([
        event({ id: "queued", type: "generation.queued" }),
        event({ id: "sources", type: "source.found", metadata: { acceptedCount: 4 } }),
        event({ id: "gen-failed", type: "generation.failed", message: "Provider request timed out" })
      ])
    ).toBe(true);
  });

  it("stays quiet for a section.failed event, which belongs to the gated section surface, not the profile run", () => {
    expect(
      hasResearchProgressAttention([
        event({ id: "sources", type: "source.found", metadata: { acceptedCount: 4 } }),
        event({ id: "section-failed", sectionId: "market", type: "section.failed", message: "Provider request timed out" })
      ])
    ).toBe(false);
  });
});

describe("buildResearchProgressPlan failure surfacing", () => {
  it("surfaces a generation-level failure on the active stage so the details tree flips to failed", () => {
    const plan = buildResearchProgressPlan({
      activeIndex: 1,
      events: [
        event({ id: "sources", type: "source.found", metadata: { acceptedCount: 4 } }),
        event({ id: "gen-failed", type: "generation.failed", message: "Provider request timed out" })
      ],
      stageNote: "unused",
      stages: RESEARCH_PROGRESS_STAGES
    });

    expect(plan[1]?.status).toBe("failed");
    expect(plan[1]?.substeps.some((substep) => substep.status === "failed" && substep.message === "Provider request timed out")).toBe(true);
  });
});
