#!/usr/bin/env tsx

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { Client } from "pg";

import type { GenerationFailureCode } from "@cold-start/core";
import { generationRunDeadAfterMs } from "@cold-start/db";

import {
  databaseUrl,
  dateBefore,
  fetchAgentCashAccounts,
  hasFlag,
  loadProductionEnv,
  parseCliArguments,
  runCli,
  safeError,
  valueFor
} from "./alpha-common";

const MAX_RUN_ROWS = 10_000;
const ALPHA_RELEASE_WALLET_FLOOR_USD = 35;
const PROFILE_RUN_FLOOR_COUNT = 10;
const SOFTWARE_FAILURE_CODES = new Set<GenerationFailureCode>(["model_contract", "concurrent_write", "unknown"]);
// Mirrors BREAKER_WINDOW_MS/BREAKER_THRESHOLD in
// apps/web/src/app/api/alpha/invite/invite-service.ts. That module reads through the Drizzle
// ColdStartDb; this script queries alpha_invite_attempts directly through its own raw pg.Client
// (lens3 F3: the operator had no visibility into the breaker, only a friend's "connection lost"
// report). Keep this window/threshold pair in sync if the source ever changes.
const BREAKER_WINDOW_MINUTES = 60;
const BREAKER_THRESHOLD = 10;

type JsonObject = Record<string, unknown>;

type InviteInstallationRow = {
  invite_id: string;
  label: string;
  invite_status: "pending" | "active" | "revoked";
  expires_at: Date;
  accepted_at: Date | null;
  invite_created_at: Date;
  profile_limit: number;
  profile_reserved: number | null;
  profile_used: number | null;
  lens_limit: number;
  lens_reserved: number | null;
  lens_used: number | null;
  installation_id: string | null;
  extension_version: string | null;
  browser: string | null;
  channel: string | null;
  connected_at: Date | null;
  last_seen_at: Date | null;
  installation_revoked_at: Date | null;
};

type RunRow = {
  request_id: string;
  invite_id: string;
  installation_id: string;
  allowance_kind: "profile" | "lens";
  slug: string;
  domain: string;
  disposition: string;
  outcome: string | null;
  request_failure_code: string | null;
  request_created_at: Date;
  settled_at: Date | null;
  generation_run_id: string | null;
  generation_status: string | null;
  generation_cost_usd: string | null;
  trace_json: JsonObject | null;
  generation_started_at: Date | null;
  generation_completed_at: Date | null;
  first_event_at: Date | null;
  last_event_at: Date | null;
};

type LedgerRow = {
  invite_id: string;
  allowance_kind: "profile" | "lens";
  entry_kind: "debit" | "refund";
  entries: string;
  amount: string;
};

type EventSummaryRow = {
  invite_id: string;
  sessions: string;
  companies: string;
  first_panel_opened_at: Date | null;
  first_profile_requested_at: Date | null;
  first_profile_result_at: Date | null;
  first_lens_requested_at: Date | null;
  first_lens_result_at: Date | null;
  client_errors: string;
};

type ClientErrorRow = {
  invite_id: string;
  code: string;
  errors: string;
};

type ProviderFailureRow = {
  endpoint: string;
  failures: string;
};

// Every generation run in the window, whatever principal started it. The alpha-scoped RunRow
// evidence above only covers runs that opened an alpha_run_requests row, which left three days
// of operator-token software failures invisible to the gate (2026-07-24 through 2026-07-27).
type AllTrafficRunRow = {
  id: string;
  slug: string;
  mode: string;
  job_kind: string;
  status: string;
  failure_code: string | null;
  started_at: Date;
  completed_at: Date | null;
  last_event_at: Date | null;
};

type TesterReport = {
  inviteId: string;
  label: string;
  inviteStatus: string;
  expiresAt: string;
  funnelStage: string;
  acceptedAt: string | null;
  connectedAt: string | null;
  firstPanelOpenedAt: string | null;
  firstProfileRequestedAt: string | null;
  firstProfileResultAt: string | null;
  firstLensRequestedAt: string | null;
  firstLensResultAt: string | null;
  extensionVersion: string | null;
  browser: string | null;
  channel: string | null;
  lastSeenAt: string | null;
  sessions: number;
  companies: number;
  dispositions: Record<string, number>;
  outcomes: Record<string, number>;
  allowance: {
    profile: AllowanceCounter;
    lens: AllowanceCounter;
  };
  ledger: {
    profileDebits: number;
    profileRefunds: number;
    lensDebits: number;
    lensRefunds: number;
  };
  latencyMs: {
    firstProgress: Distribution;
    firstUsable: Distribution;
    lens: Distribution;
  };
  clientErrors: Record<string, number>;
};

