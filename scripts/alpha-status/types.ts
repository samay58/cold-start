// Row shapes read from Postgres and the report shape built from them.
import type { Distribution } from "../lib/stats";

export type JsonObject = Record<string, unknown>;

export type InviteInstallationRow = {
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

export type RunRow = {
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

export type LedgerRow = {
  invite_id: string;
  allowance_kind: "profile" | "lens";
  entry_kind: "debit" | "refund";
  entries: string;
  amount: string;
};

export type EventSummaryRow = {
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

export type ClientErrorRow = {
  invite_id: string;
  code: string;
  errors: string;
};

export type ProviderFailureRow = {
  endpoint: string;
  failures: string;
};

// Every generation run in the window, whatever principal started it. The alpha-scoped RunRow
// evidence above only covers runs that opened an alpha_run_requests row, which left three days
// of operator-token software failures invisible to the gate (2026-07-24 through 2026-07-27).
export type AllTrafficRunRow = {
  id: string;
  slug: string;
  mode: string;
  job_kind: string;
  status: string;
  failure_code: string | null;
  failure_message: string | null;
  agentcash_accounting_status?: string | null;
  started_at: Date;
  completed_at: Date | null;
  last_event_at: Date | null;
};

export type TesterReport = {
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

export type AllowanceCounter = {
  limit: number;
  reserved: number;
  used: number;
  remaining: number;
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
      incompleteAgentcashAccountingCount: number;
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
  inviteQuota: {
    windowMinutes: number;
    threshold: number;
    busiestSourceAttempts: number;
    saturated: boolean;
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
  busiestInviteSourceAttempts: number;
  walletBalanceUsd: number | null;
  walletError: string | null;
  supportedVersions: string[];
  compatibilitySource: string;
  profileCostAnchorUsd: number;
  lensCostAnchorUsd: number;
  costAnchorSource: string;
};
