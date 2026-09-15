# Column How it wins diagnosis

Read-only production inspection on September 14, 2026, at approximately 9:52 p.m. New York time. Source revision: `fe4493658ad647d393b4e489aeeff700c2105892`.

## Observed records

| Record | Observation |
| --- | --- |
| Analysis run `8d70f327-90fd-4dfb-8691-bc8056370886` | Completed and stored synthesis at 9:19 p.m.; parent trace subsequently records How it wins failure. |
| Inngest run `01M2HABFRM5RB0D07CVSHB4Q8F` | Started 9:19:26 p.m.; ended 9:21:39 p.m.; orchestrator status `COMPLETED`, returned output `{slug: "column", status: "failed"}`. |
| Judge step | 131.297 seconds; returned `ok: false`, `Validation failed at strategyEvaluations.16: Invalid input`. No writer or verifier step followed. |
| Judgment cache | No row for Column. |
| Saved card | Investor synthesis exists; `synthesis.howItWins` does not. |
| Product event | `how-it-wins.complete`, message “How it wins could not be read,” metadata status `failed`. |
| Paid judge metadata | Absent from the parent LLM call list. Its historical cost cannot be reconstructed from that list. |

The original funding failure and this later analysis failure are separate incidents. The How it wins job was dispatched after the funding repair.

## Reproduction

Used the existing judge-test builders to construct a valid 80-strategy answer, with refinement disabled and a fake provider adapter. The unchanged control passed with one call. Deleting the required disposition reason from entry 17 caused `ZodError`, issue code `invalid_union`, path `strategyEvaluations.16`, and exactly one adapter call. No critic ran.

Both diagnostic assertions passed. Changing the call-count requirement to two reproduced the missing correction: “expected spy to be called 2 times, but got 1 times.” The temporary test was removed from the application test directory afterward.

This is a controlled reproduction of the same failure class. Column's actual rejected entry was not saved. We cannot identify its exact invalid field or assert that its answer was otherwise sound.

## Source findings

- `packages/llm/src/how-it-wins-judge.ts`: transport parse precedes semantic repair; the corrective branch catches the custom judgment error but lets Zod errors escape.
- `packages/core/src/how-it-wins-judgment-transport.ts`: three strict strategy shapes form the union that reports “Invalid input.”
- `apps/web/src/lib/errors.ts`: the short message retains the first outer issue; a structured-detail helper exists, but this worker does not preserve it.
- `apps/web/src/inngest/how-it-wins.ts`: non-transient errors become `{ok: false, error}`; call metadata reaches storage only after a valid judgment returns.
- `apps/extension/src/research/investor-lens.ts` and `HowItWinsEdge.tsx`: completion ends waiting; a missing result selects `not_read`, which renders nothing.
- `packages/llm/src/how-it-wins-judge-adapter.ts` and `apps/web/src/app/api/inngest/route.ts`: a 360-second judge timeout exceeds the 300-second route limit. The compatibility-provider deadline does not cancel the underlying request.

Private inspection summaries, controlled test source, and test logs are retained under `.cold-start/column-how-it-wins/`. They are ignored by Git. No full prompt or credential was added to the committed documentation. No provider calls, database writes, or application changes were made for this diagnosis.

## WHERE WE LEFT OFF

The [recovery specification](../superpowers/specs/2026-09-14-how-it-wins-recovery.md) is ready for implementation. The expected-correction regression still fails on the inspected revision. No implementation or production verification of that proposed repair has occurred.
