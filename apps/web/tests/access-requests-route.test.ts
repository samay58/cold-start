import { createHash } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createDb: vi.fn(() => ({ kind: "db" })),
  createAccessRequest: vi.fn()
}));

vi.mock("@cold-start/db", () => ({
  createDb: mocks.createDb,
  createAccessRequest: mocks.createAccessRequest
}));

vi.mock("../src/lib/web-env", () => ({
  webEnv: () => ({
    DATABASE_URL: "postgres://user:pass@example.com/db"
  })
}));

const { POST } = await import("../src/app/api/access-requests/route");

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    name: "Ada Lovelace",
    email: "ada@example.com",
    note: "Would love to try this out.",
    company: "",
    ...overrides
  };
}

function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/access-requests", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body)
  });
}

describe("POST /api/access-requests", () => {
  beforeEach(() => {
    mocks.createDb.mockClear();
    mocks.createAccessRequest.mockReset();
  });

  it("returns the quiet success response when the honeypot is filled, without calling the repository", async () => {
    const response = await POST(request(validBody({ company: "acme corp" })));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mocks.createAccessRequest).not.toHaveBeenCalled();
  });

  it("rejects a missing name", async () => {
    const body = validBody() as Record<string, unknown>;
    delete body.name;

    const response = await POST(request(body));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ ok: false, error: "invalid" });
    expect(mocks.createAccessRequest).not.toHaveBeenCalled();
  });

  it("rejects a name over 120 characters", async () => {
    const response = await POST(request(validBody({ name: "a".repeat(121) })));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ ok: false, error: "invalid" });
    expect(mocks.createAccessRequest).not.toHaveBeenCalled();
  });

  it("rejects a note over 500 characters", async () => {
    const response = await POST(request(validBody({ note: "a".repeat(501) })));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ ok: false, error: "invalid" });
    expect(mocks.createAccessRequest).not.toHaveBeenCalled();
  });

  it("rejects an email that fails the required pattern", async () => {
    const response = await POST(request(validBody({ email: "not-an-email" })));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ ok: false, error: "invalid" });
    expect(mocks.createAccessRequest).not.toHaveBeenCalled();
  });

  it("rejects a malformed JSON body", async () => {
    const response = await POST(
      new Request("http://localhost/api/access-requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{not json"
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ ok: false, error: "invalid" });
    expect(mocks.createAccessRequest).not.toHaveBeenCalled();
  });

  it("returns 429 when the repository reports an IP rate limit", async () => {
    mocks.createAccessRequest.mockResolvedValue("rate_limited_ip");

    const response = await POST(request(validBody()));

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({ ok: false, error: "rate_limited" });
  });

  it("returns 429 when the repository reports an email rate limit", async () => {
    mocks.createAccessRequest.mockResolvedValue("rate_limited_email");

    const response = await POST(request(validBody()));

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({ ok: false, error: "rate_limited" });
  });

  it("creates the request and hashes the first forwarded-for hop", async () => {
    mocks.createAccessRequest.mockResolvedValue("created");

    const response = await POST(
      request(validBody(), { "x-forwarded-for": "203.0.113.5, 70.41.3.18" })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mocks.createAccessRequest).toHaveBeenCalledWith(
      { kind: "db" },
      {
        name: "Ada Lovelace",
        email: "ada@example.com",
        note: "Would love to try this out.",
        ipHash: sha256("203.0.113.5")
      }
    );
  });

  it("hashes the literal 'unknown' when x-forwarded-for is missing", async () => {
    mocks.createAccessRequest.mockResolvedValue("created");

    const response = await POST(request(validBody()));

    expect(response.status).toBe(200);
    expect(mocks.createAccessRequest).toHaveBeenCalledWith(
      { kind: "db" },
      expect.objectContaining({ ipHash: sha256("unknown") })
    );
  });

  it("trims whitespace from name, email, and note before storing", async () => {
    mocks.createAccessRequest.mockResolvedValue("created");

    const response = await POST(
      request(
        validBody({
          name: "  Ada Lovelace  ",
          email: "  ada@example.com  ",
          note: "  Would love to try this out.  "
        })
      )
    );

    expect(response.status).toBe(200);
    expect(mocks.createAccessRequest).toHaveBeenCalledWith(
      { kind: "db" },
      expect.objectContaining({
        name: "Ada Lovelace",
        email: "ada@example.com",
        note: "Would love to try this out."
      })
    );
  });

  it("lowercases the email before it reaches the repository, so the per-email rate limit can't be evaded by case", async () => {
    mocks.createAccessRequest.mockResolvedValue("created");

    const response = await POST(request(validBody({ email: "Bob@X.com" })));

    expect(response.status).toBe(200);
    expect(mocks.createAccessRequest).toHaveBeenCalledWith(
      { kind: "db" },
      expect.objectContaining({ email: "bob@x.com" })
    );
  });

  it("never sets a Server-Timing header, on any response shape", async () => {
    mocks.createAccessRequest.mockResolvedValue("created");

    const honeypotResponse = await POST(request(validBody({ company: "acme corp" })));
    const invalidResponse = await POST(request({ ...validBody(), name: undefined }));
    const createdResponse = await POST(request(validBody()));

    expect(honeypotResponse.headers.get("Server-Timing")).toBeNull();
    expect(invalidResponse.headers.get("Server-Timing")).toBeNull();
    expect(createdResponse.headers.get("Server-Timing")).toBeNull();
  });
});
