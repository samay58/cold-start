import { describe, expect, it } from "vitest";
import { compactProfileSummary, formatElapsed, formatOptionalCurrency, profileSummaryCopy } from "../src/shared/extension-format";

describe("extension formatting", () => {
  it("formats elapsed run time", () => {
    expect(formatElapsed(84)).toBe("1:24");
  });

  it("formats compact currency through the shared core precision rules", () => {
    expect(formatOptionalCurrency(6_250_000)).toBe("$6.3M");
    expect(formatOptionalCurrency(6_000_000)).toBe("$6M");
    expect(formatOptionalCurrency(12_400_000)).toBe("$12M");
    expect(formatOptionalCurrency(null)).toBeNull();
  });

  it("keeps the overview to the first load-bearing sentence", () => {
    expect(
      compactProfileSummary(
        "Hanover Park is an automated fund administrator for private equity and venture capital firms. It combines fund accounting, portfolio management, LP portals, analytics, modelling, security workflows, client support, and capital calls into one platform.",
        "hanoverpark.com"
      )
    ).toBe("Hanover Park is an automated fund administrator for private equity and venture capital firms.");
  });

  it("keeps long single-sentence overviews complete instead of adding visual truncation copy", () => {
    const summary = compactProfileSummary(
      "Hanover Park replaces fragmented fund administration workflows for private equity and venture capital teams by combining fund accounting, document extraction, portfolio management, limited partner reporting, capital calls, distributions, analytics, and service operations into one workspace",
      "hanoverpark.com"
    );

    expect(summary.endsWith("...")).toBe(false);
    expect(summary).toMatch(/[.!?]$/);
    expect(summary).not.toContain("workspace...");
  });

  it("uses expandedDescription as the full tooltip body when it is meaningfully richer", () => {
    const copy = profileSummaryCopy({
      domain: "island.io",
      identity: {
        oneLiner: {
          value: "Island gives enterprises a secure browser for employees and contractors.",
          status: "verified",
          confidence: "high",
          citationIds: ["c1"],
        },
        description: {
          value: {
            shortDescription: "Island gives enterprises a secure browser for employees and contractors...",
            expandedDescription:
              "Island gives enterprises a secure browser for employees and contractors. Security and IT teams use it to control access, data movement, and app behavior without replacing every SaaS tool.",
            concept: "Enterprise browser security.",
            serves: "Security and IT teams at large companies.",
            mechanism: "Policy controls sit inside the browser where employees work.",
          },
          status: "verified",
          confidence: "high",
          citationIds: ["c1"],
        },
      },
    });

    expect(copy.summary).toBe("Island gives enterprises a secure browser for employees and contractors.");
    expect(copy.fullSummary).toContain("control access, data movement, and app behavior");
    expect(copy.fullSummary).not.toContain("...");
  });

  it("falls back to structured fields only when they add a longer explanation", () => {
    const copy = profileSummaryCopy({
      domain: "decagon.ai",
      identity: {
        oneLiner: {
          value: "Decagon sells AI agents for customer support teams.",
          status: "verified",
          confidence: "high",
          citationIds: ["c1"],
        },
        description: {
          value: {
            shortDescription: "Decagon sells AI agents for customer support teams.",
            expandedDescription: null,
            concept: "AI agents for enterprise customer support.",
            serves: "Support, product, and operations teams at software companies.",
            mechanism: "The agents resolve tickets, execute backend actions, and escalate cases when automation is not enough.",
          },
          status: "verified",
          confidence: "high",
          citationIds: ["c1"],
        },
      },
    });

    expect(copy.fullSummary).toContain("execute backend actions");
    expect(copy.fullSummary.length).toBeGreaterThan(copy.summary.length);
  });
});
