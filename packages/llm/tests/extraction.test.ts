import { describe, expect, it, vi } from "vitest";
import {
  blockEnrichmentTool,
  blockGuidance,
  evidenceForExtractionPrompt,
  extractionSystemPrompt,
  extractionTool,
  extractCompanyClaims,
  extractCompanyBlockClaims,
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

function openAiExtractionResponse(payload: unknown, toolName = "emit_company_claims") {
  return new Response(JSON.stringify({
    id: "response-id",
    model: "deepseek-v4-flash",
    choices: [{
      message: {
        tool_calls: [{
          id: "tool-call-id",
          function: { name: toolName, arguments: JSON.stringify(payload) },
        }],
      },
    }],
  }), { status: 200, headers: { "content-type": "application/json" } });
}

describe("profile extraction recovery", () => {
  it.each(["USD 25 million", "undisclosed"])("handles block amount %j without a paid correction", async (value) => {
    vi.stubEnv("DEEPSEEK_API_KEY", "test-key");
    const payload = {
      blockId: "funding", citations: validExtractionPayload.citations,
      funding: { totalRaisedUsd: { value, status: "verified", confidence: "high", citationIds: ["c1"] } },
    };
    const fetchMock = vi.fn().mockResolvedValue(openAiExtractionResponse(payload, "emit_block_claims"));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const result = await extractCompanyBlockClaims({
        client: { messages: { create: vi.fn() } } as never,
        model: "deepseek/deepseek-v4-flash", block: "funding",
        evidence: { domain: "cartesia.ai", sources: [], evidenceLedger: [] },
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(result.funding?.totalRaisedUsd?.value).toBe(value === "undisclosed" ? null : 25000000);
    } finally {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    }
  });

  it.each(["$25 million", "unknown", "25-30m", { amount: "25m" }])(
    "handles optional amount %j in one model call",
    async (value) => {
      vi.stubEnv("DEEPSEEK_API_KEY", "test-key");
      const payload = structuredClone(validExtractionPayload);
      Object.assign(payload.funding.totalRaisedUsd, { value, status: "mixed", confidence: "medium", citationIds: ["c1"] });
      const fetchMock = vi.fn().mockResolvedValue(openAiExtractionResponse(payload));
      vi.stubGlobal("fetch", fetchMock);
      try {
        const result = await extractCompanyClaims({
          client: { messages: { create: vi.fn() } } as never,
          model: "deepseek/deepseek-v4-flash",
          providerRecovery: false,
          evidence: { domain: "cartesia.ai", sources: [], evidenceLedger: [] },
        });
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(result.identity.name).toEqual(payload.identity.name);
        expect(result.citations).toEqual(payload.citations);
        expect(result.funding.totalRaisedUsd).toEqual(value === "$25 million"
          ? { value: 25000000, status: "mixed", confidence: "medium", citationIds: ["c1"] }
          : unknownFact);
      } finally {
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
      }
    }
  );

  it("adds bounded validation feedback only to the correction attempt", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "test-key");
    const invalidPayload = structuredClone(validExtractionPayload);
    Object.assign(invalidPayload.identity.name, { value: { private: "INVALID_VALUE_SHOULD_NOT_BE_ECHOED" } });
    const correctedPayload = structuredClone(validExtractionPayload);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(openAiExtractionResponse(invalidPayload))
      .mockResolvedValueOnce(openAiExtractionResponse(correctedPayload));
    vi.stubGlobal("fetch", fetchMock);

    try {
      const result = await extractCompanyClaims({
        client: { messages: { create: vi.fn() } } as never,
        model: "deepseek/deepseek-v4-flash",
        providerRecovery: false,
        evidence: { domain: "cartesia.ai", sources: [], evidenceLedger: [] },
      });

      expect(result.identity.name.value).toBe("Cartesia");
      expect(fetchMock).toHaveBeenCalledTimes(2);
      const firstBody = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
      const secondBody = JSON.parse((fetchMock.mock.calls[1]![1] as RequestInit).body as string);
      const { messages: firstMessages, ...firstRequest } = firstBody;
      const { messages: secondMessages, ...secondRequest } = secondBody;
      expect(secondRequest).toEqual(firstRequest);
      expect(secondMessages.slice(0, -1)).toEqual(firstMessages);
      expect(firstMessages).toHaveLength(2);
      expect(secondMessages).toHaveLength(3);
      const feedback = secondMessages.at(-1).content as string;
      expect(feedback).toContain("identity.name.value: expected string");
      expect(feedback).not.toContain("INVALID_VALUE_SHOULD_NOT_BE_ECHOED");
      expect(feedback.length).toBeLessThanOrEqual(1200);
    } finally {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    }
  });

  it("does not switch providers when the correction still fails schema validation", async () => {
    vi.stubEnv("ANTHROPIC_MODEL", "claude-sonnet-4-6");
    vi.stubEnv("DEEPSEEK_API_KEY", "test-key");
    const invalidPayload = structuredClone(validExtractionPayload);
    Object.assign(invalidPayload.identity.name, { value: ["Invalid identity"] });
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(openAiExtractionResponse(invalidPayload)));
    const create = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    try {
      await expect(extractCompanyClaims({
        client: { messages: { create } } as never,
        model: "deepseek/deepseek-v4-flash",
        evidence: { domain: "cartesia.ai", sources: [], evidenceLedger: [] },
      })).rejects.toThrow();
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(create).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    }
  });

  it("leaves provider comparisons on the requested model when recovery is disabled", async () => {
    vi.stubEnv("ANTHROPIC_MODEL", "claude-sonnet-4-6");
    vi.stubEnv("DEEPSEEK_API_KEY", "test-key");
    const timeout = new DOMException("timed out", "TimeoutError");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => { throw timeout; } }));
    const create = vi.fn();
    try {
      await expect(extractCompanyClaims({
        client: { messages: { create } } as never,
        model: "deepseek/deepseek-v4-flash", providerRecovery: false,
        evidence: { domain: "cartesia.ai", sources: [], evidenceLedger: [] }
      })).rejects.toBe(timeout);
      expect(create).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    }
  });

  it("uses the alternate provider when successful headers are followed by a timed-out body", async () => {
    vi.useFakeTimers();
    vi.stubEnv("ANTHROPIC_MODEL", "claude-sonnet-4-6");
    vi.stubEnv("DEEPSEEK_API_KEY", "test-key");
    const fetchMock = vi.fn().mockImplementation(async (_url, options) => ({
      ok: true,
      json: () => new Promise((_, reject) => {
        options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true });
      })
    }));
    vi.stubGlobal("fetch", fetchMock);
    const create = vi.fn().mockResolvedValue({ content: [{
      type: "tool_use", name: "emit_company_claims", input: validExtractionPayload
    }] });
    const telemetry = vi.fn();
    try {
      const pending = extractCompanyClaims({
        client: { messages: { create } } as never,
        model: "deepseek/deepseek-v4-flash",
        evidence: { domain: "cartesia.ai", sources: [], evidenceLedger: [] },
        telemetry
      });
      await vi.advanceTimersByTimeAsync(45_000);
      const result = await pending;
      expect(result.identity.name.value).toBe("Cartesia");
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(create).toHaveBeenCalledTimes(1);
      expect(create.mock.calls[0]![1]).toMatchObject({ maxRetries: 0, timeout: 90_000 });
      expect(telemetry.mock.calls.map(([call]) => [call.provider, call.status])).toEqual([
        ["deepseek", "failed"], ["anthropic", "ok"]
      ]);
    } finally {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });
});

