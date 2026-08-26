import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";

import { HOW_IT_WINS_STRATEGIES, adjudicationPatchSchema } from "@cold-start/core";

import {
  benchmarkToolSchemaForRequest,
  benchmarkTransportHash,
  createBenchmarkModelAdapter,
  createHowItWinsJudgeModelAdapter,
  loadHowItWinsJudgeRules,
  normalizeBenchmarkToolOutput,
  type HowItWinsJudgeCallRequest
} from "../src";

// Production never produced a How it wins read because the judge adapter posted global_judge
// with max_tokens 50000 through a non-streaming Anthropic call. The SDK rejects that before it
// reaches the wire, so the whole crown degraded to nothing_stands_out in about 18ms. These tests
// drive a real Anthropic client over a stubbed fetch, which is the only level that catches it:
// a fake client with a stream() method proves nothing about what the SDK will accept.

const TOOL_NAME = "emit_how_it_wins_judgment";

function evidencePacket() {
  return {
    cutoff: "2026-08-21T00:00:00.000Z",
    evidence: [
      {
        evidenceId: "e1",
        text: "A current source describes the mechanism.",
        source: "Primary source",
        sourceDate: "2026-08-20",
        attribution: "independent",
        scope: "company"
      }
    ],
    context: { companyName: "Fixture Company" }
  };
}

function globalRequest(): HowItWinsJudgeCallRequest {
  return {
    callId: "how-it-wins:monolith",
    stage: "global_judge",
    attempt: 1,
    prompt: "Judge the record.",
    payload: { evidencePacket: evidencePacket(), betMap: null }
  };
}

// Two real companies differ in packet size and in every word of their evidence. Cognition ran 40
// to 41 items; the corpus median is 16 and its widest card 36.
function companyRequest(input: { slug: string; items: number }): HowItWinsJudgeCallRequest {
  return {
    callId: `how-it-wins:${input.slug}`,
    stage: "global_judge",
    attempt: 1,
    prompt: "Judge the record.",
    payload: {
      evidencePacket: {
        cutoff: "2026-08-21T00:00:00.000Z",
        evidence: Array.from({ length: input.items }, (_, index) => ({
          evidenceId: `${input.slug}-c${index + 1}`,
          text: `${input.slug} coverage ${index + 1} reports the mechanism.`,
          source: `${input.slug} press ${index + 1}`,
          sourceDate: "2026-08-20",
          attribution: "independent",
          scope: "company"
        })),
        context: { companyName: input.slug }
      },
      betMap: null,
      rules: loadHowItWinsJudgeRules(),
      vocabulary: HOW_IT_WINS_STRATEGIES
    }
  };
}

function evidenceIdEnums(schema: unknown, key = ""): string[][] {
  if (!schema || typeof schema !== "object") return [];
  const object = schema as Record<string, unknown>;
  if (/evidenceids$/i.test(key)) {
    const items = object.items as { pattern?: string } | undefined;
    return items?.pattern ? [[items.pattern]] : [];
  }
  return Object.entries(object).flatMap(([childKey, child]) => evidenceIdEnums(child, childKey));
}

