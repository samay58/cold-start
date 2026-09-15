# How it wins recovery

Status: proposed for implementation. Source inspected at `fe4493658ad647d393b4e489aeeff700c2105892`.

Keep the company profile available when How it wins fails. Correct recoverable model-output errors within a fixed budget. Save the outcome so the extension can explain what happened and retry only the unfinished read.

## What happened

Production Column analysis completed on September 14 at 9:19 p.m. New York time. It dispatched How it wins. The judge step ran for 131.297 seconds and returned `Validation failed at strategyEvaluations.16: Invalid input`. No judgment was saved. The worker returned `{slug: "column", status: "failed"}` normally, so Inngest reports its execution as `COMPLETED`.

The missing result is not evidence that Column has no advantage. It means the read failed.

Confirmed causes:

- `parseGlobalJudgment` parses the transport schema before running semantic repairs. A Zod error escapes because the correction handler only accepts `HowItWinsJudgmentClosedError`.
- Strategy entries have three strict allowed shapes. Their union error is shortened to “Invalid input”; nested field errors are lost at the worker boundary.
- Judge usage reaches the parent trace only after a valid judgment returns. A rejected judgment loses its call metadata even if the provider supplied usage.
- The extension stops waiting on every `how-it-wins.complete` event. With no saved result, it selects `not_read`, whose component renders nothing. Reloading cannot recover a durable failed state from the card.
- The judge transport permits 360 seconds while `/api/inngest` permits 300 seconds. Correction and provider retry layers can multiply calls within a single durable step. The compatibility-provider timeout races a promise without cancelling the underlying request.

A local controlled test reproduced the same union-error path at entry 17: the unchanged 80-entry control passed; removing one required field produced a Zod error and exactly one adapter call. An assertion requiring a correction failed. This proves the recovery gap. It does not reconstruct Column's missing field. Its rejected output was not retained.

See [the diagnosis record](../../qa/column-how-it-wins-diagnosis-2026-09-14.md).

## Scope and decisions

This is a repair to How it wins generation, saved execution state, and its extension display. Preserve the current judge, writer, strategy vocabulary, evidence requirements, refinement setting, and synthesis behavior. Do not change providers to avoid a validation failure. Keep the existing exact-amount and final-card storage fixes.

Use the existing typed model adapter, database repositories, extension authentication, and background worker. Do not build a general workflow framework.

Add a small dedicated `how_it_wins_jobs` table for execution state. `how_it_wins_judgments` remains a cache of valid judgments. Failed work does not belong in that cache. The current `generation_runs` active-run index is unique by company and mode; forcing a background read into that table would interfere with profile and section admission. Avoid changing that unrelated constraint.

Keep job state out of `synthesis.howItWins`. That field describes an analytical result, and an existing good result must remain readable while a new attempt runs or fails.

## Design quality requirements

Use one definition of the judgment contract to generate the model's tool schema and validate its answer. Test the provider-specific schema transformations against all accepted strategy shapes. A mismatch between what we request and what we accept is an application defect. Do not compensate for it by adding another prompt instruction.

Put recovery decisions in one typed policy used by the worker. Put job transitions in the database repository. Derive API and UI state from that saved record. Avoid separate retry counters, status heuristics, or error-message matching in each layer. A module boundary must correspond to a distinct responsibility, not just make the patch look organized.

Retain successful stage results and resume at the first unfinished stage when their evidence, model, prompt, and verifier inputs still match. A writer or verifier failure must not repay for a valid judge. If an input changed, invalidate only the results that depend on it. Cover these dependencies in tests; do not infer compatibility from the company slug alone.

Review the implementation for both failure handling and ordinary use. No extra click is required on the successful path. No extra wait is inserted before the company profile or investor analysis appears. A failed optional read cannot clear either one. Status reads cannot start paid work, and retry availability must come from the server's actual admission decision.

Do not add another queue, provider-routing layer, general retry library, or workflow engine. The focused job record supplies the durable admission, state, and accounting that are missing from this worker. Inngest continues to execute the work.

## Accept variations without inventing judgments

Keep a strict final schema and exact coverage of all 80 strategy IDs. Do not discard an invalid strategy row and silently claim a complete evaluation. Do not convert an invalid row into `insufficient_evidence`, remove a selected strategy, invent citations, or guess a missing assessment.

