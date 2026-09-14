# Provider reliability execution prompt

Restore reliable Cold Start profile generation, using the existing timeout-recovery branch as the starting point. The owner authorizes implementation, scoped dependency repairs, provider configuration, deployment, and bounded production verification. Deliver working production behavior and a concise evidence record. Do not promise that an external service can never fail.

## Read first

Read AGENTS.md, SECURITY.md, SPEC.md, the LLM call map, the deployment runbook, and the profile-timeout-recovery spec. Apply fable-judgment, fable-execution, and fable-verification. Preserve the original checkout's unrelated changes. Work on the isolated repair branch and verify the remote revision before publication.

## Establish the facts

- Confirm the active Vercel deployment, production Neon database, and Inngest application. Initial profile runs execute inline on Vercel; background work uses Inngest.
- Inspect the failed Boski and Dumb run records and the successful September 11 comparison runs. Separate the confirmed extraction timeouts from the unproven provider-side trigger.
- The old DeepSeek model name now maps to V4.1 Flash. Verify current model IDs, endpoint capabilities, pricing, and routing against official documentation and provider APIs. Do not assume an unchanged model name means unchanged weights.
- OpenRouter already supports invitation-image generation and the shared model adapter. The owner supplied separate project credentials for OpenRouter and DeepInfra. Read them only from the ignored local provider environment file. Never put credentials in prompts, commits, logs, screenshots, command arguments, or reports. Do not overwrite credentials used by other projects.

## Choose the smallest reliable change

Compare the existing extraction request against direct DeepSeek, OpenRouter, and DeepInfra using frozen public company evidence. Prefer preserving the model and changing its host before changing model families. A gateway can route back to the same failing upstream; verify and constrain the actual serving provider. Check tool calling, forced tool selection, disabled reasoning, context length, schema validity, citation resolution, latency, and returned usage. Do not count a tiny greeting as proof of profile extraction.

Reserve a conservative maximum cost before each paid diagnostic request. Cap diagnostics at $2 and the complete investigation plus production verification at $5. Unknown usage consumes its full reservation. Disable automatic SDK retries during comparisons. Use cancellable deadlines that cover response bodies and schema correction. Run paid work serially and stop before another reservation would exceed the cap. Do not enable automatic credit purchases.

Normalize harmless formatting before spending another model call. Convert clear quoted USD amounts with exact arithmetic and field-specific bounds. Isolate an unusable optional fact while retaining valid company facts and funding rounds. Ambiguous amounts remain unknown, never zero. Preserve citation requirements and existing good values during enrichment. Keep the final schema typed. Any schema correction still needed must include bounded validation feedback rather than repeat an identical deterministic request. See [the extraction tolerance contract](2026-09-14-extraction-tolerance.md).

Keep recovery bounded. Choose an explicitly configured, independently hosted alternate. Fail visibly on authentication, invalid configuration, and invalid evidence rather than switching providers to evade validation. Preserve the existing cancellation and no-whole-step-replay fix. Keep useful existing cards intact. Failed runs must terminate, record their cause, and follow the existing allowance-refund rules without a second debit.

Record requested model, returned model, serving provider, response/request identifier when available, latency, retry count, usage, and provider-reported cost. Omit unavailable fields instead of inventing zero cost or a served-model identity. Preserve earlier attempts when recovery succeeds. Never store full prompts or credentials in the trace.

## Verify and release

Reproduce failures before fixing them. Cover stalled headers and response bodies, both providers unavailable, malformed tool output, unsupported parameters, authentication failure, cancellation, terminal settlement, and successful recovery. Run the real extraction path against frozen evidence, not only mocks. Resolve the existing dependency audit through minimal supported upgrades; do not weaken or suppress the gate. Run the full repository verification and review the final diff.

Before deployment, verify every production environment change and prepare rollback to the previously active deployment. Keep synthesis routing, How it wins behavior, public-card privacy, and unrelated design work unchanged. Publish the reviewed repair, wait for the deployment and Inngest sync to become ready, then rerun Boski and Dumb within the remaining cap. Read Neon and both public and authenticated card endpoints afterward. Verify terminal run state, citations, trace details, allowances where applicable, and background enrichment. Compare actual cost with reservations.

The work is complete when the production repair is active, both company journeys have been checked, the release gate passes, the original checkout is preserved, and a report states observed results and remaining limits. If a check fails, repair the specific failure or restore the prior deployment. Leave a precise continuation record if an external condition prevents completion.