function sseBody(events: Array<{ event: string; data: unknown }>) {
  return events.map(({ event, data }) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join("");
}

// One tool_use block streamed the way the API sends it: the input arrives as input_json_delta
// fragments, so the SDK's own parser has to reassemble it.
function toolUseStream(toolInput: unknown, usageOverrides: Record<string, unknown> = {}) {
  const serialized = JSON.stringify(toolInput);
  const split = Math.floor(serialized.length / 2);
  return sseBody([
    {
      event: "message_start",
      data: {
        type: "message_start",
        message: {
          id: "msg_fixture",
          type: "message",
          role: "assistant",
          model: "claude-opus-5",
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage: {
            input_tokens: 1_200,
            output_tokens: 1,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
            ...usageOverrides
          }
        }
      }
    },
    {
      event: "content_block_start",
      data: {
        type: "content_block_start",
        index: 0,
        content_block: { type: "tool_use", id: "toolu_fixture", name: TOOL_NAME, input: {} }
      }
    },
    {
      event: "content_block_delta",
      data: {
        type: "content_block_delta",
        index: 0,
        delta: { type: "input_json_delta", partial_json: serialized.slice(0, split) }
      }
    },
    {
      event: "content_block_delta",
      data: {
        type: "content_block_delta",
        index: 0,
        delta: { type: "input_json_delta", partial_json: serialized.slice(split) }
      }
    },
    { event: "content_block_stop", data: { type: "content_block_stop", index: 0 } },
    {
      event: "message_delta",
      data: {
        type: "message_delta",
        delta: { stop_reason: "tool_use", stop_sequence: null },
        usage: { output_tokens: 24_000 }
      }
    },
    { event: "message_stop", data: { type: "message_stop" } }
  ]);
}

// The smallest tool output the transport accepts. The judge itself rejects an empty evaluation
// list later; what matters at this level is that the request reached the wire and a real tool
// block came back through the SDK's own stream parser.
const minimalToolOutput = { strategyEvaluations: [] };

function stubbedClient(body: string) {
  const requests: Array<{ url: string; init: RequestInit }> = [];
  const client = new Anthropic({
    apiKey: "test",
    fetch: (async (url: string | URL | Request, init: RequestInit) => {
      requests.push({ url: String(url), init });
      // A real wait so the measured latency cannot land inside the same millisecond.
      await new Promise((resolve) => setTimeout(resolve, 2));
      return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
    }) as unknown as typeof fetch
  });
  return { client, requests };
}

function requestBody(requests: Array<{ init: RequestInit }>, index = 0) {
  return JSON.parse(String(requests[index]?.init.body)) as Record<string, unknown>;
}

describe("the how it wins judge transport", () => {
  it("streams a 50000-token global judge call through a real Anthropic client", async () => {
    const { client, requests } = stubbedClient(toolUseStream(minimalToolOutput));
    const adapter = createHowItWinsJudgeModelAdapter({ client, model: "claude-opus-5" });

    const result = await adapter(globalRequest());

    expect(requests).toHaveLength(1);
    const body = requestBody(requests);
    expect(body.stream).toBe(true);
    expect(body.max_tokens).toBe(50_000);
    expect(result.ok).toBe(true);
    expect(result.trace).toMatchObject({ provider: "anthropic", outcome: "ok", outputTokens: 24_000 });
    expect(result.trace.latencyMs).toBeGreaterThan(0);
  });

  it("pins the non-streaming ceiling the production adapter used to trip", () => {
    let fetchCalls = 0;
    const client = new Anthropic({
      apiKey: "test",
      fetch: (async () => {
        fetchCalls += 1;
        return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
      }) as unknown as typeof fetch
    });

    expect(() => client.messages.create({
      model: "claude-opus-5",
      max_tokens: 50_000,
      messages: [{ role: "user", content: "judge the record" }]
    })).toThrow(/streaming is required/i);
    expect(fetchCalls).toBe(0);
  });

  it("sends the same request body from the production and benchmark wrappers", async () => {
    const production = stubbedClient(toolUseStream(minimalToolOutput));
    const benchmark = stubbedClient(toolUseStream(minimalToolOutput));

    await createHowItWinsJudgeModelAdapter({ client: production.client, model: "claude-opus-5" })(globalRequest());
    await createBenchmarkModelAdapter({ client: benchmark.client, model: "claude-opus-5" })(globalRequest());

    expect(production.requests).toHaveLength(1);
    expect(benchmark.requests).toHaveLength(1);
    expect(requestBody(production.requests)).toEqual(requestBody(benchmark.requests));
  });

  it("holds the frozen benchmark transport hash", () => {
    // Re-pinned 2026-08-26 after the rubric audit: specialization, first mover, alliance,
    // efficiency, and divergence rows tightened against the default state of a startup, the
    // standard's open-question and distinctiveness gates named, and the critic told to attack
    // generic labels first. A changed value here invalidates every frozen benchmark checkpoint
    // and every cached judgment, which is intended: the old verdicts were judged by the old rows.
    expect(benchmarkTransportHash()).toBe("421f854d0618e27bdb0fabde3c4b55029873b868a67beb37625420a218a370c2");
  });

  it("sends the rubric and the vocabulary once, in a cached system block", async () => {
    const rules = loadHowItWinsJudgeRules();
    const request = globalRequest();
    request.payload = {
      ...(request.payload as Record<string, unknown>),
      rules,
      vocabulary: HOW_IT_WINS_STRATEGIES
    };
    const { client, requests } = stubbedClient(toolUseStream(minimalToolOutput));

    await createHowItWinsJudgeModelAdapter({ client, model: "claude-opus-5" })(request);

    const body = requestBody(requests) as {
      system: Array<{ type: string; text: string; cache_control?: { type: string; ttl: string } }>;
      messages: Array<{ content: string }>;
    };
    expect(body.system).toHaveLength(2);
    expect(body.system[0]?.cache_control).toBeUndefined();
    expect(body.system[0]?.text).toContain("Judge the record.");
    expect(body.system[1]?.cache_control).toMatchObject({ type: "ephemeral" });
    expect(body.system[1]?.text).toBe(
      `Rules:\n${JSON.stringify(rules)}\n\nVocabulary:\n${JSON.stringify(HOW_IT_WINS_STRATEGIES)}`
    );
    const userPayload = JSON.parse(body.messages[0]!.content) as Record<string, unknown>;
    expect(Object.hasOwn(userPayload, "rules")).toBe(false);
    expect(Object.hasOwn(userPayload, "vocabulary")).toBe(false);
    expect(Object.hasOwn(userPayload, "evidencePacket")).toBe(true);
  });

  it("prices a one-hour cache write and a cache read from the streamed usage", async () => {
    // A 1h write bills twice the input rate and a read a tenth of it. Flattening the two into
    // one cache_creation_input_tokens total prices the write at 1.25x and understates the run.
    const { client } = stubbedClient(toolUseStream(minimalToolOutput, {
      input_tokens: 1_000,
      cache_read_input_tokens: 20_000,
      cache_creation_input_tokens: 20_000,
      cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 20_000 }
    }));

    const result = await createHowItWinsJudgeModelAdapter({ client, model: "claude-opus-5" })(globalRequest());

    expect(result.trace).toMatchObject({
      inputTokens: 1_000,
      cacheReadInputTokens: 20_000,
      cacheCreationInputTokens: 20_000,
      // 1000 at $5/M, 20000 read at $0.5/M, 20000 written for an hour at $10/M, 24000 out at $25/M.
      estimatedCostUsd: 0.815
    });
  });

  it("sends two companies the same cacheable prefix and different messages", async () => {
    // Anthropic caches tools, then system, then messages. While the tool schema listed the run's
    // own handles, a 40-item packet and a 41-item packet had different tools, so the prefix never
    // hit and every one-hour write was paid twice.
    const cognition = stubbedClient(toolUseStream(minimalToolOutput));
    const bland = stubbedClient(toolUseStream(minimalToolOutput));

    await createHowItWinsJudgeModelAdapter({ client: cognition.client, model: "claude-opus-5" })(
      companyRequest({ slug: "cognition", items: 40 })
    );
    await createHowItWinsJudgeModelAdapter({ client: bland.client, model: "claude-opus-5" })(
      companyRequest({ slug: "bland", items: 41 })
    );

    const first = requestBody(cognition.requests);
    const second = requestBody(bland.requests);
    expect(first.tools).toEqual(second.tools);
    expect(first.system).toEqual(second.system);
    expect(first.messages).not.toEqual(second.messages);
  });

  it("restricts every evidence array to the fixed handle universe, not the packet", () => {
    const enums = evidenceIdEnums(benchmarkToolSchemaForRequest(companyRequest({ slug: "cognition", items: 40 })));

    expect(enums.length).toBeGreaterThan(0);
    for (const [pattern] of enums) {
      const handle = new RegExp(pattern!);
      expect(handle.test("ev_001")).toBe(true);
      expect(handle.test("ev_200")).toBe(true);
      expect(handle.test("ev_000")).toBe(false);
      expect(handle.test("ev_201")).toBe(false);
      expect(handle.test("e1")).toBe(false);
    }
  });

  it("fails closed when a packet outgrows the handle universe", () => {
    expect(() => benchmarkToolSchemaForRequest(companyRequest({ slug: "sprawling", items: 201 })))
      .toThrow(/holds 201 items and the handle universe stops at 200/);
  });

  it("rejects a handle the packet never listed", () => {
    // The enum offers 200 handles to every company, so the packet is the only thing that decides
    // which of them mean something.
    expect(() => normalizeBenchmarkToolOutput(globalRequest(), {
      strategyEvaluations: [],
      overallWrongCondition: { condition: "The mechanism stops mattering.", evidenceIds: ["ev_200"] }
    })).toThrow(/unknown evidence handle: ev_200/);
  });

  it("keeps every evidence reference out of the cached block", () => {
    // The handle mapping only rewrites the user payload now, so the cached block has to be free
    // of evidence references rather than assumed to be.
    const cached = JSON.stringify({ rules: loadHowItWinsJudgeRules(), vocabulary: HOW_IT_WINS_STRATEGIES });
    expect(cached).not.toMatch(/"evidenceIds?"/i);
  });
});