Before requesting correction:

1. Apply the existing transport normalization once. It already handles some unambiguous object, array, and wrapper variations.
2. Apply only documented, field-specific normalizations that preserve meaning. Keep existing accepted full, compact, and lean forms. Do not introduce fuzzy enum matching, blanket string coercion, or arbitrary unknown-key removal.
3. Validate the normalized transport shape, run the existing semantic repair rules, then validate the materialized judgment and its frozen evidence references.

Add a normalization only with a failing example and a proof that the before and after values mean the same thing. Prefer the existing converter over another special case in the worker. A missing substantive field needs model correction, not a fabricated default.

Classify errors into structured-output, semantic-contract, transient-provider, authentication/configuration, cancellation/deadline, and internal/storage failures. Detect supported Zod errors structurally across workspace copies. Do not retry arbitrary exceptions merely because they have a message or an `issues` property. Errors in provider metadata validation are internal contract failures, not requests to rewrite company evidence.

Extract bounded diagnostic feedback: stage, issue code, schema-known path, expected type or allowed value, actual type, and strategy ID if that ID itself is valid. For unions, prefer the branch compatible with a valid disposition; otherwise retain a small labeled set of branch errors. Cap at 12 leaf issues and 4 KB of serialized diagnostics. Redact unknown property names. Never copy source prose, credentials, or arbitrary received strings into diagnostics.

Give a corrective request the frozen evidence, the prior normalized tool answer within the existing input limit, and the specific feedback. If that context will not fit, stop with an explicit input-limit reason. Do not repeat an identical deterministic request. Treat the prior answer as data, not instructions.

Persist the bounded correction context before returning from a paid-attempt step. Otherwise a worker restart would lose the answer needed for correction. Use a private `recovery_payload_json` field, separate from operational metadata, with its call ID, content hash, evidence hash, and expiry. Store only the normalized candidate needed by the next stage, not the full HTTP exchange or prompt. Limit it to 512 KiB and the provider's input budget. Step outputs contain references and status, not the candidate body. Verify its identity and hash before reuse. Clear it after the job terminates or after 24 hours, whichever comes first. Exclude it from every API response, trace, log, and public-card query; test those projections explicitly. A lost or corrupt payload must not cause the original paid call to replay.

A format or semantic correction must pass the same final checks as the first answer. Unsupported evidence remains a reason to withhold the read after bounded recovery.

## One bounded recovery policy

The global judge gets at most two provider requests per job: the initial request and one recovery request. Transport retry and schema correction share this allowance. A transient first attempt followed by malformed output on the second does not earn a third call. Use zero automatic SDK retries for this path.

Keep the configured critic and adjudication behavior. Preserve a valid primary judgment when the existing optional-review policy permits it. Make every paid stage consume the same job-level time and dollar budget. Writer and verifier failures must also produce a durable outcome with retained call metadata. Do not expand their creative remit or loosen their citation rules.

Each paid request must run in its own resumable Inngest step, with a stable logical call ID. A request deadline must be no greater than 240 seconds and must also fit the remaining job deadline, leaving at least 15 seconds for settlement. This fits below the current 300-second Vercel invocation limit. Set an absolute job deadline of ten minutes, persisted at admission; automatic retries, cold starts, and replays cannot extend it. A separately admitted manual retry gets its own ten-minute deadline but shares the root's remaining dollar cap and manual retry limit. Use the shorter existing stage limit where applicable.

Pass cancellation to the actual HTTP request, streaming reader, and response body on every supported provider path. A promise race alone is insufficient. Check cancellation again before correction, before paid work, and before storing results.

Persist cost reservations before requests. Derive conservative maximum cost from the resolved model, bounded input/output sizes, and verified pricing. Unknown usage consumes its reservation. Never substitute zero for unavailable usage or cost. Reject missing or unusable budget configuration before dispatch. No automatic purchases.

Do not let an Inngest retry repeat a paid call whose completion is uncertain. A durable call reservation records `reserved`, `completed`, `failed`, or `unknown`. A valid saved result can be reused; an uncertain call consumes its reservation and cannot be replayed under the same call ID. A separately admitted recovery request may use the remaining budget. Inject crashes around response receipt and persistence to verify this behavior.

