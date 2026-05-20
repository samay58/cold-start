# Generation Trace And Production QA

Use these commands when a generated card is slow, incomplete, or inconsistent with the extension.

## Inspect Recent Runs

```bash
set -a; source .env.local; set +a
npm run trace:generation -- --limit 10
npm run trace:generation -- --limit 1 --detail
npm run trace:generation -- --domain legora.com --mode analysis --quality --detail
```

Useful filters:

- `--domain`
- `--mode basics|analysis`
- `--since 4h`
- `--failed`
- `--json`
- `--quality`
- `--detail`

The trace command prints job kind, run status, duration, accepted and rejected sources, citation count, synthesis verification count, Inngest IDs, failure reason, and deterministic QA flags when present.

## Production QA Suite

```bash
set -a; source .env.production.migrate.local; set +a
npm run qa:generation
```

The QA runner reads production DB traces and API card output for the fixed QA company suite. It prints a compact terminal report only.

Screenshots from manual side-panel inspection should stay outside the repo under:

```text
~/Downloads/cold-start-qa/<timestamp>/
```

## Performance Contract

Current staged-flow targets:

- First usable sidebar card: p50 under 15s, p90 under 30s.
- Contacts ready: p50 under 30s, p90 under 60s.
- Analysis: background work; it must not block sidebar usefulness.

Every generated run should carry these milestones when the lane exists:

- `firstUsableCardMs`
- `contactsReadyMs`
- `analysisReadyMs`

Provider endpoint traces should include `durationMs`.

Speed wins only count if cited quality and work-email usefulness hold. Public card responses must continue to strip emails and synthesis.