describe("the how it wins judgment tool schema", () => {
  function strategySchemaBranches() {
    const schema = benchmarkToolSchemaForRequest(globalRequest()) as Record<string, unknown>;
    const properties = (schema.properties as Record<string, Record<string, unknown>>);
    const items = properties.strategyEvaluations!.items as { anyOf: Array<Record<string, unknown>> };
    const [compact, full] = items.anyOf;
    return { compact: compact!, full: full! };
  }

  it("asks for four fields on every strategy that is not current, not yet, or in question", () => {
    const { compact, full } = strategySchemaBranches();

    expect(Object.keys(compact.properties as Record<string, unknown>)).toEqual([
      "strategyId",
      "disposition",
      "evidenceGate",
      "dispositionReason"
    ]);
    expect((compact.properties as Record<string, Record<string, unknown>>).disposition!.enum).toEqual([
      "insufficient_evidence",
      "rejected",
      "not_applicable"
    ]);
    expect((compact.properties as Record<string, Record<string, unknown>>).evidenceGate!.enum).toEqual([
      "pass",
      "fail",
      "unresolved"
    ]);
    expect((full.properties as Record<string, Record<string, unknown>>).disposition!.enum).toEqual([
      "current",
      "not_yet",
      "open_question"
    ]);
  });

  it("carries the prose length hints and no model-written deciding question", () => {
    const { full } = strategySchemaBranches();
    const properties = full.properties as Record<string, Record<string, unknown>>;

    expect(properties.mechanism).toMatchObject({ type: "string", maxLength: 260 });
    expect(properties.dispositionReason).toMatchObject({ type: "string", maxLength: 200 });

    const sibling = (properties.siblingResolutions!.items as Record<string, unknown>);
    const siblingProperties = sibling.properties as Record<string, Record<string, unknown>>;
    expect(Object.keys(siblingProperties)).toEqual(["strategyId", "reason", "evidenceIds"]);
    expect(siblingProperties.reason).toMatchObject({ type: "string", maxLength: 130 });

    const claim = properties.supportingClaims!.items as { anyOf: Array<Record<string, unknown>> };
    for (const option of claim.anyOf) {
      expect((option.properties as Record<string, Record<string, unknown>>).text)
        .toMatchObject({ type: "string", maxLength: 200 });
    }
  });
});

