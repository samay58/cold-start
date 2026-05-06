import { describe, expect, it } from "vitest";
import { extractionTool, parseExtractionToolUse } from "../src/index";

const unknownFact = {
  value: null,
  status: "unknown",
  confidence: "low",
  citationIds: []
};

const validExtractionPayload = {
  identity: {
    name: { value: "Cartesia", status: "verified", confidence: "high", citationIds: ["c1"] },
    logoUrl: null,
    oneLiner: unknownFact,
    hq: unknownFact,
    foundedYear: unknownFact,
    status: "private"
  },
  funding: {
    totalRaisedUsd: unknownFact,
    lastRound: unknownFact,
    investors: unknownFact
  },
  team: {
    founders: unknownFact,
    keyExecs: unknownFact,
    headcount: unknownFact
  },
  signals: [],
  comparables: [],
  citations: [
    {
      id: "c1",
      url: "https://cartesia.ai",
      title: "Cartesia",
      fetchedAt: "2026-05-06T00:00:00.000Z",
      sourceType: "company_site"
    }
  ]
};

describe("extractionTool", () => {
  it("exposes typed resolved fact value schemas", () => {
    const identity = extractionTool.input_schema.properties.identity;
    const funding = extractionTool.input_schema.properties.funding;
    const team = extractionTool.input_schema.properties.team;

    expect(identity.properties.foundedYear.properties.value.anyOf[0]).toMatchObject({
      type: "integer",
      minimum: 1800,
      maximum: 2100
    });
    expect(funding.properties.investors.properties.value.anyOf[0]).toMatchObject({
      type: "array",
      items: {
        properties: {
          name: { type: "string" },
          domain: { type: ["string", "null"] }
        }
      }
    });
    expect(team.properties.headcount.properties.value.anyOf[0]).toMatchObject({
      type: "object",
      properties: {
        value: { type: "integer", minimum: 0 },
        asOf: { type: "string" }
      }
    });
    expect(funding.properties.lastRound.properties.value.anyOf[0]).toMatchObject({
      type: "object",
      properties: {
        name: { type: "string" },
        amountUsd: { type: ["integer", "null"], minimum: 1 },
        announcedAt: { type: ["string", "null"] },
        leadInvestors: { type: "array", items: { type: "string" } }
      }
    });
  });
});

describe("parseExtractionToolUse", () => {
  it("extracts the forced tool payload", () => {
    const payload = parseExtractionToolUse({
      content: [
        { type: "text", text: "I will emit structured claims." },
        { type: "tool_use", name: "emit_company_claims", input: validExtractionPayload }
      ]
    });

    expect(payload).toEqual(validExtractionPayload);
  });

  it("rejects missing extraction tool use", () => {
    expect(() =>
      parseExtractionToolUse({
        content: [{ type: "tool_use", name: "wrong_tool", input: validExtractionPayload }]
      })
    ).toThrow("No emit_company_claims tool use returned");
  });

  it("rejects missing tool input", () => {
    expect(() =>
      parseExtractionToolUse({
        content: [{ type: "tool_use", name: "emit_company_claims" }]
      })
    ).toThrow("emit_company_claims tool use returned no input");
  });

  it("rejects malformed extraction payloads", () => {
    expect(() =>
      parseExtractionToolUse({
        content: [
          {
            type: "tool_use",
            name: "emit_company_claims",
            input: { ...validExtractionPayload, citations: [{ id: "c1" }] }
          }
        ]
      })
    ).toThrow();
  });
});
