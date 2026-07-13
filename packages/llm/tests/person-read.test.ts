import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { investorTasteKernel } from "../src/investor-taste-kernel";
import { personReadSystemPrompt, synthesizePersonReads, type PersonReadEvidence } from "../src/person-read";

function toolResponse(reads: unknown[]) {
  return {
    content: [
      {
        type: "tool_use",
        name: "emit_person_reads",
        input: { reads },
      },
    ],
  };
}

function clientReturning(reads: unknown[]): { client: Anthropic; callCount: () => number } {
  let calls = 0;
  const client = {
    messages: {
      create: async () => {
        calls += 1;
        return toolResponse(reads);
      },
    },
  } as unknown as Anthropic;
  return { client, callCount: () => calls };
}

function clientCapturingParams(reads: unknown[]): {
  client: Anthropic;
  paramsCalls: () => Array<{ max_tokens?: number }>;
} {
  const paramsCalls: Array<{ max_tokens?: number }> = [];
  const client = {
    messages: {
      create: async (params: { max_tokens?: number }) => {
        paramsCalls.push(params);
        return toolResponse(reads);
      },
    },
  } as unknown as Anthropic;
  return { client, paramsCalls: () => paramsCalls };
}

function evidenceFor(name: string): PersonReadEvidence {
  return {
    name,
    role: "Engineer",
    channels: {},
    evidence: [{ citationId: "c1", title: "Profile", url: "https://example.com/1", text: `${name} built things.` }],
  };
}

const founder: PersonReadEvidence = {
  name: "Ada Lovelace",
  role: "CEO",
  channels: {},
  evidence: [
    { citationId: "c1", title: "Profile", url: "https://example.com/1", text: "Built payments infra at Stripe." },
    { citationId: "c2", title: "Deere acquisition", url: "https://example.com/2", text: "Sold a company to Deere in 2021." },
  ],
};

describe("personReadSystemPrompt", () => {
  it("carries the investor taste kernel and the person-read doctrine lines", () => {
    expect(personReadSystemPrompt).toContain(investorTasteKernel);
    expect(personReadSystemPrompt).toContain(
      "You write one read per person: at most two sentences that are non-obvious, specific, and decision-relevant to an investor.",
    );
    expect(personReadSystemPrompt).toContain(
      "In scope: domain fit, repeat-founder history with outcomes, trajectory outliers, honest flags such as short tenures or no public footprint.",
    );
    expect(personReadSystemPrompt).toContain("Banned: restating the role, adjectives without evidence, any filler.");
    expect(personReadSystemPrompt).toContain("Use citationIds exactly as provided. Do not invent citationIds.");
    expect(personReadSystemPrompt).toContain("If the evidence supports no such claim, return null for that person.");
  });
});

