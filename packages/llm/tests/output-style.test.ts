import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { researchSectionStyleIssues, synthesisStyleIssues, withStyleRetry } from "../src/output-style";
import { synthesizeResearchSection } from "../src/research-section";

describe("researchSectionStyleIssues", () => {
  it("flags references to the model's input and passes plain statements", () => {
    const issues = researchSectionStyleIssues({
      summary: "The evidence shows 40 enterprise customers.",
      items: [
        { label: "Pricing", text: "Pricing is not in the supplied sources." },
        { label: "Cards", text: "The cardholder base is 2 million; the packet omits churn." },
        { label: "Plain", text: "Acme reports 40 enterprise customers [c1]." }
      ]
    });
    expect(issues).toEqual([
      'the summary says "the evidence"; say what the source said, or state the gap as a plain fact',
      'item 1 says "the supplied sources"; say what the source said, or state the gap as a plain fact',
      'item 2 says "the packet"; say what the source said, or state the gap as a plain fact'
    ]);
  });
});

describe("synthesisStyleIssues", () => {
  it("flags jargon in open questions and their change lines only", () => {
    const issues = synthesisStyleIssues({
      openQuestions: [
        { question: "Would a CFO validate the bull case?", wouldChangeReadIf: "A yes would support the thesis." },
        { question: "What share of revenue comes from the top three buyers?", wouldChangeReadIf: "Over half would weaken the read." }
      ]
    });
    expect(issues).toEqual([
      'open question 1 says "validate"; use plain words',
      'open question 1 says "bull case"; use plain words',
      "open question 1's wouldChangeReadIf says \"thesis\"; use plain words"
    ]);
  });
});

describe("withStyleRetry", () => {
  const issuesOf = (value: string) => (value.includes("bad") ? value.split(" ").filter((word) => word === "bad") : []);

  it("does not re-ask clean output", async () => {
    const calls: Array<string[] | undefined> = [];
    const result = await withStyleRetry(async (issues) => {
      calls.push(issues);
      return "clean";
    }, issuesOf);
    expect(result).toBe("clean");
    expect(calls).toEqual([undefined]);
  });

  it("re-asks once with the issues and keeps a better retry", async () => {
    const calls: Array<string[] | undefined> = [];
    const result = await withStyleRetry(async (issues) => {
      calls.push(issues);
      return issues ? "clean" : "bad bad";
    }, issuesOf);
    expect(result).toBe("clean");
    expect(calls).toEqual([undefined, ["bad", "bad"]]);
  });

  it("keeps the first output when the retry is no better or throws", async () => {
    expect(await withStyleRetry(async (issues) => (issues ? "bad bad" : "bad"), issuesOf)).toBe("bad");
    expect(
      await withStyleRetry(async (issues) => {
        if (issues) throw new Error("boom");
        return "bad";
      }, issuesOf)
    ).toBe("bad");
  });
});

describe("synthesizeResearchSection style retry", () => {
  it("re-asks once naming the phrase and returns the clean retry", async () => {
    const users: string[] = [];
    const section = (text: string) => ({
      content: [
        {
          type: "tool_use",
          name: "emit_research_section",
          input: { status: "available", summary: null, items: [{ label: "Customers", text, citationIds: ["c1"] }], confidence: "medium" }
        }
      ]
    });
    const client = {
      messages: {
        create: async (params: { messages: Array<{ content: string }> }) => {
          users.push(params.messages[0]!.content);
          return users.length === 1 ? section("The evidence names 40 customers.") : section("Acme names 40 customers [c1].");
        }
      }
    } as unknown as Anthropic;

    const result = await synthesizeResearchSection({
      client,
      model: "claude-test",
      company: { domain: "acme.com", name: "Acme" },
      definition: { id: "customer_proof", title: "Customer proof", generationPrompt: "Write customer proof." } as never,
      evidence: [{ citationId: "c1", url: "https://acme.com", title: "Acme", sourceType: "company_site", text: "Acme has 40 customers." }]
    });

    expect(result.items[0]?.text).toBe("Acme names 40 customers [c1].");
    expect(users).toHaveLength(2);
    expect(users[1]).toContain('item 1 says "the evidence"');
  });
});
