# Extraction tolerance verification

The parser repairs clear numeric formatting before validation. Unsupported optional values become unknown without discarding valid company facts. Core schemas remain strict.

## Observed behavior

- `"USD 2.75 million"` becomes `2750000` using exact integer arithmetic. Quoted headcounts and founding years use their own field rules.
- `"unknown"`, ranges, foreign currencies, malformed grouping, and unsafe precision never become invented amounts. An invalid round amount leaves the round name intact.
- Full and block extraction share these rules. Optional facts that still violate their canonical schemas are isolated. Malformed core identity still triggers the existing bounded correction path.
- Provider-call regressions cover both full and block extraction. Clear string amounts and unusable optional amounts require no corrective call.
- The pipeline regression sends a parsed block patch through the real merge function. Its unknown total preserves the saved $25 million total; its cited $4 million round is added. The final card passes schema and citation validation. A second regression preserves a missing amount within a confidently matched round, including its original citations and conservative confidence. Different dates, missing dates, or conflicting saved amounts do not transfer an old amount.

The storage regression covers two refreshes that both use `c1` for different URLs. Incoming references receive a collision-free ID throughout the card, while retained facts and saved analysis keep their original sources. Crossed ID mappings use one substitution pass. Source URLs and titles remain unchanged. Repeated merges are stable.

## Checks

The previous parser fails six focused cases. With the fix, 111 extraction tests pass, including 51 numeric boundary cases. The final `npm run check` passed after all repairs, including real Postgres integration suites and both browser builds, with no new dependency exceptions. Five focused round-preservation cases, two pipeline preservation cases, and 16 storage tests pass. Scoped typechecks, lint, diff checks, and independent review found no remaining blocker.

Four frozen provider outputs from Craftcloud3D and Vivino cover Gemini through OpenRouter and direct DeepSeek. Sixteen controlled mutations preserved all identity fields, team facts, signals, citations, and existing round details. Their citation counts were 11, 10, 20, and 20. All 16 mutated outputs also passed the final card schema, including reference resolution. These replays made zero paid calls. Frozen evidence stays in ignored local files.

The original checkout and its concurrent changes were untouched. No database migration, provider routing change, or credential change is part of this release. Production verification uses existing cards and read-only database checks rather than purchasing repeat generation.

## Rollback

The preceding deployed revision is `448415adf6319cc199bd00e51b2e443db3d39ead`. Reverting this scoped change restores the old parser while retaining the timeout and provider recovery repair. The rollback needs no database change.
