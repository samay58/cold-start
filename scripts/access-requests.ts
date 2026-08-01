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

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const args = parseCliArguments(argv);
  if (hasFlag(args, "--help")) {
    console.log(HELP);
    return;
  }

  loadProductionEnv();
  const handledId = valueFor(args, "--handled");

  if (handledId) {
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
        console.log(`${timestamp} ${request.id} ${request.name} <${request.email}>: ${request.note}`);
      }
      console.log(`\n(${sorted.length} open request${sorted.length === 1 ? "" : "s"})`);
    });
  }
}

runCli(import.meta.url, main);
