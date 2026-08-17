import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createInviteSecret,
  durationMs,
  inviteUrl,
  legacyInviteUrl,
  parseCliArguments,
  sha256,
  slugify
} from "./alpha-common";
import { assertMacOsMintSupport } from "./alpha-invite";
import { buildMintPrompt, imagesFromOpenRouterResponse } from "./alpha-mint-card";
import {
  buildAlphaStatusReport,
  type AlphaStatusReportInputs
} from "./alpha-status";
import { repairBlockedReason, requireRepairIntent } from "./alpha-revoke";

describe("alpha operator CLI primitives", () => {
  it("creates a 256-bit URL-safe invitation secret and keeps it in the fragment", () => {
    const secret = createInviteSecret();
    const decoded = Buffer.from(secret, "base64url");
    const url = new URL(legacyInviteUrl(secret, "https://alpha.example.test"));

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

  it("requires explicit repair intent before an installation revoke", () => {
    assert.doesNotThrow(() => requireRepairIntent(undefined, false));
    assert.doesNotThrow(() => requireRepairIntent("installation-id", true));
    assert.throws(
      () => requireRepairIntent("installation-id", false),
      /repair-only and reopens the original invite/
    );
  });

  it("refuses to describe revoked or expired invitations as repairable", () => {
    const now = new Date("2026-07-29T12:00:00.000Z");
    const base = {
      status: "active" as const,
      expiresAt: new Date("2026-08-01T12:00:00.000Z"),
      maxInstallations: 1
    };

    assert.equal(
      repairBlockedReason({ ...base, status: "revoked" }, 0, now),
      "the invitation is revoked"
    );
    assert.equal(
      repairBlockedReason({ ...base, expiresAt: new Date("2026-07-29T11:59:59.000Z") }, 0, now),
      "the invitation is expired"
    );
    assert.equal(
      repairBlockedReason({ ...base, maxInstallations: 2 }, 2, now),
      "the invitation will still be at its installation limit"
    );
    assert.equal(repairBlockedReason(base, 0, now), null);
  });
});

describe("invite mint pipeline", () => {
  it("buildMintPrompt carries name, number, and the copy law", () => {
    const prompt = buildMintPrompt("Dad", 4);
    assert.match(prompt, /Invitation, for Dad/);
    assert.match(prompt, /No 04/);
    assert.doesNotMatch(prompt, /friend alpha/i);
    assert.doesNotMatch(prompt, /valid|expir/i);
  });

  it("imagesFromOpenRouterResponse extracts base64 payloads", () => {
    const body = {
      choices: [{ message: { images: [
        { image_url: { url: "data:image/png;base64,aGVsbG8=" } }
      ] } }]
    };
    assert.deepEqual(imagesFromOpenRouterResponse(body), ["aGVsbG8="]);
    assert.deepEqual(imagesFromOpenRouterResponse({}), []);
  });

  it("slugify derives clean slugs", () => {
    assert.equal(slugify("Dad"), "dad");
    assert.equal(slugify("Priya S."), "priya-s");
  });

  it("inviteUrl builds the /i/ link with the code in the fragment", () => {
    assert.equal(
      inviteUrl("p".repeat(43), "ember-quarto-lark", "https://cold-start.semitechie.vc"),
      `https://cold-start.semitechie.vc/i/${"p".repeat(43)}#ember-quarto-lark`
    );
  });

  it("assertMacOsMintSupport allows darwin and rejects every other platform with a clear error", () => {
    assert.doesNotThrow(() => assertMacOsMintSupport("darwin"));
    assert.throws(() => assertMacOsMintSupport("linux"), /requires macOS/);
    assert.throws(() => assertMacOsMintSupport("win32"), /--skip-card/);
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

  // Fix wave (2026-08-12): runCost only ever read costUsdAnthropic/llm.totalEstimatedCostUsd, so
  // the emphasis read's founder-voice lane spend (mostly xAI, up to ~$0.10/run) never showed up
  // in the alpha spend report at all. It must add on top of whatever the run's other cost stream
  // already contributed, for both the stored-cost and the traced-fallback branch.
  it("adds the emphasis read's founder-voice lane spend on top of a run's other cost stream", () => {
    const fixture = failingFixture();
    const completeRun = fixture.runRows.find((run) => run.generation_run_id === "run-complete");
    if (!completeRun || !completeRun.trace_json) {
      throw new Error("fixture must carry a run-complete row with trace_json");
    }
    completeRun.trace_json = {
      ...completeRun.trace_json,
      emphasis: { enabled: true, status: "read", estimatedLaneCostUsd: 0.05 }
    };

    const report = buildAlphaStatusReport(fixture);

    // run-complete's generation_cost_usd is null (per failingFixture), so runCost falls to the
    // traced costUsdAnthropic (0.12) plus the new emphasis lane cost (0.05) = 0.17, modulo
    // float noise (spendSummary accumulates raw floats without rounding).
    assert.equal(Number(report.spend.successfulUsd.toFixed(2)), 0.17);
  });

  it("adds exact AgentCash receipt spend to the run total", () => {
    const fixture = failingFixture();
    const completeRun = fixture.runRows.find((run) => run.generation_run_id === "run-complete");
    if (!completeRun?.trace_json) {
      throw new Error("fixture must carry a run-complete trace");
    }
    completeRun.trace_json = {
      ...completeRun.trace_json,
      costUsdAgentcash: 0.03,
      providers: {
        stableenrich: {
          accountingStatus: "receipts_complete",
          receiptCostUsd: 0.03,
          receiptCount: 2,
          unreceiptedCallCount: 0
        }
      }
    };

    const report = buildAlphaStatusReport(fixture);

    assert.equal(Number(report.spend.successfulUsd.toFixed(2)), 0.15);
  });

  it("uses the complete trace and keeps every non-overlapping cost stream", () => {
    const fixture = failingFixture();
    const completeRun = fixture.runRows.find((run) => run.generation_run_id === "run-complete");
    if (!completeRun) {
      throw new Error("fixture must carry a complete run");
    }
    completeRun.generation_cost_usd = "0.0100";
    completeRun.trace_json = {
      costUsdAnthropic: 0.04,
      costUsdAgentcash: 0.03,
      llm: { calls: [], totalEstimatedCostUsd: 0.06 },
      providers: {
        stableenrich: {
          accountingStatus: "receipts_complete",
          receiptCostUsd: 0.03,
          receiptCount: 1,
          unreceiptedCallCount: 0
        },
        directExa: { estimatedCostUsd: 0.007 },
        websets: { estimatedCostUsd: 0.02 }
      },
      emphasis: { estimatedLaneCostUsd: 0.014 }
    };

    const report = buildAlphaStatusReport(fixture);

    assert.equal(Number(report.spend.successfulUsd.toFixed(3)), 0.131);
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

  it("fails closed when a run has AgentCash calls without settlement receipts", () => {
    const fixture = failingFixture();
    const completeRun = fixture.runRows.find((run) => run.generation_run_id === "run-complete");
    const allTrafficRun = fixture.allTrafficRunRows.find((run) => run.id === "run-complete");
    if (!completeRun?.trace_json || !allTrafficRun) {
      throw new Error("fixture must carry the complete run");
    }
    completeRun.trace_json = {
      ...completeRun.trace_json,
      providers: {
        stableenrich: {
          accountingStatus: "receipts_partial",
          receiptCostUsd: 0.01,
          receiptCount: 1,
          unreceiptedCallCount: 1
        }
      }
    };
    allTrafficRun.agentcash_accounting_status = "receipts_partial";

    const report = buildAlphaStatusReport(fixture);

    assert.equal(report.spend.successfulRunsMissingCost, 1);
    assert.equal(report.totals.allTraffic.incompleteAgentcashAccountingCount, 1);
    assert.ok(report.gate.failures.some((failure) => failure.code === "agentcash_accounting_incomplete"));
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
        failure_message: null,
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
        failure_message: null,
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
        failure_message: null,
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

  // The 2026-08-09 through 08-11 credit-exhaustion runs: trace rows written before the classifier
  // learned "credit balance is too low" carry a frozen "unknown" code forever. The report must
  // re-derive from the stored failure message so those runs read provider_unavailable and stop
  // counting as software failures.
  it("re-derives frozen unknown failure codes from the stored failure message", () => {
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
        id: "operator-run-credit",
        slug: "stake",
        mode: "analysis",
        job_kind: "analysis",
        status: "failed",
        failure_code: "unknown",
        failure_message:
          '400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API."}}',
        started_at: new Date("2026-08-09T14:41:00.000Z"),
        completed_at: new Date("2026-08-09T14:42:00.000Z"),
        last_event_at: new Date("2026-08-09T14:42:00.000Z")
      }
    ];

    const report = buildAlphaStatusReport(fixture);

    assert.deepEqual(report.totals.allTraffic.failureCodes, { provider_unavailable: 1 });
    assert.equal(report.totals.allTraffic.softwareFailureCount, 0);
    assert.ok(!report.gate.failures.some((failure) => failure.code === "software_failures"));
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
        failure_message: null,
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

  it("reports the busiest invite source below its quota", () => {
    const fixture = failingFixture();
    fixture.busiestInviteSourceAttempts = 9;

    const report = buildAlphaStatusReport(fixture);

    assert.deepEqual(report.inviteQuota, {
      windowMinutes: 60,
      threshold: 10,
      busiestSourceAttempts: 9,
      saturated: false
    });
  });

  it("reports a saturated invite source independently of the gate", () => {
    const fixture = failingFixture();
    fixture.busiestInviteSourceAttempts = 10;

    const report = buildAlphaStatusReport(fixture);

    assert.equal(report.inviteQuota.saturated, true);
    assert.equal(report.inviteQuota.busiestSourceAttempts, 10);
    assert.ok(!report.gate.failures.some((failure) => failure.code.includes("invite_quota")));
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
        failure_message: null,
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
        failure_message: null,
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
        failure_message: null,
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
    busiestInviteSourceAttempts: 0,
    walletBalanceUsd: 1,
    walletError: null,
    supportedVersions: ["0.1.0"],
    compatibilitySource: "test fixture",
    profileCostAnchorUsd: 0.3,
    lensCostAnchorUsd: 0.3,
    costAnchorSource: "test fixture"
  };
}
