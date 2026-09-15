# How it wins recovery verification

The production repair is published from `codex/how-it-wins-recovery`, based on `fe4493658ad647d393b4e489aeeff700c2105892`. Column completed a valid read. The server and packaged extension passed verification; the user's installed extension remains unverified.

## Before the repair

Column analysis `8d70f327-90fd-4dfb-8691-bc8056370886` completed with a saved profile and investor synthesis. Its optional How it wins judge failed. The rejected answer was not retained, so the controlled malformed-entry test is a reproduction of the same failure class, not Column's original answer.

Neon readback at 2026-09-15 02:19 UTC confirmed that run's `howItWins.status=failed`, no read on Column, and no active profile-generation runs. Database host: `ep-crimson-cherry-apkegaf4-pooler.c-7.us-east-1.aws.neon.tech`.

Rollback deployment: `dpl_E3YiUJUwyJK936W46xoQW7ipTmUP`, `cold-start-qj8xlymkh-samay58s-projects.vercel.app`. The deployment was READY. Remote main remained at the diagnosis revision.

The saved evaluator signature matches judge and writer `claude-opus-5`, editor `deepseek/deepseek-v4-pro`, verifier `deepseek/deepseek-v4-flash`, with refinement enabled. The recent successful Dumb trace uses these models. Read-only Anthropic and DeepSeek model-list requests returned HTTP 200. Sensitive Vercel environment values return blank; blanks are not evidence of empty configuration.

## Implementation

The judge uses one schema contract and gives supported invalid output one correction request. Transport recovery uses the same two-request allowance. The database also enforces that ceiling.

The version 2 worker records admission, each paid-call reservation, response metadata, validation outcome, and terminal status independently of the judgment cache. Candidate answers stay in bounded private storage until completion or expiry. Each paid call has its own Inngest step and an HTTP cancellation signal. Successful stages can be reused after a retry.

An authenticated endpoint supplies status and admits one retry of How it wins alone. The existing profile and valid read remain available. The extension retrieves saved status after reopening, shows failures, and offers a separate free progress check when status cannot be confirmed.

## Verification

- The missing-correction regression fails on the original implementation and passes with the repair.
- LLM suite: 403 tests passed.
- Extension suite: 482 tests passed. Three focused browser cases passed for failure after reload, one pending retry in a narrow panel with reduced motion, and late navigation responses.
- Web suite: 625 tests passed.
- Full workspace typecheck and lint passed.
- The existing production dependency audit passed without changing its policy.
- Full `npm run check` passed, including real Postgres, browser-backed checks, both builds, secrets, unused code, and the dependency audit.
- Real Postgres lifecycle suite passed 24 tests, including rejection before the source analysis completes and admission afterward.
- Fresh independent review found seven integration defects. Each was repaired and regression-tested before release approval.
- The extension covers a delayed job admission and a retry whose network acknowledgement is lost. Both reconcile through free status reads.
- Paid frozen-Column replay succeeded through the real adapter and local Postgres: job `3acaf920-bc04-4552-a5e7-8a15da2a3096`, outcome `read`, 5 paid requests, all usage returned. It took about 253 seconds. No controlled corruption was injected into this paid replay.
- The replay cost is $1.568332 estimated from returned usage. Providers did not return a billed dollar total. The local job reserved a $4 maximum, released at settlement. Production then received the remaining $3.431668 maximum.
- Migration `0019` applied to production. Its SHA256 matches the saved migration row: `ec008032060e6d6f156e609efcc1ebb87fd5a0fef3e3f22a6e74d2e042957de2`.
- The new table has zero production jobs before the canary. Column has no linked alpha run request, and the allowance ledger has zero entries.
- Only two Vercel environment entries were added: job budget `5`, retry admission `false`. Exported settings were compared; sensitive values are unreadable and were not overwritten.
- Final review approved the runtime changes before publication. GitHub run `34923121841` passed both the full check job and Firefox reproducibility for `e20fd9bc30dbba03a7450ca7e0fb2b3a21eda17e`.

The fresh verification budget is $5. Private reservations and receipts live in `.cold-start/hiw-recovery/budget.json`. Unknown usage must consume its full reservation.

Browser security policy blocked access to the user's Chrome extension-management page. The installed version and installation source were requested from the user. Automated browser tests do not establish that the user's installed extension has updated.

## Pricing and limits

