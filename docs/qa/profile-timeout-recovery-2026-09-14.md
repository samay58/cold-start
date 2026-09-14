# Production profile recovery verification

Both failed company journeys now finish and save usable cards. Boski completed in 30.355 seconds. Dumb completed in 67.798 seconds, including a real switch from OpenRouter to direct DeepSeek after the primary deadline.

## Release

- Production code: `5c5a1117433c8a22a68f3263eba2fde18304218a`.
- Verified Vercel deployment: `dpl_7NwQZTiNeLsaLqx8yepUm2JcxxjA`.
- Origin: [Cold Start](https://cold-start.semitechie.vc).
- Inngest app: `cold-start`, synchronized at 21:58 UTC on September 14. The four existing function identities are unchanged.
- Neon: project `red-darkness-56278017`, production `main`, database `coldstart`. Inspection used read-only connections. No migration or direct database repair was needed.
- Only three production environment entries changed: `LLM_EXTRACT_MODEL`, `LLM_EXTRACT_FALLBACK_MODEL`, and `OPENROUTER_API_KEY`. All remain sensitive. The selected models are `openrouter/google/gemini-2.5-flash` and `deepseek/deepseek-flash`.
- DeepInfra remains unselected after timeout and capacity errors. Its project credential stays in an ignored local file with mode 0600.

## Saved runs

| Company | Run ID | Outcome | Elapsed |
| --- | --- | --- | --- |
| Boski | `9e38e8d8-3689-4eae-9308-03b01ac33b0b` | Complete, saved | 30.355 s |
| Dumb, first canary | `cab8e505-7cd0-4df5-9675-777ee7de5880` | Terminal model-contract failure, no invalid card saved | 48.354 s |
| Dumb, after correction | `0f322fac-7d07-4d99-99d8-2ffd2eaed4dd` | Complete, saved | 67.798 s |

Boski ran on the preceding release `d1df3b7`; both saved cards were read back through the final release after enrichment. Public and authenticated API responses returned HTTP 200, parsed as valid ColdStartCard objects, passed the usable-profile gate, and contained zero unresolved citation references. Final reads found 20 citations for Boski and 22 in Dumb's authenticated card. Public responses contained no synthesis or withheld synthesis.

Both canaries used the operator credential. Neon contains zero alpha allowance reservations for their run IDs; no tester allowance was consumed. Verification follows the specific canary IDs, so later user-initiated analysis and section jobs do not replace the result being checked.

The original September 14 failures remain in the database as historical failures. They have not been relabeled as successful or erased.

## Live recovery proof

Dumb's final trace records:

| Attempt | Elapsed | Result |
| --- | --- | --- |
| OpenRouter Gemini initial call | 29.902 s | HTTP response returned; extraction required correction |
| OpenRouter Gemini correction | 15.090 s | Aborted when the shared primary deadline expired |
| Direct DeepSeek alternate | 12.545 s | Accepted extraction with valid citations |

The two primary calls together consumed 44.992 seconds. The correction did not start another 45-second clock. The alternate returned model `deepseek-flash` and response ID `07d66529-3e29-4e7b-b9a2-0b85a6463a71`. All attempts survive in the successful generation trace. No whole-step replay followed.

The first Dumb canary revealed that the old schema retry repeated an identical deterministic request. The repair passes bounded validation paths and expected types into the single correction. Numeric fields remain numbers or null; there is no money-string coercion. The prompt also separates the `mixed` fact status from the numeric funding value. Authentication, invalid evidence, and exhausted schema validation still fail visibly.

## Background work

Inngest independently confirms all four canary background jobs completed:

| Company | Function | Inngest run | Duration |
| --- | --- | --- | --- |
| Boski | Block enrichment | `01M2GY6XJBAK6V8Z3B56X79AFS` | 31.872 s |
| Boski | Contact enrichment | `01M2GY7WXNVQQYNHX1VZJJX1W2` | 18.845 s |
| Dumb | Block enrichment | `01M2GYYCAMPSPGCEWV5HGQ214Q` | 37.987 s |
| Dumb | Contact enrichment | `01M2GYZVZHVNM1PKR02YT6ESB1` | 24.376 s |

Both company traces and cards were read again after these completions. These jobs ran in Inngest; the two initial profiles ran inline on Vercel.

## Checks and spending

The final `npm run check` passed. This includes lint, workspace types and tests, both real-Postgres suites, builds, Firefox validation, golden dry run, unused-code checks, secrets, and dependency audit. GitHub Check run `34901537461` passed both the check and Firefox reproducibility jobs. The LLM suite contains 320 passing tests. The correction regression was observed failing without validation feedback and passing with it.

The dependency gate retains its existing temporary advisory policy. Two moderate dependency findings remain nonblocking: `@hono/node-server` and `qs`. No exceptions were added or gates weakened.

Diagnostics reserved USD 0.820706. Peak combined reservation was USD 4.990706 against the USD 5 cap. Unknown usage remains reserved rather than being treated as free. OpenRouter reported project-key usage of USD 0.1256237 at 22:01:57 UTC; the final Gemini attempt did not report per-call usage, so its charge is not asserted to be zero. Direct DeepSeek confirmed USD 21.67 available at that check. These are account snapshots, not a combined project invoice.

## Limits and rollback

External providers can still fail. The repair bounds extraction, switches to an independent provider on availability failures, and preserves evidence of each attempt. It does not weaken card quality to manufacture success. No new analysis or How it wins run was requested for these canaries; their routing is unchanged.

The pre-repair deployment is `dpl_4YotCgJWsUNC2JWa2vC95EETLioY`. Vercel rollback restores that running deployment; separately restore the extractor environment settings before any later rebuild if reverting the configuration too. Sensitive credentials and raw evidence remain outside Git.

The isolated repair worktree is clean after its commits. The original checkout's unrelated changes are preserved. The implementation spec and reusable execution prompt are linked below.

## Links

- [Implementation spec](../superpowers/specs/2026-09-14-profile-timeout-recovery.md)
- [Execution prompt](../superpowers/specs/2026-09-14-provider-reliability-prompt.md)
- [Boski](https://cold-start.semitechie.vc/c/boski)
- [Dumb](https://cold-start.semitechie.vc/c/dumb)
