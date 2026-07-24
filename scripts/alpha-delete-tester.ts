#!/usr/bin/env tsx

import { deleteAlphaTesterData, findAlphaInviteById } from "@cold-start/db";

import {
  hasFlag,
  loadProductionEnv,
  parseCliArguments,
  requiredValue,
  runCli,
  valueFor,
  withAlphaDb
} from "./alpha-common";

const HELP = `Permanently delete one tester and all identity-linked alpha data.

Usage:
  npm run alpha:delete-tester -- --invite <invite-id> --confirm <invite-id>

The confirmation value must exactly match the invitation ID. This cascades
through installations, allowances, run requests, ledger entries, and events.
Generation cards and shared generation traces are retained.`;

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const args = parseCliArguments(argv);
  if (hasFlag(args, "--help")) {
    console.log(HELP);
    return;
  }

  const inviteId = requiredValue(args, "--invite");
  if (valueFor(args, "--confirm") !== inviteId) {
    throw new Error("--confirm must exactly match --invite.");
  }

  loadProductionEnv();
  const invite = await withAlphaDb(async (db) => {
    const found = await findAlphaInviteById(db, inviteId);
    if (!found) throw new Error("No matching alpha invitation was found.");
    const deleted = await deleteAlphaTesterData(db, inviteId);
    if (!deleted) throw new Error("The tester was not deleted.");
    return found;
  });

  console.log(`Deleted alpha tester ${inviteId} (${invite.label}) and identity-linked alpha data.`);
}

runCli(import.meta.url, main);