Reservations use the maximum published token rates, including a fresh one-hour Anthropic cache write. Input bytes plus protocol overhead bound text tokens; output is bounded by the actual request limit. Unknown usage consumes the full reservation. Unknown models fail admission.

Pricing references checked September 14: [Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing) and [DeepSeek pricing](https://api-docs.deepseek.com/quick_start/pricing). Model routing remains unchanged.

## Extension package

Version 0.2.9 was built from `1cb26140b31dafe45cfce625899dee1e66227eae`. Two production builds produced identical ZIP bytes: `f396294eeecc20c73d3c70a1dee405de18a6efe4e6b9acdb08a7a245643209ec`. Manifest permissions remain `activeTab`, `sidePanel`, and `storage`. The package contains 21 files, with no excluded artifacts or detected credentials. Store acceptance and the user's installed update are unverified.

## Production result

Deployment `dpl_CyksqhiCd7EdA5Az7mqjameP4kD5` served source `e20fd9bc30dbba03a7450ca7e0fb2b3a21eda17e`. Inngest synced five functions at 2026-09-15 02:58:55 UTC. A no-cost version 2 dispatch with a nonexistent job returned `rejected` before the real canary.

The scoped legacy Column repair used job `780a34e2-7b16-48b8-bf28-26288a54a7ec` and Inngest run `01M2HG3YKSBYB0V20EFF5JZVJS`. It finished at 03:04:25 UTC with `succeeded` and outcome `read`, taking about 255 seconds across five bounded paid stages. Its saved judgment is `89b85156-c85a-4021-a807-393597f1fc13`.

Production readback verified:

- The strict judgment schema passed with all 80 strategy entries and one current strategy, `completeness`.
- The stored card passed its citation-aware schema with 12 citations. Its version advanced from 2 to 3.
- Public research matched the frozen public projection exactly. Existing synthesis fields were unchanged except for the new How it wins read. The fixture omits private person reads, so the comparison applies the same public projection to both cards.
- The job released its lease and all reservations, and cleared its private candidate payload.
- All five paid attempts retained requested and returned models, response identifiers, latency, and usage. Judge, critic, and adjudication validation outcomes are recorded. Writer and verifier call records use `not_run` for that judge-validation callback; the final card and judgment passed their separate schema checks.
- Authenticated status and card endpoints returned HTTP 200 with `succeeded` and `read`. The public endpoint returned HTTP 200 without synthesis. No private candidate or validation payload appeared in the API checks. Existing client contract `2026-08-19.how-it-wins-v1` remained accepted.
- The original analysis record retained its historical How it wins failure. It has no linked alpha run request; the allowance ledger remained at zero entries. No synthesis rerun or additional allowance debit occurred.

The production canary settled $0.817928, estimated from returned usage. Together with the local replay, total estimated spend was $2.386260 against the fresh $5 cap. Outstanding reservations and unknown-usage charges are zero. Providers did not return billed dollar totals, so this is not a claim about the final invoice. No additional paid checks are scheduled.

After the canary passed, `HOW_IT_WINS_RETRY_ENABLED` was set to `true` for the next deployment. The job budget remains `5`; model routing is unchanged. The final deployment receipt is recorded in the private release ledger because this report's publication itself triggers a deployment.

The existing guide keeps its design and now explains durable status and bounded correction in plain English. It explicitly says failure controls require extension 0.2.9. Its source pin is the released implementation `e20fd9b`; deterministic HTML SHA256 is `9f8448c0dfa26ca41e28855359dad073f6d4ae5d7b1f38608c7b885eac53998e`. The served guide matched the built file, and the explanation was checked in the browser.

The original checkout remains at `fe44936` with its three original untracked documents unchanged. Their hashes match the preservation record. No unrelated worktree was removed.

## WHERE WE LEFT OFF

The remaining user-journey check requires access to the actual installed Chrome extension. Browser policy blocked the extension-management page; the requested installed version and installation source have not been supplied. The 0.2.9 ZIP is packaged and tested, but has not been submitted to or accepted by the Web Store.

Confirm the installation source, install or reload the reviewed 0.2.9 package through that source, and reopen Column in the actual side panel. Verify its saved read, then verify a terminal failure and the single retry control without starting another paid production run. Use the existing controlled browser fixture for failure injection. Record the actual installed version and screenshots. Do not call the entire extension rollout complete before this check passes.

Production candidates were cleared and historical records preserved. The prior deployment remains the rollback target. The separate Column source-attribution issue identified during diagnosis is outside this recovery repair.
