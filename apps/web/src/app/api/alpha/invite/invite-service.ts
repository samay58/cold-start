import { createHash } from "node:crypto";

import {
  COLD_START_API_CONTRACT_VERSION,
  COLD_START_CLIENT_CONTRACT_HEADER,
  INVITE_TOKEN_PATTERN
} from "@cold-start/core";
import {
  countRecentAlphaInviteAttempts,
  recordAlphaInviteAttempt,
  type ColdStartDb
} from "@cold-start/db";
import { sql } from "drizzle-orm";
import { z } from "zod";

const MAX_REQUEST_BYTES = 2_048;

// Global failure breaker: a wrong guess matches no invite row (lookups are by exact
// hash), so per-invite counting can never attribute a miss. Every invalid-token
// attempt lands in one anonymous tally; when the trailing hour holds the threshold,
// inspect and redeem both answer 429 until the window drains.
const BREAKER_WINDOW_MS = 60 * 60 * 1000;
const BREAKER_THRESHOLD = 10;

export async function alphaInviteBreakerOpen(db: ColdStartDb, now = new Date()): Promise<boolean> {
  const since = new Date(now.getTime() - BREAKER_WINDOW_MS);
  return (await countRecentAlphaInviteAttempts(db, since)) >= BREAKER_THRESHOLD;
}

export async function recordInvalidInviteAttempt(db: ColdStartDb, now = new Date()): Promise<void> {
  await recordAlphaInviteAttempt(db, now);
}

export const alphaInviteRequestSchema = z.object({
  inviteToken: z.string().regex(INVITE_TOKEN_PATTERN)
}).strict();

export const alphaInviteRedeemRequestSchema = alphaInviteRequestSchema.extend({
  // Chrome redeems through the invite page's external message; Firefox has no
  // page-to-extension messaging (Bugzilla 1319168), so its panel redeems directly.
  browser: z.enum(["chrome", "firefox"]),
  channel: z.literal("unlisted"),
  extensionVersion: z.string().regex(/^\d+(?:\.\d+){1,3}$/).max(32),
  clientContract: z.string().min(1).max(128),
  consent: z.literal(true),
  storeVisited: z.boolean(),
  reducedMotion: z.boolean(),
  theme: z.enum(["light", "dark"])
}).strict();

export type AlphaInviteState =
  | "ready"
  | "expired"
  | "installation_limit"
  | "invalid_invite"
  | "revoked"
  | "used";

export type AlphaClientCompatibility = "current" | "old_supported" | "update_required";

type InviteInspectionRow = {
  status: "pending" | "active" | "revoked";
  expires_at: Date | string;
  profile_limit: number;
  lens_limit: number;
  max_installations: number;
  claimed_installations: number | string;
};

export type AlphaInviteInspection = {
  state: AlphaInviteState;
  profileLimit?: number;
  lensLimit?: number;
};

export async function readBoundedJson(request: Request): Promise<unknown | null> {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return null;
  }

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_REQUEST_BYTES) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function hashAlphaSecret(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function alphaClientCompatibility(headers: Headers, bodyContract?: string): AlphaClientCompatibility {
  const clientContract =
    bodyContract?.trim() ||
    headers.get(COLD_START_CLIENT_CONTRACT_HEADER)?.trim() ||
    "";
  if (clientContract === COLD_START_API_CONTRACT_VERSION) {
    return "current";
  }

  const supportedPrevious = new Set(
    (process.env.ALPHA_SUPPORTED_PREVIOUS_CLIENT_CONTRACTS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  );
  return supportedPrevious.has(clientContract) ? "old_supported" : "update_required";
}

export async function inspectAlphaInvite(
  db: ColdStartDb,
  tokenHash: string,
  now = new Date()
): Promise<AlphaInviteInspection> {
  const result = await db.execute<InviteInspectionRow>(sql`
    select
      invite.status,
      invite.expires_at,
      invite.profile_limit,
      invite.lens_limit,
      invite.max_installations,
      count(installation.id) as claimed_installations
    from alpha_invites invite
    left join alpha_installations installation
      on installation.invite_id = invite.id
      and installation.revoked_at is null
    where invite.token_hash = ${tokenHash}
    group by invite.id
    limit 1
  `);
  const row = executeRows<InviteInspectionRow>(result)[0];
  if (!row) {
    return { state: "invalid_invite" };
  }
  if (row.status === "revoked") {
    return { state: "revoked" };
  }
  if (new Date(row.expires_at).getTime() <= now.getTime()) {
    return { state: "expired" };
  }
  // Seats, not active invite status, decide whether this invitation can attach an installation.
  // The count matches redeemAlphaInvite's: only unrevoked installations occupy seats.
  if (Number(row.claimed_installations) >= row.max_installations) {
    return { state: row.max_installations === 1 ? "used" : "installation_limit" };
  }
  return {
    state: "ready",
    profileLimit: row.profile_limit,
    lensLimit: row.lens_limit
  };
}

export function alphaInviteErrorStatus(state: Exclude<AlphaInviteState, "ready">) {
  switch (state) {
    case "invalid_invite":
      return 404;
    case "expired":
    case "revoked":
      return 410;
    case "installation_limit":
    case "used":
      return 409;
  }
}

function executeRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) {
    return result as T[];
  }
  if (result && typeof result === "object" && "rows" in result) {
    const rows = (result as { rows?: unknown }).rows;
    return Array.isArray(rows) ? rows as T[] : [];
  }
  return [];
}
