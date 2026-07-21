# Gold-Standard Reference Library

Curated design references for the investor lens overhaul, Phases 2 through 4. Three research tracks ran in parallel on 2026-07-21: waiting UX, hovercard craft, and memo typography. Every concrete value below was traced to documentation, source code, or a primary write-up; the few that came through secondary summaries are flagged inline. Full raw notes with every URL live in `docs/motion-references/research-2026-07-21/` (gitignored, like all raw reference material).

How to use this file: Phase 2 (memo redesign) cites the memo typography track. Phase 3 (person hovercards) cites the hovercard track. Phase 4 (watchable wait) cites the waiting UX track. Adopted means use it when building the surface. Rejected means it came up, we looked, and it is wrong for Cold Start; do not relitigate without new evidence.

## Waiting UX (cited by Phase 4)

### Adopted

**Operational transparency.** Buell and Norton, Management Science 2011 (hbs.edu): showing the work happening beat a plain progress bar on perceived value and repeat-use desire across five experiments in 0-60 second waits, nearly the same window as Cold Start's analysis run. This is the research anchor for the whole wait surface. Clippings, the stage list, and the verifier stamp exist because watching real work is worth more than a faster-feeling bar.

**The 10-second line.** Nielsen Norman Group response-time limits (nngroup.com): past 10 seconds users mentally check out unless the surface names its progress. At 60-100 seconds the seal loop can never stand alone. It pairs with named, event-driven stages for the entire run.

**A small fixed stage vocabulary, never a percentage.** Railway names exactly three live deploy states before the terminal one; Vercel discards superseded queued builds so stale state never shows (docs.railway.com, vercel.com/docs). Three to five plain nouns beat a number with no fixed meaning across runs. Cold Start's stage model (Queue, Gather, Read, Verify, File) stays fixed and event-driven, and a superseded or retried run never leaves old stage state visible.

**A named, bounded verify beat.** Fly.io runs an approximately 10-second smoke check after a machine starts before declaring the deploy healthy (fly.io/docs). The moment of highest uncertainty gets its own named, bounded stage rather than hiding inside "deploying". This is the template for the verifier stamp moment: claims survive one by one inside a stage the user can see begin and end.

**Backscroll on reconnect.** GitHub Actions shows the last 1,000 already-emitted log lines when you open a running job, then streams (github.com/github/roadmap issue 839). Reopening the side panel mid-run must replay recent events, never mount blank. Blank-on-reopen is the single worst "did it hang" moment in long-job UX.

**Show-delay and minimum visible time.** Vercel's web-interface-guidelines: wait roughly 150-300ms before showing a transient indicator, and keep it visible at least 300-500ms once shown (github.com/vercel-labs/web-interface-guidelines). Both numbers prevent the same failure, an element flickering faster than a human can register it. Apply to any instrument that can mount and unmount quickly.

**Plain verbs, details collapsed.** Perplexity labels steps in user language ("Searching the web") and keeps the step list collapsed behind a summary line (aiuxplayground.com teardown; observed, not primary). This confirms the existing whisper-copy and Details-toggle discipline: provider internals stay behind the toggle, and the primary surface speaks plain verbs only.

### Rejected

**Editable plans and mid-run interruption** (OpenAI deep research). Right for a research agent whose runs are measured in minutes; wrong for a 60-100 second run where the interaction cost exceeds the wait itself. Revisit only if analysis runs ever get an order of magnitude longer.

**Skeleton shimmer.** The gradient sweep is the most recognizable piece of generic AI-product chrome, and DESIGN already bans skeletons after a saved card exists. Cold Start renders instruments and real events during waits, not placeholder boxes.

**Pre-run confidence scores** (Devin). A calibrated confidence number needs outcome data Cold Start does not have, and an uncalibrated one is fake precision. The evidence-posture advisories on the finished read carry that job honestly instead.

## Hovercard craft (cited by Phase 3)

### Adopted

**Delays sized to the surface's accidental-hover risk.** Radix HoverCard defaults to 700ms open and 300ms close (source-read, hover-card.tsx); Wikipedia previews open after about 650ms because readers hover prose while reading it (diff.wikimedia.org, primary). Those long delays exist for high accidental-hover surfaces. A discrete person-row list is low-risk, so the planned 90ms open intent stands.

**Timer plus geometry, never geometry alone.** Ben Kamens' reimplementation of the Amazon dropdown ships a 300ms confirmation timer on top of its triangle logic (Kamens' jQuery-menu-aim, DELAY = 300, source-read). Pure polygon logic misfires on ambiguous diagonal paths, so the 90ms open-intent timer stays even if safe-path geometry lands later.

**A safe path from row to dock.** floating-ui's safePolygon builds a rectangular trough plus a directional triangle from the cursor to the card, buffer 0.5px, with a 0.1px/ms cursor-speed gate that treats fast movement as passing through (safePolygon.ts, source-read). The docked dossier sits below all rows, so travel crosses siblings and the close grace must survive that trip. Either the trough-plus-triangle model or the 160ms close grace doing the same job on time instead of geometry is the mechanism; pick per feel in the gallery.

