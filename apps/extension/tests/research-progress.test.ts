import { describe, expect, it } from "vitest";
import {
  buildResearchProgressPlan,
  RESEARCH_PROGRESS_STAGES
} from "../src/research-progress";
import type { ExtensionResearchRunEvent, ExtensionSourceSummary } from "../src/extension-config";

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
  it("uses noun stage labels and honest waiting proof lines without events", () => {
    const plan = buildResearchProgressPlan({
      activeIndex: 0,
      events: [],
      stageNote: "unused",
      stages: RESEARCH_PROGRESS_STAGES
    });

    expect(plan.map((stage) => stage.label)).toEqual(["Sources", "Evidence", "Profile", "Filed"]);
    expect(plan.map((stage) => stage.proofLine)).toEqual([
      "Checking company, product, funding, and proof sources",
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

  it("shows first cited profile readiness with citation count", () => {
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

    expect(plan[2]?.proofLine).toBe("First cited profile ready - 7 citations");
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

    expect(text).not.toMatch(/search plan|query plan|worker|pipeline|accepted sources|Looking for useful places|Pulling in what matters|Turning evidence|Saving the final profile/i);
  });
});