type AllowanceCounter = {
  limit: number;
  reserved: number;
  used: number;
  remaining: number;
};

type Distribution = {
  n: number;
  p50: number | null;
  p90: number | null;
  max: number | null;
};

export type AlphaStatusReport = {
  generatedAt: string;
  window: {
    since: string;
    sinceAt: string;
    runRowsTruncated: boolean;
  };
  compatibility: {
    supportedVersions: string[];
    source: string;
    unsupportedActiveInstallations: Array<{
      inviteId: string;
      label: string;
      version: string;
      lastSeenAt: string;
    }>;
  };
  testers: TesterReport[];
  totals: {
    invitations: Record<string, number>;
    funnel: Record<string, number>;
    sessions: number;
    companies: number;
    dispositions: Record<string, number>;
    outcomes: Record<string, number>;
    allowance: {
      profileRemaining: number;
      lensRemaining: number;
      profileDebits: number;
      profileRefunds: number;
      lensDebits: number;
      lensRefunds: number;
    };
    latencyMs: {
      firstProgress: Distribution;
      firstUsable: Distribution;
      lens: Distribution;
    };
    failureCodes: Record<string, number>;
    providerFailures: Record<string, number>;
    staleOrSilentRuns: Array<{
      runId: string;
      inviteId: string;
      kind: string;
      status: string;
      ageMs: number;
      silentMs: number;
    }>;
    allTraffic: {
      runs: number;
      failed: number;
      failureCodes: Record<string, number>;
      softwareFailureCount: number;
      staleOrSilentRunCount: number;
    };
    clientErrors: Record<string, number>;
    queueDrops: number;
  };
  spend: {
    successfulUsd: number;
    successfulRunsWithCost: number;
    successfulRunsMissingCost: number;
    failedUsd: number;
    failedRunsWithCost: number;
    failedRunsMissingCost: number;
    note: string;
  };
  wallet: {
    available: boolean;
    baseBalanceUsd: number | null;
    error: string | null;
    profileRunFloorCount: number;
    profileProviderCostAnchorUsd: number;
    lensProviderCostAnchorUsd: number;
    costAnchorSource: string;
    requiredFloorUsd: number;
    remainingAllowanceExposureUsd: number;
  };
  evidenceGaps: string[];
  breaker: {
    windowMinutes: number;
    threshold: number;
    recentAttempts: number;
    open: boolean;
  };
  gate: {
    passed: boolean;
    failures: Array<{ code: string; message: string }>;
  };
};

export type AlphaStatusReportInputs = {
  now: Date;
  sinceLabel: string;
  sinceAt: Date;
  inviteRows: InviteInstallationRow[];
  runRows: RunRow[];
  runRowsTruncated: boolean;
  allTrafficRunRows: AllTrafficRunRow[];
  allTrafficRunRowsTruncated: boolean;
  ledgerRows: LedgerRow[];
  eventSummaryRows: EventSummaryRow[];
  clientErrorRows: ClientErrorRow[];
  providerFailureRows: ProviderFailureRow[];
  recentInviteAttempts: number;
  walletBalanceUsd: number | null;
  walletError: string | null;
  supportedVersions: string[];
  compatibilitySource: string;
  profileCostAnchorUsd: number;
  lensCostAnchorUsd: number;
  costAnchorSource: string;
};

