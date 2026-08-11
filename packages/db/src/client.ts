import { neon, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { drizzle as drizzleNodePostgres } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { Agent, type Dispatcher } from "undici";

import * as schema from "./schema";

type NeonFetchDependencies = {
  fetchFn?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  dispatcher?: Dispatcher;
};

const neonDispatcher = new Agent({ connectTimeout: 3_000 });

const preConnectFailureCodes = new Set([
  "UND_ERR_CONNECT_TIMEOUT",
  "EAI_AGAIN",
  "ENETUNREACH",
  "ECONNREFUSED",
]);

function errorCode(error: unknown): string | null {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current && typeof current === "object"; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string") {
      return code;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return null;
}

export async function neonFetchWithConnectionRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
  dependencies: NeonFetchDependencies = {},
): Promise<Response> {
  const fetchFn = dependencies.fetchFn ?? fetch;
  const sleep = dependencies.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const requestInit = {
    ...init,
    dispatcher: dependencies.dispatcher ?? neonDispatcher,
  } as RequestInit;

  try {
    return await fetchFn(input, requestInit);
  } catch (error) {
    const code = errorCode(error);
    if (!code || !preConnectFailureCodes.has(code)) {
      throw error;
    }
    await sleep(75);
    return fetchFn(input, requestInit);
  }
}

neonConfig.fetchFunction = neonFetchWithConnectionRetry;

export function createDb(databaseUrl = process.env.DATABASE_URL) {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  if (isLocalPostgresUrl(databaseUrl)) {
    const pool = new Pool({ connectionString: databaseUrl });
    return drizzleNodePostgres(pool, { schema });
  }

  const sql = neon(databaseUrl);
  return drizzle(sql, { schema });
}

export type ColdStartDb = ReturnType<typeof createDb>;

function isLocalPostgresUrl(databaseUrl: string) {
  try {
    const url = new URL(databaseUrl);
    return (
      (url.protocol === "postgres:" || url.protocol === "postgresql:") &&
      ["localhost", "127.0.0.1", "::1"].includes(url.hostname)
    );
  } catch {
    return false;
  }
}
