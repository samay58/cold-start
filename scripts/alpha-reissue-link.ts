#!/usr/bin/env tsx

import { generateInviteCode } from "@cold-start/core";
import {
  listAlphaInvitePresentationMigrationCandidates,
  rotateAlphaInviteLinkSecrets
} from "@cold-start/db";

import {
  createInviteSecret,
  hasFlag,
  inviteUrl,
  loadProductionEnv,
  parseCliArguments,
  requiredValue,
  runCli,
  sha256,
  valueFor,
  withAlphaDb
} from "./alpha-common";

const HELP = `Audit or reissue one personalized friend-alpha link.

Usage:
  npm run alpha:reissue-link
  npm run alpha:reissue-link -- --invite <uuid> --confirm <same-uuid> --apply

Without --apply, this reports active personalized invitations that still use legacy
name-slug previews. Applying rotates only the invitation code and adds a hashed
presentation capability. Existing installation credentials remain active.`;

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const args = parseCliArguments(argv);
  if (hasFlag(args, "--help")) {
    console.log(HELP);
    return;
  }

  loadProductionEnv();
  if (!hasFlag(args, "--apply")) {
    const candidates = await withAlphaDb((db) => listAlphaInvitePresentationMigrationCandidates(db));
    console.log(JSON.stringify({ mode: "dry-run", count: candidates.length, candidates }, null, 2));
    return;
  }

  const inviteId = requiredValue(args, "--invite");
  if (valueFor(args, "--confirm") !== inviteId) {
    throw new Error("--confirm must exactly match --invite");
  }

  const code = generateInviteCode();
  const presentationToken = createInviteSecret();
  const invite = await withAlphaDb((db) => rotateAlphaInviteLinkSecrets(db, {
    inviteId,
    tokenHash: sha256(code),
    presentationTokenHash: sha256(presentationToken)
  }));
  if (!invite) {
    throw new Error("Invitation is missing, expired, revoked, or has no personalized card.");
  }

  console.log(`Invitation ${invite.id} link secrets rotated for ${invite.label}.`);
  console.log("Send this replacement link as its own message:");
  console.log(inviteUrl(presentationToken, code));
}

runCli(import.meta.url, main);