const HELP = `Report friend-alpha funnel, allowance, reliability, and spend evidence.

Usage:
  npm run alpha:status -- --since 7d
  npm run alpha:status -- --since 7d --json
  npm run alpha:status -- --gate

Options:
  --since <duration>  Reporting window, default 7d
  --json              Emit stable machine-readable JSON
  --gate              Exit 2 unless software failures, stale runs, wallet floor,
                      and extension compatibility checks pass
  --help              Show this help

Environment:
  ALPHA_SUPPORTED_EXTENSION_VERSIONS   Comma-separated accepted versions
  ALPHA_PROFILE_WORST_CASE_USD         Per-profile AgentCash exposure anchor
  ALPHA_LENS_WORST_CASE_USD            Per-Lens AgentCash exposure anchor

If cost anchors are unset, the report uses the existing wallet-status $0.30
conservative provider-run estimate and labels it as an estimate.`;

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const args = parseCliArguments(argv);
  if (hasFlag(args, "--help")) {
    console.log(HELP);
    return;
  }

  const sinceLabel = valueFor(args, "--since") ?? "7d";
  const now = new Date();
  const sinceAt = dateBefore(now, sinceLabel, "--since");
  const json = hasFlag(args, "--json");
  const gate = hasFlag(args, "--gate");

  loadProductionEnv();
  const compatibility = supportedCompatibility();
  const costs = costAnchors();
  const client = new Client({ connectionString: databaseUrl() });
  await client.connect();
  let databaseEvidence: Awaited<ReturnType<typeof readDatabaseEvidence>>;
  try {
    databaseEvidence = await readDatabaseEvidence(client, sinceAt);
  } finally {
    await client.end();
  }

  const wallet = await fetchAgentCashAccounts()
    .then((accounts) => ({
      balance: accounts.find((account) => account.network.toLowerCase() === "base")?.balance ?? null,
      error: null
    }))
    .catch((error: unknown) => ({
      balance: null,
      error: safeError(error)
    }));

  const report = buildAlphaStatusReport({
    now,
    sinceLabel,
    sinceAt,
    ...databaseEvidence,
    walletBalanceUsd: wallet.balance,
    walletError: wallet.error,
    supportedVersions: compatibility.versions,
    compatibilitySource: compatibility.source,
    profileCostAnchorUsd: costs.profile,
    lensCostAnchorUsd: costs.lens,
    costAnchorSource: costs.source
  });

  console.log(json ? JSON.stringify(report, null, 2) : formatAlphaStatusReport(report));
  if (gate && !report.gate.passed) {
    process.exitCode = 2;
  }
}

