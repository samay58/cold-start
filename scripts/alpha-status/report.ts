// Builds the alpha status report, gate included, from rows already read. Pure: no I/O.
import {
  ALPHA_INVITE_ATTEMPT_LIMIT,
  generationFailureCode,
  type GenerationFailureCode,
  type GenerationTrace
} from "@cold-start/core";
import { generationRunDeadAfterMs } from "@cold-start/db";

import { generationCostBreakdown } from "../generation-cost-accounting";
import { distribution } from "../lib/stats";
import {
  ALPHA_RELEASE_WALLET_FLOOR_USD,
  INVITE_QUOTA_WINDOW_MINUTES,
  MAX_RUN_ROWS,
  PROFILE_RUN_FLOOR_COUNT,
  SOFTWARE_FAILURE_CODES,
  dateNumber,
  earliestIso,
  finiteNumber,
  integer,
  iso,
  money,
  objectAt,
  stringValue
} from "./helpers";
import type {
  AllTrafficRunRow,
  AllowanceCounter,
  AlphaStatusReport,
  AlphaStatusReportInputs,
  LedgerRow,
  RunRow,
  TesterReport
} from "./types";

export function buildAlphaStatusReport(input: AlphaStatusReportInputs): AlphaStatusReport {
  const inviteGroups = groupBy(input.inviteRows, (row) => row.invite_id);
  const runGroups = groupBy(input.runRows, (row) => row.invite_id);
  const ledgerGroups = groupBy(input.ledgerRows, (row) => row.invite_id);
  const eventSummaries = new Map(input.eventSummaryRows.map((row) => [row.invite_id, row]));
  const clientErrors = nestedCounts(input.clientErrorRows, "invite_id", "code", "errors");

  const testers = [...inviteGroups.entries()].map(([inviteId, rows]) => {
    const base = rows[0];
    const activeInstallations = rows
      .filter((row) => row.installation_id && !row.installation_revoked_at)
      .sort((left, right) => dateNumber(right.last_seen_at) - dateNumber(left.last_seen_at));
    const latestInstallation = activeInstallations[0] ?? rows
      .filter((row) => row.installation_id)
      .sort((left, right) => dateNumber(right.last_seen_at) - dateNumber(left.last_seen_at))[0];
    const runs = runGroups.get(inviteId) ?? [];
    const events = eventSummaries.get(inviteId);
    const ledger = ledgerGroups.get(inviteId) ?? [];
    const companySet = new Set(runs.map((run) => run.domain));
    const eventCompanyCount = integer(events?.companies);
    const firstProfileRequestedAt = iso(events?.first_profile_requested_at)
      ?? earliestIso(runs.filter((run) => run.allowance_kind === "profile").map((run) => run.request_created_at));
    const firstProfileResultAt = iso(events?.first_profile_result_at)
      ?? earliestIso(runs
        .filter((run) => run.allowance_kind === "profile" && run.outcome !== null)
        .map((run) => run.settled_at));
    const firstLensRequestedAt = iso(events?.first_lens_requested_at)
      ?? earliestIso(runs.filter((run) => run.allowance_kind === "lens").map((run) => run.request_created_at));
    const firstLensResultAt = iso(events?.first_lens_result_at)
      ?? earliestIso(runs
        .filter((run) => run.allowance_kind === "lens" && run.outcome !== null)
        .map((run) => run.settled_at));
    const latency = latenciesForRuns(runs);

    return {
      inviteId,
      label: base.label,
      inviteStatus: base.invite_status,
      expiresAt: base.expires_at.toISOString(),
      funnelStage: funnelStage({
        acceptedAt: iso(base.accepted_at),
        connectedAt: iso(latestInstallation?.connected_at),
        firstProfileRequestedAt,
        firstProfileResultAt,
        firstLensRequestedAt,
        firstLensResultAt
      }),
      acceptedAt: iso(base.accepted_at),
      connectedAt: iso(latestInstallation?.connected_at),
      firstPanelOpenedAt: iso(events?.first_panel_opened_at),
      firstProfileRequestedAt,
      firstProfileResultAt,
      firstLensRequestedAt,
      firstLensResultAt,
      extensionVersion: latestInstallation?.extension_version ?? null,
      browser: latestInstallation?.browser ?? null,
      channel: latestInstallation?.channel ?? null,
      lastSeenAt: iso(latestInstallation?.last_seen_at),
      sessions: integer(events?.sessions),
      companies: Math.max(eventCompanyCount, companySet.size),
      dispositions: alphaDispositionCounts(runs),
      outcomes: countBy(runs.filter((run) => run.outcome), (run) => run.outcome as string),
      allowance: {
        profile: allowanceCounter(base.profile_limit, base.profile_reserved, base.profile_used),
        lens: allowanceCounter(base.lens_limit, base.lens_reserved, base.lens_used)
      },
      ledger: {
        profileDebits: ledgerEntryCount(ledger, "profile", "debit"),
        profileRefunds: ledgerEntryCount(ledger, "profile", "refund"),
        lensDebits: ledgerEntryCount(ledger, "lens", "debit"),
        lensRefunds: ledgerEntryCount(ledger, "lens", "refund")
      },
      latencyMs: latency,
      clientErrors: clientErrors.get(inviteId) ?? {}
    } satisfies TesterReport;
  });

  const uniqueRuns = uniqueGenerationRuns(input.runRows);
  const failureEvidence = [
    ...uniqueRuns,
    ...input.runRows.filter((run) => run.generation_run_id === null)
  ];
  const failureCodes = countBy(
    failureEvidence
      .map((run) => failureCode(run))
      .filter((code): code is GenerationFailureCode => code !== null),
    (code) => code
  );
  const staleOrSilentRuns = uniqueRuns.flatMap((run) => {
    if (
      !run.generation_run_id ||
      !run.generation_started_at ||
      !["queued", "running"].includes(run.generation_status ?? "")
    ) return [];
    const ageMs = input.now.getTime() - run.generation_started_at.getTime();
    const lastActivityAt = run.last_event_at ?? run.generation_started_at;
    const silentMs = input.now.getTime() - lastActivityAt.getTime();
    if (ageMs <= generationRunDeadAfterMs || silentMs <= generationRunDeadAfterMs) return [];
    return [{
      runId: run.generation_run_id,
      inviteId: run.invite_id,
      kind: run.allowance_kind,
      status: run.generation_status as string,
      ageMs,
      silentMs
    }];
  });
  const unsupportedActiveInstallations = input.inviteRows.flatMap((row) => {
    if (
      !row.installation_id ||
      row.installation_revoked_at ||
      !row.last_seen_at ||
      row.last_seen_at < input.sinceAt ||
      !row.extension_version ||
      input.supportedVersions.includes(row.extension_version)
    ) return [];
    return [{
      inviteId: row.invite_id,
      label: row.label,
      version: row.extension_version,
      lastSeenAt: row.last_seen_at.toISOString()
    }];
  });
  const spend = spendSummary(uniqueRuns);
  const chargeableTesters = testers.filter(
    (tester) => tester.inviteStatus !== "revoked" && new Date(tester.expiresAt) > input.now
  );
  const profileRemaining = chargeableTesters
    .reduce((sum, tester) => sum + tester.allowance.profile.remaining, 0);
  const lensRemaining = chargeableTesters
    .reduce((sum, tester) => sum + tester.allowance.lens.remaining, 0);
  const requiredFloorUsd = Math.max(
    ALPHA_RELEASE_WALLET_FLOOR_USD,
    input.profileCostAnchorUsd * PROFILE_RUN_FLOOR_COUNT
  );
  const remainingAllowanceExposureUsd =
    profileRemaining * input.profileCostAnchorUsd + lensRemaining * input.lensCostAnchorUsd;
  // Reliability evidence over every generation run in the window, whatever principal started
  // it. Alpha-linked runs are a subset; alpha request rows that never opened a generation run
  // are counted separately below so nothing is double-counted or missed.
  const allTrafficFailed = input.allTrafficRunRows.filter((run) => run.status === "failed");
  const allTrafficFailureCodes = countBy(allTrafficFailed, allTrafficFailureCode);
  const allTrafficSoftwareFailureCount = allTrafficFailed.filter((run) =>
    SOFTWARE_FAILURE_CODES.has(allTrafficFailureCode(run))
  ).length;
  const allTrafficStaleOrSilentRunCount = input.allTrafficRunRows.filter((run) => {
    if (!["queued", "running"].includes(run.status)) return false;
    const ageMs = input.now.getTime() - run.started_at.getTime();
    const silentMs = input.now.getTime() - (run.last_event_at ?? run.started_at).getTime();
    return ageMs > generationRunDeadAfterMs && silentMs > generationRunDeadAfterMs;
  }).length;
  const incompleteAgentcashAccountingCount = input.allTrafficRunRows.filter(
    (run) => run.agentcash_accounting_status === "receipts_partial"
  ).length;
  const requestOnlySoftwareFailureCount = input.runRows
    .filter((run) => run.generation_run_id === null)
    .map((run) => failureCode(run))
    .filter((code): code is GenerationFailureCode => code !== null && SOFTWARE_FAILURE_CODES.has(code))
    .length;
  const softwareFailureCount = allTrafficSoftwareFailureCount + requestOnlySoftwareFailureCount;

  const gateFailures: Array<{ code: string; message: string }> = [];
  if (softwareFailureCount > 0) {
    gateFailures.push({
      code: "software_failures",
      message: `${softwareFailureCount} software failure(s) appeared in the reporting window across all traffic.`
    });
  }
  if (allTrafficStaleOrSilentRunCount > 0) {
    gateFailures.push({
      code: "stale_runs",
      message: `${allTrafficStaleOrSilentRunCount} run(s) exceeded the five-minute silence policy.`
    });
  }
  if (incompleteAgentcashAccountingCount > 0) {
    gateFailures.push({
      code: "agentcash_accounting_incomplete",
      message: `${incompleteAgentcashAccountingCount} run(s) have AgentCash calls without exact settlement receipts.`
    });
  }
  if (input.walletBalanceUsd === null) {
    gateFailures.push({
      code: "wallet_unavailable",
      message: "AgentCash Base balance could not be verified."
    });
  } else if (input.walletBalanceUsd < requiredFloorUsd) {
    gateFailures.push({
      code: "wallet_floor",
      message: `AgentCash Base balance is below the release floor (${money(requiredFloorUsd)}).`
    });
  }
  if (unsupportedActiveInstallations.length > 0) {
    gateFailures.push({
      code: "unsupported_client",
      message: `${unsupportedActiveInstallations.length} recently active installation(s) use an unsupported version.`
    });
  }
  if (input.runRowsTruncated || input.allTrafficRunRowsTruncated) {
    gateFailures.push({
      code: "report_truncated",
      message: `Run evidence exceeded the ${MAX_RUN_ROWS} row reporting bound.`
    });
  }

  const allLatency = latenciesForRuns(input.runRows);
  const totalsClientErrors = mergeCounts([...clientErrors.values()]);
  const evidenceGaps = [
    "Rejected event batches and authentication failures are not persisted by the alpha event table, so this report cannot count them.",
    "Remaining AgentCash exposure uses configured cost anchors or the existing $0.30 wallet-status estimate; completed run spend uses exact receipts when available.",
    "Latency is available only when the linked generation trace or run-event timestamps contain the relevant milestone."
  ];

  return {
    generatedAt: input.now.toISOString(),
    window: {
      since: input.sinceLabel,
      sinceAt: input.sinceAt.toISOString(),
      runRowsTruncated: input.runRowsTruncated
    },
    compatibility: {
      supportedVersions: input.supportedVersions,
      source: input.compatibilitySource,
      unsupportedActiveInstallations
    },
    testers,
    totals: {
      invitations: countBy(testers, (tester) => tester.inviteStatus),
      funnel: countBy(testers, (tester) => tester.funnelStage),
      sessions: testers.reduce((sum, tester) => sum + tester.sessions, 0),
      companies: new Set(input.runRows.map((run) => run.domain)).size,
      dispositions: alphaDispositionCounts(input.runRows),
      outcomes: countBy(input.runRows.filter((run) => run.outcome), (run) => run.outcome as string),
      allowance: {
        profileRemaining,
        lensRemaining,
        profileDebits: testers.reduce((sum, tester) => sum + tester.ledger.profileDebits, 0),
        profileRefunds: testers.reduce((sum, tester) => sum + tester.ledger.profileRefunds, 0),
        lensDebits: testers.reduce((sum, tester) => sum + tester.ledger.lensDebits, 0),
        lensRefunds: testers.reduce((sum, tester) => sum + tester.ledger.lensRefunds, 0)
      },
      latencyMs: allLatency,
      failureCodes,
      providerFailures: Object.fromEntries(
        input.providerFailureRows.map((row) => [row.endpoint || "unknown", integer(row.failures)])
      ),
      staleOrSilentRuns,
      allTraffic: {
        runs: input.allTrafficRunRows.length,
        failed: allTrafficFailed.length,
        failureCodes: allTrafficFailureCodes,
        softwareFailureCount: allTrafficSoftwareFailureCount,
        staleOrSilentRunCount: allTrafficStaleOrSilentRunCount,
        incompleteAgentcashAccountingCount
      },
      clientErrors: totalsClientErrors,
      queueDrops: totalsClientErrors.analytics_queue_dropped ?? 0
    },
    spend,
    wallet: {
      available: input.walletBalanceUsd !== null,
      baseBalanceUsd: input.walletBalanceUsd,
      error: input.walletError,
      profileRunFloorCount: PROFILE_RUN_FLOOR_COUNT,
      profileProviderCostAnchorUsd: input.profileCostAnchorUsd,
      lensProviderCostAnchorUsd: input.lensCostAnchorUsd,
      costAnchorSource: input.costAnchorSource,
      requiredFloorUsd,
      remainingAllowanceExposureUsd
    },
    evidenceGaps,
    inviteQuota: {
      windowMinutes: INVITE_QUOTA_WINDOW_MINUTES,
      threshold: ALPHA_INVITE_ATTEMPT_LIMIT,
      busiestSourceAttempts: input.busiestInviteSourceAttempts,
      saturated: input.busiestInviteSourceAttempts >= ALPHA_INVITE_ATTEMPT_LIMIT
    },
    gate: {
      passed: gateFailures.length === 0,
      failures: gateFailures
    }
  };
}