describe("optional extraction facts", () => {
  const fact = (value: unknown) => ({ value, status: "verified", confidence: "high", citationIds: ["c1"] });
  const parse = (payload: unknown) => parseExtractionToolUse({ content: [{ type: "tool_use", name: "emit_company_claims", input: payload }] });
  const parseBlock = (payload: unknown) => parseBlockEnrichmentToolUse({ content: [{ type: "tool_use", name: "emit_block_claims", input: payload }] });

  it("normalizes amounts and counts identically in full and background extraction", () => {
    const payload = {
      ...validExtractionPayload,
      identity: { ...validExtractionPayload.identity, foundedYear: fact("2020") },
      funding: {
        ...validExtractionPayload.funding,
        totalRaisedUsd: fact("$25m"),
        lastRound: fact({ name: "Series A", amountUsd: "USD 2.75 million" }),
        rounds: fact([{ name: "Seed", amountUsd: "undisclosed" }, { name: "Series A", amountUsd: "2.75m" }]),
      },
      team: { ...validExtractionPayload.team, headcount: fact({ value: "1,200", asOf: "2026-09" }) },
    };
    const full = parse(payload);
    const block = parseBlock({ ...payload, blockId: "funding" });
    expect(full.funding).toEqual(block.funding);
    expect(full.team).toEqual(block.team);
    expect(full.identity.foundedYear.value).toBe(2020);
    expect(full.funding.lastRound.value?.amountUsd).toBe(2750000);
    expect(full.funding.rounds?.value?.map((round) => round.amountUsd)).toEqual([null, 2750000]);
    expect(full.team.headcount.value?.value).toBe(1200);
  });

  it("isolates invalid optional facts while preserving usable identity and funding rounds", () => {
    const payload = {
      ...validExtractionPayload,
      identity: { ...validExtractionPayload.identity, hq: fact("New York"), foundedYear: fact("2200"), websiteUrl: fact("not a URL") },
      funding: { ...validExtractionPayload.funding, totalRaisedUsd: fact("25-30m"), lastRound: fact({ name: "Series A", amountUsd: "$12.50" }) },
      team: { ...validExtractionPayload.team, headcount: fact({ value: "100", asOf: null }) },
      competitionFraming: fact({ text: "malformed" }),
    };
    const result = parse(payload);
    expect(result.identity.name).toEqual(validExtractionPayload.identity.name);
    expect(result.identity.oneLiner).toEqual(validExtractionPayload.identity.oneLiner);
    expect(result.citations).toEqual(validExtractionPayload.citations);
    expect(result.identity.hq).toEqual(unknownFact);
    expect(result.identity.websiteUrl).toEqual(unknownFact);
    expect(result.identity.foundedYear).toEqual(unknownFact);
    expect(result.funding.totalRaisedUsd).toEqual(unknownFact);
    expect(result.funding.lastRound.value).toMatchObject({ name: "Series A", amountUsd: null });
    expect(result.team.headcount).toEqual(unknownFact);
    expect(result.competitionFraming).toEqual(unknownFact);
    const block = parseBlock({ ...payload, blockId: "funding" });
    expect(block.funding).toEqual(result.funding);
    expect(block.team).toEqual(result.team);
    expect(block.competitionFraming).toEqual(unknownFact);
  });

  it("never promotes a converted amount without citation evidence", () => {
    const result = parse({ ...validExtractionPayload, funding: {
      ...validExtractionPayload.funding, totalRaisedUsd: { ...fact("$25m"), citationIds: [] },
    } });
    expect(result.funding.totalRaisedUsd).toEqual(unknownFact);
  });

  it("still rejects irrecoverable identity and malformed root responses", () => {
    expect(() => parse(null)).toThrow();
    expect(() => parse({ ...validExtractionPayload, identity: { ...validExtractionPayload.identity, name: fact({ name: "Cartesia" }) } })).toThrow();
  });
});

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

  it("requires basis on every comparable so the model must justify the buyer-alternative test", () => {
    expect(extractionTool.input_schema.properties.comparables.items.required).toEqual([
      "name",
      "domain",
      "oneLiner",
      "basis"
    ]);
  });

  it("exposes an optional competitionFraming resolved fact", () => {
    expect(extractionTool.input_schema.properties.competitionFraming.properties.value.anyOf[0]).toMatchObject({
      type: "string",
      minLength: 1
    });
    expect(extractionTool.input_schema.required).not.toContain("competitionFraming");
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

  it("requires basis on comparables and exposes competitionFraming like the full extraction tool", () => {
    expect(blockEnrichmentTool.input_schema.properties.comparables.items.required).toContain("basis");
    expect(blockEnrichmentTool.input_schema.properties.competitionFraming.properties.value.anyOf[0]).toMatchObject({
      type: "string",
      minLength: 1
    });
  });
});

