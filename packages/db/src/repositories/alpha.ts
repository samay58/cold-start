import { and, desc, eq, isNull, sql } from "drizzle-orm";

import type { ColdStartDb } from "../client";
import {
  alphaAllowanceLedger,
  alphaAllowances,
  alphaInstallations,
  alphaInviteAttempts,
  alphaInvites,
  alphaRunRequests
} from "../schema";

export type AlphaInviteStatus = "pending" | "active" | "revoked";
export type AlphaBrowser = "chrome" | "firefox";
export type AlphaInstallChannel = "unlisted" | "unpacked" | "unknown";
export type AlphaAllowanceKind = "profile" | "lens";
export type AlphaRunDisposition = "started" | "joined" | "cached" | "withheld" | "blocked" | "rejected";
export type AlphaRunOutcome = "complete" | "withheld" | "failed" | "watchdog_retired";
export type AlphaTheme = "light" | "dark";

export type AlphaInvite = {
  id: string;
  label: string;
  tokenHash: string;
  status: AlphaInviteStatus;
  scopes: string[];
  profileLimit: number;
  lensLimit: number;
  maxInstallations: number;
  slug: string | null;
  displayName: string | null;
  ordinal: number | null;
  cardPngBase64: string | null;
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type AlphaInstallationAuth = {
  installation: {
    id: string;
    inviteId: string;
    browser: AlphaBrowser;
    channel: AlphaInstallChannel;
    extensionVersion: string;
    connectedAt: Date;
    lastSeenAt: Date;
  };
  invite: {
    id: string;
    label: string;
    status: AlphaInviteStatus;
    scopes: string[];
    expiresAt: Date;
    profileLimit: number;
    lensLimit: number;
  };
};

export type AlphaAllowanceSnapshot = {
  inviteId: string;
  profile: {
    limit: number;
    reserved: number;
    used: number;
    remaining: number;
  };
  lens: {
    limit: number;
    reserved: number;
    used: number;
    remaining: number;
  };
  updatedAt: Date;
};

export type AlphaRunRequestRecord = {
  requestId: string;
  inviteId: string;
  installationId: string;
  interactionId: string;
  kind: AlphaAllowanceKind;
  slug: string;
  domain: string;
  disposition: AlphaRunDisposition;
  dispositionReason: string | null;
  generationRunId: string | null;
  outcome: AlphaRunOutcome | null;
  failureCode: string | null;
  settledAt: Date | null;
  createdAt: Date;
};

export type AlphaReservationResult = AlphaRunRequestRecord & {
  debited: boolean;
  // True when this interaction id already owned a request row before the call: the reservation
  // is a replay of an earlier click, not fresh work, so no caller may start a second execution
  // against it.
  replayed: boolean;
};

export type AlphaSettlementResult = {
  requestId: string;
  generationRunId: string;
  outcome: AlphaRunOutcome;
  failureCode: string | null;
  settledAt: Date;
  refunded: boolean;
  applied: boolean;
};

export class AlphaInteractionConflictError extends Error {
  constructor() {
    super("interaction_id is already owned by another alpha principal");
    this.name = "AlphaInteractionConflictError";
  }
}

export async function createAlphaInvite(
  db: ColdStartDb,
  input: {
    label: string;
    tokenHash: string;
    scopes: readonly string[];
    expiresAt: Date;
    profileLimit?: number;
    lensLimit?: number;
    maxInstallations?: number;
    slug?: string;
    displayName?: string;
    ordinal?: number;
    cardPngBase64?: string;
    now?: Date;
  }
): Promise<AlphaInvite> {
  assertSha256Hash(input.tokenHash, "tokenHash");
  const now = input.now ?? new Date();
  const profileLimit = input.profileLimit ?? 12;
  const lensLimit = input.lensLimit ?? 6;
  const maxInstallations = input.maxInstallations ?? 1;
  assertNonNegativeInteger(profileLimit, "profileLimit");
  assertNonNegativeInteger(lensLimit, "lensLimit");
  assertPositiveInteger(maxInstallations, "maxInstallations");

  const rows = await db
    .insert(alphaInvites)
    .values({
      label: input.label.trim(),
      tokenHash: input.tokenHash,
      scopes: [...new Set(input.scopes)],
      profileLimit,
      lensLimit,
      maxInstallations,
      slug: input.slug ?? null,
      displayName: input.displayName ?? null,
      ordinal: input.ordinal ?? null,
      cardPngBase64: input.cardPngBase64 ?? null,
      expiresAt: input.expiresAt,
      createdAt: now,
      updatedAt: now
    })
    .returning();

  return alphaInviteFromRow(rows[0]);
}

export async function findAlphaInviteById(db: ColdStartDb, inviteId: string): Promise<AlphaInvite | null> {
  const rows = await db.select().from(alphaInvites).where(eq(alphaInvites.id, inviteId)).limit(1);
  return rows[0] ? alphaInviteFromRow(rows[0]) : null;
}

export async function findAlphaInviteCardBySlug(
  db: ColdStartDb,
  slug: string
): Promise<{ displayName: string | null; ordinal: number | null; cardPngBase64: string | null } | null> {
  const rows = await db
    .select({
      displayName: alphaInvites.displayName,
      ordinal: alphaInvites.ordinal,
      cardPngBase64: alphaInvites.cardPngBase64
    })
    .from(alphaInvites)
    .where(eq(alphaInvites.slug, slug))
    .limit(1);
  return rows[0] ?? null;
}

export async function nextAlphaInviteOrdinal(db: ColdStartDb): Promise<number> {
  const result = await db.execute<{ next: number | string | null }>(
    sql`select coalesce(max(ordinal), 0) + 1 as next from alpha_invites`
  );
  return Number(executeRows<{ next: number | string | null }>(result)[0]?.next ?? 1);
}

export async function recordAlphaInviteAttempt(db: ColdStartDb, now = new Date()): Promise<void> {
  await db.insert(alphaInviteAttempts).values({ createdAt: now });
}

export async function countRecentAlphaInviteAttempts(db: ColdStartDb, since: Date): Promise<number> {
  const result = await db.execute<{ count: number | string }>(
    sql`select count(*) as count from alpha_invite_attempts where created_at > ${since}`
  );
  return Number(executeRows<{ count: number | string }>(result)[0]?.count ?? 0);
}

export async function pruneAlphaInviteAttempts(db: ColdStartDb, before: Date): Promise<number> {
  const rows = await db
    .delete(alphaInviteAttempts)
    .where(sql`${alphaInviteAttempts.createdAt} < ${before}`)
    .returning({ id: alphaInviteAttempts.id });
  return rows.length;
}

// The one path that attaches an installation to an invitation, for the first seat and every later
// one. An already-active invitation is still a candidate, so a second browser or a reinstall
// redeems normally while max_installations decides; accepted_at keeps the moment of the first
// redemption. Only active installations occupy seats. Revoking a broken installation deliberately
// returns its seat to the invitation while revoking the invitation itself remains terminal.
//
// The seat check lives in redeem_alpha_invite rather than in a CTE here for the reason spelled out
// in that function: one statement cannot both take the advisory lock and then count against a
// snapshot that includes the winner's write, so the CTE form handed out more seats than the
// invitation had whenever redemptions raced.
export async function redeemAlphaInvite(
  db: ColdStartDb,
  input: {
    tokenHash: string;
    accessTokenHash: string;
    browser: AlphaBrowser;
    channel: AlphaInstallChannel;
    extensionVersion: string;
    now?: Date;
  }
): Promise<AlphaInstallationAuth | null> {
  assertSha256Hash(input.tokenHash, "tokenHash");
  assertSha256Hash(input.accessTokenHash, "accessTokenHash");
  const now = input.now ?? new Date();
  const result = await db.execute<{ result: AlphaAuthSqlRow | null }>(sql`
    select redeem_alpha_invite(
      ${input.tokenHash},
      ${input.accessTokenHash},
      ${input.browser}::alpha_browser,
      ${input.channel}::alpha_install_channel,
      ${input.extensionVersion},
      ${now}
    ) as result
  `);

  const row = executeRows<{ result: AlphaAuthSqlRow | null }>(result)[0]?.result;
  return row ? alphaAuthFromSqlRow(row) : null;
}

export async function findActiveAlphaInstallationByTokenHash(
  db: ColdStartDb,
  tokenHash: string,
  now = new Date()
): Promise<AlphaInstallationAuth | null> {
  assertSha256Hash(tokenHash, "tokenHash");
  const rows = await db
    .select({
      installationId: alphaInstallations.id,
      inviteId: alphaInstallations.inviteId,
      browser: alphaInstallations.browser,
      channel: alphaInstallations.channel,
      extensionVersion: alphaInstallations.extensionVersion,
      connectedAt: alphaInstallations.connectedAt,
      lastSeenAt: alphaInstallations.lastSeenAt,
      label: alphaInvites.label,
      status: alphaInvites.status,
      scopes: alphaInvites.scopes,
      expiresAt: alphaInvites.expiresAt,
      profileLimit: alphaInvites.profileLimit,
      lensLimit: alphaInvites.lensLimit
    })
    .from(alphaInstallations)
    .innerJoin(alphaInvites, eq(alphaInvites.id, alphaInstallations.inviteId))
    .where(
      and(
        eq(alphaInstallations.accessTokenHash, tokenHash),
        isNull(alphaInstallations.revokedAt),
        eq(alphaInvites.status, "active"),
        isNull(alphaInvites.revokedAt),
        sql`${alphaInvites.expiresAt} > ${now}`
      )
    )
    .limit(1);

  return rows[0] ? alphaAuthFromSqlRow(rows[0]) : null;
}

export async function touchAlphaInstallation(
  db: ColdStartDb,
  installationId: string,
  input: { extensionVersion?: string; now?: Date } = {}
): Promise<boolean> {
  const now = input.now ?? new Date();
  const rows = await db
    .update(alphaInstallations)
    .set({
      ...(input.extensionVersion ? { extensionVersion: input.extensionVersion } : {}),
      lastSeenAt: now,
      updatedAt: now
    })
    .where(and(eq(alphaInstallations.id, installationId), isNull(alphaInstallations.revokedAt)))
    .returning();
  return rows.length === 1;
}

export async function revokeAlphaInstallation(
  db: ColdStartDb,
  installationId: string,
  now = new Date()
): Promise<boolean> {
  const rows = await db
    .update(alphaInstallations)
    .set({ revokedAt: now, updatedAt: now })
    .where(and(eq(alphaInstallations.id, installationId), isNull(alphaInstallations.revokedAt)))
    .returning();
  return rows.length === 1;
}

export async function revokeAlphaInvite(
  db: ColdStartDb,
  inviteId: string,
  now = new Date()
): Promise<boolean> {
  const result = await db.execute<{ result: boolean }>(sql`
    select revoke_alpha_invite(${inviteId}::uuid, ${now}) as result
  `);
  return executeRows<{ result: boolean }>(result)[0]?.result === true;
}

export async function getAlphaAllowanceSnapshot(
  db: ColdStartDb,
  inviteId: string
): Promise<AlphaAllowanceSnapshot | null> {
  const rows = await db.select().from(alphaAllowances).where(eq(alphaAllowances.inviteId, inviteId)).limit(1);
  const row = rows[0];
  if (!row) return null;

  return {
    inviteId: row.inviteId,
    profile: allowanceCounter(row.profileLimit, row.profileReserved, row.profileUsed),
    lens: allowanceCounter(row.lensLimit, row.lensReserved, row.lensUsed),
    updatedAt: row.updatedAt
  };
}

export async function recordAlphaRunDisposition(
  db: ColdStartDb,
  input: {
    inviteId: string;
    installationId: string;
    interactionId: string;
    kind: AlphaAllowanceKind;
    slug: string;
    domain: string;
    disposition: Exclude<AlphaRunDisposition, "started" | "joined">;
    reason?: string | null;
    now?: Date;
  }
): Promise<AlphaRunRequestRecord> {
  const now = input.now ?? new Date();
  const rows = await db
    .insert(alphaRunRequests)
    .values({
      inviteId: input.inviteId,
      installationId: input.installationId,
      interactionId: input.interactionId,
      allowanceKind: input.kind,
      slug: input.slug,
      domain: input.domain,
      disposition: input.disposition,
      dispositionReason: input.reason ?? null,
      createdAt: now
    })
    .onConflictDoNothing({ target: alphaRunRequests.interactionId })
    .returning();

  const row = rows[0] ?? await findAlphaRunRequestByInteraction(db, input.interactionId);
  if (!row || row.inviteId !== input.inviteId || row.installationId !== input.installationId) {
    throw new AlphaInteractionConflictError();
  }
  return alphaRunRequestFromRow(row);
}

export async function reserveAlphaRunRequest(
  db: ColdStartDb,
  input: {
    inviteId: string;
    installationId: string;
    interactionId: string;
    kind: AlphaAllowanceKind;
    jobKind?: string;
    slug: string;
    domain: string;
    now?: Date;
  }
): Promise<AlphaReservationResult> {
  const now = input.now ?? new Date();
  const result = await db.execute<{ result: AlphaReservationSqlRow | null }>(sql`
    select reserve_alpha_run_request(
      ${input.inviteId}::uuid,
      ${input.installationId}::uuid,
      ${input.interactionId}::uuid,
      ${input.kind}::alpha_allowance_kind,
      ${input.slug},
      ${input.domain},
      ${input.jobKind ?? (input.kind === "profile" ? "basics" : "analysis")},
      ${now}
    ) as result
  `);
  const row = executeRows<{ result: AlphaReservationSqlRow | null }>(result)[0]?.result;
  if (!row) throw new AlphaInteractionConflictError();
  return {
    ...alphaRunRequestFromSqlRow(row),
    debited: booleanFromSql(row.debited),
    replayed: row.replayed === undefined ? false : booleanFromSql(row.replayed)
  };
}

export async function settleAlphaRunRequest(
  db: ColdStartDb,
  input: {
    generationRunId: string;
    outcome: AlphaRunOutcome;
    failureCode?: string | null;
    costUsd?: string | null;
    error?: string | null;
    settledAt?: Date;
  }
): Promise<AlphaSettlementResult | null> {
  const settledAt = input.settledAt ?? new Date();
  const result = await db.execute<{ result: AlphaSettlementSqlRow | null }>(sql`
    select settle_alpha_run_request(
      ${input.generationRunId}::uuid,
      ${input.outcome}::alpha_run_outcome,
      ${input.failureCode ?? null},
      ${input.costUsd ?? null}::numeric,
      ${input.error ?? null},
      ${settledAt}
    ) as result
  `);
  const row = executeRows<{ result: AlphaSettlementSqlRow | null }>(result)[0]?.result;
  if (!row) return null;

  return {
    requestId: row.request_id,
    generationRunId: row.generation_run_id,
    outcome: row.outcome,
    failureCode: row.failure_code,
    settledAt: dateFromSql(row.settled_at),
    refunded: booleanFromSql(row.refunded),
    applied: booleanFromSql(row.applied)
  };
}

export async function findAlphaRunRequestByInteraction(
  db: ColdStartDb,
  interactionId: string
) {
  const rows = await db
    .select()
    .from(alphaRunRequests)
    .where(eq(alphaRunRequests.interactionId, interactionId))
    .limit(1);
  return rows[0] ?? null;
}

type AlphaEventProperty =
  | string
  | number
  | boolean
  | null
  | readonly string[]
  | readonly number[]
  | readonly boolean[];

export type AlphaEventInsert = {
  eventId: string;
  eventName: string;
  schemaVersion: number;
  occurredAt: Date;
  sessionId: string;
  sequence: number;
  interactionId?: string | null;
  extensionVersion: string;
  browser: AlphaBrowser;
  installChannel: AlphaInstallChannel;
  surface: string;
  theme: AlphaTheme;
  reducedMotion: boolean;
  online: boolean;
  properties: Readonly<Record<string, AlphaEventProperty | undefined>>;
};

export class AlphaEventRateLimitError extends Error {
  constructor() {
    super("alpha event rate limit exceeded");
    this.name = "AlphaEventRateLimitError";
  }
}

export async function insertAlphaEvents(
  db: ColdStartDb,
  input: {
    inviteId: string;
    installationId: string;
    events: readonly AlphaEventInsert[];
    receivedAt?: Date;
  }
): Promise<string[]> {
  if (input.events.length === 0) return [];
  if (input.events.length > 25) throw new RangeError("alpha event batches are limited to 25 events");
  const receivedAt = input.receivedAt ?? new Date();

  for (const event of input.events) {
    if (Buffer.byteLength(JSON.stringify(event.properties), "utf8") > 4096) {
      throw new RangeError(`alpha event ${event.eventId} properties exceed 4096 bytes`);
    }
  }

  const serialized = input.events.map((event) => ({
    event_id: event.eventId,
    event_name: event.eventName,
    schema_version: event.schemaVersion,
    occurred_at: event.occurredAt.toISOString(),
    session_id: event.sessionId,
    sequence: event.sequence,
    interaction_id: event.interactionId ?? null,
    extension_version: event.extensionVersion,
    browser: event.browser,
    install_channel: event.installChannel,
    surface: event.surface,
    theme: event.theme,
    reduced_motion: event.reducedMotion,
    online: event.online,
    properties_json: event.properties
  }));
  const result = await db.execute<{ result: AlphaEventBatchSqlResult }>(sql`
    select insert_alpha_event_batch(
      ${input.inviteId}::uuid,
      ${input.installationId}::uuid,
      ${JSON.stringify(serialized)}::jsonb,
      ${receivedAt},
      300
    ) as result
  `);
  const batch = executeRows<{ result: AlphaEventBatchSqlResult }>(result)[0]?.result;
  if (!batch || batch.status === "inactive") {
    return [];
  }
  if (batch.status === "throttled") {
    throw new AlphaEventRateLimitError();
  }
  return batch.acknowledged_event_ids;
}

type AlphaEventBatchSqlResult = {
  status: "accepted" | "inactive" | "throttled";
  acknowledged_event_ids: string[];
};

export async function getAlphaTesterStatus(db: ColdStartDb, inviteId: string) {
  const [invite, allowance, installations, requests, ledger] = await Promise.all([
    findAlphaInviteById(db, inviteId),
    getAlphaAllowanceSnapshot(db, inviteId),
    db
      .select({
        id: alphaInstallations.id,
        browser: alphaInstallations.browser,
        channel: alphaInstallations.channel,
        extensionVersion: alphaInstallations.extensionVersion,
        connectedAt: alphaInstallations.connectedAt,
        lastSeenAt: alphaInstallations.lastSeenAt,
        revokedAt: alphaInstallations.revokedAt
      })
      .from(alphaInstallations)
      .where(eq(alphaInstallations.inviteId, inviteId))
      .orderBy(desc(alphaInstallations.lastSeenAt)),
    db
      .select({
        disposition: alphaRunRequests.disposition,
        outcome: alphaRunRequests.outcome
      })
      .from(alphaRunRequests)
      .where(eq(alphaRunRequests.inviteId, inviteId)),
    db
      .select({
        entryKind: alphaAllowanceLedger.entryKind,
        allowanceKind: alphaAllowanceLedger.allowanceKind,
        amount: alphaAllowanceLedger.amount
      })
      .from(alphaAllowanceLedger)
      .where(eq(alphaAllowanceLedger.inviteId, inviteId))
  ]);

  return {
    invite,
    allowance,
    installations,
    dispositions: countBy(requests, (row) => row.disposition),
    outcomes: countBy(requests.filter((row) => row.outcome !== null), (row) => row.outcome as AlphaRunOutcome),
    ledger: {
      profile: ledger.filter((entry) => entry.allowanceKind === "profile").reduce((sum, entry) => sum + entry.amount, 0),
      lens: ledger.filter((entry) => entry.allowanceKind === "lens").reduce((sum, entry) => sum + entry.amount, 0),
      debits: ledger.filter((entry) => entry.entryKind === "debit").length,
      refunds: ledger.filter((entry) => entry.entryKind === "refund").length
    }
  };
}

export async function pruneAlphaEvents(
  db: ColdStartDb,
  input: { before: Date; limit?: number }
): Promise<number> {
  const limit = input.limit ?? 1_000;
  assertPositiveInteger(limit, "limit");
  const result = await db.execute<{ event_id: string }>(sql`
    with doomed as (
      select event_id
      from alpha_events
      where received_at < ${input.before}
      order by received_at
      limit ${limit}
    )
    delete from alpha_events events
    using doomed
    where events.event_id = doomed.event_id
    returning events.event_id
  `);
  return executeRows(result).length;
}

export async function deleteAlphaTesterData(db: ColdStartDb, inviteId: string): Promise<boolean> {
  const rows = await db
    .delete(alphaInvites)
    .where(eq(alphaInvites.id, inviteId))
    .returning();
  return rows.length === 1;
}

type AlphaAuthSqlRow = {
  installation_id: string;
  invite_id: string;
  browser: AlphaBrowser;
  channel: AlphaInstallChannel;
  extension_version: string;
  connected_at: Date | string;
  last_seen_at: Date | string;
  label: string;
  status: AlphaInviteStatus;
  scopes: string[];
  expires_at: Date | string;
  profile_limit: number;
  lens_limit: number;
};

type AlphaReservationSqlRow = {
  request_id: string;
  invite_id: string;
  installation_id: string;
  interaction_id: string;
  allowance_kind: AlphaAllowanceKind;
  slug: string;
  domain: string;
  disposition: AlphaRunDisposition;
  disposition_reason: string | null;
  generation_run_id: string | null;
  outcome: AlphaRunOutcome | null;
  failure_code: string | null;
  settled_at: Date | string | null;
  created_at: Date | string;
  debited: boolean | string;
  replayed?: boolean | string;
};

type AlphaSettlementSqlRow = {
  request_id: string;
  generation_run_id: string;
  outcome: AlphaRunOutcome;
  failure_code: string | null;
  settled_at: Date | string;
  refunded: boolean | string;
  applied: boolean | string;
};

function alphaInviteFromRow(row: typeof alphaInvites.$inferSelect | undefined): AlphaInvite {
  if (!row) throw new Error("alpha invite insert did not return a row");
  return {
    ...row,
    scopes: [...row.scopes]
  };
}

function alphaAuthFromSqlRow(row: AlphaAuthSqlRow | {
  installationId: string;
  inviteId: string;
  browser: AlphaBrowser;
  channel: AlphaInstallChannel;
  extensionVersion: string;
  connectedAt: Date;
  lastSeenAt: Date;
  label: string;
  status: AlphaInviteStatus;
  scopes: string[];
  expiresAt: Date;
  profileLimit: number;
  lensLimit: number;
}): AlphaInstallationAuth {
  const sqlRow = row as AlphaAuthSqlRow;
  const drizzleRow = row as {
    installationId?: string;
    inviteId?: string;
    extensionVersion?: string;
    connectedAt?: Date;
    lastSeenAt?: Date;
    expiresAt?: Date;
    profileLimit?: number;
    lensLimit?: number;
  };
  const inviteId = sqlRow.invite_id ?? drizzleRow.inviteId;
  return {
    installation: {
      id: sqlRow.installation_id ?? drizzleRow.installationId ?? "",
      inviteId,
      browser: row.browser,
      channel: row.channel,
      extensionVersion: sqlRow.extension_version ?? drizzleRow.extensionVersion ?? "",
      connectedAt: dateFromSql(sqlRow.connected_at ?? drizzleRow.connectedAt),
      lastSeenAt: dateFromSql(sqlRow.last_seen_at ?? drizzleRow.lastSeenAt)
    },
    invite: {
      id: inviteId,
      label: row.label,
      status: row.status,
      scopes: [...row.scopes],
      expiresAt: dateFromSql(sqlRow.expires_at ?? drizzleRow.expiresAt),
      profileLimit: sqlRow.profile_limit ?? drizzleRow.profileLimit ?? 0,
      lensLimit: sqlRow.lens_limit ?? drizzleRow.lensLimit ?? 0
    }
  };
}

function alphaRunRequestFromRow(row: typeof alphaRunRequests.$inferSelect): AlphaRunRequestRecord {
  return {
    requestId: row.id,
    inviteId: row.inviteId,
    installationId: row.installationId,
    interactionId: row.interactionId,
    kind: row.allowanceKind,
    slug: row.slug,
    domain: row.domain,
    disposition: row.disposition,
    dispositionReason: row.dispositionReason,
    generationRunId: row.generationRunId,
    outcome: row.outcome,
    failureCode: row.failureCode,
    settledAt: row.settledAt,
    createdAt: row.createdAt
  };
}

function alphaRunRequestFromSqlRow(row: AlphaReservationSqlRow): AlphaRunRequestRecord {
  return {
    requestId: row.request_id,
    inviteId: row.invite_id,
    installationId: row.installation_id,
    interactionId: row.interaction_id,
    kind: row.allowance_kind,
    slug: row.slug,
    domain: row.domain,
    disposition: row.disposition,
    dispositionReason: row.disposition_reason,
    generationRunId: row.generation_run_id,
    outcome: row.outcome,
    failureCode: row.failure_code,
    settledAt: row.settled_at ? dateFromSql(row.settled_at) : null,
    createdAt: dateFromSql(row.created_at)
  };
}

function allowanceCounter(limit: number, reserved: number, used: number) {
  return {
    limit,
    reserved,
    used,
    remaining: limit - reserved - used
  };
}

function countBy<T, K extends string>(values: readonly T[], key: (value: T) => K): Partial<Record<K, number>> {
  const counts: Partial<Record<K, number>> = {};
  for (const value of values) {
    const itemKey = key(value);
    counts[itemKey] = (counts[itemKey] ?? 0) + 1;
  }
  return counts;
}

function assertSha256Hash(value: string, field: string) {
  if (!/^[0-9a-f]{64}$/.test(value)) {
    throw new TypeError(`${field} must be a lowercase SHA-256 hex digest`);
  }
}

function assertNonNegativeInteger(value: number, field: string) {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${field} must be a non-negative integer`);
  }
}

function assertPositiveInteger(value: number, field: string) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${field} must be a positive integer`);
  }
}

function dateFromSql(value: Date | string | undefined): Date {
  if (!value) throw new TypeError("database timestamp is missing");
  return value instanceof Date ? value : new Date(value);
}

function booleanFromSql(value: boolean | string): boolean {
  return value === true || value === "true" || value === "t";
}

function executeRows<T extends Record<string, unknown>>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result) {
    return (result as { rows: T[] }).rows;
  }
  return [];
}