describe("compact strategy rows", () => {
  function rowsFrom(row: Record<string, unknown>) {
    const output = normalizeBenchmarkToolOutput(globalRequest(), { strategyEvaluations: [row] });
    return (output as { strategyEvaluations: Array<Record<string, unknown>> }).strategyEvaluations[0]!;
  }

  it("drops the empty padding a model puts on a compact row", () => {
    // Padding a four-field row with nulls and empty arrays used to fail the strict compact
    // schema, take the whole 80-row judgment down with it, and buy a paid repair call.
    const trimmed = rowsFrom({
      strategyId: "usership",
      disposition: "rejected",
      evidenceGate: "fail",
      dispositionReason: "No user base is described.",
      mechanism: null,
      notYet: null,
      presentBridge: null,
      betRefs: [],
      evidenceIds: [],
      supportingClaims: [],
      counterevidenceIds: [],
      siblingCandidateIds: [],
      siblingResolutions: [],
      historicalEvidenceIds: [],
      presentEvidenceIds: [],
      presentRelevance: ""
    });

    expect(Object.keys(trimmed)).toEqual([
      "strategyId",
      "disposition",
      "evidenceGate",
      "dispositionReason"
    ]);
  });

  it("keeps a compact row's non-empty extras so a genuinely full row still fails loudly", () => {
    const trimmed = rowsFrom({
      strategyId: "usership",
      disposition: "insufficient_evidence",
      evidenceGate: "unresolved",
      dispositionReason: "The user base is not described.",
      mechanism: "Users bring other users.",
      evidenceIds: []
    });

    expect(trimmed).toEqual({
      strategyId: "usership",
      disposition: "insufficient_evidence",
      evidenceGate: "unresolved",
      dispositionReason: "The user base is not described.",
      mechanism: "Users bring other users."
    });
  });

  it("leaves a full row alone", () => {
    const full = {
      strategyId: "usership",
      disposition: "current",
      evidenceGate: "pass",
      dispositionReason: "The user base is described.",
      mechanism: "Users bring other users.",
      betRefs: [1],
      evidenceIds: ["ev_001"],
      supportingClaims: [],
      counterevidenceIds: [],
      siblingCandidateIds: [],
      siblingResolutions: [],
      historicalEvidenceIds: [],
      presentEvidenceIds: [],
      presentBridge: null,
      notYet: null,
      presentRelevance: "current"
    };

    expect(rowsFrom(full)).toEqual({ ...full, evidenceIds: ["e1"] });
  });
});

