import { describe, expect, it, vi } from "vitest";

import {
  expandedDescriptionCorrection,
  synthesizeExpandedDescription,
  validateExpandedDescriptionDraft
} from "../src/expanded-description";

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

  it("normalizes em-dashes to commas instead of suppressing or re-asking", () => {
    const paragraphs = paragraphsOf(150);
    paragraphs[0] = "Mews sells to hotel operators — independent hotels and chains.";

    const result = validateExpandedDescriptionDraft({ paragraphs, citationIds: ["c1"] }, validCitationIds);

    expect(result.suppressionReason).toBeNull();
    expect(result.expandedDescription?.paragraphs[0]).toBe("Mews sells to hotel operators, independent hotels and chains.");
  });

  it("suppresses a draft whose citations do not resolve", () => {
    const result = validateExpandedDescriptionDraft(
      { paragraphs: paragraphsOf(150), citationIds: ["c99"] },
      validCitationIds
    );

    expect(result.suppressionReason).toBe("no_valid_citations");
  });
});

describe("expandedDescriptionCorrection", () => {
  it("names the exact banned phrase in the correction", () => {
    const message = expandedDescriptionCorrection(
      { paragraphs: ["It sells property management solutions to hotels."] },
      "banned_phrase"
    );

    expect(message).toContain('"solutions"');
    expect(message).toContain("Rewrite");
  });
});

function toolResponse(description: unknown, usage: Record<string, number>) {
  return {
    content: [{ type: "tool_use", name: "emit_expanded_description", input: { description } }],
    usage
  };
}

function fakeClient(responses: unknown[]) {
  const create = vi.fn(async (_params: { messages: Array<{ role: string; content: string }> }) => {
    const next = responses.shift();
    if (!next) throw new Error("no scripted response left");
    return next;
  });
  return { client: { messages: { create } } as never, create };
}

const evidence = {
  companyName: "Mews",
  domain: "mews.com",
  cardFacts: { name: "Mews" },
  sources: [{ citationId: "c1", title: "Mews", url: "https://mews.com", text: "Mews runs hotel operations software." }]
};

describe("synthesizeExpandedDescription retry", () => {
  it("re-asks once with the named violation and returns the corrected draft", async () => {
    const banned = { paragraphs: [...paragraphsOf(140).slice(0, 2), "It sells property management solutions to hotels."], citationIds: ["c1"] };
    const clean = { paragraphs: paragraphsOf(150), citationIds: ["c1"] };
    const { client, create } = fakeClient([
      toolResponse(banned, { input_tokens: 10, output_tokens: 10 }),
      toolResponse(clean, { input_tokens: 12, output_tokens: 12 })
    ]);

    const result = await synthesizeExpandedDescription({ client, evidence, model: "claude-test" });

    expect(create).toHaveBeenCalledTimes(2);
    const retryMessages = create.mock.calls[1]?.[0]?.messages ?? [];
    expect(retryMessages.at(-1)?.content).toContain('"solutions"');
    expect(result.suppressionReason).toBeNull();
    expect(result.expandedDescription?.paragraphs).toHaveLength(3);
  });

  it("suppresses after a persistent violation instead of looping", async () => {
    const banned = { paragraphs: [...paragraphsOf(140).slice(0, 2), "It sells property management solutions to hotels."], citationIds: ["c1"] };
    const { client, create } = fakeClient([
      toolResponse(banned, { input_tokens: 10, output_tokens: 10 }),
      toolResponse(banned, { input_tokens: 12, output_tokens: 12 })
    ]);

    const result = await synthesizeExpandedDescription({ client, evidence, model: "claude-test" });

    expect(create).toHaveBeenCalledTimes(2);
    expect(result.expandedDescription).toBeNull();
    expect(result.suppressionReason).toBe("banned_phrase");
  });

  it("does not re-ask for evidence-shaped failures", async () => {
    const { client, create } = fakeClient([toolResponse(null, { input_tokens: 10, output_tokens: 2 })]);

    const result = await synthesizeExpandedDescription({ client, evidence, model: "claude-test" });

    expect(create).toHaveBeenCalledTimes(1);
    expect(result.suppressionReason).toBe("no_draft");
  });
});
