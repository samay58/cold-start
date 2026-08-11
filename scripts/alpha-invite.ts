#!/usr/bin/env tsx

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";

import { generateInviteCode } from "@cold-start/core";
import { createAlphaInvite, nextAlphaInviteOrdinal, type AlphaInvite } from "@cold-start/db";

import {
  boundedInteger,
  createInviteSecret,
  dateAfter,
  hasFlag,
  inviteUrl,
  legacyInviteUrl,
  loadEnvFile,
  loadProductionEnv,
  parseCliArguments,
  requiredValue,
  runCli,
  sha256,
  slugify,
  valueFor,
  withAlphaDb
} from "./alpha-common";
import { mintInviteCandidates } from "./alpha-mint-card";

const HELP = `Create one expiring friend-alpha invitation with a minted invitation card.

Usage:
  npm run alpha:invite -- --label "Dad" [options]

Options:
  --label <label>              Operator label, required
  --name <name>                Name lettered on the card, defaults to --label
  --skip-card                  Mint nothing; print the legacy /alpha link instead
  --expires <duration>         Expiry from now, default 14d
  --profiles <count>           Fresh profile allowance, default 12
  --lenses <count>             Fresh Investor Lens allowance, default 6
  --max-installations <count>  Active installation limit, default 1
  --scope <csv>                Server scopes, default cards:read,generation:write,events:write
  --help                       Show this help

Candidate cards are minted through OpenRouter (OPENROUTER_API_KEY in .env.local),
written to .cold-start/invites/, and opened for approval. Only an approved card is
stored; the invite row is created after approval. The invitation URL contains the
only copy of the raw code. It is printed once after the hashed invitation exists.`;

// Check the macOS-only open/sips dependency before the paid mint call, not after billing.
export function assertMacOsMintSupport(platform: NodeJS.Platform): void {
  if (platform !== "darwin") {
    throw new Error(
      "alpha:invite's card mint requires macOS (uses open and sips). Run it from a Mac, or pass --skip-card for the legacy link-only flow."
    );
  }
}

async function promptOperator(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const args = parseCliArguments(argv);
  if (hasFlag(args, "--help")) {
    console.log(HELP);
    return;
  }

  const label = requiredValue(args, "--label");
  if (label.length > 120) throw new Error("--label must be 120 characters or fewer.");
  const name = valueFor(args, "--name")?.trim() || label;
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
  // OPENROUTER_API_KEY lives in .env.local, not in the production env file.
  loadEnvFile(resolve(process.cwd(), ".env.local"));

  const code = generateInviteCode();
  const slugBase = slugify(name);
  const ordinal = await withAlphaDb((db) => nextAlphaInviteOrdinal(db));

  let cardPngBase64: string | undefined;
  let presentationToken: string | undefined;

  if (!hasFlag(args, "--skip-card")) {
    assertMacOsMintSupport(process.platform);
    const outDir = resolve(process.cwd(), ".cold-start", "invites", `${slugBase}-${ordinal}`);
    const mintInput = {
      name,
      ordinal,
      referencePath: resolve(process.cwd(), "docs/brand/invite-style-reference.png"),
      outDir
    };
    let candidates = await mintInviteCandidates(mintInput);
    execSync(`open ${JSON.stringify(outDir)}`);
    for (;;) {
      const choice = (await promptOperator(
        `Candidates in ${outDir}. Approve [1-${candidates.length}], r to re-roll, s to skip the card: `
      )).toLowerCase();
      if (choice === "r") {
        candidates = await mintInviteCandidates(mintInput);
        console.log(`Re-rolled: ${candidates.length} fresh candidates in ${outDir}.`);
        continue;
      }
      if (choice === "s") {
        break;
      }
      const approved = Number.isInteger(Number(choice)) ? candidates[Number(choice) - 1] : undefined;
      if (!approved) {
        console.log("Pick a number in range, r to re-roll, or s to skip the card.");
        continue;
      }
      // iMessage reportedly gives the full-width bubble only above ~2400px wide;
      // below that the card shrinks to a thumbnail. Upscale before storing, and
      // force real PNG bytes: the model labels its data URL image/png but the
      // payload is JPEG (proven on the first production mint, 2026-07-30).
      const approvedPng = approved.replace(/\.png$/, "-approved.png");
      execSync(
        `sips -s format png --resampleWidth 2400 ${JSON.stringify(approved)} --out ${JSON.stringify(approvedPng)}`
      );
      cardPngBase64 = readFileSync(approvedPng).toString("base64");
      presentationToken = createInviteSecret();
      break;
    }
  }

  const createInput = {
    label,
    tokenHash: sha256(code),
    ...(presentationToken ? { presentationTokenHash: sha256(presentationToken) } : {}),
    scopes,
    expiresAt,
    profileLimit,
    lensLimit,
    maxInstallations,
    displayName: name,
    ordinal,
    ...(cardPngBase64 ? { cardPngBase64 } : {}),
    now
  };

  const invite: AlphaInvite = await withAlphaDb((db) => createAlphaInvite(db, createInput));

  console.log(`Invitation ${invite.id} created for ${invite.label}. No ${String(ordinal).padStart(2, "0")}.`);
  console.log(`Expires: ${invite.expiresAt.toISOString()}`);
  console.log(`Allowances: ${invite.profileLimit} profiles, ${invite.lensLimit} Lens runs`);
  console.log("");
  console.log("Send this as its own iMessage bubble (the card preview replaces the URL):");
  console.log(presentationToken ? inviteUrl(presentationToken, code) : legacyInviteUrl(code));
  console.log("");
  console.log(`If they ever need to type it, the key is: ${code}`);
}

runCli(import.meta.url, main);
