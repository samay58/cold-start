import Anthropic from "@anthropic-ai/sdk";

// Classifies an error thrown from an LLM call (the Anthropic SDK path or the openai-compat
// adapter, packages/llm/src/openai-compat.ts) as a transient transport failure worth retrying at
// the Inngest step level, versus a semantic failure (bad content, schema mismatch) that should
// stay a memoized, non-retried step outcome. See apps/web/src/inngest/generation-helpers.ts
// (synthesizeCardStepBody, verifySynthesisStepBody) for the caller.
//
// Deliberately conservative: anything not clearly transport-shaped is treated as semantic.
// Over-classifying risks retrying a permanently-broken request (a bad schema, a content policy
// rejection) forever; under-classifying only costs one avoidable permanent failure during a real
// outage, which is the status quo this item is fixing.
const OPENAI_COMPAT_STATUS_PATTERN = /^openai-compat request failed with (\d+):/;

function isRetryableHttpStatus(status: number) {
  return status === 429 || (status >= 500 && status < 600);
}

export function isTransientLlmError(error: unknown): boolean {
  if (error instanceof Anthropic.APIError) {
    // APIConnectionError (network failure, including APIConnectionTimeoutError) and
    // APIUserAbortError both carry status === undefined. RateLimitError is 429;
    // InternalServerError covers every 5xx, including 529 "overloaded_error". The remaining 4xx
    // classes (bad request, auth, permission, not found, conflict, unprocessable entity) are
    // request-shaped, not transport-shaped, so they fall through to semantic.
    return error.status === undefined || error.status === 429 || error.status >= 500;
  }

  if (error instanceof Error) {
    // The openai-compat adapter throws a plain Error with the HTTP status baked into a message it
    // constructs itself, after its own in-process retry loop (3 attempts, short backoff) is
    // already exhausted (postChatCompletion in openai-compat.ts). This Inngest-level retry is a
    // second, longer-horizon layer for outages that outlast the in-process one.
    const statusMatch = OPENAI_COMPAT_STATUS_PATTERN.exec(error.message);
    if (statusMatch?.[1]) {
      return isRetryableHttpStatus(Number(statusMatch[1]));
    }

    // Raw network failures that escape postChatCompletion's own retry loop: Node's fetch throws
    // TypeError("fetch failed") on connection failures, and AbortSignal.timeout() rejects with a
    // DOMException named "TimeoutError" on request timeout.
    if (error.name === "TimeoutError" || error.name === "AbortError") {
      return true;
    }
    if (error instanceof TypeError && /fetch/i.test(error.message)) {
      return true;
    }
  }

  return false;
}
