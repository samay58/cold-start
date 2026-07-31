import { createHash } from "node:crypto";

import {
  COLD_START_API_CONTRACT_VERSION,
  COLD_START_CLIENT_CONTRACT_HEADER
} from "@cold-start/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticateExtensionRequest: vi.fn(),
  countRecentAlphaInviteAttempts: vi.fn(),
  createDb: vi.fn(),
  execute: vi.fn(),
  getAlphaAllowanceSnapshot: vi.fn(),
  insertAlphaEvents: vi.fn(),
  recordAlphaInviteAttempt: vi.fn(),
  redeemAlphaInvite: vi.fn()
}));

mocks.createDb.mockReturnValue({ execute: mocks.execute });
mocks.countRecentAlphaInviteAttempts.mockResolvedValue(0);

vi.mock("@cold-start/db", () => ({
  countRecentAlphaInviteAttempts: mocks.countRecentAlphaInviteAttempts,
  createDb: mocks.createDb,
  getAlphaAllowanceSnapshot: mocks.getAlphaAllowanceSnapshot,
  insertAlphaEvents: mocks.insertAlphaEvents,
  recordAlphaInviteAttempt: mocks.recordAlphaInviteAttempt,
  redeemAlphaInvite: mocks.redeemAlphaInvite
}));

vi.mock("../src/lib/extension-auth", () => ({
  authenticateExtensionRequest: mocks.authenticateExtensionRequest
}));

vi.mock("../src/lib/web-env", () => ({
  webEnv: () => ({ DATABASE_URL: "postgres://example.test/cold-start" })
}));

const inspectRoute = await import("../src/app/api/alpha/invite/inspect/route");
const redeemRoute = await import("../src/app/api/alpha/invite/redeem/route");
const statusRoute = await import("../src/app/api/alpha/invite/status/route");
const inviteService = await import("../src/app/api/alpha/invite/invite-service");

const inviteToken = "i".repeat(32);