describe("lean open-question rows", () => {
  function rowsFrom(row: Record<string, unknown>) {
    const output = normalizeBenchmarkToolOutput(globalRequest(), { strategyEvaluations: [row] });
    return (output as { strategyEvaluations: Array<Record<string, unknown>> }).strategyEvaluations[0]!;
  }

  // The real transport union is what decides whether a row survives, so the tests ask it rather
  // than restate its rules.
  function transportAccepts(row: unknown) {
    return adjudicationPatchSchema.safeParse({
      strategyEvaluations: [row],
      currentStrategyIds: [],
      overrides: []
    }).success;
  }

  const lean = {
    strategyId: "usership",
    disposition: "open_question",
    evidenceGate: "unresolved",
    mechanism: "Users bring other users.",
    evidenceIds: ["ev_001"],
    counterevidenceIds: [],
    dimensions: {
      evidenceStrength: "inferred",
      centrality: "supporting",
      materiality: "material",
      distinctiveness: "company_specific",
      independence: "independent",
      explanatoryValue: "additive"
    },
    dispositionReason: "The pull is described but never measured."
  };

  const fullOnlyKeys = {
    betRefs: [1],
    supportingClaims: [],
    siblingCandidateIds: [],
    siblingResolutions: [],
    historicalEvidenceIds: [],
    presentEvidenceIds: [],
    presentBridge: null,
    notYet: null,
    presentRelevance: "current"
  };

  it("drops the full-record padding a model puts on a lean row", () => {
    const trimmed = rowsFrom({
      ...lean,
      betRefs: [],
      supportingClaims: [],
      siblingCandidateIds: [],
      siblingResolutions: [],
      historicalEvidenceIds: [],
      presentEvidenceIds: [],
      presentBridge: null,
      notYet: null,
      presentRelevance: ""
    });

    expect(trimmed).toEqual({ ...lean, evidenceIds: ["e1"] });
    expect(transportAccepts(trimmed)).toBe(true);
  });

  it("leaves a full-shaped open-question row whole", () => {
    // Every full record carries notYet: null and usually presentBridge: null. Reading those as
    // padding and dropping them would leave a row that matches no shape at all.
    const trimmed = rowsFrom({ ...lean, ...fullOnlyKeys });

    expect(trimmed).toEqual({ ...lean, ...fullOnlyKeys, evidenceIds: ["e1"] });
    expect(transportAccepts(trimmed)).toBe(true);
  });

  it("leaves a lean row that needs no trimming alone", () => {
    const trimmed = rowsFrom({ ...lean, counterevidenceIds: ["ev_001"] });

    expect(trimmed).toEqual({ ...lean, evidenceIds: ["e1"], counterevidenceIds: ["e1"] });
    expect(transportAccepts(trimmed)).toBe(true);
  });
});