function uniqueGenerationRuns(rows: RunRow[]): RunRow[] {
  const byRun = new Map<string, RunRow>();
  for (const row of rows) {
    if (row.generation_run_id && !byRun.has(row.generation_run_id)) {
      byRun.set(row.generation_run_id, row);
    }
  }
  return [...byRun.values()];
}

function spendSummary(runs: RunRow[]): AlphaStatusReport["spend"] {
  let successfulUsd = 0;
  let successfulRunsWithCost = 0;
  let successfulRunsMissingCost = 0;
  let failedUsd = 0;
  let failedRunsWithCost = 0;
  let failedRunsMissingCost = 0;

  for (const run of runs) {
    if (!["complete", "failed"].includes(run.generation_status ?? "")) continue;
    const cost = runCost(run);
    if (run.generation_status === "failed") {
      if (cost === null) failedRunsMissingCost += 1;
      else {
        failedUsd += cost;
        failedRunsWithCost += 1;
      }
    } else if (cost === null) {
      successfulRunsMissingCost += 1;
    } else {
      successfulUsd += cost;
      successfulRunsWithCost += 1;
    }
  }
  return {
    successfulUsd,
    successfulRunsWithCost,
    successfulRunsMissingCost,
    failedUsd,
    failedRunsWithCost,
    failedRunsMissingCost,
    note: "Allowance refunds do not reverse provider or LLM spend."
  };
}

