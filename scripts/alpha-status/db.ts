// Every Postgres read behind the alpha status report, in one pass over one client.
import type { Client } from "pg";

import { INVITE_QUOTA_WINDOW_MINUTES, MAX_RUN_ROWS, integer } from "./helpers";
import type {
  AllTrafficRunRow,
  ClientErrorRow,
  EventSummaryRow,
  InviteInstallationRow,
  LedgerRow,
  ProviderFailureRow,
  RunRow
} from "./types";

export async function readDatabaseEvidence(client: Client, sinceAt: Date) {
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
       run.trace_json #>> '{failure,message}' as failure_message,
       run.trace_json #>> '{providers,stableenrich,accountingStatus}' as agentcash_accounting_status,
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

  const inviteQuota = await client.query<{ count: string }>(
    `select coalesce(max(source_attempts), 0)::text as count
     from (
       select count(*) as source_attempts
       from alpha_invite_attempts
       where created_at >= now() - interval '${INVITE_QUOTA_WINDOW_MINUTES} minutes'
         and source_hash is not null
       group by source_hash
     ) attempts`
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
    busiestInviteSourceAttempts: integer(inviteQuota.rows[0]?.count)
  };
}
