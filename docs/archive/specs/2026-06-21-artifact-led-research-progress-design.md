# Artifact-Led Research Progress Design

## Status

Approved direction from product discussion on 2026-06-21. This spec covers the `Research progress` panel shown during the initial company generation wait. It does not approve or include changes to research cards, generated section bodies, queue behavior, or the research stack.

## Target Surface

This targets the screenshot state:

```text
Research progress
01 / 04

01 Finding sources
   Looking for useful places to read
   Queued this company

02 Reading evidence
   Pulling in what matters

03 Building the profile
   Turning evidence into a card

04 Filing the card
   Saving the final profile
```

The target vocabulary is:

- `Cold start wait`: the first generation wait before the company profile appears.
- `Research progress`: the panel that explains that wait.
- `Stage card`: one row in the four-step progress tree.
- `Proof line`: the line under the stage label.
- `Artifact-led progress`: progress copy that names what the system found, checked, or saved.
- `Verb-led progress`: progress copy that only says what the system is doing.

## Problem

The current view is honest but underpowered. It tells the user Cold Start is doing work, but the copy does not prove the work is useful.

The weak lines are:

- `Looking for useful places to read`
- `Pulling in what matters`
- `Turning evidence into a card`
- `Saving the final profile`

Those lines are not wrong. They are just too soft for the demo. A sharp user should not have to infer that the product is checking company pages, docs, funding coverage, product evidence, people, customer proof, and citations.

The fix is not to make progress louder. The fix is to make each `Stage card` leave a small receipt.

## Design Principle

Keep the current event-driven tree. Change what each row earns.

The progress panel should answer one question while the user waits:

```text
What has Cold Start actually found, checked, or saved?
```

Rules:

- Do not expose internal machinery. Never show `search plan`, `query plan`, `worker`, `pipeline`, `accepted sources`, or provider names as primary user-facing copy.
- Do not fake progress. The tree advances only from real generation events.
- Do not make the copy poetic. This surface should sound careful, plain, and receipt-like.
- Do not make source counts the whole story when source classes are available. `Company site, docs, and funding coverage found` beats `12 sources found`.
- Do not invent source classes or evidence types. If the UI cannot prove a type, it should fall back to a simpler artifact.

## Proposed Stage Model

The four rows stay. The labels change from verbs to nouns.

| Marker | New label | Job |
|---|---|---|
| `01` | `Sources` | Show that the system found places worth reading. |
| `02` | `Evidence` | Show what evidence categories were checked. |
| `03` | `Profile` | Show when the first cited profile is usable. |
| `04` | `Filed` | Show when the profile is saved with sources attached. |

The row label is stable. The `Proof line` changes as event data arrives.

## Copy System

### Sources

Pending:

```text
Checking company, product, funding, and proof sources
```

After `generation.queued`:

```text
Company queued
```

After `generation.started` or `plan.ready`, before sources:

```text
Checking company, product, funding, and proof sources
```

After `source.found`, if source categories are available:

```text
Company site, docs, and funding coverage found
```

After `source.found`, if only count is available:

```text
12 sources found
```

Why this is better: the user sees what kind of trail Cold Start found, not that backend work happened.

### Evidence

Pending:

```text
Waiting for sources
```

Running with sources:

```text
Checking funding, product, people, and customer proof
```

After evidence categories are known:

```text
Funding, product, people, and customer proof checked
```

If customer evidence is searched but not found:

```text
Funding, product, and people checked. Customer proof not found
```

If only source count is known:

```text
Reading source evidence
```

Why this is better: it tells the user which investor-relevant buckets are being checked. It does not claim those buckets are proven.

### Profile

Pending:

```text
Waiting for evidence
```

Running:

```text
Building first cited profile
```

After `card.partial`:

```text
First cited profile ready
```

After `card.partial` with citation count:

```text
First cited profile ready - 7 citations
```

Why this is better: it names the first payoff. The user understands that the wait has produced a usable profile, not just a generic card.

### Filed

Pending:

```text
Waiting for profile
```

Running:

```text
Saving with sources attached
```

After `card.saved`:

```text
Saved with sources attached
```

After `generation.complete`:

```text
Research filed
```

Why this is better: it describes the durable state the user cares about. The profile is not just done; it is saved with evidence.

## Stage Row Behavior

Each row has two visible text layers:

- Label: stable noun, for example `Sources`.
- Proof line: current artifact or honest waiting state.

The proof line should replace the current soft subtitle. Substeps remain available, but they should not duplicate the proof line.

Bad:

```text
Sources
12 sources found
✓ Found 12 sources
```

Good:

```text
Sources
Company site, docs, and funding coverage found
✓ 12 sources found
```

If the substep adds no new information, hide it for that stage.

## Data Mapping

Current event support:

| Event type | Current metadata | User-facing artifact |
|---|---|---|
| `generation.queued` | `mode` | `Company queued` |
| `generation.started` | `mode` | `Checking company, product, funding, and proof sources` |
| `plan.ready` | `queryCount` | Do not show query count. Keep the same source-check copy. |
| `source.found` | `acceptedCount`, `rejectedCount`, provider counts | Use source categories when available. Otherwise show `N sources found`. |
| `source.enrichment` | `sourceCount`, `providerFactCount`, `missingBlocks` | Show missing evidence only when it maps to user language. |
| `card.partial` | `citationCount`, `sourceCount` | `First cited profile ready - N citations` |
| `card.saved` | `citationCount`, `sourceCount` | `Saved with sources attached` |
| `generation.complete` | `costUsd`, `mode` | `Research filed` |

