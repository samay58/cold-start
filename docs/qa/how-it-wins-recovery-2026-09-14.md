# How it wins recovery verification

Implementation was reviewed on `codex/how-it-wins-recovery`, from `fe4493658ad647d393b4e489aeeff700c2105892`. This is the pre-release checkpoint; the server still uses the previous deployment.

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
- LLM suite: 397 tests passed.
- Extension suite: 478 tests passed before the added browser cases.
- Focused web suite: 76 tests passed before the added executor cases.
- Full workspace typecheck and lint passed.
- The existing production dependency audit passed without changing its policy.
- Full `npm run check` passed, including real Postgres, browser-backed checks, both builds, secrets, unused code, and the dependency audit.
- Real Postgres lifecycle suite passed 24 tests, including rejection before the source analysis completes and admission afterward.
- Fresh independent review found seven integration defects. Each was repaired and regression-tested before release approval.
- The extension covers a delayed job admission and a retry whose network acknowledgement is lost. Both reconcile through free status reads.
- Paid frozen-Column replay succeeded through the real adapter and local Postgres: job `3acaf920-bc04-4552-a5e7-8a15da2a3096`, outcome `read`, 5 paid requests, all usage returned. It took about 253 seconds. No controlled corruption was injected into this paid replay.
- The replay cost is $1.568332 estimated from returned usage. Providers did not return a billed dollar total. The local job reserved a $4 maximum; the shared $5 verification budget has $3.431668 remaining.
- Migration `0019` applied to production. Its SHA256 matches the saved migration row: `ec008032060e6d6f156e609efcc1ebb87fd5a0fef3e3f22a6e74d2e042957de2`.
- The new table has zero production jobs before the canary. Column has no linked alpha run request, and the allowance ledger has zero entries.
- Only two Vercel environment entries were added: job budget `5`, retry admission `false`. Exported settings were compared; sensitive values are unreadable and were not overwritten.
- Final review approved the runtime changes. The production canary and deployed readback remain pending.

The fresh verification budget is $5. Private reservations and receipts live in `.cold-start/hiw-recovery/budget.json`. Unknown usage must consume its full reservation.

Browser security policy blocked access to the user's Chrome extension-management page. The installed version and installation source were requested from the user. Automated browser tests do not establish that the user's installed extension has updated.

## Pricing and limits

Reservations use the maximum published token rates, including a fresh one-hour Anthropic cache write. Input bytes plus protocol overhead bound text tokens; output is bounded by the actual request limit. Unknown usage consumes the full reservation. Unknown models fail admission.

Pricing references checked September 14: [Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing) and [DeepSeek pricing](https://api-docs.deepseek.com/quick_start/pricing). Model routing remains unchanged.

## Extension package

Version 0.2.9 was built from `1cb26140b31dafe45cfce625899dee1e66227eae`. Two production builds produced identical ZIP bytes: `f396294eeecc20c73d3c70a1dee405de18a6efe4e6b9acdb08a7a245643209ec`. Manifest permissions remain `activeTab`, `sidePanel`, and `storage`. The package contains 21 files, with no excluded artifacts or detected credentials. Store acceptance and the user's installed update are unverified.

## WHERE WE LEFT OFF

Publish the reviewed repair, confirm deployment and Inngest sync, then admit the scoped Column canary within $3.431668. Enable manual retry only after it passes. Record the deployed result and installation limit. Keep the original failure records intact.
