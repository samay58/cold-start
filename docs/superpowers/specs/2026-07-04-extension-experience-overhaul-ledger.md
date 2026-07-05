# Token Ledger: Extension Experience Overhaul

Tracks output tokens by model tier at every phase boundary, per `~/.claude/FABLE-ORCHESTRATION.md`. Success bar: Fable at or below 20 percent of output tokens across the execution phases (Phase 1 onward), all gates green, result rated fantastic by Samay.

Phase 0 is deliberately all-Fable (spec, design review, decomposition are Fable's job); the ratio is judged on execution.

## Measurement

One command, run at each phase boundary. It sweeps every transcript this project produced since the pilot started (main session, subagents, workflow agents) and splits output tokens by model:

```bash
find ~/.claude/projects/-Users-samaydhawan-Projects-active-cold-start \
  -name '*.jsonl' -newermt '2026-07-04 20:00' -print0 | xargs -0 cat 2>/dev/null | \
  jq -rs '[.[] | select(.message.usage.output_tokens != null) |
    {m: (.message.model // "unknown"), o: .message.usage.output_tokens}] |
    group_by(.m) | map({model: .[0].m, out: (map(.o) | add)}) | sort_by(-.out) |
    .[] | "\(.model)\t\(.out)"'
```

Cross-check: each Workflow run's `budget.spent()` and journal.

## Ledger

| Boundary | Date | Fable | Opus | Sonnet | Haiku | Fable share | Notes |
|---|---|---|---|---|---|---|---|
| Phase 0 (spec + review card) | 2026-07-05 | 250,819 | 0 | 0 | 0 | 100% (by design) | Spec, doctrine, visual review card, ledger setup. All planning. |
| Phase 1 (audits + A1 + B1 + D2) | 2026-07-05 | 402,669 | 0 | 182,875 | 0 | see note | Cumulative totals. Fable delta (+151,850) is the packet plan, two scout dispatches, and the gate review, planning and review work per doctrine. Sonnet 182,875 output tokens bought: 6 surface audits, the A1 schema packet, the B1 imagery packet (with live provider-schema verification), and the D2 latency measurement. All 9 agents done, 0 errors. Workflow-reported 974,618 "tokens" is input+output; the ledger counts output only via the jq sweep. |
| Phase 2a (A4 + B2 + C1; A2 blocked) | 2026-07-05 | 444,549 | 252,479 | 271,086 | 0 | Fable 6% of phase delta | Phase delta: Fable +41,880 (gate review, one merge-conflict resolution, ledger); Opus +252,479 (assembly surface B2, dossier tooltip A4); Sonnet +88,211 (C1 diets; A2 correctly stopped on the worktree-base bug and spent almost nothing). Execution-phase running share: Fable 41,880 of 653,656 = 6.4%. Merged tree green: 199 extension tests, typecheck, audit:css. |
| Phase 2b (A2 + C2 + D1 + reviews) | 2026-07-05 | 488,701 | 311,035 | 389,679 | 0 | Fable 6.2% running | Phase delta: Fable +44,152 (gate, merges, Phase 3 addendum); Opus +58,556 (two adversarial reviews, 7 findings, 14 attack surfaces cleared on B2); Sonnet +118,593 (A2 person_read stage, C2 dead-code sweep, D1 contract/manifest/e2e/profile-clippings). Reviews confirmed one real bug (failure events never flip attention) plus three dossier-interactivity findings. Execution running share: Fable 86,032 of 1,393,447 = 6.2%. Merged gates: 201 extension + 144 web tests, typecheck, 32 Playwright UI + smoke specs (in D1's worktree). |

## Final report (filled at the end)

- Total output tokens by tier:
- Fable share of execution-phase output tokens:
- Counterfactual all-Fable estimate:
- Gates: check green / adversarial findings resolved / visual sign-off:
- Verdict from Samay:
