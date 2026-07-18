# Cold Start Speed Work Backlog

This is the parking lot for follow-on work from the perceived-speed and real-speed plans.

Primary plans:

- `docs/superpowers/plans/2026-06-07-living-dossier-perceived-speed.md`
- `docs/superpowers/plans/2026-06-07-real-speed-yield-and-compression.md`

## Attack Order

Start with the perceived-speed work. It has the best impact-to-risk ratio because it mostly changes how the extension exposes work the backend already performs: source events, starter cards, stored sections, stale cards, and scoped section runs.

Then do real-speed work in shadow mode. Provider routing and evidence compression can produce real latency wins, but they can also quietly reduce useful cited output. They need trace proof before behavior changes.

## Next Worktree

Branch:

```bash
codex/living-dossier-speed
```

Worktree:

```bash
.worktrees/living-dossier-speed
```

First milestone:

- Source receipt during running basics generation.
- Interim usable card renders immediately.
- Section runs stay scoped to the section module.
- Empty sections read as resolved work, not failure.

Success criteria:

- `npm test -w @cold-start/extension -- sidepanel.test.tsx`
- `npm run qa:extension:ui -w @cold-start/extension`
- `npm run qa:extension:smoke -w @cold-start/extension`
- `npm run check`
- Manual extension pass confirms the product feels calmer and faster, not busier.

## Defer Until After Living Dossier

### Stale-But-Readable Public/Extension Treatment

Do after the source receipt and interim-card path works. It is valuable, but freshness language needs a careful visual pass so stale data does not look as authoritative as current data.

### Visual Regression Screenshots For Every Dossier State

Do after the first behavior tests pass. Screenshots are useful once the state model is stable.

### Full Source Receipt Polish

Ship the plain receipt first. Then refine source class marks, density, and hover/focus affordances.

## Real-Speed Backlog

### Endpoint Applied-Fact Yield

Add trace fields that distinguish provider facts produced from provider facts applied. This is the foundation for every later provider skip decision.

Do before:

- Provider yield router.
- StableEnrich skip enforcement.
- Cost benchmark comparisons.

### Provider Yield Router In Shadow Mode

Record which endpoints would have been skipped without changing the live request set.

Do not enforce until:

- At least 20 comparable runs exist.
- Applied-fact count does not regress.
- Citation count and public profile quality stay stable.

### Citation-Aware Evidence Packets

Start in shadow mode. Measure character reduction and packet coverage before sending packets to the LLM prompt.

Do not enable prompt mode until:

- Citation references still resolve.
- Verifier survival does not fall.
- Public section availability does not fall.
- Source snippets remain auditable.

### Real-Run Benchmark Notes

When live provider/LLM runs are approved, record results in:

```text
docs/qa/real-speed-shadow-benchmark.md
```

Minimum domains:

- `cartesia.ai`
- `modal.com`
- `turbopuffer.com`

Track:

- `seedCardMs`
- `firstUsableCardMs`
- terminal duration
- citation count
- structured fact count
- visible fact count
- available section count
- verifier survival count
- AgentCash wallet delta
- Anthropic cost

## Do Not Bundle

- Do not bundle perceived-speed UI work with provider routing.
- Do not bundle evidence packet prompt mode with shadow telemetry.
- Do not change public route shapes for UI convenience.
- Do not weaken `hasUsablePublicProfile`.
- Do not start background paid calls to make the extension feel instant.
- Do not turn empty sections into failure states.
- Do not turn source receipts into uncited claim previews.

## Later Ideas

These are worth revisiting after the first two plans teach us something.

- Browser context hints as non-authoritative generation hints.
- Watchlist cache warming with explicit budget ceilings.
- One-section-only investor flow as the default gated action.
- Source-domain dedupe in confidence receipts.
- Section-level freshness marks on public card pages.
- Local trace comparison command for baseline versus shadow runs.

