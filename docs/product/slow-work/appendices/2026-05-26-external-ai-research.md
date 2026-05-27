# External AI Research Appendix: Slow Work UX

Date: 2026-05-26

This appendix distills the external research Samay brought back on how strong products handle slow background work. Treat the named-product details as directional, not audited source truth. The product patterns are the reusable part.

## Cold Start Lens

Cold Start does slow work on purpose:

- identify the company
- fetch and crawl sources
- enrich company, people, funding, and contact data
- extract facts
- verify claims against citations
- write section prose
- save section state

The current product risk is not only latency. The risk is that latency feels like failure. The fix is to make the work visible, durable, and section-level.

## Pattern Scorecard

| Product pattern | Examples from research | Keep for Cold Start | Why |
|---|---|---|---|
| Plan before run | Gemini Deep Research, ChatGPT Deep Research, Perplexity | Yes, but passive | Cold Start does not need user approval every time. It does need to show what it is about to research. |
| Activity log | ChatGPT Deep Research, Perplexity, Vercel | Yes | The user should see real work: searched, read, extracted, verified, saved. |
| Live source list | Gemini Sites Browsed, Perplexity sources | Yes | Sources are useful before prose is ready. This is the strongest trust pattern. |
| Section-level state | GitHub checks, Vercel deploy phases, BigQuery jobs | Already started; deepen it | This matches the new `research_sections` model. Make it visible and exact. |
| Stale while refresh | Cursor indexing, cached query results, Vercel serving old deploy | Yes | Saved sections should never disappear because refresh is pending. |
| Durable run object | Vercel deployments, BigQuery jobs, GitHub Actions | Yes | Generation is not a click animation. It is a saved research run with history. |
| Lower fidelity first | YouTube processing, Copilot fallback search | Yes | Quick card first. Investor-grade sections later. |
| Provider waterfall | Clay enrichment | Yes, internally first | Great for debugging and trust, but the user-facing version should be calm. |
| Provenance styling | Granola, Perplexity citations | Yes | Every claim needs a source quote, not only a URL. |
| Fake percent progress | Generic video/render tools | No | Percent bars are usually dishonest for LLM + provider workflows. Use named states and counts. |

## Strong Examples

### Deep Research Products

ChatGPT, Gemini, and Perplexity all make a long research process feel intentional by showing the plan, the steps, and the sources.

Cold Start should copy:

- a compact research plan header
- a live source tray
- an activity log with real events
- clear permission to leave and come back

Cold Start should not copy:

- verbose chain-of-thought-style panels
- research theater that shows vague model thoughts
- a giant report flow that hides section completion

### Cursor And Codebase Indexing

Cursor makes slow setup tolerable by avoiding repeated setup. It reuses prior work when content has not changed.

Cold Start should copy:

- shared saved cards by canonical company domain
- section-level freshness
- cached evidence when source content has not changed
- useful fallback while deeper work runs

The direct lesson: the second open of a company should feel instant.

### Vercel Deployments And GitHub Checks

Deployments and checks are durable objects. They have states, logs, errors, retries, and history.

Cold Start should copy:

- every generation run has an id
- every run has named phases
- every phase can produce events
- failures preserve completed work
- retry targets the failed section, not the whole card

The direct lesson: a card run should be inspectable after it finishes or fails.

### YouTube Upload Processing

YouTube lets lower-quality output become available before high-quality processing is done.

Cold Start should copy:

- quick card first
- deeper sections later
- do not block usable basics on slow enrichment

The direct lesson: identity, one-line description, team, funding, and source count should appear before the full investor lens.

### Clay Enrichment Waterfalls

Clay makes multi-provider enrichment legible. It shows attempts, misses, hits, and cost.

Cold Start should copy:

- internal provider attempt ledger
- source/provider attempt summaries per section
- cost caps
- clear failure reasons

Cold Start should be careful:

- user-facing provider waterfalls can become noisy
- cost details belong in debug/admin surfaces first
- investor users care more about evidence quality than provider names

### Granola Provenance

Granola separates what the human wrote from what AI added, then lets users jump to the exact supporting transcript moment.

Cold Start should copy the trust shape:

- generated claims have visible citation affordances
- clicking a claim opens the exact source snippet
- edited or user-confirmed claims can be marked as user-owned later

The direct lesson: citations should point to evidence text, not just domains.

## What To Ignore

Ignore generic advice:

- show a spinner
- add a progress bar
- stream tokens everywhere
- ask users to approve every fixed step
- expose provider internals to every user
- build a new orchestration platform before using the state already in Postgres and Inngest

Ignore patterns that do not fit Cold Start:

- full-screen report writing as the main flow
- chat-style response as the artifact
- dark terminal logs as the primary UX
- fake "thinking" panels
- percentages for work whose duration is dominated by external APIs and LLM retries

## Tailored Cold Start Takeaways

The best next version is not "faster AI." It is a better research object:

- show saved card immediately
- show which sections are old, ready, running, empty, or failed
- show sources as soon as they exist
- show activity as small factual events
- save every run and section state
- retry only the failed part
- make citation snippets inspectable

The backend already has the beginning of this shape:

- `cards`
- `sources`
- `citations`
- `generation_runs`
- `research_sections`

The missing piece is a user-facing event/evidence layer that connects these tables into a calm progress experience.
