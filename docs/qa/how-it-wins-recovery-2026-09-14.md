# How it wins recovery verification

Implementation is being verified on `codex/how-it-wins-recovery`, from `fe4493658ad647d393b4e489aeeff700c2105892`. Production has not changed in this repair yet.

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
- Paid replay, migration, production canary, and release readback remain pending.

The fresh verification budget is $5. No paid requests have run yet. Private reservations and receipts live in `.cold-start/hiw-recovery/budget.json`.

Browser security policy blocked access to the user's Chrome extension-management page. The installed version and installation source were requested from the user. Automated browser tests do not establish that the user's installed extension has updated.

## Pricing and limits

Reservations use the maximum published token rates, including a fresh one-hour Anthropic cache write. Input bytes plus protocol overhead bound text tokens; output is bounded by the actual request limit. Unknown usage consumes the full reservation. Unknown models fail admission.

Pricing references checked September 14: [Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing) and [DeepSeek pricing](https://api-docs.deepseek.com/quick_start/pricing). Model routing remains unchanged.

## WHERE WE LEFT OFF

Finish the full gate and fresh review before any production mutation. Record the migrated schema, reviewed commit, deployment, Inngest sync, extension package and installed build, Column result, allowance readback, public redaction, and settled spend here. Keep the original failure records intact.