async function readDatabaseEvidence(client: Client, sinceAt: Date) {
  const inviteRows = await client.query<InviteInstallationRow>(
    `select
       i.id as invite_id,
       i.label,
       i.status as invite_status,
       i.expires_at,
       i.accepted_at,
       i.created_at as invite_created_at,
       i.profile_limit,
       a.profile_reserved,
       a.profile_used,
       i.lens_limit,
       a.lens_reserved,
       a.lens_used,
       installation.id as installation_id,
       installation.extension_version,
       installation.browser,
       installation.channel,
       installation.connected_at,
       installation.last_seen_at,
       installation.revoked_at as installation_revoked_at
     from alpha_invites i
     left join alpha_allowances a on a.invite_id = i.id
     left join alpha_installations installation on installation.invite_id = i.id
     order by i.created_at, installation.connected_at`
  );

  const rawRuns = await client.query<RunRow>(
    `select
       request.id as request_id,
       request.invite_id,
       request.installation_id,
       request.allowance_kind,
       request.slug,
       request.domain,
       request.disposition,
       request.outcome,
       request.failure_code as request_failure_code,
       request.created_at as request_created_at,
       request.settled_at,
       run.id as generation_run_id,
       run.status as generation_status,
       run.cost_usd as generation_cost_usd,
       run.trace_json,
       run.started_at as generation_started_at,
       run.completed_at as generation_completed_at,
       event_bounds.first_event_at,
       event_bounds.last_event_at
     from alpha_run_requests request
     left join generation_runs run on run.id = request.generation_run_id
     left join lateral (
       select min(event.created_at) as first_event_at, max(event.created_at) as last_event_at
       from research_run_events event
       where event.run_id = run.id::text
     ) event_bounds on true
     where request.created_at >= $1
     order by request.created_at desc
     limit $2`,
    [sinceAt, MAX_RUN_ROWS + 1]
  );

  const allTrafficRuns = await client.query<AllTrafficRunRow>(
    `select
       run.id,
       run.slug,
       run.mode,
       run.job_kind,
       run.status,
       run.trace_json #>> '{failure,code}' as failure_code,
       run.started_at,
       run.completed_at,
       event_bounds.last_event_at
     from generation_runs run
     left join lateral (
       select max(event.created_at) as last_event_at
       from research_run_events event
       where event.run_id = run.id::text
     ) event_bounds on true
     where run.started_at >= $1
     order by run.started_at desc
     limit $2`,
    [sinceAt, MAX_RUN_ROWS + 1]
  );

  const ledgerRows = await client.query<LedgerRow>(
    `select invite_id, allowance_kind, entry_kind, count(*)::text as entries, sum(amount)::text as amount
     from alpha_allowance_ledger
     where created_at >= $1
     group by invite_id, allowance_kind, entry_kind`,
    [sinceAt]
  );

  const eventSummaryRows = await client.query<EventSummaryRow>(
    `select
       invite_id,
       count(distinct session_id)::text as sessions,
       count(distinct nullif(properties_json->>'domain', ''))::text as companies,
       min(occurred_at) filter (where event_name = 'panel.opened') as first_panel_opened_at,
       min(occurred_at) filter (where event_name = 'profile.generate_requested') as first_profile_requested_at,
       min(occurred_at) filter (where event_name = 'profile.first_payoff_viewed') as first_profile_result_at,
       min(occurred_at) filter (where event_name = 'lens.run_requested') as first_lens_requested_at,
       min(occurred_at) filter (where event_name = 'lens.result_viewed') as first_lens_result_at,
       count(*) filter (where event_name = 'client.error_presented')::text as client_errors
     from alpha_events
     where received_at >= $1
     group by invite_id`,
    [sinceAt]
  );

  const clientErrorRows = await client.query<ClientErrorRow>(
    `select
       invite_id,
       coalesce(properties_json->>'code', 'unknown') as code,
       sum(
         case
           when properties_json->>'code' = 'analytics_queue_dropped'
             then greatest(coalesce((properties_json->>'count')::int, 1), 1)
           else 1
         end
       )::text as errors
     from alpha_events
     where received_at >= $1 and event_name = 'client.error_presented'
     group by invite_id, coalesce(properties_json->>'code', 'unknown')`,
    [sinceAt]
  );

  const breakerAttempts = await client.query<{ count: string }>(
    `select count(*)::text as count
     from alpha_invite_attempts
     where created_at >= now() - interval '${BREAKER_WINDOW_MINUTES} minutes'`
  );

  const providerFailureRows = await client.query<ProviderFailureRow>(
    `select endpoint.value->>'name' as endpoint, count(distinct run.id)::text as failures
     from alpha_run_requests request
     join generation_runs run on run.id = request.generation_run_id
     cross join lateral jsonb_array_elements(
       coalesce(run.trace_json #> '{providers,stableenrich,endpoints}', '[]'::jsonb)
     ) endpoint(value)
     where request.created_at >= $1 and endpoint.value->>'status' = 'failed'
     group by endpoint.value->>'name'
     order by count(distinct run.id) desc, endpoint.value->>'name'`,
    [sinceAt]
  );

  const runRowsTruncated = rawRuns.rows.length > MAX_RUN_ROWS;
  const allTrafficRunRowsTruncated = allTrafficRuns.rows.length > MAX_RUN_ROWS;
  return {
    inviteRows: inviteRows.rows,
    runRows: rawRuns.rows.slice(0, MAX_RUN_ROWS),
    runRowsTruncated,
    allTrafficRunRows: allTrafficRuns.rows.slice(0, MAX_RUN_ROWS),
    allTrafficRunRowsTruncated,
    ledgerRows: ledgerRows.rows,
    eventSummaryRows: eventSummaryRows.rows,
    clientErrorRows: clientErrorRows.rows,
    providerFailureRows: providerFailureRows.rows,
    recentInviteAttempts: integer(breakerAttempts.rows[0]?.count)
  };
}

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
  const allTrafficFailureCodes = countBy(allTrafficFailed, (run) => run.failure_code ?? "unknown");
  const allTrafficSoftwareFailureCount = allTrafficFailed.filter((run) =>
    SOFTWARE_FAILURE_CODES.has((run.failure_code ?? "unknown") as GenerationFailureCode)
  ).length;
  const allTrafficStaleOrSilentRunCount = input.allTrafficRunRows.filter((run) => {
    if (!["queued", "running"].includes(run.status)) return false;
    const ageMs = input.now.getTime() - run.started_at.getTime();
    const silentMs = input.now.getTime() - (run.last_event_at ?? run.started_at).getTime();
    return ageMs > generationRunDeadAfterMs && silentMs > generationRunDeadAfterMs;
  }).length;
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
    "AgentCash exposure uses configured cost anchors or the existing $0.30 wallet-status estimate. It is not provider billing reconciliation.",
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
        staleOrSilentRunCount: allTrafficStaleOrSilentRunCount
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
    breaker: {
      windowMinutes: BREAKER_WINDOW_MINUTES,
      threshold: BREAKER_THRESHOLD,
      recentAttempts: input.recentInviteAttempts,
      open: input.recentInviteAttempts >= BREAKER_THRESHOLD
    },
    gate: {
      passed: gateFailures.length === 0,
      failures: gateFailures
    }
  };
}

