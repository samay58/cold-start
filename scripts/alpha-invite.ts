#!/usr/bin/env tsx

import { createAlphaInvite } from "@cold-start/db";

import {
  boundedInteger,
  createInviteSecret,
  dateAfter,
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

const HELP = `Create one expiring friend-alpha invitation.

Usage:
  npm run alpha:invite -- --label "Dad" [options]

Options:
  --label <label>              Operator label, required
  --expires <duration>         Expiry from now, default 14d
  --profiles <count>           Fresh profile allowance, default 12
  --lenses <count>             Fresh Investor Lens allowance, default 6
  --max-installations <count>  Active installation limit, default 1
  --scope <csv>                Server scopes, default cards:read,generation:write,events:write
  --help                       Show this help

The invitation URL contains the only copy of the raw secret. It is printed once
after the hashed invitation has been stored.`;

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const args = parseCliArguments(argv);
  if (hasFlag(args, "--help")) {
    console.log(HELP);
    return;
  }

  const label = requiredValue(args, "--label");
  if (label.length > 120) throw new Error("--label must be 120 characters or fewer.");
  const now = new Date();
  const expiresAt = dateAfter(now, valueFor(args, "--expires") ?? "14d", "--expires");
  const profileLimit = boundedInteger(valueFor(args, "--profiles"), 12, {
    name: "--profiles",
    min: 0,
    max: 1_000
  });
  const lensLimit = boundedInteger(valueFor(args, "--lenses"), 6, {
    name: "--lenses",
    min: 0,
    max: 1_000
  });
  const maxInstallations = boundedInteger(valueFor(args, "--max-installations"), 1, {
    name: "--max-installations",
    min: 1,
    max: 10
  });
  const scopes = [...new Set(
    (valueFor(args, "--scope") ?? "cards:read,generation:write,events:write")
    .split(",")
    .map((scope) => scope.trim())
    .filter(Boolean)
  )];
  if (
    scopes.length === 0 ||
    scopes.length > 20 ||
    scopes.some((scope) => !/^[a-z][a-z0-9:_-]{0,79}$/.test(scope))
  ) {
    throw new Error("--scope must contain 1 to 20 bounded lowercase scope names.");
  }

  loadProductionEnv();
  const secret = createInviteSecret();
  const invite = await withAlphaDb((db) =>
    createAlphaInvite(db, {
      label,
      tokenHash: sha256(secret),
      scopes,
      expiresAt,
      profileLimit,
      lensLimit,
      maxInstallations,
      now
    })
  );

  console.log(`Invitation ${invite.id} created for ${invite.label}.`);
  console.log(`Expires: ${invite.expiresAt.toISOString()}`);
  console.log(`Allowances: ${invite.profileLimit} profiles, ${invite.lensLimit} Lens runs`);
  console.log("One-time invitation URL:");
  console.log(inviteUrl(secret));
}

runCli(import.meta.url, main);
