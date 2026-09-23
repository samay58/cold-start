# Project polish pass

Status: applied September 22, 2026, except C3 and C5, which stay open. Outcomes are recorded under each group. Five read-only reviews (prompts, user-facing copy, code health, reliability and cost, docs and tracking) found these; each was checked against the code before it was listed, and Samay approved every group.

Rule for this pass: one change, one check, then stop. Prompt changes get a single before-and-after run on frozen inputs with a stated cap, not a tournament.

## A. Writing quality

| # | Fix | Evidence | Check |
| --- | --- | --- | --- |
| A1 | Give the How it wins writer prompt its own hash. Today `HOW_IT_WINS_FROZEN_WRITER_PROMPT` sits inside `HOW_IT_WINS_JUDGE_PROMPTS`, which feeds the judge's prompt hash, so any writer edit discards every filed verdict (about $1.70 per company to re-judge). | `how-it-wins-judge-prompts.ts`, `howItWinsJudgePromptHash` | Test pins the judge hash unchanged; writer checkpoint hash includes the writer prompt. Waits on the other session. |
| A2 | How it wins notes: stop the fixed endings. In-question notes state what is known and why it falls short; a test is named in at most one note in three. Current notes end on the proof unless a limit changes how the reader weighs it. Not-yet notes name the promoting event. | 49 of 51 in-question notes end "...would show / answer / decide"; 8 of 8 current notes end on "Neither / None of this shows"; 4 of 4 not-yet end "would mark the shift" | One rewrite of the 8 cached verdicts, cap $1.50, phrase counts before and after. After A1. |
| A3 | Synthesis: one question per open question, and `wouldChangeReadIf` names the single answer that would move the read most, without "thesis", "validate", "bull case". | 61 of 91 open questions join two questions; 73 of 91 change lines use "X would support; Y would weaken" | One run on 5 corpus cards, cap $1.50. Update `synthesis.test.ts:103`. |
| A4 | Research sections: never refer to "the evidence", "the card" or "the supplied sources". Say what the source said, or state the gap as a fact. | 176 of 4,795 items, still present in August market and customer-proof sections | Covered by the A3 run. |
| A5 | Expanded description: drop the literal example "How it charges is not publicly disclosed." Write an absence sentence only when nothing about pricing is known. | 53 of 67 second paragraphs say "not publicly disclosed"; 13 copy the example word for word; the stat strip already says it | Covered by the A3 run. |

Outcome, checked on 8 cached How it wins verdicts and 5 provider-matrix fixtures for $2.15:

- A1, A2: in-question notes ending on "would show / answer / decide" went from 40 of 51 to 0 of 52; current notes ending on a "Neither / None" hedge from 5 of 8 to 0 of 8. New habits: 15 of 52 in-question notes end on a "No customer..." absence sentence, and none names a concrete test. The writer prompt hash is now in the evaluator signature, so filed reads are re-written from stored verdicts on their next refresh; no verdict is re-judged.
- A3: median open question 33 words to 23; two-part questions 9 to 6; two-sided change lines 14 to 9. "Thesis", "validate" and "bull" still appear 9 times.
- A4 did not hold: 11 of 82 section items still say "the evidence". Left for a later pass.
- A5 has no offline runner and was not checked live.

## B. What users see

| # | Fix | Evidence |
| --- | --- | --- |
| B1 | Invited testers see developer instructions on errors ("set API origin to http://localhost:3000", "check the worker logs"). Show a plain user message on production builds; keep the developer text for local builds. | `apps/extension/src/shared/extension-config.ts:532-580`, nine call sites in `sidepanel.tsx` |
| B2 | A wrong card link shows the stock Next.js 404. Add `app/not-found.tsx` in the site's style. | no `not-found.tsx` under `apps/web/src/app` |
| B3 | The public card's loading screen shows three fake steps while it only reads a saved card. Replace with one plain line. | `apps/web/src/app/c/[slug]/loading.tsx:13-21` against DESIGN.md's loading rule |
| B4 | "Reading how it wins..." is written twice, one copy hard-coded, and breaks its own no-ellipsis comment. | `investor-read-copy.ts:34-37`, `InvestorReadCard.tsx:444` |
| B5 | The access form's success line is silent to screen readers, and the button never says it is sending. | `AccessForm.tsx:74-76` |
| B6 | One product area has three names: Investor Lens, Investor read, Lens. Needs Samay's pick. | 17 uses of "Investor Lens", "Investor read" on the public card, "Lens" on /alpha |

Flagged for Samay, not changed (his copy): the landing page's five questions do not match the labels shown beside them (`page.tsx:79-81`); the "Verified" legend promises two independent sources while the code accepts one outside source plus any second citation (`SourcesLegend.tsx:15` against `card-face/model.ts:118`); "The alpha is resting".

Outcome: B1 to B6 shipped as listed. B3 went further afterwards: the card route's loading screen streamed a 200 before the page could call `notFound()`, so a missing card answered 200. The loading screen is gone and a missing card now answers 404. Tester errors are plain on any non-local API origin; local builds keep developer text. "Investor Lens" is the one name in UI strings and screen-reader labels. Two Playwright specs in `sidepanel-ui.spec.ts` (domain-receipt overflow at 825, drag attachment at 1471) failed in the worker's run on surfaces these changes do not touch; they are not in the required checks.

