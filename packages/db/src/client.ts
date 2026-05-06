import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { drizzle as drizzleNodePostgres } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

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