describe("synthesizePersonReads", () => {
  it("nulls the read when the only cited id is not in the person's evidence", async () => {
    const { client } = clientReturning([
      {
        name: "Ada Lovelace",
        read: { text: "Built payments infra at Stripe for six years.", citationIds: ["missing"] },
      },
    ]);

    const result = await synthesizePersonReads({
      client,
      companyName: "Acme",
      domain: "acme.com",
      model: "claude-test",
      people: [founder],
    });

    expect(result.reads).toEqual([{ name: "Ada Lovelace", read: null, suppressionReason: "no_nonobvious_claim" }]);
  });

  it("drops only the invented ids from a mixed citationIds list and keeps the read", async () => {
    const { client } = clientReturning([
      {
        name: "Ada Lovelace",
        read: {
          text: "Built payments infra at Stripe for six years. Her first company sold to Deere in 2021.",
          citationIds: ["c1", "missing"],
        },
      },
    ]);

    const result = await synthesizePersonReads({
      client,
      companyName: "Acme",
      domain: "acme.com",
      model: "claude-test",
      people: [founder],
    });

    expect(result.reads).toEqual([
      {
        name: "Ada Lovelace",
        read: {
          text: "Built payments infra at Stripe for six years. Her first company sold to Deere in 2021.",
          citationIds: ["c1"],
        },
        suppressionReason: null,
      },
    ]);
  });

  it("keeps a valid two-sentence read with citation ids that all resolve to evidence", async () => {
    const { client } = clientReturning([
      {
        name: "Ada Lovelace",
        read: {
          text: "Built payments infra at Stripe for six years. Her first company sold to Deere in 2021.",
          citationIds: ["c1", "c2"],
        },
      },
    ]);

    const result = await synthesizePersonReads({
      client,
      companyName: "Acme",
      domain: "acme.com",
      model: "claude-test",
      people: [founder],
    });

    expect(result.reads).toEqual([
      {
        name: "Ada Lovelace",
        read: {
          text: "Built payments infra at Stripe for six years. Her first company sold to Deere in 2021.",
          citationIds: ["c1", "c2"],
        },
        suppressionReason: null,
      },
    ]);
  });

  it("rejects reads longer than two sentences", async () => {
    const { client } = clientReturning([
      {
        name: "Ada Lovelace",
        read: {
          text:
            "Built payments infra at Stripe for six years. This is her third company. She previously sold a company to Deere.",
          citationIds: ["c1"],
        },
      },
    ]);

    const result = await synthesizePersonReads({
      client,
      companyName: "Acme",
      domain: "acme.com",
      model: "claude-test",
      people: [founder],
    });

    expect(result.reads).toEqual([{ name: "Ada Lovelace", read: null, suppressionReason: "no_nonobvious_claim" }]);
  });

  it("treats an explicit null read from the model as no_nonobvious_claim", async () => {
    const { client } = clientReturning([{ name: "Ada Lovelace", read: null }]);

    const result = await synthesizePersonReads({
      client,
      companyName: "Acme",
      domain: "acme.com",
      model: "claude-test",
      people: [founder],
    });

    expect(result.reads).toEqual([{ name: "Ada Lovelace", read: null, suppressionReason: "no_nonobvious_claim" }]);
  });

  it("suppresses a person the model omitted from its response entirely", async () => {
    const { client } = clientReturning([]);

    const result = await synthesizePersonReads({
      client,
      companyName: "Acme",
      domain: "acme.com",
      model: "claude-test",
      people: [founder],
    });

    expect(result.reads).toEqual([{ name: "Ada Lovelace", read: null, suppressionReason: "no_nonobvious_claim" }]);
  });

  it("short-circuits people with no evidence without calling the LLM", async () => {
    const { client, callCount } = clientReturning([]);

    const ghost: PersonReadEvidence = { name: "Ghost Founder", role: null, channels: {}, evidence: [] };

    const result = await synthesizePersonReads({
      client,
      companyName: "Acme",
      domain: "acme.com",
      model: "claude-test",
      people: [ghost],
    });

    expect(callCount()).toBe(0);
    expect(result.reads).toEqual([{ name: "Ghost Founder", read: null, suppressionReason: "thin_evidence" }]);
  });

  it("only sends people with evidence to the LLM while thin-evidence people still resolve", async () => {
    const { client, callCount } = clientReturning([
      {
        name: "Ada Lovelace",
        read: {
          text: "Built payments infra at Stripe for six years. Her first company sold to Deere in 2021.",
          citationIds: ["c1", "c2"],
        },
      },
    ]);

    const ghost: PersonReadEvidence = { name: "Ghost Founder", role: null, channels: {}, evidence: [] };

    const result = await synthesizePersonReads({
      client,
      companyName: "Acme",
      domain: "acme.com",
      model: "claude-test",
      people: [founder, ghost],
    });

    expect(callCount()).toBe(1);
    expect(result.reads).toEqual([
      {
        name: "Ada Lovelace",
        read: {
          text: "Built payments infra at Stripe for six years. Her first company sold to Deere in 2021.",
          citationIds: ["c1", "c2"],
        },
        suppressionReason: null,
      },
      { name: "Ghost Founder", read: null, suppressionReason: "thin_evidence" },
    ]);
  });

  it("rejects a read that does not end in terminal punctuation as truncated", async () => {
    const { client } = clientReturning([
      {
        name: "Ada Lovelace",
        // Cut off mid-clause, as a response would look if the model ran out of output
        // tokens partway through the second sentence.
        read: { text: "Built payments infra at Stripe for six years, and then her next", citationIds: ["c1"] },
      },
    ]);

    const result = await synthesizePersonReads({
      client,
      companyName: "Acme",
      domain: "acme.com",
      model: "claude-test",
      people: [founder],
    });

    expect(result.reads).toEqual([{ name: "Ada Lovelace", read: null, suppressionReason: "truncated" }]);
  });

  it("accepts a read ending in punctuation followed by a closing quote", async () => {
    const { client } = clientReturning([
      {
        name: "Ada Lovelace",
        read: { text: 'Colleagues describe her as "relentless about payments infra."', citationIds: ["c1"] },
      },
    ]);

    const result = await synthesizePersonReads({
      client,
      companyName: "Acme",
      domain: "acme.com",
      model: "claude-test",
      people: [founder],
    });

    expect(result.reads).toEqual([
      {
        name: "Ada Lovelace",
        read: { text: 'Colleagues describe her as "relentless about payments infra."', citationIds: ["c1"] },
        suppressionReason: null,
      },
    ]);
  });

  it("keeps max_tokens at the existing floor for a small team", async () => {
    const { client, paramsCalls } = clientCapturingParams([
      { name: "Ada Lovelace", read: { text: "Built payments infra at Stripe for six years.", citationIds: ["c1"] } },
    ]);

    await synthesizePersonReads({
      client,
      companyName: "Acme",
      domain: "acme.com",
      model: "claude-test",
      people: [founder],
    });

    expect(paramsCalls()[0]?.max_tokens).toBe(1500);
  });

  it("scales max_tokens up with the number of people in the batch", async () => {
    const eightPeople = Array.from({ length: 8 }, (_, index) => evidenceFor(`Person ${index}`));
    const { client, paramsCalls } = clientCapturingParams(
      eightPeople.map((person) => ({ name: person.name, read: null }))
    );

    await synthesizePersonReads({
      client,
      companyName: "Acme",
      domain: "acme.com",
      model: "claude-test",
      people: eightPeople,
    });

    // 8 people * 220 tokens/person = 1,760, above the 1,500 floor.
    expect(paramsCalls()[0]?.max_tokens).toBe(1760);
  });

  it("caps max_tokens at the ceiling for a very large batch", async () => {
    const manyPeople = Array.from({ length: 60 }, (_, index) => evidenceFor(`Person ${index}`));
    const { client, paramsCalls } = clientCapturingParams(
      manyPeople.map((person) => ({ name: person.name, read: null }))
    );

    await synthesizePersonReads({
      client,
      companyName: "Acme",
      domain: "acme.com",
      model: "claude-test",
      people: manyPeople,
    });

    expect(paramsCalls()[0]?.max_tokens).toBe(8000);
  });
});
