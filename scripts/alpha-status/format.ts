// Plain-text rendering of the alpha status report.
import type { Distribution } from "../lib/stats";
import { money } from "./helpers";
import type { AlphaStatusReport } from "./types";

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
    `Incomplete AgentCash accounting: ${report.totals.allTraffic.incompleteAgentcashAccountingCount}`,
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
    "Invite source quota",
    `${report.inviteQuota.busiestSourceAttempts} attempt(s) from the busiest source in the trailing ${report.inviteQuota.windowMinutes} minutes (limit ${report.inviteQuota.threshold})`,
    report.inviteQuota.saturated ? "At least one source is throttled." : "No source is throttled.",
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