describe("alpha invitation routes", () => {
  beforeEach(() => {
    delete process.env.ALPHA_ACCESS_ENABLED;
    delete process.env.ALPHA_GENERATION_ENABLED;
    delete process.env.ALPHA_SUPPORTED_PREVIOUS_CLIENT_CONTRACTS;
    mocks.createDb.mockClear();
    mocks.createDb.mockReturnValue({ execute: mocks.execute });
    mocks.execute.mockReset();
    mocks.countRecentAlphaInviteAttempts.mockReset();
    mocks.countRecentAlphaInviteAttempts.mockResolvedValue(0);
    mocks.recordAlphaInviteAttempt.mockReset();
    mocks.insertAlphaEvents.mockReset();
    mocks.insertAlphaEvents.mockResolvedValue([]);
    mocks.redeemAlphaInvite.mockReset();
    mocks.authenticateExtensionRequest.mockReset();
    mocks.getAlphaAllowanceSnapshot.mockReset();
    mocks.getAlphaAllowanceSnapshot.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // The allowance figures are load-bearing before redemption: the disclosure panel in
  // src/app/alpha/AlphaInviteClient.tsx renders them ("This invitation includes N fresh profiles
  // and M Investor Lens runs") from this response, and falls back to a hardcoded 12/6 without
  // them, which would quietly misstate any invitation issued with different limits. Trimming them
  // needs the panel's copy moved to post-redeem data first.
  it("inspects a pending invitation without redeeming it", async () => {
    mocks.execute.mockResolvedValue({
      rows: [inviteRow({ status: "pending", claimed_installations: 0 })]
    });

    const response = await inspectRoute.POST(jsonRequest(
      "http://localhost/api/alpha/invite/inspect",
      { inviteToken }
    ));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      state: "ready",
      allowance: { profile: 12, lens: 6 }
    });
    expect(mocks.redeemAlphaInvite).not.toHaveBeenCalled();
  });

  it.each([
    ["expired", inviteRow({ expires_at: "2020-01-01T00:00:00.000Z" }), 410],
    ["revoked", inviteRow({ status: "revoked" }), 410],
    // A single-seat invitation that has spent its seat keeps answering "used". Only a multi-seat
    // invitation reaches "installation_limit".
    ["used", inviteRow({ status: "active", claimed_installations: 1 }), 409],
    [
      "installation_limit",
      inviteRow({ status: "active", max_installations: 2, claimed_installations: 2 }),
      409
    ]
  ])("reports a %s invitation without collapsing it to a generic error", async (code, row, status) => {
    mocks.execute.mockResolvedValue({ rows: [row] });

    const response = await inspectRoute.POST(jsonRequest(
      "http://localhost/api/alpha/invite/inspect",
      { inviteToken }
    ));

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toMatchObject({ ok: false, code });
  });

  it("still reads ready while a multi-seat invitation has a free seat", async () => {
    mocks.execute.mockResolvedValue({
      rows: [inviteRow({ status: "active", max_installations: 2, claimed_installations: 1 })]
    });

    const response = await inspectRoute.POST(jsonRequest(
      "http://localhost/api/alpha/invite/inspect",
      { inviteToken }
    ));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, state: "ready" });
  });

  it("keeps redemption disabled ahead of all database work", async () => {
    process.env.ALPHA_ACCESS_ENABLED = "false";

    const response = await redeemRoute.POST(jsonRequest(
      "http://localhost/api/alpha/invite/redeem",
      {
        inviteToken,
        browser: "chrome",
        channel: "unlisted",
        extensionVersion: "0.1.0",
        clientContract: COLD_START_API_CONTRACT_VERSION,
        consent: true,
        storeVisited: false,
        reducedMotion: false,
        theme: "light"
      }
    ));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ ok: false, code: "access_disabled" });
    expect(mocks.createDb).not.toHaveBeenCalled();
    expect(mocks.redeemAlphaInvite).not.toHaveBeenCalled();
  });

  it("keeps access disabled ahead of all database work", async () => {
    process.env.ALPHA_ACCESS_ENABLED = "false";

    const response = await inspectRoute.POST(jsonRequest(
      "http://localhost/api/alpha/invite/inspect",
      { inviteToken }
    ));

    expect(response.status).toBe(503);
    expect(mocks.createDb).not.toHaveBeenCalled();
  });

  it("redeems into a separate hashed credential and returns the raw credential only once", async () => {
    mocks.redeemAlphaInvite.mockResolvedValue({
      installation: { id: "6a50d643-83dd-42e0-9eb9-45c7aaa1b2c3" },
      invite: {
        id: "b4f48495-c594-48ab-815c-fc62d45caa91",
        profileLimit: 12,
        lensLimit: 6
      }
    });

    const response = await redeemRoute.POST(jsonRequest(
      "http://localhost/api/alpha/invite/redeem",
      {
        inviteToken,
        browser: "chrome",
        channel: "unlisted",
        extensionVersion: "0.1.0",
        clientContract: COLD_START_API_CONTRACT_VERSION,
        consent: true,
        storeVisited: true,
        reducedMotion: true,
        theme: "dark"
      },
      {
        [COLD_START_CLIENT_CONTRACT_HEADER]: COLD_START_API_CONTRACT_VERSION
      }
    ));
    const body = await response.json() as {
      accessToken: string;
      installationSuffix: string;
    };

    expect(response.status).toBe(200);
    expect(body.accessToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(body.accessToken).not.toBe(inviteToken);
    expect(body.installationSuffix).toBe("a1b2c3");
    expect(JSON.stringify(body)).not.toContain("6a50d643-83dd-42e0-9eb9-45c7aaa1b2c3");
    expect(JSON.stringify(body)).not.toContain("b4f48495-c594-48ab-815c-fc62d45caa91");
    expect(mocks.redeemAlphaInvite).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tokenHash: createHash("sha256").update(inviteToken).digest("hex"),
        accessTokenHash: createHash("sha256").update(body.accessToken).digest("hex")
      })
    );
    expect(mocks.insertAlphaEvents).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        inviteId: "b4f48495-c594-48ab-815c-fc62d45caa91",
        installationId: "6a50d643-83dd-42e0-9eb9-45c7aaa1b2c3",
        events: [
          expect.objectContaining({
            eventName: "invite.accepted",
            sequence: 0,
            surface: "invite",
            theme: "dark",
            reducedMotion: true,
            properties: {}
          }),
          expect.objectContaining({
            eventName: "invite.store_clicked",
            sequence: 1,
            properties: {}
          }),
          expect.objectContaining({
            eventName: "installation.connected",
            sequence: 2,
            properties: {}
          })
        ]
      })
    );
    const analyticsInput = mocks.insertAlphaEvents.mock.calls[0]?.[1];
    expect(JSON.stringify(analyticsInput?.events)).not.toContain("inviteId");
    expect(JSON.stringify(analyticsInput?.events)).not.toContain("installationId");
  });

  it("returns the persisted allowance when a repaired installation reconnects", async () => {
    mocks.redeemAlphaInvite.mockResolvedValue({
      installation: { id: "6a50d643-83dd-42e0-9eb9-45c7aaa1b2c3" },
      invite: {
        id: "b4f48495-c594-48ab-815c-fc62d45caa91",
        profileLimit: 12,
        lensLimit: 6
      }
    });
    mocks.getAlphaAllowanceSnapshot.mockResolvedValue({
      inviteId: "b4f48495-c594-48ab-815c-fc62d45caa91",
      profile: { limit: 12, remaining: 7 },
      lens: { limit: 6, remaining: 4 },
      updatedAt: new Date("2026-07-29T12:00:00.000Z")
    });

    const response = await redeemRoute.POST(jsonRequest(
      "http://localhost/api/alpha/invite/redeem",
      {
        inviteToken,
        browser: "firefox",
        channel: "unlisted",
        extensionVersion: "0.2.2",
        clientContract: COLD_START_API_CONTRACT_VERSION,
        consent: true,
        storeVisited: false,
        reducedMotion: false,
        theme: "light"
      }
    ));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      allowance: {
        profile: { limit: 12, remaining: 7 },
        lens: { limit: 6, remaining: 4 }
      }
    });
    expect(mocks.getAlphaAllowanceSnapshot).toHaveBeenCalledWith(
      expect.anything(),
      "b4f48495-c594-48ab-815c-fc62d45caa91"
    );
  });

  it("redeems a Firefox installation (the panel redeems directly; Firefox has no page-to-extension messaging)", async () => {
    mocks.redeemAlphaInvite.mockResolvedValue({
      installation: { id: "6a50d643-83dd-42e0-9eb9-45c7aaa1b2c3" },
      invite: {
        id: "b4f48495-c594-48ab-815c-fc62d45caa91",
        profileLimit: 12,
        lensLimit: 6
      }
    });

    const response = await redeemRoute.POST(jsonRequest(
      "http://localhost/api/alpha/invite/redeem",
      {
        inviteToken,
        browser: "firefox",
        channel: "unlisted",
        extensionVersion: "0.2.2",
        clientContract: COLD_START_API_CONTRACT_VERSION,
        consent: true,
        storeVisited: false,
        reducedMotion: false,
        theme: "light"
      },
      {
        [COLD_START_CLIENT_CONTRACT_HEADER]: COLD_START_API_CONTRACT_VERSION
      }
    ));

    expect(response.status).toBe(200);
    expect(mocks.redeemAlphaInvite).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ browser: "firefox" })
    );
  });

  it("does not redeem or write events without explicit consent", async () => {
    const response = await redeemRoute.POST(jsonRequest(
      "http://localhost/api/alpha/invite/redeem",
      {
        inviteToken,
        browser: "chrome",
        channel: "unlisted",
        extensionVersion: "0.1.0",
        clientContract: COLD_START_API_CONTRACT_VERSION,
        consent: false,
        storeVisited: false,
        reducedMotion: false,
        theme: "light"
      }
    ));

    expect(response.status).toBe(400);
    expect(mocks.redeemAlphaInvite).not.toHaveBeenCalled();
    expect(mocks.insertAlphaEvents).not.toHaveBeenCalled();
  });

  it("rejects a client outside the supported compatibility window before redemption", async () => {
    const response = await redeemRoute.POST(jsonRequest(
      "http://localhost/api/alpha/invite/redeem",
      {
        inviteToken,
        browser: "chrome",
        channel: "unlisted",
        extensionVersion: "0.0.1",
        clientContract: "retired-contract",
        consent: true,
        storeVisited: false,
        reducedMotion: false,
        theme: "light"
      }
    ));

    expect(response.status).toBe(426);
    await expect(response.json()).resolves.toMatchObject({ ok: false, code: "update_required" });
    expect(mocks.redeemAlphaInvite).not.toHaveBeenCalled();
  });

  it("returns allowance and generation posture only for an alpha principal", async () => {
    mocks.authenticateExtensionRequest.mockResolvedValue({
      ok: true,
      principal: {
        kind: "alpha",
        inviteId: "invite-1",
        installationId: "6a50d643-83dd-42e0-9eb9-45c7aaa1b2c3",
        scopes: ["cards:read", "generation:write", "events:write"]
      }
    });
    mocks.getAlphaAllowanceSnapshot.mockResolvedValue({
      profile: { limit: 12, reserved: 1, used: 3, remaining: 8 },
      lens: { limit: 6, reserved: 0, used: 2, remaining: 4 }
    });

    const response = await statusRoute.POST(jsonRequest(
      "http://localhost/api/alpha/invite/status",
      { clientContract: COLD_START_API_CONTRACT_VERSION },
      {
        [COLD_START_CLIENT_CONTRACT_HEADER]: COLD_START_API_CONTRACT_VERSION
      }
    ));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      ok: true,
      state: "connected",
      installationSuffix: "a1b2c3",
      compatibility: "current",
      generationEnabled: true,
      allowance: {
        profile: { limit: 12, remaining: 8 },
        lens: { limit: 6, remaining: 4 }
      }
    });
    expect(JSON.stringify(body)).not.toContain("6a50d643-83dd-42e0-9eb9-45c7aaa1b2c3");
    expect(JSON.stringify(body)).not.toContain("invite-1");
  });
});

