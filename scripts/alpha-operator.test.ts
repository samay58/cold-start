import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createInviteSecret,
  durationMs,
  inviteUrl,
  parseCliArguments,
  sha256
} from "./alpha-common";
import {
  buildAlphaStatusReport,
  type AlphaStatusReportInputs
} from "./alpha-status";

describe("alpha operator CLI primitives", () => {
  it("creates a 256-bit URL-safe invitation secret and keeps it in the fragment", () => {
    const secret = createInviteSecret();
    const decoded = Buffer.from(secret, "base64url");
    const url = new URL(inviteUrl(secret, "https://alpha.example.test"));

    assert.equal(decoded.byteLength, 32);
    assert.equal(url.pathname, "/alpha");
    assert.equal(url.search, "");
    assert.equal(url.hash, `#invite=${secret}`);
    assert.match(sha256(secret), /^[0-9a-f]{64}$/);
    assert.notEqual(sha256(secret), secret);
  });

  it("parses flags, values, equals syntax, and bounded duration units", () => {
    const args = parseCliArguments([
      "--since",
      "7d",
      "--json",
      "--profiles=12",
      "positional"
    ]);

    assert.equal(args.values.get("--since"), "7d");
    assert.equal(args.values.get("--profiles"), "12");
    assert.equal(args.flags.has("--json"), true);
    assert.deepEqual(args.positionals, ["positional"]);
    assert.equal(durationMs("30m"), 1_800_000);
    assert.equal(durationMs("12h"), 43_200_000);
    assert.equal(durationMs("7d"), 604_800_000);
    assert.throws(() => durationMs("1.5d"), /whole-number duration/);
  });
});

describe("alpha status report", () => {
  it("reports funnel, refunds, traced failed spend, and all readiness gate failures", () => {
    const report = buildAlphaStatusReport(failingFixture());

    assert.equal(report.testers.length, 1);
    assert.equal(report.testers[0].funnelStage, "lens_result");
    assert.equal(report.testers[0].sessions, 2);
    assert.equal(report.testers[0].companies, 3);
    assert.equal(report.testers[0].ledger.profileDebits, 1);
    assert.equal(report.testers[0].ledger.lensDebits, 2);
    assert.equal(report.testers[0].ledger.lensRefunds, 1);
    assert.deepEqual(report.testers[0].dispositions, { fresh: 3, failed: 1 });
    assert.equal(report.spend.successfulUsd, 0.12);
    assert.equal(report.spend.failedUsd, 0.08);
    assert.equal(report.spend.failedRunsMissingCost, 0);
    assert.deepEqual(report.totals.failureCodes, { model_contract: 1 });
    assert.deepEqual(report.totals.providerFailures, { org_enrichment: 2 });
    assert.equal(report.totals.staleOrSilentRuns.length, 1);
    assert.equal(report.totals.queueDrops, 3);
    assert.equal(report.wallet.remainingAllowanceExposureUsd, 4.5);
    assert.equal(report.wallet.requiredFloorUsd, 35);
    assert.match(
      report.gate.failures.find((failure) => failure.code === "wallet_floor")?.message ?? "",
      /\$35\.0000/
    );
    assert.deepEqual(
      report.gate.failures.map((failure) => failure.code),
      ["software_failures", "stale_runs", "wallet_floor", "unsupported_client"]
    );
  });

  it("passes when wallet, reliability, and compatibility evidence are clean", () => {
    const fixture = failingFixture();
    fixture.runRows = fixture.runRows.filter((run) => run.generation_run_id === "run-complete");
    fixture.allTrafficRunRows = fixture.allTrafficRunRows.filter((run) => run.id === "run-complete");
    fixture.inviteRows[0].extension_version = "0.1.0";
    fixture.providerFailureRows = [];
    fixture.walletBalanceUsd = 35;

    const report = buildAlphaStatusReport(fixture);

    assert.equal(report.gate.passed, true);
    assert.deepEqual(report.gate.failures, []);
    assert.equal(report.totals.staleOrSilentRuns.length, 0);
    assert.deepEqual(report.totals.failureCodes, {});
    assert.equal(report.wallet.requiredFloorUsd, 35);
  });

  // The 2026-07-24 through 2026-07-27 outage: seventeen software failures across three days of
  // operator-token traffic, and the gate reported "Failure codes: none" because its reliability
  // evidence only covered alpha-linked runs. The gate must see every generation run.
  it("fails the gate on software failures from operator-token runs with no alpha traffic", () => {
    const fixture = failingFixture();
    fixture.inviteRows = [];
    fixture.runRows = [];
    fixture.ledgerRows = [];
    fixture.eventSummaryRows = [];
    fixture.clientErrorRows = [];
    fixture.providerFailureRows = [];
    fixture.walletBalanceUsd = 40;
    fixture.allTrafficRunRows = [
      {
        id: "operator-run-1",
        slug: "economist",
        mode: "analysis",
        job_kind: "analysis",
        status: "failed",
        failure_code: "concurrent_write",
        started_at: new Date("2026-07-24T12:00:00.000Z"),
        completed_at: new Date("2026-07-24T12:01:00.000Z"),
        last_event_at: new Date("2026-07-24T12:01:00.000Z")
      },
      {
        id: "operator-run-2",
        slug: "varda",
        mode: "analysis",
        job_kind: "analysis",
        status: "failed",
        failure_code: "model_contract",
        started_at: new Date("2026-07-24T13:00:00.000Z"),
        completed_at: new Date("2026-07-24T13:01:00.000Z"),
        last_event_at: new Date("2026-07-24T13:01:00.000Z")
      },
      {
        id: "operator-run-3",
        slug: "usb",
        mode: "basics",
        job_kind: "basics",
        status: "complete",
        failure_code: null,
        started_at: new Date("2026-07-24T14:00:00.000Z"),
        completed_at: new Date("2026-07-24T14:01:00.000Z"),
        last_event_at: new Date("2026-07-24T14:01:00.000Z")
      }
    ];

    const report = buildAlphaStatusReport(fixture);

    assert.equal(report.gate.passed, false);
    assert.ok(report.gate.failures.some((failure) => failure.code === "software_failures"));
    assert.equal(report.totals.allTraffic.runs, 3);
    assert.equal(report.totals.allTraffic.failed, 2);
    assert.equal(report.totals.allTraffic.softwareFailureCount, 2);
    assert.deepEqual(report.totals.allTraffic.failureCodes, { concurrent_write: 1, model_contract: 1 });
  });

  it("fails the gate on a silent operator-token run stuck past the dead threshold", () => {
    const fixture = failingFixture();
    fixture.inviteRows = [];
    fixture.runRows = [];
    fixture.ledgerRows = [];
    fixture.eventSummaryRows = [];
    fixture.clientErrorRows = [];
    fixture.providerFailureRows = [];
    fixture.walletBalanceUsd = 40;
    fixture.allTrafficRunRows = [
      {
        id: "operator-run-stuck",
        slug: "gamma",
        mode: "analysis",
        job_kind: "analysis",
        status: "running",
        failure_code: null,
        started_at: new Date("2026-07-24T16:10:00.000Z"),
        completed_at: null,
        last_event_at: new Date("2026-07-24T16:12:00.000Z")
      }
    ];

    const report = buildAlphaStatusReport(fixture);

    assert.equal(report.gate.passed, false);
    assert.ok(report.gate.failures.some((failure) => failure.code === "stale_runs"));
    assert.equal(report.totals.allTraffic.staleOrSilentRunCount, 1);
  });
});