Changing the durable step layout needs an explicit execution contract version on new jobs/events. Preserve existing event names and legacy step identities for in-flight work. New attempt steps may be added under the versioned path. Test replay and confirm old jobs have drained before removing legacy execution code.

## Durable job state and accounting

The job record needs:

- Identity: job ID, root job ID, source analysis-run ID, company slug, evidence hash, evaluator signature, execution contract version, and nullable Inngest run ID.
- State: queued, running, succeeded, failed, cancelled, or superseded; current stage; terminal reason code; timestamps; absolute deadline; and a lease/version for conditional updates.
- Result: optional judgment reference and the saved analytical outcome. `thin_file`, `nothing_stands_out`, and a failed request stay distinct.
- Recovery: retry-of ID and a root-level manual retry allowance.
- Accounting: configured cap, reserved and settled amounts, and a bounded typed list of attempts keyed by logical call ID. Include safe validation issues and transport/validation outcomes separately.

Keep long valid judgments in their existing table. Keep full prompts, source packets, raw HTTP responses, and credentials out of job records and traces. The short-lived recovery payload described above is the sole candidate-body storage exception; it is never operational metadata. Carry requested model, returned model, serving provider, response identifier, duration, retries, usage, and provider-reported cost when available. Estimates must be labeled. An HTTP success followed by validation failure must retain both facts.

Use atomic admission and conditional transitions. Enforce one active job for a company/evidence/evaluator combination. A duplicate request joins it. A worker must prove it still owns the lease before making another request or saving. Cancellation and supersession invalidate that lease.

Create the job before sending its event. If sending is uncertain, retain the job and resend the same event identity through a bounded reconciliation path. Never create a second paid job to resolve a dispatch ambiguity.

At success, recheck the evidence and evaluator and save the result with the terminal job outcome in one database transaction. Preserve the last good card and read on every failure. Keep an older read visible only with its original resolving citations and an explicit older-read label when appropriate; never attach it to changed evidence as though it were current. Terminal states are immutable; an explicit retry creates a linked job. Persist accounting independently of the optional parent-trace summary so that a trace-patch failure cannot lose usage.

An interrupted worker cannot leave a permanent running state. Reconcile expired leases/deadlines through a lightweight scheduled check and the authenticated status read. This check settles abandoned work; it must not start paid work. Apply the same identity, deletion, and retention rules as the related operational records. Prune job diagnostics after 90 days through the existing guarded retention path, and include any installation-linked data in tester deletion.

## API, retry, and extension behavior

Add an authenticated status/retry route under `/api/extension/cards/{slug}/how-it-wins` using the existing credential and scope checks. GET is read-only except for deterministic expiry settlement. It returns the current job's public-safe operational summary, never raw diagnostics. POST admits or joins a retry of the specified current failed job; company identity, parent ownership, evidence, evaluator, eligibility, and budgets are resolved on the server.

A repair retry must not rerun profile extraction or investor synthesis. It reuses unchanged valid evidence and a matching cached judgment when available. It does not debit another analysis allowance. Limit it to one explicit manual retry per root job, sharing that root's remaining dollar cap. Admission must be atomic across tabs and users; a request ID alone is not a spending limit. Preserve existing access gates, revocation checks, and request quotas. Nonretryable configuration failures show no misleading retry button.

New evidence or a different evaluator requires a new authorized analysis job, not relabeling the old retry. For the legacy Column failure, permit one operator-only admission that verifies the original failed analysis trace and current evidence. Record the link and the new reservation. Do not claim its historical missing usage is known, rewrite the original failure, or bulk-backfill other companies.

The extension reads job status instead of inferring execution solely from card age or the existence of a completion event. Scope polling and responses by job ID and company. Abort on navigation; ignore late responses. A polling window ending means “not confirmed yet,” not failure or absence. Reopening the extension retrieves the persisted state.

| State | Display and action |
| --- | --- |
| Never requested | Keep the existing unrequested behavior. |
| Queued or running | “Reading how it wins…” Keep the profile visible. |
| Failed, eligible for retry | “How it wins couldn’t finish.” Show “Try again.” |
| Failed, not eligible | Show the same failure plainly and the relevant short reason. Do not offer an ineffective action. |
| Existing good read, refresh failed | Keep that read. Add “The update couldn’t finish.” |
| Polling cannot confirm status | “Couldn’t check progress.” Offer “Check again,” which performs no paid work. |
| Cancelled or superseded | Explain that the read stopped or belongs to older research. Do not show it as a verdict. |
| Thin evidence or no distinct advantage | Keep their current analytical meanings and copy. |