function jsonRequest(url: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers
    },
    body: JSON.stringify(body)
  });
}

function inviteRow(overrides: Record<string, unknown> = {}) {
  return {
    status: "pending",
    expires_at: "2099-01-01T00:00:00.000Z",
    profile_limit: 12,
    lens_limit: 6,
    max_installations: 1,
    claimed_installations: 0,
    ...overrides
  };
}

describe("alphaInviteRequestSchema token shapes", () => {
  it("accepts a three-word invite code in the redeem schema", () => {
    const parsed = inviteService.alphaInviteRequestSchema.safeParse({ inviteToken: "ember-quarto-lark" });
    expect(parsed.success).toBe(true);
  });

  it("still accepts a legacy 43-char token", () => {
    const parsed = inviteService.alphaInviteRequestSchema.safeParse({
      inviteToken: "Xk3jP9qLm2vR8tYw4nZbF6hD1cAeG7sUoI5xKdMpQrE"
    });
    expect(parsed.success).toBe(true);
  });
});

describe("alpha invite failure breaker", () => {
  beforeEach(() => {
    delete process.env.ALPHA_ACCESS_ENABLED;
    mocks.createDb.mockClear();
    mocks.createDb.mockReturnValue({ execute: mocks.execute });
    mocks.execute.mockReset();
    mocks.countRecentAlphaInviteAttempts.mockReset();
    mocks.recordAlphaInviteAttempt.mockReset();
  });

  it("opens the breaker after 10 invalid attempts in the window", async () => {
    let attempts = 0;
    mocks.recordAlphaInviteAttempt.mockImplementation(async () => { attempts += 1; });
    mocks.countRecentAlphaInviteAttempts.mockImplementation(async () => attempts);
    const db = mocks.createDb();
    for (let i = 0; i < 10; i += 1) {
      await inviteService.recordInvalidInviteAttempt(db);
    }
    expect(await inviteService.alphaInviteBreakerOpen(db)).toBe(true);
  });

  it("keeps the breaker closed for a quiet window", async () => {
    mocks.countRecentAlphaInviteAttempts.mockResolvedValue(0);
    expect(await inviteService.alphaInviteBreakerOpen(mocks.createDb())).toBe(false);
  });

  it("records invalid attempts on inspect and answers 429 once the window fills", async () => {
    let attempts = 0;
    mocks.recordAlphaInviteAttempt.mockImplementation(async () => { attempts += 1; });
    mocks.countRecentAlphaInviteAttempts.mockImplementation(async () => attempts);
    mocks.execute.mockResolvedValue({ rows: [] });

    for (let i = 0; i < 10; i += 1) {
      const response = await inspectRoute.POST(jsonRequest(
        "http://localhost/api/alpha/invite/inspect",
        { inviteToken }
      ));
      expect(response.status).toBe(404);
    }
    expect(attempts).toBe(10);

    const blocked = await inspectRoute.POST(jsonRequest(
      "http://localhost/api/alpha/invite/inspect",
      { inviteToken }
    ));
    expect(blocked.status).toBe(429);
    await expect(blocked.json()).resolves.toMatchObject({ error: "too_many_attempts" });
  });
});
