import { createHash } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import { trustedClientAddress, trustedClientHash } from "../src/lib/client-identity";

afterEach(() => {
  delete process.env.VERCEL;
  process.env.NODE_ENV = "test";
});

describe("trustedClientAddress", () => {
  it("uses Vercel's unspoofable forwarding header in production", () => {
    process.env.NODE_ENV = "production";
    const headers = new Headers({
      "x-forwarded-for": "198.51.100.2",
      "x-vercel-forwarded-for": "203.0.113.5"
    });
    expect(trustedClientAddress(headers)).toBe("203.0.113.5");
  });

  it("does not trust x-forwarded-for in production when the Vercel header is absent", () => {
    process.env.NODE_ENV = "production";
    const headers = new Headers({ "x-forwarded-for": "198.51.100.2" });
    expect(trustedClientAddress(headers)).toBeNull();
    expect(trustedClientHash(headers)).toBeNull();
  });

  it("allows the first forwarded hop in local tests", () => {
    expect(trustedClientAddress(new Headers({ "x-forwarded-for": "203.0.113.5, 70.41.3.18" }))).toBe(
      "203.0.113.5"
    );
  });

  it("hashes a namespaced canonical identity", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.5" });
    expect(trustedClientHash(headers)).toBe(
      createHash("sha256").update("cold-start-client-v1:203.0.113.5").digest("hex")
    );
  });

  it("uses loopback for a local request with no forwarding headers", () => {
    expect(trustedClientAddress(new Headers())).toBe("127.0.0.1");
  });
});
