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

## Final report (filled at the end)

- Total output tokens by tier:
- Fable share of execution-phase output tokens:
- Counterfactual all-Fable estimate:
- Gates: check green / adversarial findings resolved / visual sign-off:
- Verdict from Samay:
