import { createHash } from "node:crypto";

import {
  ALPHA_INVITE_ATTEMPT_LIMIT,
  ALPHA_INVITE_ATTEMPT_WINDOW_SECONDS,
  COLD_START_API_CONTRACT_VERSION,
  COLD_START_CLIENT_CONTRACT_HEADER,
  INVITE_TOKEN_PATTERN
} from "@cold-start/core";
import {
  consumeAlphaInviteAttempt,
  type AlphaInviteState,
  type ColdStartDb
} from "@cold-start/db";
import { z } from "zod";

export const ALPHA_INVITE_REQUEST_MAX_BYTES = 2_048;

export async function consumeAlphaInviteQuota(
  db: ColdStartDb,
  sourceHash: string,
  now = new Date()
): Promise<boolean> {
  return consumeAlphaInviteAttempt(db, {
    sourceHash,
    limit: ALPHA_INVITE_ATTEMPT_LIMIT,
    windowSeconds: ALPHA_INVITE_ATTEMPT_WINDOW_SECONDS,
    now
  });
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

export type AlphaClientCompatibility = "current" | "old_supported" | "update_required";

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
