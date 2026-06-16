import { describe, expect, it, vi } from "vitest";
import {
  blockEnrichmentTool,
  evidenceForExtractionPrompt,
  extractionSystemPrompt,
  extractionTool,
  parseBlockEnrichmentToolUse,
  parseExtractionToolUse
} from "../src/index";

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
    oneLiner: {
      value: "Real-time voice AI infrastructure for developers building low-latency audio products.",
      status: "verified",
      confidence: "high",
      citationIds: ["c1"]
    },
    description: {
      value: {
        shortDescription: "Real-time voice AI infrastructure for developers building low-latency audio products.",
        expandedDescription:
          "Cartesia builds voice AI infrastructure for developers shipping low-latency audio products. Its models and APIs support voice agents, audio interfaces, and real-time speech workflows where delay changes the user experience.",
        concept: "Low-latency speech models exposed as developer infrastructure.",
        serves: "Developers building voice agents and audio applications.",
        mechanism: "APIs and models for real-time speech generation and understanding."
      },
      status: "verified",
      confidence: "high",
      citationIds: ["c1"]
    },
    hq: unknownFact,
    foundedYear: unknownFact,
    status: "private"
  },
  funding: {
    totalRaisedUsd: unknownFact,
    lastRound: unknownFact,
    rounds: unknownFact,
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
    expect(identity.properties.foundedYear.properties.citationIds.items).toMatchObject({
      type: "string",
      minLength: 1
    });
    expect(funding.properties.investors.properties.value.anyOf[0]).toMatchObject({
      type: "array",
      items: {
        properties: {
          name: { type: "string", minLength: 1 },
          domain: { anyOf: [{ type: "string", minLength: 1 }, { type: "null" }] }
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
        name: { type: "string", minLength: 1 },
        amountUsd: { type: ["integer", "null"], minimum: 1 },
        announcedAt: { anyOf: [{ type: "string", minLength: 1 }, { type: "null" }] },
        leadInvestors: { type: "array", items: { type: "string", minLength: 1 } }
      }
    });
    expect(funding.properties.rounds.properties.value.anyOf[0]).toMatchObject({
      type: "array",
      items: funding.properties.lastRound.properties.value.anyOf[0]
    });
    expect(extractionTool.input_schema.properties.citations.items.properties.url).toMatchObject({
      type: "string",
      minLength: 1,
      format: "uri"
    });
    expect(extractionTool.input_schema.properties.citations.items.properties.fetchedAt).toMatchObject({
      type: "string",
      minLength: 1,
      format: "date-time"
    });
    expect(extractionTool.input_schema.properties.identity.properties.logoUrl).toMatchObject({
      anyOf: [{ type: "string", minLength: 1, format: "uri" }, { type: "null" }]
    });
    expect(extractionTool.input_schema.properties.team.properties.founders.properties.value.anyOf[0]).toMatchObject({
      type: "array",
      items: {
        properties: {
          email: { anyOf: [{ type: "string", minLength: 1, format: "email" }, { type: "null" }] },
          sourceUrl: { anyOf: [{ type: "string", minLength: 1, format: "uri" }, { type: "null" }] }
        }
      }
    });
    expect(extractionTool.input_schema.properties.signals.items.properties.url).toMatchObject({
      type: "string",
      minLength: 1,
      format: "uri"
    });
    expect(identity.properties.oneLiner.properties.value.anyOf[0]).toMatchObject({
      type: "string",
      minLength: 1
    });
    expect(identity.properties.description.properties.value.anyOf[0]).toMatchObject({
      type: "object",
      properties: {
        shortDescription: { type: "string", minLength: 1 },
        expandedDescription: { anyOf: [{ type: "string", minLength: 1 }, { type: "null" }] },
        concept: { anyOf: [{ type: "string", minLength: 1 }, { type: "null" }] },
      }
    });
    expect(identity.properties.description.properties.value.anyOf[0].required).toContain("expandedDescription");
  });
});

describe("blockEnrichmentTool", () => {
  it("supports block-specific payloads with public work emails for management", () => {
    expect(blockEnrichmentTool.input_schema.properties.blockId).toMatchObject({
      enum: ["description", "funding", "team", "signals", "comparables"]
    });
    expect(blockEnrichmentTool.input_schema.properties.team.properties.founders.properties.value.anyOf[0]).toMatchObject({
      type: "array",
      items: {
        properties: {
          email: { anyOf: [{ type: "string", minLength: 1, format: "email" }, { type: "null" }] }
        }
      }
    });
  });
});

