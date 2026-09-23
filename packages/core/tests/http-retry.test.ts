import { describe, expect, it } from "vitest";
import { isRetryableHttpStatus, retryAfterMs } from "../src/index";

describe("isRetryableHttpStatus", () => {
  it("retries 429 and every 5xx, nothing else", () => {
    expect([429, 500, 503, 529, 599].every(isRetryableHttpStatus)).toBe(true);
    expect([200, 400, 401, 402, 403, 404, 600].some(isRetryableHttpStatus)).toBe(false);
  });
});

describe("retryAfterMs", () => {
  const response = (retryAfter?: string) =>
    new Response(null, { status: 429, headers: retryAfter === undefined ? {} : { "retry-after": retryAfter } });

  it("reads numeric seconds and caps them at ten seconds", () => {
    expect(retryAfterMs(response("2"), 500)).toBe(2000);
    expect(retryAfterMs(response("60"), 500)).toBe(10_000);
  });

  it("falls back on a missing, zero, or non-numeric header", () => {
    expect(retryAfterMs(response(), 500)).toBe(500);
    expect(retryAfterMs(response("0"), 500)).toBe(500);
    expect(retryAfterMs(response("Wed, 21 Oct 2026 07:28:00 GMT"), 500)).toBe(500);
  });
});