function failingFixture(): AlphaStatusReportInputs {
  const now = new Date("2026-07-24T16:30:00.000Z");
  const inviteId = "11111111-1111-4111-8111-111111111111";
  const installationId = "22222222-2222-4222-8222-222222222222";
  return {
    now,
    sinceLabel: "7d",
    sinceAt: new Date("2026-07-17T16:30:00.000Z"),
    inviteRows: [{
      invite_id: inviteId,
      label: "Dad",
      invite_status: "active",
      expires_at: new Date("2026-08-07T16:00:00.000Z"),
      accepted_at: new Date("2026-07-23T14:00:00.000Z"),
      invite_created_at: new Date("2026-07-23T13:00:00.000Z"),
      profile_limit: 12,
      profile_reserved: 0,
      profile_used: 2,
      lens_limit: 6,
      lens_reserved: 0,
      lens_used: 1,
      installation_id: installationId,
      extension_version: "0.0.9",
      browser: "chrome",
      channel: "unlisted",
      connected_at: new Date("2026-07-23T14:05:00.000Z"),
      last_seen_at: new Date("2026-07-24T16:00:00.000Z"),
      installation_revoked_at: null
    }],
    runRows: [
      {
        request_id: "request-complete",
        invite_id: inviteId,
        installation_id: installationId,
        allowance_kind: "profile",
        slug: "acme",
        domain: "acme.example",
        disposition: "started",
        outcome: "complete",
        request_failure_code: null,
        request_created_at: new Date("2026-07-24T14:00:00.000Z"),
        settled_at: new Date("2026-07-24T14:01:00.000Z"),
        generation_run_id: "run-complete",
        generation_status: "complete",
        generation_cost_usd: null,
        trace_json: {
          costUsdAnthropic: 0.12,
          milestones: { firstUsableCardMs: 40_000 }
        },
        generation_started_at: new Date("2026-07-24T14:00:00.000Z"),
        generation_completed_at: new Date("2026-07-24T14:01:00.000Z"),
        first_event_at: new Date("2026-07-24T14:00:02.000Z"),
        last_event_at: new Date("2026-07-24T14:01:00.000Z")
      },
      {
        request_id: "request-failed",
        invite_id: inviteId,
        installation_id: installationId,
        allowance_kind: "lens",
        slug: "beta",
        domain: "beta.example",
        disposition: "started",
        outcome: "failed",
        request_failure_code: "model_contract",
        request_created_at: new Date("2026-07-24T15:00:00.000Z"),
        settled_at: new Date("2026-07-24T15:01:00.000Z"),
        generation_run_id: "run-failed",
        generation_status: "failed",
        generation_cost_usd: null,
        trace_json: {
          llm: { totalEstimatedCostUsd: 0.08 },
          milestones: { analysisReadyMs: 55_000 },
          failure: { code: "model_contract" }
        },
        generation_started_at: new Date("2026-07-24T15:00:00.000Z"),
        generation_completed_at: new Date("2026-07-24T15:01:00.000Z"),
        first_event_at: new Date("2026-07-24T15:00:03.000Z"),
        last_event_at: new Date("2026-07-24T15:01:00.000Z")
      },
      {
        request_id: "request-stale",
        invite_id: inviteId,
        installation_id: installationId,
        allowance_kind: "profile",
        slug: "gamma",
        domain: "gamma.example",
        disposition: "started",
        outcome: null,
        request_failure_code: null,
        request_created_at: new Date("2026-07-24T16:18:00.000Z"),
        settled_at: null,
        generation_run_id: "run-stale",
        generation_status: "running",
        generation_cost_usd: null,
        trace_json: null,
        generation_started_at: new Date("2026-07-24T16:18:00.000Z"),
        generation_completed_at: null,
        first_event_at: new Date("2026-07-24T16:19:00.000Z"),
        last_event_at: new Date("2026-07-24T16:20:00.000Z")
      }
    ],
    runRowsTruncated: false,
    allTrafficRunRows: [
      {
        id: "run-complete",
        slug: "acme",
        mode: "basics",
        job_kind: "basics",
        status: "complete",
        failure_code: null,
        started_at: new Date("2026-07-24T14:00:00.000Z"),
        completed_at: new Date("2026-07-24T14:01:00.000Z"),
        last_event_at: new Date("2026-07-24T14:01:00.000Z")
      },
      {
        id: "run-failed",
        slug: "beta",
        mode: "analysis",
        job_kind: "analysis",
        status: "failed",
        failure_code: "model_contract",
        started_at: new Date("2026-07-24T15:00:00.000Z"),
        completed_at: new Date("2026-07-24T15:01:00.000Z"),
        last_event_at: new Date("2026-07-24T15:01:00.000Z")
      },
      {
        id: "run-stale",
        slug: "gamma",
        mode: "basics",
        job_kind: "basics",
        status: "running",
        failure_code: null,
        started_at: new Date("2026-07-24T16:18:00.000Z"),
        completed_at: null,
        last_event_at: new Date("2026-07-24T16:20:00.000Z")
      }
    ],
    allTrafficRunRowsTruncated: false,
    ledgerRows: [
      {
        invite_id: inviteId,
        allowance_kind: "profile",
        entry_kind: "debit",
        entries: "1",
        amount: "1"
      },
      {
        invite_id: inviteId,
        allowance_kind: "lens",
        entry_kind: "debit",
        entries: "2",
        amount: "2"
      },
      {
        invite_id: inviteId,
        allowance_kind: "lens",
        entry_kind: "refund",
        entries: "1",
        amount: "-1"
      }
    ],
    eventSummaryRows: [{
      invite_id: inviteId,
      sessions: "2",
      companies: "2",
      first_panel_opened_at: new Date("2026-07-23T14:06:00.000Z"),
      first_profile_requested_at: new Date("2026-07-24T14:00:00.000Z"),
      first_profile_result_at: new Date("2026-07-24T14:00:40.000Z"),
      first_lens_requested_at: new Date("2026-07-24T15:00:00.000Z"),
      first_lens_result_at: new Date("2026-07-24T15:01:00.000Z"),
      client_errors: "1"
    }],
    clientErrorRows: [{
      invite_id: inviteId,
      code: "contract_mismatch",
      errors: "1"
    }, {
      invite_id: inviteId,
      code: "analytics_queue_dropped",
      errors: "3"
    }],
    providerFailureRows: [{
      endpoint: "org_enrichment",
      failures: "2"
    }],
    walletBalanceUsd: 1,
    walletError: null,
    supportedVersions: ["0.1.0"],
    compatibilitySource: "test fixture",
    profileCostAnchorUsd: 0.3,
    lensCostAnchorUsd: 0.3,
    costAnchorSource: "test fixture"
  };
}
