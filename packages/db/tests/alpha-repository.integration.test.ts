import { createHash, randomUUID } from "node:crypto";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { ColdStartDb } from "../src/client";
import {
  AlphaEventRateLimitError,
  createAlphaInvite,
  deleteAlphaTesterData,
  findActiveAlphaInstallationByTokenHash,
  findAlphaInviteById,
  getAlphaAllowanceSnapshot,
  insertAlphaEvents,
  pruneAlphaEvents,
  recordAlphaRunDisposition,
  redeemAlphaInvite,
  reserveAlphaRunRequest,
  revokeAlphaInstallation,
  revokeAlphaInvite,
  settleAlphaRunRequest
} from "../src/repositories/alpha";
import * as schema from "../src/schema";

const databaseUrl = process.env.ALPHA_DB_TEST_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;
let pool: Pool;
let db: ColdStartDb;

describeDatabase("alpha repositories against Postgres", () => {
  beforeAll(async () => {
    assertSafeTestDatabase(databaseUrl);
    pool = new Pool({ connectionString: databaseUrl });
    const testDb = drizzle(pool, { schema });
    db = testDb as ColdStartDb;
    await migrate(testDb, {
      migrationsFolder: new URL("../drizzle", import.meta.url).pathname
    });
  }, 30_000);

  afterAll(async () => {
    await pool?.end();
  });

  it("redeems an invite once, authenticates the installation, and revokes it", async () => {
    const now = new Date("2026-07-24T12:00:00.000Z");
    const invite = await createAlphaInvite(db, {
      label: `auth-${randomUUID()}`,
      tokenHash: hashChar("a"),
      scopes: ["cards:read", "generation:write"],
      expiresAt: new Date("2026-07-31T12:00:00.000Z"),
      now
    });

    const auth = await redeemAlphaInvite(db, {
      tokenHash: hashChar("a"),
      accessTokenHash: hashChar("b"),
      browser: "chrome",
      channel: "unlisted",
      extensionVersion: "0.2.0",
      now
    });
    expect(auth?.invite.id).toBe(invite.id);
    expect(auth?.invite.scopes).toEqual(["cards:read", "generation:write"]);

    const replay = await redeemAlphaInvite(db, {
      tokenHash: hashChar("a"),
      accessTokenHash: hashChar("c"),
      browser: "chrome",
      channel: "unlisted",
      extensionVersion: "0.2.0",
      now
    });
    expect(replay).toBeNull();

    const lookup = await findActiveAlphaInstallationByTokenHash(db, hashChar("b"), now);
    expect(lookup?.installation.id).toBe(auth?.installation.id);
    expect(await getAlphaAllowanceSnapshot(db, invite.id)).toMatchObject({
      profile: { limit: 12, reserved: 0, used: 0, remaining: 12 },
      lens: { limit: 6, reserved: 0, used: 0, remaining: 6 }
    });

    expect(await revokeAlphaInstallation(db, auth!.installation.id, now)).toBe(true);
    expect(await findActiveAlphaInstallationByTokenHash(db, hashChar("b"), now)).toBeNull();
    expect(await deleteAlphaTesterData(db, invite.id)).toBe(true);
  });

  it("gives a two-seat invitation a second installation with its own credential, then stops", async () => {
    const tokenHash = hashSeed("two-seat-invite");
    const now = new Date("2026-07-24T12:00:00.000Z");
    const later = new Date("2026-07-25T09:00:00.000Z");
    const invite = await createAlphaInvite(db, {
      label: `two-seat-${randomUUID()}`,
      tokenHash,
      scopes: ["cards:read", "generation:write"],
      expiresAt: new Date("2026-07-31T12:00:00.000Z"),
      maxInstallations: 2,
      now
    });

    const redeem = (accessTokenHash: string, at: Date) =>
      redeemAlphaInvite(db, {
        tokenHash,
        accessTokenHash,
        browser: "chrome",
        channel: "unlisted",
        extensionVersion: "0.2.0",
        now: at
      });

    const first = await redeem(hashSeed("two-seat-first"), now);
    const second = await redeem(hashSeed("two-seat-second"), later);

    expect(first?.invite.id).toBe(invite.id);
    expect(second?.invite.id).toBe(invite.id);
    expect(second?.installation.id).toBeTruthy();
    expect(second?.installation.id).not.toBe(first?.installation.id);

    // Each browser authenticates on its own credential.
    expect((await findActiveAlphaInstallationByTokenHash(db, hashSeed("two-seat-first"), later))?.installation.id)
      .toBe(first?.installation.id);
    expect((await findActiveAlphaInstallationByTokenHash(db, hashSeed("two-seat-second"), later))?.installation.id)
      .toBe(second?.installation.id);

    // Only the pending-to-active transition stamps accepted_at, so the second seat leaves it be.
    const stored = await findAlphaInviteById(db, invite.id);
    expect(stored?.status).toBe("active");
    expect(stored?.acceptedAt?.toISOString()).toBe(now.toISOString());

    // One allowance for the invitation, not one per seat, and the second redemption spends none.
    expect(await getAlphaAllowanceSnapshot(db, invite.id)).toMatchObject({
      profile: { limit: 12, reserved: 0, used: 0, remaining: 12 },
      lens: { limit: 6, reserved: 0, used: 0, remaining: 6 }
    });

    expect(await redeem(hashSeed("two-seat-third"), later)).toBeNull();
    const installations = await pool.query(
      "select count(*)::int as count from alpha_installations where invite_id = $1",
      [invite.id]
    );
    expect(installations.rows[0]?.count).toBe(2);

    await deleteAlphaTesterData(db, invite.id);
  });

  // Eight callers at once, because the seat gate has to hold against a race and not just against
  // a sequential replay. Written as one CTE it did not: the count ran against a snapshot taken
  // before the advisory lock was granted, and a two-seat invitation handed out four installations.
  it.each([1, 2])("stops eight concurrent redemptions exactly at %i seat(s)", async (maxInstallations) => {
    const tokenHash = hashSeed(`concurrent-seat-invite-${maxInstallations}`);
    const now = new Date("2026-07-24T12:00:00.000Z");
    const invite = await createAlphaInvite(db, {
      label: `concurrent-seat-${randomUUID()}`,
      tokenHash,
      scopes: ["cards:read"],
      expiresAt: new Date("2026-07-31T12:00:00.000Z"),
      maxInstallations,
      now
    });

    const results = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        redeemAlphaInvite(db, {
          tokenHash,
          accessTokenHash: hashSeed(`concurrent-seat-${maxInstallations}-${index}`),
          browser: "chrome",
          channel: "unlisted",
          extensionVersion: "0.2.0",
          now
        })
      )
    );

    const granted = results.filter((result) => result !== null);
    expect(granted).toHaveLength(maxInstallations);
    expect(new Set(granted.map((result) => result!.installation.id)).size).toBe(maxInstallations);

    const installations = await pool.query(
      "select count(*)::int as count from alpha_installations where invite_id = $1",
      [invite.id]
    );
    expect(installations.rows[0]?.count).toBe(maxInstallations);

    await deleteAlphaTesterData(db, invite.id);
  });

  it("returns a revoked seat to its invitation without restoring the old credential", async () => {
    const tokenHash = hashSeed("revoked-seat-invite");
    const now = new Date("2026-07-24T12:00:00.000Z");
    const invite = await createAlphaInvite(db, {
      label: `revoked-seat-${randomUUID()}`,
      tokenHash,
      scopes: ["cards:read"],
      expiresAt: new Date("2026-07-31T12:00:00.000Z"),
      now
    });

    const auth = await redeemAlphaInvite(db, {
      tokenHash,
      accessTokenHash: hashSeed("revoked-seat-first"),
      browser: "chrome",
      channel: "unlisted",
      extensionVersion: "0.2.0",
      now
    });
    expect(await revokeAlphaInstallation(db, auth!.installation.id, now)).toBe(true);

    const repaired = await redeemAlphaInvite(db, {
      tokenHash,
      accessTokenHash: hashSeed("revoked-seat-second"),
      browser: "chrome",
      channel: "unlisted",
      extensionVersion: "0.2.0",
      now
    });

    expect(repaired?.invite.id).toBe(invite.id);
    expect(repaired?.installation.id).not.toBe(auth?.installation.id);
    expect(await findActiveAlphaInstallationByTokenHash(
      db,
      hashSeed("revoked-seat-first"),
      now
    )).toBeNull();
    expect((await findActiveAlphaInstallationByTokenHash(
      db,
      hashSeed("revoked-seat-second"),
      now
    ))?.installation.id).toBe(repaired?.installation.id);

    const installations = await pool.query(
      `select count(*)::int as total,
              count(*) filter (where revoked_at is null)::int as active
       from alpha_installations
       where invite_id = $1`,
      [invite.id]
    );
    expect(installations.rows[0]).toMatchObject({ total: 2, active: 1 });

    expect(await revokeAlphaInvite(db, invite.id, now)).toBe(true);
    expect(await redeemAlphaInvite(db, {
      tokenHash,
      accessTokenHash: hashSeed("revoked-seat-third"),
      browser: "chrome",
      channel: "unlisted",
      extensionVersion: "0.2.0",
      now
    })).toBeNull();

    await deleteAlphaTesterData(db, invite.id);
  });

  it("stops 50 concurrent reservations exactly at the allowance limit", async () => {
    const fixture = await connectedInvite(12, hashChar("d"), hashChar("e"));
    const prefix = randomUUID().slice(0, 8);
    const results = await Promise.all(
      Array.from({ length: 50 }, (_, index) =>
        reserveAlphaRunRequest(db, {
          inviteId: fixture.inviteId,
          installationId: fixture.installationId,
          interactionId: randomUUID(),
          kind: "profile",
          slug: `${prefix}-${index}`,
          domain: `${prefix}-${index}.example`,
          now: fixture.now
        })
      )
    );

    expect(results.filter((result) => result.disposition === "started")).toHaveLength(12);
    expect(results.filter((result) => result.disposition === "rejected")).toHaveLength(38);
    expect(results.filter((result) => result.debited)).toHaveLength(12);
    expect(await getAlphaAllowanceSnapshot(db, fixture.inviteId)).toMatchObject({
      profile: { limit: 12, reserved: 12, used: 0, remaining: 0 }
    });

    const ledger = await pool.query(
      `select entry_kind, count(*)::int as count
       from alpha_allowance_ledger
       where invite_id = $1
       group by entry_kind`,
      [fixture.inviteId]
    );
    expect(ledger.rows).toEqual([{ entry_kind: "debit", count: 12 }]);
    await deleteAlphaTesterData(db, fixture.inviteId);
  }, 30_000);

  it("deduplicates an interaction and refunds a failed run exactly once", async () => {
    const fixture = await connectedInvite(1, hashChar("f"), hashChar("1"));
    const interactionId = randomUUID();
    const reservationResults = await Promise.all(
      Array.from({ length: 20 }, () =>
        reserveAlphaRunRequest(db, {
          inviteId: fixture.inviteId,
          installationId: fixture.installationId,
          interactionId,
          kind: "profile",
          slug: `refund-${fixture.inviteId}`,
          domain: `refund-${fixture.inviteId}.example`,
          now: fixture.now
        })
      )
    );
    expect(new Set(reservationResults.map((result) => result.requestId)).size).toBe(1);
    expect(reservationResults.every((result) => result.debited)).toBe(true);

    const generationRunId = reservationResults[0]!.generationRunId!;
    const settlements = await Promise.all(
      Array.from({ length: 20 }, () =>
        settleAlphaRunRequest(db, {
          generationRunId,
          outcome: "failed",
          failureCode: "provider_unavailable",
          costUsd: "0.0300",
          error: "bounded failure",
          settledAt: new Date("2026-07-24T12:01:00.000Z")
        })
      )
    );
    expect(settlements.filter((result) => result?.applied)).toHaveLength(1);
    expect(settlements.every((result) => result?.refunded)).toBe(true);
    expect(await getAlphaAllowanceSnapshot(db, fixture.inviteId)).toMatchObject({
      profile: { limit: 1, reserved: 0, used: 0, remaining: 1 }
    });

    const ledger = await pool.query(
      `select entry_kind, count(*)::int as count
       from alpha_allowance_ledger
       where invite_id = $1
       group by entry_kind
       order by entry_kind`,
      [fixture.inviteId]
    );
    expect(ledger.rows).toEqual([
      { entry_kind: "debit", count: 1 },
      { entry_kind: "refund", count: 1 }
    ]);
    await expect(
      pool.query(
        "update alpha_allowance_ledger set reason = 'changed' where invite_id = $1",
        [fixture.inviteId]
      )
    ).rejects.toThrow(/immutable/);
    expect(await deleteAlphaTesterData(db, fixture.inviteId)).toBe(true);
  }, 30_000);

  it("joins identical work but rejects a different active job without a debit", async () => {
    const fixture = await connectedInvite(2, hashChar("4"), hashChar("5"));
    const slug = `join-${randomUUID().slice(0, 8)}`;
    const domain = `${slug}.example`;
    const started = await reserveAlphaRunRequest(db, {
      inviteId: fixture.inviteId,
      installationId: fixture.installationId,
      interactionId: randomUUID(),
      kind: "profile",
      jobKind: "basics",
      slug,
      domain,
      now: fixture.now
    });
    const joined = await reserveAlphaRunRequest(db, {
      inviteId: fixture.inviteId,
      installationId: fixture.installationId,
      interactionId: randomUUID(),
      kind: "profile",
      jobKind: "basics",
      slug,
      domain,
      now: fixture.now
    });
    const busy = await reserveAlphaRunRequest(db, {
      inviteId: fixture.inviteId,
      installationId: fixture.installationId,
      interactionId: randomUUID(),
      kind: "profile",
      jobKind: "section:market",
      slug,
      domain,
      now: fixture.now
    });

    expect(started).toMatchObject({ disposition: "started", debited: true });
    expect(joined).toMatchObject({
      disposition: "joined",
      generationRunId: started.generationRunId,
      debited: false
    });
    expect(busy).toMatchObject({
      disposition: "rejected",
      dispositionReason: "generation_busy",
      debited: false
    });
    expect(await getAlphaAllowanceSnapshot(db, fixture.inviteId)).toMatchObject({
      profile: { limit: 2, reserved: 1, used: 0, remaining: 1 }
    });
    await deleteAlphaTesterData(db, fixture.inviteId);
  });

  it("counts only fresh work against the burst window, not cached or rejected answers", async () => {
    const fixture = await connectedInvite(4, hashChar("6"), hashChar("7"));
    const prefix = randomUUID().slice(0, 8);
    for (let index = 0; index < 24; index += 1) {
      await recordAlphaRunDisposition(db, {
        inviteId: fixture.inviteId,
        installationId: fixture.installationId,
        interactionId: randomUUID(),
        kind: "profile",
        slug: `${prefix}-cached-${index}`,
        domain: `${prefix}-cached-${index}.example`,
        disposition: index % 2 === 0 ? "cached" : "rejected",
        reason: "fresh_cache",
        now: fixture.now
      });
    }

    const fresh = await reserveAlphaRunRequest(db, {
      inviteId: fixture.inviteId,
      installationId: fixture.installationId,
      interactionId: randomUUID(),
      kind: "profile",
      slug: `${prefix}-fresh`,
      domain: `${prefix}-fresh.example`,
      now: fixture.now
    });

    expect(fresh).toMatchObject({ disposition: "started", debited: true, replayed: false });
    await deleteAlphaTesterData(db, fixture.inviteId);
  }, 30_000);

  it("still trips the burst window on twenty started runs in a minute", async () => {
    const fixture = await connectedInvite(25, hashChar("8"), hashChar("9"));
    const prefix = randomUUID().slice(0, 8);
    for (let index = 0; index < 20; index += 1) {
      const started = await reserveAlphaRunRequest(db, {
        inviteId: fixture.inviteId,
        installationId: fixture.installationId,
        interactionId: randomUUID(),
        kind: "profile",
        slug: `${prefix}-burst-${index}`,
        domain: `${prefix}-burst-${index}.example`,
        now: fixture.now
      });
      expect(started.disposition).toBe("started");
    }

    const blocked = await reserveAlphaRunRequest(db, {
      inviteId: fixture.inviteId,
      installationId: fixture.installationId,
      interactionId: randomUUID(),
      kind: "profile",
      slug: `${prefix}-burst-20`,
      domain: `${prefix}-burst-20.example`,
      now: fixture.now
    });

    expect(blocked).toMatchObject({ disposition: "rejected", dispositionReason: "rate_limited" });
    await deleteAlphaTesterData(db, fixture.inviteId);
  }, 30_000);

  it("marks a repeated interaction id as replayed so no caller starts it twice", async () => {
    const fixture = await connectedInvite(2, hashChar("a"), hashChar("b"));
    const interactionId = randomUUID();
    const slug = `replay-${randomUUID().slice(0, 8)}`;
    const reserve = () =>
      reserveAlphaRunRequest(db, {
        inviteId: fixture.inviteId,
        installationId: fixture.installationId,
        interactionId,
        kind: "profile",
        slug,
        domain: `${slug}.example`,
        now: fixture.now
      });

    const first = await reserve();
    const replay = await reserve();

    expect(first).toMatchObject({ disposition: "started", debited: true, replayed: false });
    expect(replay).toMatchObject({
      disposition: "started",
      debited: true,
      replayed: true,
      generationRunId: first.generationRunId
    });
    await deleteAlphaTesterData(db, fixture.inviteId);
  });

  it("acknowledges duplicate events idempotently and prunes by receipt time", async () => {
    const fixture = await connectedInvite(1, hashChar("2"), hashChar("3"));
    const eventId = randomUUID();
    const sessionId = randomUUID();
    const event = {
      eventId,
      eventName: "panel.opened",
      schemaVersion: 1,
      occurredAt: fixture.now,
      sessionId,
      sequence: 0,
      extensionVersion: "0.2.0",
      browser: "chrome" as const,
      installChannel: "unlisted" as const,
      surface: "side_panel",
      theme: "light" as const,
      reducedMotion: false,
      online: true,
      properties: {}
    };

    expect(await insertAlphaEvents(db, {
      inviteId: fixture.inviteId,
      installationId: fixture.installationId,
      events: [event],
      receivedAt: fixture.now
    })).toEqual([eventId]);
    expect(await insertAlphaEvents(db, {
      inviteId: fixture.inviteId,
      installationId: fixture.installationId,
      events: [event],
      receivedAt: fixture.now
    })).toEqual([eventId]);

    const count = await pool.query(
      "select count(*)::int as count from alpha_events where event_id = $1",
      [eventId]
    );
    expect(count.rows[0]?.count).toBe(1);
    expect(await pruneAlphaEvents(db, {
      before: new Date("2026-07-24T12:00:01.000Z")
    })).toBeGreaterThanOrEqual(1);
    await deleteAlphaTesterData(db, fixture.inviteId);
  });

  it("atomically caps each installation at 300 new events per minute", async () => {
    const fixture = await connectedInvite(1, hashChar("4"), hashChar("5"));
    const batches = Array.from({ length: 13 }, (_, batchIndex) =>
      Array.from({ length: 25 }, (_, eventIndex) => ({
        eventId: randomUUID(),
        eventName: "panel.opened",
        schemaVersion: 1,
        occurredAt: fixture.now,
        sessionId: randomUUID(),
        sequence: batchIndex * 25 + eventIndex,
        extensionVersion: "0.2.0",
        browser: "chrome" as const,
        installChannel: "unlisted" as const,
        surface: "side_panel",
        theme: "light" as const,
        reducedMotion: false,
        online: true,
        properties: {}
      }))
    );

    const results = await Promise.allSettled(batches.map((events) =>
      insertAlphaEvents(db, {
        inviteId: fixture.inviteId,
        installationId: fixture.installationId,
        events,
        receivedAt: fixture.now
      })
    ));

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(12);
    expect(results.filter((result) =>
      result.status === "rejected" && result.reason instanceof AlphaEventRateLimitError
    )).toHaveLength(1);
    const count = await pool.query(
      "select count(*)::int as count from alpha_events where installation_id = $1",
      [fixture.installationId]
    );
    expect(count.rows[0]?.count).toBe(300);
    await deleteAlphaTesterData(db, fixture.inviteId);
  }, 30_000);
});