describe("tolerant list transport", () => {
  function bets(raw: unknown) {
    const request: HowItWinsJudgeCallRequest = {
      callId: "how-it-wins:bet-map",
      stage: "bet_map",
      attempt: 1,
      prompt: "Map the bet.",
      payload: { evidencePacket: evidencePacket() }
    };
    return (normalizeBenchmarkToolOutput(request, raw) as { materialBets: unknown[] }).materialBets;
  }

  const bet = {
    statement: "The company is betting on one evidenced mechanism.",
    scope: "company",
    supportingEvidenceIds: ["ev_001"],
    scopeReasons: ["The same buyer and operating model apply."]
  };

  it("reads a list the model wrapped in prose", () => {
    expect(bets({ materialBets: `Here is the list: ${JSON.stringify([bet])}` }))
      .toEqual([{ ...bet, supportingEvidenceIds: ["e1"] }]);
  });

  it("reads a list the model numbered into an object", () => {
    expect(bets({ materialBets: { "0": bet, "1": bet } })).toHaveLength(2);
  });

  it("refuses two top-level lists rather than guessing which one is the answer", () => {
    expect(() => bets({ materialBets: `first ${JSON.stringify([bet])} then ${JSON.stringify([bet])}` }))
      .toThrow(/must be a JSON array/i);
  });

  it("reads one bet the model wrote bare instead of as a one-item list", () => {
    // Friend, 2026-08-26: the judge answered with the bet object itself and paid a full re-ask.
    expect(bets({ materialBets: bet })).toEqual([{ ...bet, supportingEvidenceIds: ["e1"] }]);
    expect(bets({ materialBets: JSON.stringify(bet) })).toEqual([{ ...bet, supportingEvidenceIds: ["e1"] }]);
  });

  it("reads bets the model wrote as XML parameter blocks inside the list string", () => {
    // DeepInfra, Sparxell, Tavily, Boom Supersonic: the list arrived as
    // `<parameter name="statement">...</parameter><parameter name="scope">...`, one block per field,
    // a repeated field name starting the next bet.
    const block = (item: typeof bet) =>
      `<parameter name="statement">${item.statement}</parameter>\n` +
      `<parameter name="scope">${item.scope}</parameter>\n` +
      `<parameter name="supportingEvidenceIds">${JSON.stringify(item.supportingEvidenceIds)}</parameter>\n` +
      `<parameter name="scopeReasons">${JSON.stringify(item.scopeReasons)}</parameter>\n`;
    const second = { ...bet, statement: "A second bet on a different buyer." };

    expect(bets({ materialBets: `\n${block(bet)}${block(second)}` })).toEqual([
      { ...bet, supportingEvidenceIds: ["e1"] },
      { ...second, supportingEvidenceIds: ["e1"] }
    ]);
    // The same shape with the outer materialBets block still wrapped around it.
    expect(bets({ materialBets: `<parameter name="materialBets">\n${block(bet)}</parameter>` })).toHaveLength(1);
  });

  it("names the shape it got when it rejects a list", () => {
    expect(() => bets({ materialBets: 7 })).toThrow(/must be a JSON array: number/i);
    expect(() => bets({ materialBets: {} })).toThrow(/must be a JSON array: object/i);
    expect(() => bets({ materialBets: "the bets are not written down anywhere" }))
      .toThrow(/must be a JSON array: string "the bets are not written down anywhere"/i);
  });
});