describe("extractionSystemPrompt", () => {
  it("requires round-ledger funding reconciliation and non-generic investor-grade one-liners", () => {
    expect(extractionSystemPrompt).toContain("round ledger");
    expect(extractionSystemPrompt).toContain("Do not write generic category labels");
    expect(extractionSystemPrompt).toContain("mechanically reconciled");
    expect(extractionSystemPrompt).toContain("Numeric fields must be JSON numbers or null");
    expect(extractionSystemPrompt).toContain("Unsupported amounts must remain null");
    expect(extractionSystemPrompt).toContain("source incentives");
    expect(extractionSystemPrompt).toContain("18 to 24 words");
    expect(extractionSystemPrompt).toContain("expandedDescription");
    expect(extractionSystemPrompt).toContain("Never use literal ellipses");
    expect(extractionSystemPrompt).toContain("Never stuff feature lists into the overview");
    expect(extractionSystemPrompt).toContain("Ban brochure language");
    expect(extractionSystemPrompt).toContain("buyer-alternative test");
    expect(extractionSystemPrompt).toContain("basis is required for every comparable");
    expect(extractionSystemPrompt).toContain("competitionFraming");
  });
});

describe("blockGuidance", () => {
  it("tightens comparables guidance with the buyer-alternative test and competitionFraming", () => {
    expect(blockGuidance.comparables).toContain("buyer-alternative test");
    expect(blockGuidance.comparables).toContain("basis is required");
    expect(blockGuidance.comparables).toContain("competitionFraming");
    expect(blockGuidance.comparables).toContain("Never invent market commentary");
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

  it("keeps a short description whole across an abbreviation instead of truncating mid-phrase", () => {
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
                  shortDescription:
                    "Huckberry sells menswear and outdoor gear online and through two physical stores in Washington D.C. and Columbus.",
                  expandedDescription: null,
                  concept: null,
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

    expect(payload.identity.description?.value?.shortDescription).toBe(
      "Huckberry sells menswear and outdoor gear online and through two physical stores in Washington D.C. and Columbus."
    );
    expect(payload.identity.description?.value?.shortDescription).not.toMatch(/D\.C\.$/);
  });

  it("keeps up to two complete sentences for serves and mechanism instead of truncating to one", () => {
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
                  shortDescription: "Cartesia builds real-time voice AI infrastructure for developers.",
                  expandedDescription: null,
                  concept: "Low-latency speech models exposed as developer infrastructure.",
                  serves:
                    "Developers building voice agents and audio applications. Teams at consumer and enterprise companies both ship on the same APIs.",
                  mechanism:
                    "APIs and models for real-time speech generation and understanding. Streaming inference keeps round-trip latency under 100 milliseconds."
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

    expect(payload.identity.description?.value?.serves).toBe(
      "Developers building voice agents and audio applications. Teams at consumer and enterprise companies both ship on the same APIs."
    );
    expect(payload.identity.description?.value?.mechanism).toBe(
      "APIs and models for real-time speech generation and understanding. Streaming inference keeps round-trip latency under 100 milliseconds."
    );
  });

  it("truncates a third serves or mechanism sentence at the sentence boundary, never mid-sentence", () => {
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
                  shortDescription: "Cartesia builds real-time voice AI infrastructure for developers.",
                  expandedDescription: null,
                  concept: "Low-latency speech models exposed as developer infrastructure.",
                  serves:
                    "Developers building voice agents and audio applications. Teams at consumer and enterprise companies both ship on the same APIs. A self-serve tier targets indie builders.",
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

    expect(payload.identity.description?.value?.serves).toBe(
      "Developers building voice agents and audio applications. Teams at consumer and enterprise companies both ship on the same APIs."
    );
    expect(payload.identity.description?.value?.serves).not.toContain("self-serve tier");
  });

  it("keeps concept to one sentence even when the model returns two", () => {
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
                  shortDescription: "Cartesia builds real-time voice AI infrastructure for developers.",
                  expandedDescription: null,
                  concept:
                    "Low-latency speech models exposed as developer infrastructure. It also ships a hosted playground.",
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

    expect(payload.identity.description?.value?.concept).toBe(
      "Low-latency speech models exposed as developer infrastructure."
    );
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

  it("normalizes a cited competitionFraming fact", () => {
    const payload = parseExtractionToolUse({
      content: [
        {
          type: "tool_use",
          name: "emit_company_claims",
          input: {
            ...validExtractionPayload,
            competitionFraming: {
              value: "Cartesia competes in the low-latency voice API slice, which is crowded with well-funded rivals.",
              status: "verified",
              confidence: "medium",
              citationIds: ["c1"],
            },
          },
        },
      ],
    });

    expect(payload.competitionFraming?.value).toBe(
      "Cartesia competes in the low-latency voice API slice, which is crowded with well-funded rivals."
    );
    expect(payload.competitionFraming?.citationIds).toEqual(["c1"]);
  });

  it("drops an uncited competitionFraming claim rather than keeping unsupported market commentary", () => {
    const payload = parseExtractionToolUse({
      content: [
        {
          type: "tool_use",
          name: "emit_company_claims",
          input: {
            ...validExtractionPayload,
            competitionFraming: {
              value: "Cartesia dominates a wide-open market.",
              status: "inferred",
              confidence: "low",
              citationIds: [],
            },
          },
        },
      ],
    });

    expect(payload.competitionFraming).toEqual(unknownFact);
  });

  it("drops a private-network company logo without rejecting the card", () => {
    const payload = parseExtractionToolUse({
      content: [{
        type: "tool_use",
        name: "emit_company_claims",
        input: {
          ...validExtractionPayload,
          identity: { ...validExtractionPayload.identity, logoUrl: "https://127.0.0.1/logo.png" }
        }
      }]
    });

    expect(payload.identity.logoUrl).toBeNull();
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
  it("drops unsafe person channel URLs during LLM parsing", () => {
    const payload = parseBlockEnrichmentToolUse({
      content: [{
        type: "tool_use",
        name: "emit_block_claims",
        input: {
          blockId: "team",
          team: {
            founders: {
              value: [{
                name: "Raymond Luo",
                role: "Founder and CEO",
                sourceUrl: "javascript:alert(1)",
                email: null,
                githubUrl: "https://github.com/raymond",
                xUrl: "data:text/html,unsafe",
                personalUrl: "https://user:pass@example.com/private"
              }],
              status: "verified",
              confidence: "medium",
              citationIds: ["c1"]
            }
          },
          citations: [{
            id: "c1",
            url: "https://zo.computer/team",
            title: "Zo Computer team",
            fetchedAt: "2026-05-14T16:00:00.000Z",
            sourceType: "company_site"
          }]
        }
      }]
    });

    expect(payload.team?.founders?.value?.[0]).toMatchObject({
      sourceUrl: null,
      githubUrl: "https://github.com/raymond",
      xUrl: null,
      personalUrl: null
    });
  });

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

  it("normalizes a cited competitionFraming patch from the comparables block", () => {
    const payload = parseBlockEnrichmentToolUse({
      content: [
        {
          type: "tool_use",
          name: "emit_block_claims",
          input: {
            blockId: "comparables",
            comparables: [
              {
                name: "Browserbase",
                domain: "browserbase.com",
                oneLiner: "Cloud browser automation infrastructure for AI agents.",
                basis: "Adjacent cloud execution surface for AI-controlled browser work.",
                citationIds: ["c1"],
              },
            ],
            competitionFraming: {
              value: "Cartesia competes in the low-latency voice API slice, which is crowded with well-funded rivals.",
              status: "verified",
              confidence: "medium",
              citationIds: ["c1"],
            },
            citations: [
              {
                id: "c1",
                url: "https://browserbase.com",
                title: "Browserbase",
                fetchedAt: "2026-05-14T16:00:00.000Z",
                sourceType: "news",
              },
            ],
          },
        },
      ],
    });

    expect(payload.blockId).toBe("comparables");
    expect(payload.comparables?.[0]).toMatchObject({ name: "Browserbase", basis: "Adjacent cloud execution surface for AI-controlled browser work." });
    expect(payload.competitionFraming?.value).toBe(
      "Cartesia competes in the low-latency voice API slice, which is crowded with well-funded rivals."
    );
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