**Retarget goes hot.** floating-ui's FloatingDelayGroup drops the open delay to 1ms for siblings while any group member is open (FloatingDelayGroup.tsx, source-read). The first row pays the 90ms intent price; moving between rows with the dock already open goes straight to the 140ms content crossfade. Intent, once proven, is not re-charged.

**Rest detection as the fallback.** floating-ui's restMs opens when the pointer stops moving rather than on time-since-enter, and hoverIntent's classic model is under 6px moved between 100ms polls (both source-read). If live QA shows the flat 90ms timer opening on fast sweeps down the list, dwell detection is the documented fix. Do not just lengthen the timer.

**WCAG 1.4.13 as the acceptance checklist.** Dismissible, hoverable, persistent (w3.org, primary). These three words are the phase-gate test list for the dock, and hoverable is the hard one given the dock's spatial separation from its trigger rows.

**Pin is a semantic promotion.** WAI-ARIA APG: a true tooltip never receives focus and never contains interactive content (w3.org, primary). The unpinned dossier is informational; the pinned dossier (click or Enter) is a real interactive region where the email click-to-copy lives. This is an accessibility requirement, not a styling choice.

### Rejected

**Copying Radix or Wikipedia delay values.** The values are correct for their surfaces and wrong for a person-row list; 650-700ms here would read as sluggish. Size the delay to the accidental-hover risk, which for discrete rows is low.

**Trigger-content pointer bridging alone** (Radix's dual wiring). Bridging works when the card is adjacent to its trigger. The dock is not adjacent, so bridging without a safe path or a generous close grace fails WCAG's hoverable requirement mid-travel.

**Interactive content in an unpinned hover state.** It violates the ARIA tooltip contract and leaves the email link unreachable by keyboard. The pin promotion exists exactly so the hover state never needs to host interaction.

## Memo typography (cited by Phase 2)

### Adopted

**Hierarchy through face, weight, and color at shared sizes.** IBM Carbon renders heading-01 and body-01 both at 14px, heading-02 and body-02 both at 16px, split by weight alone (Carbon type SCSS, source-read). Readers parse weight and color faster than 1px size deltas. In the five-role scale, Section label (11px At Umami, seal color) and Meta (11.5px Plex) are neighbors, and the face and color carry that boundary, not the 0.5px; if implementation friction ever argues for collapsing them to one size, no hierarchy is lost.

**Tracking rises as size drops.** Carbon adds 0.32px letter-spacing at 12px, 0.16px at 14px, and none at 16px and up (source-read). Small sizes lose word-shape cues. Receipt at 10px carries at least 0.32px tracking, and a caps-cased section label needs measurable tracking, never the browser default.

**13px claim body, validated by the closest analog.** Hypothesis's annotation sidebar, a permanently docked citation surface, runs its body text at 13px with 1.4 line-height throughout (sidebar.css, source-read). The nearest real product to the lens memo independently landed on the plan's exact Claim size.

**Line-height holds near 1.4; density comes from block spacing.** Readwise Reader defaults to 1.4, iA Writer states 140%, and Hypothesis runs 1.4 at every size (all primary). Three unrelated reading products converge on the ratio. No role compresses below 1.4; the memo gets denser by tightening space between blocks, never by crushing leading inside one.

**Receipt face never wraps.** iA Writer's stated floor: "Below 12 pixels serifed typefaces don't render sharply enough" (ia.net, quoted). At Textual is not a serif, but the caution transfers to any detailed face that small: the 10px role is for call numbers, dates, source tags, and single-line marks. The moment receipt-face text wraps into a sentence, it is in the wrong role.

**Marks before sizes.** Bloomberg Terminal carries hierarchy through color coding and alignment on custom faces rather than size sprawl (bloomberg.com via secondary summary; direct fetch blocked, flagged). In a dense surface, size variety is the scarcest resource. A new hierarchy need gets a mark, a weight, or a color before anyone mints a sixth size.

**Full-measure single column.** USWDS: 45-90 characters is the readable measure range, 66 the long-form target (designsystem.digital.gov, primary). At 360-420px panel width, 13px claim text already sits at the low end of that range. Claim text takes the full card width with nothing competing for it; the 76px label rail's removal is confirmed by measure math alone.

### Rejected

**A sixth size.** Every new UI moment that gets its own px value erodes the scale from considered to accidental. Carbon's discipline of reusing sizes across roles is the counter-model. Five sizes, exactly.

**Bracket citation numerals inside claim text.** On-baseline `[1]` markers compete with the prose they annotate (indieweb.org). Scoped rejection: this governs the lens memo's claim lines, where citations render as small receipt-face marks. The public web card's citation-marker component is out of scope and keeps its DESIGN.md treatment.

**Receipt accent spreading into prose.** Bloomberg's monospace exists for numeric column alignment, not voice (same secondary-sourced summary flagged above). Pervasive mono reads as terminal pastiche and is already banned by DESIGN and project memory. At Textual stays a rare, earned accent.

---
*Captured 2026-07-21 from three parallel research tracks. Raw notes: `docs/motion-references/research-2026-07-21/` (gitignored).*
