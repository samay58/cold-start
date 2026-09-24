import { describe, expect, it } from "vitest";
import { expandedDescriptionSystemPrompt } from "../src/expanded-description";
import { investorTasteKernel } from "../src/investor-taste-kernel";
import { researchSectionSystemPrompt } from "../src/research-section";
import { synthesisSystemPrompt } from "../src/synthesis";

// Samay's approved wording, September 23, 2026 (Task 3 of the evidence remediation plan). The
// principle lives once, in the shared kernel; the per-prompt sentences it replaced are gone.
const principle =
  "Private companies rarely publish revenue, margins, contract values or head-to-head results. Their absence is normal, not a finding. Mention a missing fact only when it is unusual for this company, or when finding it would change the read.";

describe("normal private-company absences", () => {
  it("are stated once, in the shared kernel every writing stage reads", () => {
    expect(investorTasteKernel).toContain(principle);
    expect(synthesisSystemPrompt).toContain(principle);
    expect(researchSectionSystemPrompt).toContain(principle);
  });

  it("are no longer invited by the prompts that read the kernel", () => {
    expect(synthesisSystemPrompt).toContain("Bull claims must name a buyer, workflow, mechanism, or proof.");
    expect(synthesisSystemPrompt).not.toContain("missing proof");
    expect(researchSectionSystemPrompt).toContain(
      "Never refer to the evidence, the supplied sources, the card, or the packet in what you write. Say what the source said."
    );
    expect(researchSectionSystemPrompt).not.toContain("state a gap");
  });

  it("are no longer invited by the expanded description, which does not read the kernel", () => {
    expect(expandedDescriptionSystemPrompt).toContain(
      "State what is known about who pays and what it costs, and stop. Never mention the evidence or the sources in the description. Never guess."
    );
    expect(expandedDescriptionSystemPrompt).not.toContain("what is missing");
    expect(expandedDescriptionSystemPrompt).not.toContain("Honest absence");
  });
});
