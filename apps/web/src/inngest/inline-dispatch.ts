import { after } from "next/server";
import { isTransientLlmError } from "@cold-start/llm";
import { inngest, type GenerationStepTools } from "./client";
import { generateCardHandler } from "./functions";

// In-process execution of the user-facing profile runs (basics, analysis) for /api/generate,
// so the first progress event never waits on Inngest's dispatcher (docs/qa/
// analysis-run-observations.md, attack item 2). The generate-card handler is unchanged; this
// module only supplies a step executor that runs step bodies directly, and `after` keeps the
// route invocation alive past the 202 until the run settles. Section jobs and the enrichment
// workers stay on Inngest, and sendEvent forwards to it so those dispatches still happen.

const INLINE_TRANSIENT_ATTEMPTS = 2;
const INLINE_TRANSIENT_RETRY_PAUSE_MS = 2000;

// No step memoization inline, by design: a failed inline analysis run re-pays synthesis on the
// next click, and the panel's retry state is the recovery path. Transient LLM transport
// failures get one bounded in-process retry, standing in for the step-level retry Inngest
// provides; everything else fails the run immediately.
export function createInlineStepTools(): GenerationStepTools {
  const run = (async (_id: unknown, fn: (...input: unknown[]) => unknown, ...input: unknown[]) => {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await fn(...input);
      } catch (error) {
        if (attempt >= INLINE_TRANSIENT_ATTEMPTS || !isTransientLlmError(error)) {
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, INLINE_TRANSIENT_RETRY_PAUSE_MS));
      }
    }
  }) as GenerationStepTools["run"];

  const sendEvent = (async (_id: unknown, payload: Parameters<typeof inngest.send>[0]) =>
    inngest.send(payload)) as GenerationStepTools["sendEvent"];

  return { run, sendEvent };
}

export function startInlineGeneration(input: {
  domain: string;
  generationRunId: string;
  slug: string;
  mode: "basics" | "analysis";
  requestedAtMs: number;
}) {
  // The synthetic runId lands in generation_runs.inngest_run_id, so rows record which dispatch
  // path served them. No event id exists inline, so none is stamped.
  const run = generateCardHandler({
    event: {
      ts: input.requestedAtMs,
      data: {
        domain: input.domain,
        generationRunId: input.generationRunId,
        slug: input.slug,
        mode: input.mode,
        requestedAtMs: input.requestedAtMs
      }
    },
    runId: `inline:${crypto.randomUUID()}`,
    step: createInlineStepTools()
  }).then(
    () => undefined,
    (error) => {
      // The handler's own catch already marked the run failed and recorded the failure event;
      // this guard only stops the rejection from surfacing as an unhandled rejection.
      console.error("[generation] inline run failed", { slug: input.slug, mode: input.mode }, error);
    }
  );
  after(run);
}