function runCost(run: RunRow): number | null {
  return generationCostBreakdown(
    run.trace_json as GenerationTrace | null,
    run.generation_cost_usd
  ).totalUsd;
}

// request_failure_code and the traced failure.code are both app-written from
// generationFailureCode(), so this cast reflects an existing invariant rather than adding one.
// Codes stored in trace_json are frozen at failure time by whatever classifier version was
// deployed then; the 2026-08-09 through 08-11 credit-exhaustion runs all read "unknown" forever
// under the stored code. Both helpers therefore re-derive from the stored failure message with
// the current classifier and fall back to the stored code only when the message yields nothing.
function failureCode(run: RunRow): GenerationFailureCode | null {
  const failure = objectAt(run.trace_json, "failure");
  const message = stringValue(failure?.message);
  const derived = message === null ? "unknown" : generationFailureCode(message);
  if (derived !== "unknown") return derived;
  return (run.request_failure_code ?? stringValue(failure?.code)) as GenerationFailureCode | null;
}

function allTrafficFailureCode(run: AllTrafficRunRow): GenerationFailureCode {
  const derived = run.failure_message === null ? "unknown" : generationFailureCode(run.failure_message);
  if (derived !== "unknown") return derived;
  return (run.failure_code ?? "unknown") as GenerationFailureCode;
}