Needed improvement:

Add or derive source-category summary for the progress UI. The preferred source categories are:

- `company site`
- `docs`
- `funding coverage`
- `product page`
- `people source`
- `customer proof`
- `filing`
- `news`
- `database`

If this can be derived from the existing `sources` prop in the extension, do that first. If it needs backend metadata, add a small `sourceCategories` array or count map to the `source.found` event metadata. Keep it stable and bounded.

Do not expose provider names such as Direct Exa or StableEnrich in this view.

## UI Behavior

The layout can stay close to the current view:

```text
Research progress                         01 / 04

01   [status]   Sources
                Company site, docs, and funding coverage found

02   [status]   Evidence
                Checking funding, product, people, and customer proof

03   [status]   Profile
                Waiting for evidence

04   [status]   Filed
                Waiting for profile
```

Visual rules:

- Completed `Proof line`s should be darker than pending waiting lines.
- Pending waiting lines should be calm and muted.
- Running row gets the current loader.
- Do not add badges, panels, or extra decorative marks for this pass.
- Keep the `Step 1 of 4` footer unless it conflicts visually after copy changes.
- Keep reduced-motion behavior. Motion can breathe in place, but content must remain readable without spatial travel.

## Accessibility

The screen-reader line should use the stage label plus proof line, not the old generic note.

Example:

```text
Sources. Company site, docs, and funding coverage found.
```

When the proof line changes, `aria-live="polite"` can announce it. Avoid frequent announcements for duplicate events.

## Fallbacks

The UI must degrade in this order:

1. Specific source-category artifact when source categories are known.
2. Count artifact when only counts are known.
3. Honest waiting state when no event data exists.

Examples:

```text
Company site, docs, and funding coverage found
```

then:

```text
12 sources found
```

then:

```text
Checking company, product, funding, and proof sources
```

No row should use filler copy to hide missing data.

## Non-Goals

This spec does not cover:

- Active research-card staging.
- Queue copy after the profile exists.
- Generated section capsules.
- Evidence-quality marks inside completed research cards.
- The `Read so far` final state.
- Provider telemetry, cost display, or debug tracing.
- A new visual system for the progress panel.

Those may be separate specs. This pass should stay focused on making the current `Research progress` panel 10x clearer.

## Acceptance Criteria

The work is complete when:

- The screenshot state no longer contains `Finding sources`, `Reading evidence`, `Building the profile`, or `Filing the card` as stage labels.
- The screenshot state no longer contains `Looking for useful places to read`, `Pulling in what matters`, `Turning evidence into a card`, or `Saving the final profile`.
- `Search plan`, `query plan`, `worker`, `pipeline`, `accepted sources`, and provider names do not appear in user-facing progress copy.
- With no events, progress stays honest and does not advance by elapsed time.
- With `source.found`, the `Sources` row shows either source categories or a plain source count.
- With source categories available, the `Sources` row uses those categories instead of only a count.
- With `card.partial`, the `Profile` row says `First cited profile ready`, including citation count when available.
- With `card.saved`, the `Filed` row says `Saved with sources attached`.
- Existing reduced-motion coverage still passes.
- Tests assert the new artifact copy and reject the removed soft subtitles.

## Test Plan

Update extension tests that currently expect old stage language.

Required checks:

- No-event generation still shows `Step 1 of 4` and does not advance by wall clock.
- No-event generation shows `Sources` and a calm source-check proof line.
- `source.found` with count shows `Sources` and `12 sources found`.
- `source.found` with categories shows `Company site, docs, and funding coverage found`.
- `card.partial` shows `Profile` and `First cited profile ready`.
- `card.saved` shows `Filed` and `Saved with sources attached`.
- Reduced-motion test still confirms readable progress without sweeping motion.
- Regression test confirms removed subtitles are absent.

## Implementation Notes

Likely touch points:

- `apps/extension/src/research-progress.ts`
- `apps/extension/src/SourcePassInstrument.tsx`
- `apps/extension/src/ResearchLayerPanel.tsx`
- `apps/extension/src/sidepanel.tsx`
- `apps/extension/tests/sidepanel.test.tsx`
- `apps/extension/tests/e2e/sidepanel-ui.spec.ts`
- Possibly `apps/web/src/inngest/functions.ts` if source categories need to be recorded on `source.found`.

Preferred implementation shape:

- Keep `RESEARCH_PROGRESS_STAGES`, but rename labels and replace static notes with pending proof lines.
- Add a small formatter that turns events plus optional sources into a `proofLine` per stage.
- Keep raw event messages available for details, but do not let raw backend messages become the main proof line.
- Deduplicate substeps when they repeat the proof line.
- Avoid broad component extraction unless the formatter becomes hard to test.

## Demo Bar

In the demo, this should feel like Cold Start is leaving a careful trail:

```text
Sources
Company site, docs, and funding coverage found

Evidence
Checking funding, product, people, and customer proof

Profile
First cited profile ready - 7 citations

Filed
Saved with sources attached
```

That is the target. Not charming. Not chatty. Just specific enough that the wait earns trust.