async function connectedInvite(profileLimit: number, tokenHash: string, accessTokenHash: string) {
  const now = new Date("2026-07-24T12:00:00.000Z");
  const invite = await createAlphaInvite(db, {
    label: `fixture-${randomUUID()}`,
    tokenHash,
    scopes: ["cards:read", "generation:write", "events:write"],
    expiresAt: new Date("2026-07-31T12:00:00.000Z"),
    profileLimit,
    lensLimit: 1,
    now
  });
  const auth = await redeemAlphaInvite(db, {
    tokenHash,
    accessTokenHash,
    browser: "chrome",
    channel: "unlisted",
    extensionVersion: "0.2.0",
    now
  });
  if (!auth) throw new Error("fixture invite redemption failed");
  return {
    inviteId: invite.id,
    installationId: auth.installation.id,
    now
  };
}

function hashChar(char: string) {
  return char.repeat(64);
}

function hashSeed(seed: string) {
  return createHash("sha256").update(seed).digest("hex");
}

function assertSafeTestDatabase(value: string | undefined): asserts value is string {
  if (!value) throw new Error("ALPHA_DB_TEST_URL is required");
  const url = new URL(value);
  if (!["localhost", "127.0.0.1", "::1"].includes(url.hostname) || !url.pathname.endsWith("_test")) {
    throw new Error("ALPHA_DB_TEST_URL must point to a local database ending in _test");
  }
}
