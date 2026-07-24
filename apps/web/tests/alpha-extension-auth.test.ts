import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { findInstallation, touchInstallation } = vi.hoisted(() => ({
  findInstallation: vi.fn(),
  touchInstallation: vi.fn()
}));

vi.mock("@cold-start/db", async (importOriginal) => {
  const original = await importOriginal<typeof import("@cold-start/db")>();
  return {
    ...original,
    findActiveAlphaInstallationByTokenHash: findInstallation,
    touchAlphaInstallation: touchInstallation
  };
});

import {
  authenticateExtensionRequest,
  principalHasScope
} from "../src/lib/extension-auth";
import type { ColdStartDb } from "@cold-start/db";

const originalEnv = { ...process.env };
const db = {} as ColdStartDb;

function headers(token: string) {
  return new Headers({
    authorization: `Bearer ${token}`,
    origin: "chrome-extension://prod-id",
    "x-cold-start-extension-id": "prod-id",
    "x-cold-start-extension-version": "0.2.0"
  });
}

describe("alpha extension authentication", () => {
  beforeEach(() => {
    process.env.NODE_ENV = "production";
    process.env.ALLOWED_EXTENSION_ORIGINS = "chrome-extension://prod-id";
    process.env.ALLOWED_EXTENSION_IDS = "prod-id";
    process.env.EXTENSION_API_TOKEN = "operator-token";
    delete process.env.EXTENSION_API_TOKENS;
    delete process.env.ALPHA_ACCESS_ENABLED;
    findInstallation.mockReset();
    touchInstallation.mockReset().mockResolvedValue(true);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns the transitional operator as a separate principal", async () => {
    await expect(authenticateExtensionRequest(headers("operator-token"), db)).resolves.toEqual({
      ok: true,
      principal: {
        kind: "operator",
        inviteId: null,
        installationId: null,
        scopes: ["operator"]
      }
    });
    expect(findInstallation).not.toHaveBeenCalled();
  });

  it("hashes a valid per-install credential and derives identity from storage", async () => {
    findInstallation.mockResolvedValue({
      installation: {
        id: "installation-1",
        inviteId: "invite-1",
        browser: "chrome",
        channel: "unlisted",
        extensionVersion: "0.1.0",
        connectedAt: new Date(),
        lastSeenAt: new Date()
      },
      invite: {
        id: "invite-1",
        label: "Friend",
        status: "active",
        scopes: ["cards:read", "generation:write", "events:write"],
        expiresAt: new Date(Date.now() + 60_000),
        profileLimit: 12,
        lensLimit: 6
      }
    });

    await expect(authenticateExtensionRequest(headers("installation-secret"), db)).resolves.toEqual({
      ok: true,
      principal: {
        kind: "alpha",
        inviteId: "invite-1",
        installationId: "installation-1",
        scopes: ["cards:read", "generation:write", "events:write"]
      }
    });
    expect(findInstallation).toHaveBeenCalledWith(
      db,
      createHash("sha256").update("installation-secret").digest("hex")
    );
    expect(touchInstallation).toHaveBeenCalledWith(db, "installation-1", {
      extensionVersion: "0.2.0"
    });
  });

  it("pauses alpha access without disabling the operator principal", async () => {
    process.env.ALPHA_ACCESS_ENABLED = "false";

    await expect(authenticateExtensionRequest(headers("installation-secret"), db)).resolves.toEqual({
      ok: false,
      status: 503,
      error: "alpha access is temporarily paused",
      code: "access_disabled"
    });
    await expect(authenticateExtensionRequest(headers("operator-token"), db)).resolves.toMatchObject({
      ok: true,
      principal: { kind: "operator" }
    });
  });

  it("returns repairable auth copy for a revoked or unknown installation", async () => {
    findInstallation.mockResolvedValue(null);

    await expect(authenticateExtensionRequest(headers("revoked-secret"), db)).resolves.toEqual({
      ok: false,
      status: 401,
      error: "extension connection needs repair",
      code: "authentication"
    });
  });

  it("keeps operator access separate while enforcing alpha scopes", () => {
    expect(principalHasScope({
      kind: "operator",
      inviteId: null,
      installationId: null,
      scopes: ["operator"]
    }, "generation:write")).toBe(true);
    expect(principalHasScope({
      kind: "alpha",
      inviteId: "invite-1",
      installationId: "installation-1",
      scopes: ["cards:read"]
    }, "cards:read")).toBe(true);
    expect(principalHasScope({
      kind: "alpha",
      inviteId: "invite-1",
      installationId: "installation-1",
      scopes: ["cards:read"]
    }, "generation:write")).toBe(false);
  });
});