function latenciesForRuns(runs: RunRow[]): TesterReport["latencyMs"] {
  const firstProgress: number[] = [];
  const firstUsable: number[] = [];
  const lens: number[] = [];
  const seenRuns = new Set<string>();

  for (const run of runs) {
    if (!run.generation_run_id || seenRuns.has(run.generation_run_id)) continue;
    seenRuns.add(run.generation_run_id);
    if (run.generation_started_at && run.first_event_at) {
      const elapsed = run.first_event_at.getTime() - run.generation_started_at.getTime();
      if (elapsed >= 0) firstProgress.push(elapsed);
    }
    const milestones = objectAt(run.trace_json, "milestones");
    const firstUsableMs = finiteNumber(milestones?.firstUsableCardMs);
    if (firstUsableMs !== null) firstUsable.push(firstUsableMs);
    if (run.allowance_kind === "lens") {
      const analysisReadyMs = finiteNumber(milestones?.analysisReadyMs);
      if (analysisReadyMs !== null) {
        lens.push(analysisReadyMs);
      } else if (run.generation_started_at && run.generation_completed_at) {
        lens.push(run.generation_completed_at.getTime() - run.generation_started_at.getTime());
      }
    }
  }
  return {
    firstProgress: distribution(firstProgress),
    firstUsable: distribution(firstUsable),
    lens: distribution(lens)
  };
}