## C. Reliability and cost

| # | Fix | Evidence |
| --- | --- | --- |
| C1 | The How it wins critic can write without limit. Cap findings at about 12, add a length hint for `summary`, and send screened-out strategies as a list rather than 37 to 51 filler rows. | 3 of 8 scoped critic calls hit 12,000 tokens and failed, which skipped adjudication. Waits on the other session. |
| C2 | A DeepSeek or OpenRouter reply cut off at its token limit is read as bad JSON and re-sent unchanged, paying twice and failing anyway. Detect the cut-off and fail once with a clear reason. | `openai-compat.ts:235` never reads `finish_reason`; `llm-provider.ts:317-344` |
| C3 | When the full judge misses rows, the fix re-runs the whole judgment. Ask only for the missing rows. | 2 of 8 full-judge cards re-asked, $0.41 and $0.49, 87 to 110 s each. Waits on the other session. |
| C4 | Decision: the one-hour prompt cache costs about twice as much as no cache when reads are hours apart. A five-minute cache on the judge would save about $0.29 a read. It was chosen deliberately and applies to every stage, so this is a trade-off, not a bug. | `anthropic.ts:30-43`, `docs/anthropic-llm-call-map.md:100` |
| C5 | Later: move the judge off the forced tool choice, then A/B Opus 5.5 as the judge. | spec step 7 |

Outcome: C1, C2 and C4 shipped. C3 and C5 stay open. A truncated reply now surfaces as its own error; the How it wins job still files it under the reason `internal_storage`, which is misleading and left for later.

## D. Code health

| # | Fix | Size |
| --- | --- | --- |
| D1 | Split `how-it-wins-judge.ts` (999 lines with the other session's edits) into schema, validation and the judge. Waits on the other session. | M |
| D2 | One pricing table for every provider. The substring match in `anthropic.ts:55-79` caused the Opus 5.5 mispricing and silently prices unknown models. | M |
| D3 | Delete exports nothing uses (`planCompanyResearch`, `getAlphaTesterStatus`, `placeholderResearchSectionsForCard`, `benchmarkCachedSystemTextForRequest`), found with `knip --include-entry-exports`. Keep frozen step ids. | S |
| D4 | One copy of the HTTP retry helpers, now in three files. | S |
| D5 | One `percentile`, now in seven scripts with two different definitions. | S |
| D6 | One money formatter: `funding-evidence.ts` shows $6.25M as "$6M" while the shared one shows "$6.3M". | S |
| D7 | Rename `FAST_BASICS_ENABLED` to `DIRECT_EXA_ENABLED`, reading the old name for one deploy. | S |
| D8 | Fake timers for the two slow retry tests. | S |
| D9 | Split `stableenrich/people.ts` (57 lines over) and `scripts/alpha-status.ts`, from the size allowlist. | M |

Outcome: all shipped except the three person-name heuristics in `people.ts`, which are not equivalent and stay separate. Every Anthropic model now needs an exact row in `pricing.ts`; an unpriced model gets no cost estimate and cannot reserve a How it wins budget. Citation funding labels between $1M and $10M now show one decimal. `researchPlannerSystemPrompt` has no caller left.

## E. Organization and tracking

| # | Fix | Evidence |
| --- | --- | --- |
| E1 | Make `AGENTS.md` the one agent guide, `CLAUDE.md` an `@AGENTS.md` import, and bring it under 32 KB by pointing at README and deployment docs for commands and env. | Two 65 KB copies that already drifted (AGENTS.md alone has the How it wins recovery section) |
| E2 | Move 23 shipped specs and 12 shipped plans to `docs/archive/`, fixing their inbound references first. Keep the two rubric files code reads, the layered-screen spec and alpha readiness. | the repo's own archive rule |
| E3 | Add `docs/STATUS.md`: in flight, next, recently shipped. One page, updated whenever a plan closes. | No single place says what is in progress |
| E4 | Fix references to deleted files (`ReadRegion.tsx`, `read-region.test.tsx`, three `packages/ui` files) and the stale `docs/README.md` map. | checked against tracked files |
| E5 | Correct two wrong status lines and label SPEC.md's May build schedule as history. | recovery spec says "proposed"; Firefox says "partial" |
| E6 | Add `.claude/worktrees/` and `.claude/settings.local.json` to `.gitignore`; delete a byte-identical 1 MB icon copy. | ignored only on this machine |
| E7 | `.codex/config.toml` named `gpt-5.4`, outside Samay's Astra-or-Sol rule. The repo no longer sets a model or effort, so Codex uses Samay's global default. | done |

Outcome: E1 to E6 shipped. AGENTS.md went from 68 KB to 32 KB with nothing lost; command and file-level detail moved to `docs/commands.md` and `docs/code-map.md`. 33 specs and plans moved to `docs/archive/`. The How it wins recovery spec stays in place because SPEC.md links to it. E7 is done.
