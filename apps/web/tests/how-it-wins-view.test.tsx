import type { HowItWinsRead } from "@cold-start/core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HowItWinsView } from "../src/app/eval/HowItWinsView";

const read: HowItWinsRead = {
  status: "read",
  sentence: "The company controls a required passage through its release process.",
  running: [
    {
      strategy: "hybrid",
      meaning: "MODEL-WRITTEN HYBRID MEANING",
      note: "It combines research and software [c1].",
      citationIds: ["c1"]
    },
    {
      strategy: "chokepoint",
      meaning: "MODEL-WRITTEN CHOKEPOINT MEANING",
      note: "Two buyers must use the same release step [c2].",
      citationIds: ["c2"]
    }
  ],
  pair: {
    strategies: ["hybrid", "chokepoint"],
    note: "The research determines what the software tests [c1][c2].",
    wrongIf: "Buyers can replace either part without losing quality.",
    citationIds: ["c1", "c2"]
  },
  next: [
    {
      strategy: "standardization",
      note: "A third buyer would have to adopt the same process.",
      citationIds: []
    }
  ],
  inQuestion: [],
  wrongIf: "Buyers can replace the release step without losing quality."
};

describe("HowItWinsView", () => {
  it("uses human headings and canonical meanings for running, pair, and next", () => {
    const html = renderToStaticMarkup(<HowItWinsView read={read} />);

    expect(html).toContain("What currently wins");
    expect(html).not.toContain(">Running<");
    expect(html).toContain("Competence in two distinct areas, or two strengths not usually found together.");
    expect(html).toContain("Controls a passage that competitors or prey must pass through.");
    expect(html).toContain("Emergent alignment that reduces friction.");
    expect(html).not.toContain("MODEL-WRITTEN");
  });

  it("renders in-question strategies under their own heading, including on nothing_stands_out", () => {
    const withQuestion = {
      ...read,
      inQuestion: [{
        strategy: "completeness" as const,
        note: "The filed record does not show whether buyers still need another tool.",
        citationIds: []
      }]
    };
    const html = renderToStaticMarkup(<HowItWinsView read={withQuestion} />);
    expect(html).toContain("Unresolved");
    expect(html).toContain("Completeness");
    expect(html).toContain("One tool covers everything the buyer needs, so nothing else is required.");

    const empty = renderToStaticMarkup(<HowItWinsView read={{
      status: "nothing_stands_out",
      sentence: "It competes the way most developer tools do.",
      inQuestion: withQuestion.inQuestion
    }} />);
    expect(empty).toContain("Unresolved");
    expect(empty).toContain("Completeness");
    expect(empty).not.toContain("What currently wins");
  });
});