describe("extractionSystemPrompt", () => {
  it("requires round-ledger funding reconciliation and non-generic investor-grade one-liners", () => {
    expect(extractionSystemPrompt).toContain("round ledger");
    expect(extractionSystemPrompt).toContain("Do not write generic category labels");
    expect(extractionSystemPrompt).toContain("mechanically reconciled");
    expect(extractionSystemPrompt).toContain("source incentives");
    expect(extractionSystemPrompt).toContain("18 to 24 words");
    expect(extractionSystemPrompt).toContain("expandedDescription");
    expect(extractionSystemPrompt).toContain("Never use literal ellipses");
    expect(extractionSystemPrompt).toContain("Never stuff feature lists into the overview");
    expect(extractionSystemPrompt).toContain("Ban brochure language");
  });
});

describe("evidenceForExtractionPrompt", () => {
  it("keeps prompt evidence compact while preserving ranked source identity", () => {
    const evidence = evidenceForExtractionPrompt({
      domain: "harvey.ai",
      sources: Array.from({ length: 30 }, (_, index) => ({
        url: `https://source.example/${index}`,
        title: `Source ${index}`,
        sourceType: "news",
        rawText: `source ${index} ${"important funding and product context ".repeat(200)}`,
      })),
      evidenceLedger: Array.from({ length: 25 }, (_, index) => ({
        id: `e${index + 1}`,
        url: `https://source.example/${index}`,
        title: `Source ${index}`,
        sourceType: "news",
        intents: ["funding"],
        authorityScore: 10 - index,
        supportingSnippets: [`snippet ${index} ${"details ".repeat(200)}`],
      })),
    });

    expect(evidence.evidenceLedger).toHaveLength(20);
    expect(evidence.sources.length).toBeLessThanOrEqual(20);
    expect(evidence.sources.reduce((sum, source) => sum + source.rawText.length, 0)).toBeLessThanOrEqual(24_000);
    expect(evidence.sources[0]?.rawText.length).toBeLessThanOrEqual(2200);
    expect(evidence.evidenceLedger?.[0]?.supportingSnippets[0]?.length).toBeLessThanOrEqual(420);
    expect(evidence.sources[0]?.url).toBe("https://source.example/0");
  });

  it("prioritizes high-trust evidence before lower-yield enrichment text", () => {
    const evidence = evidenceForExtractionPrompt({
      domain: "modal.com",
      sources: [
        {
          url: "https://news.example/modal",
          title: "News",
          sourceType: "news",
          intent: "recent_signals",
          rawText: "news context ".repeat(200),
        },
        {
          url: "https://stableenrich.dev/modal",
          title: "Enrichment",
          sourceType: "enrichment",
          rawText: "provider profile ".repeat(200),
        },
        {
          url: "https://modal.com/about",
          title: "Company",
          sourceType: "company_site",
          rawText: "company product detail ".repeat(200),
        },
        {
          url: "https://sec.gov/modal",
          title: "Filing",
          sourceType: "filing",
          rawText: "filing disclosure ".repeat(200),
        },
        {
          url: "https://analysis.example/modal",
          title: "Independent analysis",
          sourceType: "news",
          intent: "independent_analysis",
          rawText: "independent market analysis ".repeat(200),
        },
      ],
    });

    expect(evidence.sources.map((source) => source.url)).toEqual([
      "https://sec.gov/modal",
      "https://analysis.example/modal",
      "https://modal.com/about",
      "https://news.example/modal",
      "https://stableenrich.dev/modal",
    ]);
  });

  it("honors EXTRACTION_EVIDENCE_BUDGET_CHARS at module load", async () => {
    const previousBudget = process.env.EXTRACTION_EVIDENCE_BUDGET_CHARS;
    process.env.EXTRACTION_EVIDENCE_BUDGET_CHARS = "1000";
    vi.resetModules();

    try {
      const { evidenceForExtractionPrompt: promptEvidence } = await import("../src/extraction");
      const evidence = promptEvidence({
        domain: "modal.com",
        sources: [
          {
            url: "https://stableenrich.dev/modal",
            title: "Enrichment",
            sourceType: "enrichment",
            rawText: "provider profile ".repeat(300),
          },
          {
            url: "https://modal.com/about",
            title: "Company",
            sourceType: "company_site",
            rawText: "company product detail ".repeat(300),
          },
          {
            url: "https://sec.gov/modal",
            title: "Filing",
            sourceType: "filing",
            rawText: "filing disclosure ".repeat(300),
          },
        ],
      });

      expect(evidence.sources[0]?.url).toBe("https://sec.gov/modal");
      expect(evidence.sources.reduce((sum, source) => sum + source.rawText.length, 0)).toBeLessThanOrEqual(1000);
    } finally {
      if (previousBudget === undefined) {
        delete process.env.EXTRACTION_EVIDENCE_BUDGET_CHARS;
      } else {
        process.env.EXTRACTION_EVIDENCE_BUDGET_CHARS = previousBudget;
      }
      vi.resetModules();
    }
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

  it("keeps complete descriptions instead of applying a hard character cap", () => {
    const payload = parseExtractionToolUse({
      content: [
        {
          type: "tool_use",
          name: "emit_company_claims",
          input: {
            ...validExtractionPayload,
            identity: {
              ...validExtractionPayload.identity,
              oneLiner: {
                value:
                  "TwelveLabs builds multimodal video understanding infrastructure that lets developers search, classify, and reason over large video libraries with AI models.",
                status: "verified",
                confidence: "high",
                citationIds: ["c1"],
              },
            },
          },
        },
      ],
    });

    expect(payload.identity.oneLiner.value).toBe(
      "TwelveLabs builds multimodal video understanding infrastructure that lets developers search, classify, and reason over large video libraries with AI models."
    );
  });

  it("derives the compatibility one-liner from structured description when needed", () => {
    const payload = parseExtractionToolUse({
      content: [
        {
          type: "tool_use",
          name: "emit_company_claims",
          input: {
            ...validExtractionPayload,
            identity: {
              ...validExtractionPayload.identity,
              oneLiner: unknownFact,
              description: {
                value: {
                  shortDescription: "Domain-specific AI for law firms and in-house legal teams.",
                  expandedDescription:
                    "The company builds domain-specific AI for law firms and in-house legal teams. It supports case, contract, and research workflows where legal accuracy matters more than generic chat.",
                  concept: "A legal workflow layer built around case and contract work.",
                  serves: "Law firms and in-house legal teams.",
                  mechanism: "AI assistants and workflow agents embedded into legal tasks."
                },
                status: "verified",
                confidence: "high",
                citationIds: ["c1"]
              }
            },
          },
        },
      ],
    });

    expect(payload.identity.oneLiner.value).toBe("Domain-specific AI for law firms and in-house legal teams.");
  });

  it("normalizes description prose into complete sentences without ellipses", () => {
    const description = "A research workspace for technical diligence teams";
    const payload = parseExtractionToolUse({
      content: [
        {
          type: "tool_use",
          name: "emit_company_claims",
          input: {
            ...validExtractionPayload,
            identity: {
              ...validExtractionPayload.identity,
              description: {
                value: {
                  shortDescription: description,
                  expandedDescription:
                    "The workspace helps investors and operators inspect technical diligence materials. It keeps evidence, claims, and follow-up questions in one place so teams can reason from sourced context...",
                  concept: "Evidence-led diligence workspace...",
                  serves: null,
                  mechanism: null
                },
                status: "verified",
                confidence: "high",
                citationIds: ["c1"]
              }
            }
          }
        }
      ]
    });

    expect(payload.identity.description?.value?.shortDescription).toBe(`${description}.`);
    expect(payload.identity.description?.value?.expandedDescription).not.toContain("...");
    expect(payload.identity.description?.value?.concept).toBe("Evidence-led diligence workspace.");
  });

  it("drops empty, category-label, or incomplete short descriptions", () => {
    const payload = parseExtractionToolUse({
      content: [
        {
          type: "tool_use",
          name: "emit_company_claims",
          input: {
            ...validExtractionPayload,
            identity: {
              ...validExtractionPayload.identity,
              description: {
                value: {
                  shortDescription: "AI platform",
                  expandedDescription: "AI platform for companies.",
                  concept: null,
                  serves: null,
                  mechanism: null,
                },
                status: "verified",
                confidence: "high",
                citationIds: ["c1"],
              },
            },
          },
        },
      ],
    });

    expect(payload.identity.description).toEqual(unknownFact);

    const incomplete = parseExtractionToolUse({
      content: [
        {
          type: "tool_use",
          name: "emit_company_claims",
          input: {
            ...validExtractionPayload,
            identity: {
              ...validExtractionPayload.identity,
              description: {
                value: {
                  shortDescription: "A research workspace for technical diligence over",
                  expandedDescription: "The workspace helps investors inspect technical diligence materials.",
                  concept: null,
                  serves: null,
                  mechanism: null,
                },
                status: "verified",
                confidence: "high",
                citationIds: ["c1"],
              },
            },
          },
        },
      ],
    });

    expect(incomplete.identity.description).toEqual(unknownFact);
  });

  it("defaults omitted optional list sections to empty arrays", () => {
    const { signals: _signals, comparables: _comparables, ...payloadWithoutOptionalLists } = validExtractionPayload;

    const payload = parseExtractionToolUse({
      content: [
        {
          type: "tool_use",
          name: "emit_company_claims",
          input: payloadWithoutOptionalLists,
        },
      ],
    });

    expect(payload.signals).toEqual([]);
    expect(payload.comparables).toEqual([]);
  });

  it("converts missing required fact sections into explicit unknown facts", () => {
    const payload = parseExtractionToolUse({
      content: [
        {
          type: "tool_use",
          name: "emit_company_claims",
          input: {
            identity: {
              name: { value: "TwelveLabs" },
              status: "private",
            },
            citations: [],
          },
        },
      ],
    });

    expect(payload.identity.name).toEqual(unknownFact);
    expect(payload.identity.oneLiner).toEqual(unknownFact);
    expect(payload.identity.description).toEqual(unknownFact);
    expect(payload.funding.totalRaisedUsd).toEqual(unknownFact);
    expect(payload.funding.rounds).toEqual(unknownFact);
    expect(payload.team.founders).toEqual(unknownFact);
  });

  it("filters malformed optional list items instead of failing the full extraction", () => {
    const payload = parseExtractionToolUse({
      content: [
        {
          type: "tool_use",
          name: "emit_company_claims",
          input: {
            ...validExtractionPayload,
            signals: [
              {
                title: "Launch",
                url: "https://example.com/launch",
                date: "2026-05-01",
                source: "Example",
                category: "launch",
                citationIds: ["c1"],
              },
              { title: "Bad signal" },
            ],
            comparables: [
              { name: "Valid", domain: "valid.ai", oneLiner: "Video AI." },
              { name: "Bad comparable" },
            ],
            citations: [
              validExtractionPayload.citations[0],
              { id: "bad", title: "Missing URL", fetchedAt: "2026-05-06T00:00:00.000Z", sourceType: "news" },
            ],
          },
        },
      ],
    });

    expect(payload.signals).toHaveLength(1);
    expect(payload.comparables).toHaveLength(1);
    expect(payload.citations).toHaveLength(1);
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
            input: "not an extraction object"
          }
        ]
      })
    ).toThrow();
  });
});

