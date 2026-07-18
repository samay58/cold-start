# Cold Start Performance And Email Baseline

Date captured: 2026-05-19

## Production Timing

Recent production traces show that the sidebar waits too long before the first useful company card is visible.

| Mode | p50 total | p90 total | Slowest stages |
| --- | ---: | ---: | --- |
| Basics | 2m 01s | 2m 53s | `generate-card`, `fetch-sources` |
| Analysis | 2m 47s | 3m 56s | `generate-card`, `fetch-sources` |

Observed stage shape:

- Basics commonly spends about 46s in `fetch-sources` and 1m 13s in `generate-card`.
- Analysis commonly spends about 39s in `fetch-sources` and 1m 51s in `generate-card`.
- Analysis runs often spend nearly two minutes inside card generation before any extension-visible synthesis is usable.

## Email Coverage

The contact lane was under-serving the core workflow.

| Sample | Result |
| --- | ---: |
| Production cards inspected | 80 |
| Cards with people | 62 |
| Cards with any email | 15 |
| People inspected | 320 |
| Work emails present | 36 |

Several recent cards had people and zero emails. This made the card non-actionable even when the company summary was otherwise useful.

## Fixed Targets

Use these as the production QA bar for the staged sidebar flow.

| Lane | p50 target | p90 target |
| --- | ---: | ---: |
| First usable sidebar card | under 15s | under 30s |
| Contacts ready | under 30s | under 60s |
| Analysis | Background | Must not block sidebar usefulness |

## Instrumentation Contract

Every generated run should carry these trace milestones when the lane exists:

- `firstUsableCardMs`: seed profile card has been persisted and can be returned by the card API.
- `contactsReadyMs`: contact enrichment has completed, including the checked-and-not-found state.
- `analysisReadyMs`: extension-gated synthesis is complete.

Provider endpoint traces should include `durationMs` so slow endpoints can be ranked without reading raw logs.

## Quality Guardrail

Speed wins only count if they preserve cited quality and email usefulness:

- Do not accept speed variants that reduce citation count below the baseline card quality bar.
- Do not accept variants that improve latency by skipping verified work-email discovery.
- Public card responses must continue to strip emails and synthesis.
- Extension responses may include verified or high-confidence professional work emails only.