Use the existing layout and type scale. No red stack trace, toast-only error, new settings requirement, or full-card error screen. Test keyboard access, narrow panels, reduced motion, retry pending/disabled state, reload, and navigation between companies.

Keep public APIs and pages free of synthesis and private job diagnostics. Use a separate additive operational response so existing clients can continue reading cards. Verify the current API-contract compatibility policy before changing headers or shipping a new extension build. A Vercel deploy alone does not update installed extensions.

## Verification and release

Required behavior tests:

- Valid 80-entry control; one malformed required field; each accepted strategy shape; nested union issues; harmless wrapper variation; ambiguous data; missing/duplicate strategy IDs; invented evidence references; contradictory judgments; malformed second answer.
- First-call failure then correction succeeds; transport retry consumes the correction slot; unsupported parameters and authentication do not retry; both provider attempts fail; no valid input is weakened to satisfy a schema.
- Headers stall, body stalls, stream never finishes, caller cancels, deadline expires before correction. Prove underlying requests abort and late results cannot store.
- Failed attempts retain usage and validation detail. Missing usage stays unknown. Replay and cached judgments do not double-count or repay. Reservations prevent overspend, including concurrent requests and process death after a provider response.
- Resuming correction after a worker restart uses the saved candidate without another initial call. Candidate size, hash, expiry, cleanup, and API exclusion are enforced. A writer or verifier retry reuses eligible completed stages.
- Atomic duplicate admission; uncertain dispatch; worker replay; lost lease; interrupted worker; stale evidence; failed final write; parent-trace failure; success; legacy Column retry. Real Postgres tests must verify guards and allowance behavior.
- Extension failure visible after reload; saved read preserved; no paid request on polling or remount; retry targets only How it wins; no stale cross-company update; old clients still read cards; public responses expose no private fields.

Convert the local diagnosis into permanent regression tests. Replay frozen public evidence through the real adapter normalization, judgment, persistence, and status-response path. Mark injected corruption as controlled; do not present it as Column's recovered raw response.

Run `npm run check`, relevant extension browser tests, and a final diff review by a fresh reviewer. The reviewer must inspect normalization meaning, retry ownership, concurrency, candidate privacy, allowance behavior, and the actual user journey. Resolve blocking findings before publication. Verify every new migration and rollback behavior locally. Before publication, compare the reviewed commit with remote main and preserve unrelated changes.

Capture the previous production deployment, current model settings, database identity, Inngest app, active runs, and extension versions. Apply the guarded additive migration, deploy the reviewed server, confirm Inngest sync and execution version, then package and verify the extension. Check the actual installed build used for UX verification; disclose store-review delays rather than calling all clients updated.

Within an explicitly authorized remaining budget, run one scoped Column recovery and verify the job record, judgment cache when successful, card result, authenticated status, public redaction, costs, and the actual extension. A provider refusal or exhausted cap is a reported limit, not permission to loop. Do not rerun the whole analysis just to get a successful screenshot.

If a canary exposes a repair regression, disable new retry admission and restore the prior compatible deployment. Keep historical jobs and valid cards. Do not drop the new table to roll back application code.

## Done and continuation

Implementation is complete when the release gate passes, production uses the reviewed repair, and the verified extension demonstrates both successful recovery and an intelligible terminal failure. The controlled malformed-answer regression must complete successfully after correction. Column must reach a valid analytical outcome in a bounded production check: a read, an evidence-supported no-advantage result, or a correctly justified thin-file result. Never invent an advantage to satisfy the canary. A failed request is not a successful analytical outcome.

If an external condition prevents a successful Column check or extension distribution, report the release as partially verified and leave the exact continuation. A green orchestrator badge, a clearer error message, or passing mocks alone cannot satisfy the done-definition.

This session produced a diagnosis and specification only. No application changes, migration, deployment, or paid model calls were made. The current recovery gap remains in production until this spec is implemented.

The emphasis-read citation failure and other company-matching defects visible in the same analysis trace are separate findings. They are not explained away by this repair and must not be claimed fixed.
