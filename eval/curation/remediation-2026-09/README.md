# Evidence remediation: fixed comparison set

The companies and baseline numbers for `docs/superpowers/plans/2026-09-23-evidence-and-judgment-remediation.md`. Every later task measures against this set, so results stay comparable.

## The 12 companies

The 8 from the September 22 judge comparison:

august, bland, cognition, deepinfra, doppel, hebbia, nekohealth, notion

4 added from `eval/curation/corpus/cards`, none on the holdout list in `scripts/how-it-wins-batch.ts`:

| Slug | Why it is here | Citations |
| --- | --- | --- |
| casaphq | Thin file: 5 citations, the fewest of any card that still passes the How it wins thin-file check | 5 |
| kalshi | Marketplace: a regulated prediction-market exchange | 22 |
| ouraring | Hardware: the Oura smart ring | 15 |
| stripe | Later stage, with press coverage of its finances ($1.9T volume, revenue, tender valuations) | 33 |

Each of the 12 has synthesis and passes `howItWinsThinFileReason`, so each can run through the judge.

## Baseline, September 23, 2026

Taken with `python3 eval/curation/remediation-2026-09/monitors.py <the 12 card paths>` against the frozen corpus cards and the saved judgments in `eval/curation/how-it-wins-batch/_judgments`.

### Citation snippets on the card

"JSON" means the snippet is raw provider JSON (search metadata, no page text). "Empty" means no snippet at all. "Median readable" is the median length of the snippets that are neither.

| Slug | Citations | JSON | Empty | Median readable (chars) |
| --- | --- | --- | --- | --- |
| august | 21 | 5 | 3 | 219 |
| bland | 21 | 9 | 0 | 125 |
| cognition | 36 | 10 | 6 | 156 |
| deepinfra | 18 | 7 | 1 | 317 |
| doppel | 16 | 6 | 0 | 218 |
| hebbia | 15 | 5 | 0 | 180 |
| nekohealth | 19 | 6 | 0 | 236 |
| notion | 32 | 11 | 6 | 114 |
| casaphq | 5 | 0 | 0 | 255 |
| kalshi | 22 | 8 | 0 | 230 |
| ouraring | 15 | 8 | 0 | 121 |
| stripe | 33 | 7 | 0 | 150 |
| **Total** | **253** | **82** | **16** | |

### Evidence the How it wins judge saw

From the saved judgments. Opus 5 and Opus 5.5 received the same packet for each company. "Title only" means the item text is just the page title, because the snippet was empty.

| Slug | Items | JSON | Title only | Median item length |
| --- | --- | --- | --- | --- |
| august | 21 | 5 | 3 | 232 |
| bland | 21 | 9 | 1 | 173 |
| cognition | 36 | 10 | 6 | 165 |
| deepinfra | 18 | 7 | 1 | 283 |
| doppel | 16 | 6 | 0 | 235 |
| hebbia | 15 | 5 | 0 | 222 |
| nekohealth | 19 | 6 | 0 | 257 |
| notion | 32 | 11 | 8 | 151 |
| **Total** | **178** | **59** | **19** | |

78 of 178 items (44%) carried no page text. The 4 added companies have no saved judgment yet.

### Current How it wins verdicts

Strategies the judge called current, then what was shown. Opus 5 is run `2026-09-22-1734`, whose judge verdicts were served from the saved judgments of run `1733`, so its per-card cost counts only the writer and critic. Opus 5.5 is run `2026-09-22-2154`, after `4830c3c` moved every stage to `tool_choice: auto`.

| Slug | Opus 5 | Opus 5.5 |
| --- | --- | --- |
| august | malleability, read | precision, read |
| bland | none, nothing stands out | none, nothing stands out |
| cognition | specialization, read | none, nothing stands out |
| deepinfra | low_friction, read | none, nothing stands out |
| doppel | none, nothing stands out | none, nothing stands out |
| hebbia | none, nothing stands out | none, nothing stands out |
| nekohealth | cloning, affordability, specialization, read | affordability, read |
| notion | composability, completeness, read | none, nothing stands out |

### Lines that name missing information

The text match found such lines in 3 of the 12: hebbia 1, notion 2, casaphq 2. Across the whole corpus it finds 130 of 373. The match undercounts. It misses, for example, Stripe's bear case "no disclosed GAAP financials". Treat it as a trend line, not a count.

## Files

- `monitors.py`: the three monitors (judge evidence stubs, card citation stubs, absence lines).
- `cards/`: rebuilt cards from Task 2 (not yet created).