export function formatAlphaStatusReport(report: AlphaStatusReport): string {
  const lines = [
    `Friend alpha status (${report.window.since}, since ${report.window.sinceAt})`,
    "",
    "Tester funnel",
    "Label | Stage | Version | Last seen | Sessions | Companies | Profile | Lens"
  ];
  if (report.testers.length === 0) {
    lines.push("(no alpha invitations)");
  }
  for (const tester of report.testers) {
    lines.push([
      tester.label,
      tester.funnelStage,
      tester.extensionVersion ?? "-",
      tester.lastSeenAt ?? "-",
      String(tester.sessions),
      String(tester.companies),
      `${tester.allowance.profile.remaining}/${tester.allowance.profile.limit}`,
      `${tester.allowance.lens.remaining}/${tester.allowance.lens.limit}`
    ].join(" | "));
    lines.push(
      `  ${tester.inviteId}  dispositions ${formatCounts(tester.dispositions)}  outcomes ${formatCounts(tester.outcomes)}`
    );
  }

  lines.push(
    "",
    "Usage and allowance",
    `Sessions: ${report.totals.sessions}; companies: ${report.totals.companies}`,
    `Dispositions: ${formatCounts(report.totals.dispositions)}`,
    `Outcomes: ${formatCounts(report.totals.outcomes)}`,
    `Profiles: ${report.totals.allowance.profileRemaining} remaining, ${report.totals.allowance.profileDebits} debits, ${report.totals.allowance.profileRefunds} refunds`,
    `Lens: ${report.totals.allowance.lensRemaining} remaining, ${report.totals.allowance.lensDebits} debits, ${report.totals.allowance.lensRefunds} refunds`,
    "",
    "Latency",
    `First progress: ${formatDistribution(report.totals.latencyMs.firstProgress)}`,
    `First usable: ${formatDistribution(report.totals.latencyMs.firstUsable)}`,
    `Lens: ${formatDistribution(report.totals.latencyMs.lens)}`,
    "",
    "Reliability",
    `Failure codes: ${formatCounts(report.totals.failureCodes)}`,
    `Provider failures: ${formatCounts(report.totals.providerFailures)}`,
    `Stale or silent runs: ${report.totals.staleOrSilentRuns.length}`,
    `Client errors: ${formatCounts(report.totals.clientErrors)}`,
    `Offline queue drops: ${report.totals.queueDrops}`,
    "",
    "Reliability, all traffic (any principal)",
    `Runs: ${report.totals.allTraffic.runs}; failed: ${report.totals.allTraffic.failed}`,
    `Failure codes: ${formatCounts(report.totals.allTraffic.failureCodes)}`,
    `Software failures: ${report.totals.allTraffic.softwareFailureCount}`,
    `Stale or silent runs: ${report.totals.allTraffic.staleOrSilentRunCount}`,
    "",
    "Spend and exposure",
    `Successful spend: ${money(report.spend.successfulUsd)} across ${report.spend.successfulRunsWithCost} costed runs; ${report.spend.successfulRunsMissingCost} missing cost`,
    `Failed spend: ${money(report.spend.failedUsd)} across ${report.spend.failedRunsWithCost} costed runs; ${report.spend.failedRunsMissingCost} missing cost`,
    report.wallet.available
      ? `AgentCash Base: ${money(report.wallet.baseBalanceUsd as number)}`
      : `AgentCash Base: unavailable (${report.wallet.error ?? "unknown error"})`,
    `Release wallet floor: ${money(report.wallet.requiredFloorUsd)}`,
    `Remaining allowance provider exposure: ${money(report.wallet.remainingAllowanceExposureUsd)} (${report.wallet.costAnchorSource})`,
    "",
    "Invite breaker",
    `${report.breaker.recentAttempts} invalid attempt(s) in the trailing ${report.breaker.windowMinutes} minutes (threshold ${report.breaker.threshold})`,
    report.breaker.open ? "OPEN: invite/inspect, invite/redeem, and /i/{slug} are all answering 429/miss." : "closed",
    "",
    `Supported extension versions: ${report.compatibility.supportedVersions.join(", ")} (${report.compatibility.source})`,
    `Unsupported active installations: ${report.compatibility.unsupportedActiveInstallations.length}`,
    "",
    report.gate.passed ? "GATE PASS" : "GATE FAIL"
  );
  for (const failure of report.gate.failures) {
    lines.push(`  ${failure.code}: ${failure.message}`);
  }
  if (report.evidenceGaps.length > 0) {
    lines.push("", "Evidence gaps");
    for (const gap of report.evidenceGaps) lines.push(`  ${gap}`);
  }
  return lines.join("\n");
}

