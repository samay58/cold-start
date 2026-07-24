import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  createDb: vi.fn(() => ({ kind: "db" })),
  insertEvents: vi.fn()
}));

vi.mock("@cold-start/db", () => ({
  AlphaEventRateLimitError: class AlphaEventRateLimitError extends Error {},
  createDb: mocks.createDb,
  insertAlphaEvents: mocks.insertEvents
}));

vi.mock("../src/lib/extension-auth", () => ({
  authenticateExtensionRequest: mocks.authenticate,
  principalHasScope: (
    principal: { kind: string; scopes: readonly string[] },
    scope: string
  ) => principal.kind === "operator" || principal.scopes.includes(scope)
}));

vi.mock("../src/lib/web-env", () => ({
  webEnv: () => ({
    DATABASE_URL: "postgres://user:pass@example.com/db",
    NEXT_PUBLIC_WEB_ORIGIN: "http://localhost:3000"
  })
}));

const { POST } = await import("../src/app/api/alpha/events/route");

function event() {
  return {
    eventId: "event-1",
    eventName: "panel.opened",
    schemaVersion: 1,
    occurredAt: "2026-07-24T12:00:00.000Z",
    sessionId: "session-1",
    sequence: 1,
    context: {
      extensionVersion: "0.2.0",
      browser: "chrome",
      installChannel: "unlisted",
      surface: "side_panel",
      theme: "light",
      reducedMotion: false,
      online: true
    },
    properties: {}
  };
}

function request(body: unknown) {
  return new Request("http://localhost/api/alpha/events", {
    method: "POST",
    headers: {
      authorization: "Bearer installation-secret",
      "content-type": "application/json",
      "x-cold-start-extension-id": "extension-id"
    },
    body: JSON.stringify(body)
  });
}

describe("POST /api/alpha/events", () => {
  beforeEach(() => {
    mocks.authenticate.mockReset().mockResolvedValue({
      ok: true,
      principal: {
        kind: "alpha",
        inviteId: "invite-1",
        installationId: "installation-1",
        scopes: ["events:write"]
      }
    });
    mocks.insertEvents.mockReset().mockResolvedValue(["event-1"]);
  });

  it("derives identity from auth and acknowledges only persisted event IDs", async () => {
    const response = await POST(request({ events: [event()] }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      acknowledgedEventIds: ["event-1"]
    });
    expect(mocks.insertEvents).toHaveBeenCalledWith(
      { kind: "db" },
      expect.objectContaining({
        inviteId: "invite-1",
        installationId: "installation-1"
      })
    );
  });

  it("rejects spoofed client identity before storage", async () => {
    const response = await POST(request({
      events: [{ ...event(), inviteId: "spoofed-invite" }]
    }));

    expect(response.status).toBe(400);
    expect(mocks.insertEvents).not.toHaveBeenCalled();
  });

  it("does not accept the transitional operator token for tester analytics", async () => {
    mocks.authenticate.mockResolvedValue({
      ok: true,
      principal: {
        kind: "operator",
        inviteId: null,
        installationId: null,
        scopes: ["operator"]
      }
    });

    const response = await POST(request({ events: [event()] }));
    expect(response.status).toBe(403);
    expect(mocks.insertEvents).not.toHaveBeenCalled();
  });

  it("rejects an alpha installation without event permission", async () => {
    mocks.authenticate.mockResolvedValue({
      ok: true,
      principal: {
        kind: "alpha",
        inviteId: "invite-1",
        installationId: "installation-1",
        scopes: ["cards:read"]
      }
    });

    const response = await POST(request({ events: [event()] }));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: "authorization" });
    expect(mocks.insertEvents).not.toHaveBeenCalled();
  });

  it("rejects a body larger than 64 KB", async () => {
    const response = await POST(request({
      events: [{ ...event(), properties: { padding: "x".repeat(70_000) } }]
    }));

    expect(response.status).toBe(413);
    expect(mocks.insertEvents).not.toHaveBeenCalled();
  });

  it("returns a retryable response when the installation event rate is exceeded", async () => {
    const { AlphaEventRateLimitError } = await import("@cold-start/db");
    mocks.insertEvents.mockRejectedValue(new AlphaEventRateLimitError());

    const response = await POST(request({ events: [event()] }));

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
    await expect(response.json()).resolves.toMatchObject({ code: "rate_limited" });
  });
});
