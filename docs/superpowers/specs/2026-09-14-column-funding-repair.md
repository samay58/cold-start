# Column funding repair

Column's saved profile contained `33299999.999999996` in two integer fields. The next two profile runs failed when they loaded it. This was deterministic application arithmetic, not a provider timeout.

## Cause

The citation fallback multiplied `33.3` by one million using binary floating point. It ran after extraction validation. `upsertCard` trusted its TypeScript argument without validating the final JSON. A valid extraction could therefore become an invalid stored card.

The source also described the public-notice company Column, not the bank at column.com. The extraction left funding unknown; the fallback reintroduced an unrelated company's lifetime funding as a single round.

## Change

- Share the existing exact integer parser between extraction and citation fallback. Reject fractional dollars, malformed grouping, and unsafe integers. Do not round uncertain amounts.
- Limit citation funding fallback to the company's own domain or sources already assigned to a non-null identity fact by extraction. A matching name in a search result is insufficient. This conservative check can omit legitimate reporting; it does not prove entity identity in every article.
- Do not materialize lifetime totals as individual rounds.
- Validate after final card transformations and immediately before every upsert. Preserve the existing strict mutation boundary, citation checks, and stored edition if a write fails.
- Check stored research-section citations when merging them with a card. If a section references removed evidence, use current card facts instead. Repair Column's separately stored financing section as well as its card.
- Repair Column using a backed-up, version-checked update. Remove its unrelated inferred funding and the unrelated citations, retaining the bank's valid facts. Do not rerun paid generation or rewrite failed-run history.
- Inspect the full saved-card corpus for similar failures. Any additional repair must enumerate exact fields, preserve supporting facts, pass the final schema, and compare the saved version before writing.

## Acceptance

Reproduce the float, wrong-company fallback, lifetime-total error, and invalid write before fixing them. Test exact conversion and rejected amounts. Replay the actual saved Column record through finalization and a real Postgres write/read. Verify the repaired production card through public and authenticated APIs and bootstrap. Check all saved cards, terminal runs, and allowance settlement. Run the full repository gate and verify deployment and Inngest sync.

No provider configuration, database migration, paid call, or synthesis routing change is needed. Roll back to deployment `dpl_AWFJYfmtvqceMV8RWpVDE38hYWjo` if the release fails. Keep the pre-repair JSON and versions in ignored local storage for a separately guarded data rollback.
