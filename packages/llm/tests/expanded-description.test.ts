import { describe, expect, it } from "vitest";

import { validateExpandedDescriptionDraft } from "../src/expanded-description";

const validCitationIds = new Set(["c1", "c2"]);

function paragraphsOf(totalWords: number, paragraphCount = 3): string[] {
  const perParagraph = Math.ceil(totalWords / paragraphCount);
  return Array.from({ length: paragraphCount }, () =>
    `${Array.from({ length: perParagraph }, (_, index) => `word${index}`).join(" ")}.`
  );
}

describe("validateExpandedDescriptionDraft", () => {
  it("accepts a three-paragraph memo with resolvable citations", () => {
    const result = validateExpandedDescriptionDraft(
      { paragraphs: paragraphsOf(150), citationIds: ["c1", "c2", "c1"] },
      validCitationIds
    );

    expect(result.suppressionReason).toBeNull();
    expect(result.expandedDescription?.paragraphs).toHaveLength(3);
    expect(result.expandedDescription?.citationIds).toEqual(["c1", "c2"]);
  });

  it("suppresses a null draft as honest inability", () => {
    expect(validateExpandedDescriptionDraft(null, validCitationIds)).toEqual({
      expandedDescription: null,
      suppressionReason: "no_draft"
    });
  });

  it("suppresses brochure copy on the banned phrases", () => {
    const paragraphs = paragraphsOf(150);
    paragraphs[1] = "It is an AI-powered platform for enterprise workflows.";

    const result = validateExpandedDescriptionDraft({ paragraphs, citationIds: ["c1"] }, validCitationIds);

    expect(result.expandedDescription).toBeNull();
    expect(result.suppressionReason).toBe("banned_phrase");
  });

  it("suppresses drafts outside the word bounds", () => {
    const short = validateExpandedDescriptionDraft({ paragraphs: paragraphsOf(20), citationIds: ["c1"] }, validCitationIds);
    const long = validateExpandedDescriptionDraft({ paragraphs: paragraphsOf(400), citationIds: ["c1"] }, validCitationIds);

    expect(short.suppressionReason).toBe("word_bounds");
    expect(long.suppressionReason).toBe("word_bounds");
  });

  it("suppresses a draft cut off mid-sentence", () => {
    const paragraphs = paragraphsOf(150);
    paragraphs[2] = "The company sells to hotels and";

    const result = validateExpandedDescriptionDraft({ paragraphs, citationIds: ["c1"] }, validCitationIds);

    expect(result.suppressionReason).toBe("truncated");
  });

  it("suppresses a draft whose citations do not resolve", () => {
    const result = validateExpandedDescriptionDraft(
      { paragraphs: paragraphsOf(150), citationIds: ["c99"] },
      validCitationIds
    );

    expect(result.suppressionReason).toBe("no_valid_citations");
  });
});
