#!/usr/bin/env tsx

import { listOpenAccessRequests, markAccessRequestHandled } from "@cold-start/db";

import {
  hasFlag,
  loadProductionEnv,
  parseCliArguments,
  requiredValue,
  runCli,
  valueFor,
  withAlphaDb
} from "./alpha-common";

const HELP = `Manage access requests.

Usage:
  npm run access:requests                List open requests
  npm run access:requests -- --handled <id>  Mark a request as handled
  npm run access:requests -- --help      Show this help

Output:
  Lists open requests newest-first as flat lines.`;

// Public form input is hostile by default: strip every Unicode control character (this covers
// \r\n plus ESC and other C0/C1 codes a terminal would otherwise interpret) rather than just the
// newline pair, so nothing can escape-sequence its way into the operator's terminal.
function sanitizeOutput(text: string): string {
  return text.replace(/\p{Cc}+/gu, " ");
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const args = parseCliArguments(argv);
  if (hasFlag(args, "--help")) {
    console.log(HELP);
    return;
  }

  loadProductionEnv();

  // Check if --handled flag is present (either in flags or values)
  const hasHandledFlag = hasFlag(args, "--handled") || valueFor(args, "--handled") !== undefined;

  if (hasHandledFlag) {
    const handledId = requiredValue(args, "--handled");
    await withAlphaDb(async (db) => {
      const success = await markAccessRequestHandled(db, handledId);
      console.log(success ? `Marked ${handledId} as handled.` : `Request ${handledId} not found or already handled.`);
    });
  } else {
    await withAlphaDb(async (db) => {
      const requests = await listOpenAccessRequests(db);
      const sorted = [...requests].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      for (const request of sorted) {
        const timestamp = request.createdAt.toISOString();
        const name = sanitizeOutput(request.name);
        const email = sanitizeOutput(request.email);
        const note = sanitizeOutput(request.note);
        console.log(`${timestamp} ${request.id} ${name} <${email}>: ${note}`);
      }
      if (sorted.length > 0) {
        console.log("");
      }
      console.log(`(${sorted.length} open request${sorted.length === 1 ? "" : "s"})`);
    });
  }
}

runCli(import.meta.url, main);
