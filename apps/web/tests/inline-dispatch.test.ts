import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  after: vi.fn(),
  generateCardHandler: vi.fn()
}));

vi.mock("../src/inngest/client", () => ({
  inngest: { send: mocks.send }
}));

vi.mock("../src/inngest/functions", () => ({
  generateCardHandler: mocks.generateCardHandler
}));

vi.mock("next/server", () => ({
  after: mocks.after
}));

const { createInlineStepTools, startInlineGeneration } = await import("../src/inngest/inline-dispatch");

function transientError() {
  // Node's fetch throws TypeError("fetch failed") on connection failure; isTransientLlmError
  // classifies it transient.
  return new TypeError("fetch failed");
}

describe("createInlineStepTools run", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    mocks.send.mockReset();
  });

  it("executes the step body once and returns its value", async () => {
    const step = createInlineStepTools();
    const body = vi.fn(async () => ({ ok: true }));

    await expect(step.run("fetch-sources", body)).resolves.toEqual({ ok: true });
    expect(body).toHaveBeenCalledTimes(1);
  });

  it("retries a transient failure once after a pause, then succeeds", async () => {
    const step = createInlineStepTools();
    const body = vi
      .fn()
      .mockRejectedValueOnce(transientError())
      .mockResolvedValueOnce("second-attempt");

    const result = step.run("synthesize-card", body);
    await vi.advanceTimersByTimeAsync(2000);

    await expect(result).resolves.toBe("second-attempt");
    expect(body).toHaveBeenCalledTimes(2);
  });

  it("gives up after the second transient failure", async () => {
    const step = createInlineStepTools();
    const body = vi.fn().mockRejectedValue(transientError());

    const result = step.run("verify-synthesis", body);
    result.catch(() => null);
    await vi.advanceTimersByTimeAsync(2000);

    await expect(result).rejects.toThrow("fetch failed");
    expect(body).toHaveBeenCalledTimes(2);
  });

  it("fails a semantic error immediately without retrying", async () => {
    const step = createInlineStepTools();
    const body = vi.fn().mockRejectedValue(new Error("synthesis draft failed schema validation"));

    await expect(step.run("synthesize-card", body)).rejects.toThrow("schema validation");
    expect(body).toHaveBeenCalledTimes(1);
  });
});

describe("createInlineStepTools sendEvent", () => {
  afterEach(() => {
    mocks.send.mockReset();
  });

  it("forwards the payload to inngest.send so enrichment workers still dispatch", async () => {
    mocks.send.mockResolvedValue({ ids: ["evt_1"] });
    const step = createInlineStepTools();
    const payload = { name: "card/enrich-block.requested", data: { slug: "cartesia" } };

    await step.sendEvent("request-block-enrichment", payload as never);

    expect(mocks.send).toHaveBeenCalledWith(payload);
  });
});

describe("startInlineGeneration", () => {
  afterEach(() => {
    mocks.after.mockReset();
    mocks.generateCardHandler.mockReset();
  });

  it("invokes the generate-card handler immediately and keeps the invocation alive via after", async () => {
    mocks.generateCardHandler.mockResolvedValue({ slug: "cartesia", mode: "basics" });

    startInlineGeneration({
      domain: "cartesia.ai",
      generationRunId: "run-db-1",
      slug: "cartesia",
      mode: "basics",
      requestedAtMs: 1_753_000_000_000
    });

    expect(mocks.generateCardHandler).toHaveBeenCalledTimes(1);
    const context = mocks.generateCardHandler.mock.calls[0]![0] as {
      event: { ts?: number; data: Record<string, unknown> };
      runId: string;
      step: { run: unknown; sendEvent: unknown };
    };
    expect(context.event.data).toEqual({
      domain: "cartesia.ai",
      generationRunId: "run-db-1",
      slug: "cartesia",
      mode: "basics",
      requestedAtMs: 1_753_000_000_000
    });
    expect(context.event.ts).toBe(1_753_000_000_000);
    expect(context.runId).toMatch(/^inline:/);
    expect(typeof context.step.run).toBe("function");
    expect(typeof context.step.sendEvent).toBe("function");

    expect(mocks.after).toHaveBeenCalledTimes(1);
    await expect(mocks.after.mock.calls[0]![0]).resolves.toBeUndefined();
  });

  it("swallows a handler rejection so it cannot surface as an unhandled rejection", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.generateCardHandler.mockRejectedValue(new Error("run failed"));

    startInlineGeneration({
      domain: "tenex.com",
      generationRunId: "run-db-2",
      slug: "tenex",
      mode: "analysis",
      requestedAtMs: 1
    });

    await expect(mocks.after.mock.calls[0]![0]).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
