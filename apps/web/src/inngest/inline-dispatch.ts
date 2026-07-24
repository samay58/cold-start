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

// Transport-shaped failures of the Inngest event API: 429, any 5xx, or a raw network failure.
// isTransientLlmError is the wrong classifier here; it is shaped around the Anthropic SDK and the
// openai-compat adapter's own message format. Anything not clearly transport-shaped (a rejected
// payload, a bad event key) is permanent and must not be retried.
function eventSendStatus(error: Error): number | null {
  const carried = (error as { status?: unknown; statusCode?: unknown }).status
    ?? (error as { statusCode?: unknown }).statusCode;
  if (typeof carried === "number") {
    return carried;
  }
  const match = /\b(?:status|code)\D{0,4}(\d{3})\b/i.exec(error.message);
  return match?.[1] ? Number(match[1]) : null;
}

function isTransientEventSendError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  if (error.name === "TimeoutError" || error.name === "AbortError") {
    return true;
  }
  if (error instanceof TypeError && /fetch/i.test(error.message)) {
    return true;
  }
  const status = eventSendStatus(error);
  return status === 429 || (status !== null && status >= 500 && status < 600);
}

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

  // The enrichment dispatches keep going through Inngest even inline, so they get the same
  // bounded retry the step bodies get. A dispatch that still fails is logged and swallowed: the
  // card this run produced is already stored, and failing the run over a missed enrichment
  // dispatch would report a completed profile to the user as a failure.
  const sendEvent = (async (id: unknown, payload: Parameters<typeof inngest.send>[0]) => {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await inngest.send(payload);
      } catch (error) {
        if (attempt < INLINE_TRANSIENT_ATTEMPTS && isTransientEventSendError(error)) {
          await new Promise((resolve) => setTimeout(resolve, INLINE_TRANSIENT_RETRY_PAUSE_MS));
          continue;
        }
        console.warn("[generation] inline event dispatch failed; continuing without it", {
          step: typeof id === "string" ? id : null,
          attempts: attempt
        }, error);
        return undefined;
      }
    }
  }) as GenerationStepTools["sendEvent"];

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
