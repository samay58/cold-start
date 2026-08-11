import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  alphaAllowanceLedger,
  alphaAllowances,
  alphaEvents,
  alphaInstallations,
  alphaInvites,
  alphaRunRequests
} from "../src/schema";

const migrationPath = fileURLToPath(
  new URL("../drizzle/0009_reflective_meteorite.sql", import.meta.url)
);
const migration = readFileSync(migrationPath, "utf8");
const securityMigration = readFileSync(
  fileURLToPath(new URL("../drizzle/0016_pink_husk.sql", import.meta.url)),
  "utf8"
);

describe("alpha database schema", () => {
  it("exports the focused alpha tables", () => {
    expect(alphaInvites).toBeDefined();
    expect(alphaInstallations).toBeDefined();
    expect(alphaAllowances).toBeDefined();
    expect(alphaAllowanceLedger).toBeDefined();
    expect(alphaRunRequests).toBeDefined();
    expect(alphaEvents).toBeDefined();
  });

  it("stores credential hashes rather than raw credentials", () => {
    expect(alphaInvites.tokenHash.notNull).toBe(true);
    expect(alphaInstallations.accessTokenHash.notNull).toBe(true);
    expect("token" in alphaInvites).toBe(false);
    expect("accessToken" in alphaInstallations).toBe(false);
  });

  it("generates the idempotency and accounting constraints", () => {
    expect(migration).toContain("alpha_invites_token_hash_idx");
    expect(migration).toContain("alpha_installations_token_hash_idx");
    expect(migration).toContain("alpha_run_requests_interaction_idx");
    expect(migration).toContain("alpha_run_requests_started_run_idx");
    expect(migration).toContain("alpha_allowance_ledger_debit_idx");
    expect(migration).toContain("alpha_allowance_ledger_refund_idx");
    expect(migration).toContain('"event_id" uuid PRIMARY KEY');
  });

  it("protects the ledger while preserving tester-level cascade deletion", () => {
    expect(migration).toContain("alpha_allowance_ledger_immutable");
    expect(migration).toContain("alpha_allowance_ledger is immutable");
    expect(migration).toContain(
      '"refund_of_ledger_id") REFERENCES "public"."alpha_allowance_ledger"("id") ON DELETE cascade'
    );
  });

  it("keeps rate and failure breakers inside atomic reservation", () => {
    expect(migration).toContain("rate_limited");
    expect(migration).toContain("domain_failure_breaker");
    expect(migration).toContain("invite_failure_breaker");
    expect(migration).toContain("p_now - interval '1 minute'");
    expect(migration).toContain("p_now - interval '1 day'");
  });

  it("joins only the same active job inside atomic reservation", () => {
    expect(migration).toContain("v_run_job_kind <> p_job_kind");
    expect(migration).toContain("'generation_busy'");
  });

  it("keeps the security migration compatible with the pre-deploy invite writer", () => {
    expect(securityMigration).toContain('ADD COLUMN "source_hash" text;');
    expect(securityMigration).not.toContain('ADD COLUMN "source_hash" text NOT NULL');
    expect(securityMigration).not.toContain('TRUNCATE TABLE "alpha_invite_attempts"');
  });

  it("defines source-scoped invite and deterministic access-request locks", () => {
    expect(securityMigration).toContain('CREATE FUNCTION "consume_alpha_invite_attempt"');
    expect(securityMigration).toContain("pg_advisory_xact_lock(hashtextextended(p_source_hash, 811))");
    expect(securityMigration).toContain('CREATE FUNCTION "create_access_request"');
    expect(securityMigration).toContain("pg_advisory_xact_lock(least(v_ip_lock, v_email_lock))");
    expect(securityMigration).toContain("pg_advisory_xact_lock(greatest(v_ip_lock, v_email_lock))");
  });
});
