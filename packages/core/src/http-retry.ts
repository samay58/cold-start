// Shared retry rules for provider HTTP calls (Direct Exa and the OpenAI-compat LLM adapter):
// a 429 or any 5xx is transient; every other status is the request's own fault and never retries.
export function isRetryableHttpStatus(status: number) {
  return status === 429 || (status >= 500 && status < 600);
}

// Honors a numeric Retry-After header, capped at ten seconds so one slow provider cannot stall a
// step. HTTP-date values and missing or non-positive headers fall back to the caller's backoff.
export function retryAfterMs(response: Response, fallbackMs: number) {
  const header = response.headers.get("retry-after");
  if (!header) {
    return fallbackMs;
  }
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds > 0) {
    return Math.min(seconds * 1000, 10_000);
  }
  return fallbackMs;
}