function supportedCompatibility(): { versions: string[]; source: string } {
  const configured = process.env.ALPHA_SUPPORTED_EXTENSION_VERSIONS
    ?.split(",")
    .map((version) => version.trim())
    .filter(Boolean);
  if (configured?.length) {
    return { versions: [...new Set(configured)], source: "ALPHA_SUPPORTED_EXTENSION_VERSIONS" };
  }
  const packageJson = JSON.parse(
    readFileSync(resolve(process.cwd(), "apps/extension/package.json"), "utf8")
  ) as { version?: unknown };
  if (typeof packageJson.version !== "string" || !packageJson.version) {
    throw new Error("Unable to derive the current extension version.");
  }
  return {
    versions: [packageJson.version],
    source: "apps/extension/package.json current build"
  };
}

function costAnchors(): {
  profile: number;
  lens: number;
  source: string;
} {
  const configuredProfile = optionalPositiveNumber(process.env.ALPHA_PROFILE_WORST_CASE_USD);
  const configuredLens = optionalPositiveNumber(process.env.ALPHA_LENS_WORST_CASE_USD);
  const profile = configuredProfile ?? 0.3;
  const lens = configuredLens ?? profile;
  const source = configuredProfile !== null
    ? configuredLens !== null
      ? "configured alpha worst-case anchors"
      : "configured profile anchor; Lens inherits profile anchor"
    : "wallet-status conservative $0.30 provider-run estimate";
  return { profile, lens, source };
}

function optionalPositiveNumber(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("Alpha cost anchors must be positive numbers.");
  }
  return value;
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
  const stored = run.generation_cost_usd === null ? null : Number(run.generation_cost_usd);
  if (stored !== null && Number.isFinite(stored)) return stored;
  const traced = finiteNumber(run.trace_json?.costUsdAnthropic)
    ?? finiteNumber(objectAt(run.trace_json, "llm")?.totalEstimatedCostUsd);
  return traced;
}

// request_failure_code and the traced failure.code are both app-written from
// generationFailureCode(), so this cast reflects an existing invariant rather than adding one.
function failureCode(run: RunRow): GenerationFailureCode | null {
  return (run.request_failure_code
    ?? stringValue(objectAt(run.trace_json, "failure")?.code)) as GenerationFailureCode | null;
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

function distribution(values: number[]): Distribution {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  return {
    n: sorted.length,
    p50: percentile(sorted, 50),
    p90: percentile(sorted, 90),
    max: sorted.length ? sorted[sorted.length - 1] : null
  };
}

function percentile(sorted: number[], value: number): number | null {
  if (sorted.length === 0) return null;
  const index = Math.ceil((value / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))];
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

function objectAt(value: JsonObject | null | undefined, key: string): JsonObject | null {
  const nested = value?.[key];
  return nested && typeof nested === "object" && !Array.isArray(nested)
    ? nested as JsonObject
    : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function integer(value: string | number | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isInteger(parsed) ? parsed : 0;
}

function dateNumber(value: Date | null | undefined): number {
  return value?.getTime() ?? 0;
}

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function earliestIso(values: Array<Date | null>): string | null {
  const timestamps = values.flatMap((value) => value ? [value.getTime()] : []);
  return timestamps.length ? new Date(Math.min(...timestamps)).toISOString() : null;
}

function formatCounts(counts: Record<string, number>): string {
  const entries = Object.entries(counts).sort(([left], [right]) => left.localeCompare(right));
  return entries.length ? entries.map(([key, value]) => `${key}=${value}`).join(", ") : "none";
}

function formatDistribution(value: Distribution): string {
  if (value.n === 0) return "unavailable";
  return `n=${value.n}, p50=${formatMs(value.p50)}, p90=${formatMs(value.p90)}, max=${formatMs(value.max)}`;
}

function formatMs(value: number | null): string {
  if (value === null) return "-";
  return value < 1_000 ? `${Math.round(value)}ms` : `${(value / 1_000).toFixed(1)}s`;
}

function money(value: number): string {
  return `$${value.toFixed(4)}`;
}

runCli(import.meta.url, main);
