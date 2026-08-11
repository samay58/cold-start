import { describe, expect, it } from "vitest";

import { readBoundedJson } from "../src/lib/bounded-json";

function request(body: BodyInit, headers: Record<string, string> = {}) {
  return new Request("http://localhost/test", {
    method: "POST",
    body,
    headers,
    duplex: "half"
  } as RequestInit & { duplex: "half" });
}

describe("readBoundedJson", () => {
  it("accepts a bounded body without Content-Length", async () => {
    await expect(readBoundedJson(request('{"ok":true}'), 32)).resolves.toEqual({
      ok: true,
      value: { ok: true }
    });
  });

  it("rejects a declared oversize body before reading", async () => {
    await expect(readBoundedJson(request("{}", { "content-length": "33" }), 32)).resolves.toEqual({
      ok: false,
      reason: "too_large"
    });
  });

  it("rejects an understated Content-Length when streamed bytes cross the cap", async () => {
    await expect(
      readBoundedJson(request(`{"value":"${"x".repeat(40)}"}`, { "content-length": "2" }), 32)
    ).resolves.toEqual({ ok: false, reason: "too_large" });
  });

  it("rejects an oversize chunked stream", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"value":"'));
        controller.enqueue(new TextEncoder().encode("x".repeat(40)));
        controller.enqueue(new TextEncoder().encode('"}'));
        controller.close();
      }
    });
    await expect(readBoundedJson(request(stream), 32)).resolves.toEqual({ ok: false, reason: "too_large" });
  });

  it("rejects malformed JSON", async () => {
    await expect(readBoundedJson(request("{bad"), 32)).resolves.toEqual({
      ok: false,
      reason: "invalid_json"
    });
  });
});