describe("parseBlockEnrichmentToolUse", () => {
  it("extracts a cited management block without requiring unrelated sections", () => {
    const payload = parseBlockEnrichmentToolUse({
      content: [
        {
          type: "tool_use",
          name: "emit_block_claims",
          input: {
            blockId: "team",
            team: {
              founders: {
                value: [
                  {
                    name: "Raymond Luo",
                    role: "Founder and CEO",
                    sourceUrl: "https://zo.computer/team",
                    email: "raymond@zo.computer"
                  }
                ],
                status: "verified",
                confidence: "medium",
                citationIds: ["c1"]
              }
            },
            citations: [
              {
                id: "c1",
                url: "https://zo.computer/team",
                title: "Zo Computer team",
                fetchedAt: "2026-05-14T16:00:00.000Z",
                sourceType: "company_site"
              }
            ]
          }
        }
      ]
    });

    expect(payload.blockId).toBe("team");
    expect(payload.team?.founders?.value?.[0]).toMatchObject({
      name: "Raymond Luo",
      email: "raymond@zo.computer"
    });
    expect(payload.funding).toBeUndefined();
    expect(payload.citations).toHaveLength(1);
  });

  it("drops uncited block facts instead of letting guessed emails through", () => {
    const payload = parseBlockEnrichmentToolUse({
      content: [
        {
          type: "tool_use",
          name: "emit_block_claims",
          input: {
            blockId: "team",
            team: {
              founders: {
                value: [
                  {
                    name: "Raymond Luo",
                    role: "Founder and CEO",
                    sourceUrl: "https://zo.computer/team",
                    email: "raymond@zo.computer"
                  }
                ],
                status: "inferred",
                confidence: "low",
                citationIds: []
              }
            },
            citations: []
          }
        }
      ]
    });

    expect(payload.team?.founders).toEqual(unknownFact);
  });
});