function allowanceCounter(
  limit: number,
  reserved: number | null,
  used: number | null
): AllowanceCounter {
  const safeReserved = reserved ?? 0;
  const safeUsed = used ?? 0;
  return {
    limit,
    reserved: safeReserved,
    used: safeUsed,
    remaining: Math.max(0, limit - safeReserved - safeUsed)
  };
}

function ledgerEntryCount(
  rows: LedgerRow[],
  allowanceKind: LedgerRow["allowance_kind"],
  entryKind: LedgerRow["entry_kind"]
): number {
  return integer(rows.find(
    (row) => row.allowance_kind === allowanceKind && row.entry_kind === entryKind
  )?.entries);
}

function funnelStage(input: {
  acceptedAt: string | null;
  connectedAt: string | null;
  firstProfileRequestedAt: string | null;
  firstProfileResultAt: string | null;
  firstLensRequestedAt: string | null;
  firstLensResultAt: string | null;
}): string {
  if (input.firstLensResultAt) return "lens_result";
  if (input.firstLensRequestedAt) return "lens_requested";
  if (input.firstProfileResultAt) return "profile_result";
  if (input.firstProfileRequestedAt) return "profile_requested";
  if (input.connectedAt) return "connected";
  if (input.acceptedAt) return "accepted";
  return "invited";
}

function nestedCounts<
  Row extends Record<Outer | Inner | Value, string>,
  Outer extends keyof Row,
  Inner extends keyof Row,
  Value extends keyof Row
>(
  rows: Row[],
  outer: Outer,
  inner: Inner,
  value: Value
): Map<string, Record<string, number>> {
  const result = new Map<string, Record<string, number>>();
  for (const row of rows) {
    const outerKey = row[outer];
    const innerKey = row[inner];
    const counts = result.get(outerKey) ?? {};
    counts[innerKey] = integer(row[value]);
    result.set(outerKey, counts);
  }
  return result;
}

function groupBy<Row>(
  rows: Row[],
  keyFor: (row: Row) => string
): Map<string, Row[]> {
  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    const key = keyFor(row);
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  return groups;
}

function countBy<Row>(
  rows: Row[],
  keyFor: (row: Row) => string
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    const key = keyFor(row);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function alphaDispositionCounts(rows: RunRow[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    const primary = row.disposition === "started" ? "fresh" : row.disposition;
    counts[primary] = (counts[primary] ?? 0) + 1;
    if (row.outcome === "withheld" && primary !== "withheld") {
      counts.withheld = (counts.withheld ?? 0) + 1;
    }
    if (row.outcome === "failed" || row.outcome === "watchdog_retired") {
      counts.failed = (counts.failed ?? 0) + 1;
    }
  }
  return counts;
}

function mergeCounts(counts: Record<string, number>[]): Record<string, number> {
  const merged: Record<string, number> = {};
  for (const group of counts) {
    for (const [key, value] of Object.entries(group)) {
      merged[key] = (merged[key] ?? 0) + value;
    }
  }
  return merged;
}
