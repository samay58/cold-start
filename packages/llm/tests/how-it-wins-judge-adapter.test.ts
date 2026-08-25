import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";

import {
  benchmarkToolSchemaForRequest,
  benchmarkTransportHash,
  createBenchmarkModelAdapter,
  createHowItWinsJudgeModelAdapter,
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

function sseBody(events: Array<{ event: string; data: unknown }>) {
  return events.map(({ event, data }) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join("");
}

// One tool_use block streamed the way the API sends it: the input arrives as input_json_delta
// fragments, so the SDK's own parser has to reassemble it.
function toolUseStream(toolInput: unknown) {
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
            cache_read_input_tokens: 0
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
    // Re-pinned by packet B of the How it wins repair, which shrank the judgment's output
    // contract: compact rows for every strategy that is not current, not yet, or an open
    // question, no model-written deciding question, and prose length hints on the tool schema.
    // A changed value here invalidates every frozen benchmark checkpoint.
    expect(benchmarkTransportHash()).toBe("3ab0fa44acbc1155506bb6c00f4abcd10b8cdd8f78b0de958c726aad62126b05");
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
