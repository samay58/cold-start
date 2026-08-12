# The Exhibit: show the difference, don't argue it

Decided 2026-08-11 with Samay. This is the build spec for a new landing-page block and a video bookend. Both show real PitchBook output next to real Cold Start output for the same companies. The page never says "we are better." It shows the two documents and lets the reader count.

Related: `docs/product/strategy/resonance-audience-and-10x.md` (the positioning frame this executes).

## The idea in three sentences

PitchBook describes every company with the same sentence. Cold Start's card answers the questions an investor actually asks. Put the two texts side by side, verbatim, and mark every Cold Start line the other side has no field for.

## Register rules (non-negotiable)

- The card's own microcopy voice narrates: flat, filed, declarative, zero persuasion. "Both values stand" is the register.
- PitchBook text appears verbatim, full contrast, attributed with an access date. No dimming, no strawman styling, no editorializing labels like "generic" or "nuanced."
- No checkmarks, no red X marks, no feature grid, no word counts.
- Every copy line that renders on the page is written by Samay. This spec ships working placeholders only, and they are marked `[SAMAY]`. Placeholders may render in dev builds; nothing ships to production until he replaces them.
- No synthesis on the landing page. The exhibit uses public card content only: description, expanded description, comps, risk, next question. Investor Lens content appears in the video only, where the extension is the subject.

## Placement

Landing: inside the existing PitchBook section (`apps/web/src/app/page.tsx`, `section#pitchbook`), between the intro paragraph and `ComparisonTable`. The table and the closing paragraph stay. The exhibit is evidence; the table below becomes the recap.

Video: a bookend in the first-company walkthrough (`apps/video`). Cold open poses a question and shows PitchBook failing to answer it. The existing walkthrough runs unchanged. At the payoff, the same question returns and a card line answers it with its citation. Video work is a separate later task; this spec records the plan so it is not re-litigated.

## Section structure, top to bottom

### Beat 0: kicker

One line under the section intro. `[SAMAY]`. Working placeholder: "The same companies, in both tools."

### Beat 1: the stack

Six PitchBook one-liners, stacked, verbatim. Same sentence shape six times; the repetition is the content. Order: Exa, Turbopuffer, ClickHouse, Cursor, Ramp, Mintlify last (it hands off into the first pair). One caption for the whole stack: PitchBook attribution plus access date, receipt style.

Verbatim strings (frozen 2026-08-11 from Samay's PitchBook access; re-verify against PitchBook before ship):

1. Exa: "Developer of an artificial intelligence-powered search engine designed to perform web searches at a large scale."
2. Turbopuffer: "Developer of a serverless vector database designed for the technology and data storage industries."
3. ClickHouse: "Developer of an online analytical processing database management system designed to generate analytical reports using SQL queries."
4. Cursor: "Developer of an artificial intelligence-powered coding platform designed to enhance the productivity and capabilities of programmers and software engineers."
5. Ramp: "Developer of a spend-management platform designed to streamline business, improve efficiency, and build healthier enterprises."
6. Mintlify: "Developer of an intelligent knowledge platform designed to organize, analyze, and surface enterprise knowledge for improved decision-making."

### Beats 2 to 4: three question pairs, each a different company

Each pair: question as title `[SAMAY]`, their material on the left, our card excerpt on the right with tick marks, a link to the live card underneath. Link label `[SAMAY]`, placeholder "Open the full card".

**Pair 1. Working question: "What do they actually sell?" Company: Mintlify.**

- Left: the Mintlify description above, plus their fields as a record: 62 employees, 2 contacts, 5 deals, 11 investors, Year Founded 2021, Primary Industry "Business/Productivity Software".
- Right: our card's short description and expanded description, plus the who-pays lines (engineering and developer-experience teams; Anthropic, Perplexity, Vercel, Fidelity, Replit). Freeze from the live prod card at build time; do not retype from this spec.
- The gap this pair shows: their text points a reader at enterprise knowledge management (the wrong product). Ours names the product and the buyer. The page never says this; the reader feels it.
- Margin note on the employee number: theirs 62, ours 85, both dated. Note wording `[SAMAY]`. This is the only place the two documents disagree on a number that we surface, and both values stand.
- The founding-year discrepancy stays OFF the page (they say 2021; YC and our card say 2022, three citations). Recorded here so nobody re-adds it: a reader cannot referee it in place, and it turns the exhibit into an attack.

**Pair 2. Working question: "Who pays them?" Company: Turbopuffer.**

- Left: their record row, transcribed: Employees 22 (as of 2025), Total Raised: dash, Post Valuation: dash, Revenue: dash. Render the dashes as they render them. The empty fields are the show.
- Right: our card's buyer and bet lines (Anthropic, Cursor, Notion, Atlassian; the object-storage bet with the latency numbers). Freeze from prod card.

**Pair 3. Working question: "Who do they compete with?" Company: ClickHouse.**

- Left: their seeded comparison columns, transcribed: Databricks (9,000 employees, $29.52B raised), Anthropic (5,000 employees, $161.25B raised), Grafana Labs (1,600 employees). Bare records, no reasons. Samay confirmed 2026-08-11 that PitchBook seeded these columns, not him; that confirmation is what makes this pair honest. If that ever becomes uncertain, fall back to their algorithmic Similar Companies list (Mintlify's includes an EDI logistics vendor and an API debugging client).
- Right: our comps section: Snowflake, Databricks, Elastic, LangSmith, each with its reason and its source domain beside the name. Freeze from prod card.

### Beat 5: tally

One flat line under the pairs carrying the tick count. `[SAMAY]`. Working placeholder: "Nine lines. No field on the left for any of them."

## Visual spec

- Two papers on the desk: the pair panels sit on the parchment ground with a few pixels of vertical offset, not a rigid 50/50 grid.
- Left panel: flat, slightly cold white against the warm page, thin 1px rules between fields, small grey all-caps field labels, values full-contrast. IBM Plex Sans. Receipt-style caption underneath with attribution and access date.
- Right panel: a real render of the public card components (the same pieces `/c/{slug}` uses), from frozen fixture data, never screenshots. Fades out at the bottom mid-content, link below.
- Ticks: short vertical marks in seal lilac (`--color-seal #6E5C9E`) in the card's left margin, one per line with no left-side counterpart, with a tiny margin note in the receipt face. The ticks are the only lilac in the exhibit. Accent stays in this one band.
- Motion: ticks draw in once when the section scrolls into view, roughly 60ms stagger, well-damped. Everything else is still. Under reduced motion the ticks appear at full opacity without the draw. This block reads as print, not demo.
- Mobile under 700px: each pair stacks vertically, their panel first, ticks shrink to bare marks in a narrow gutter, the tally line carries the count.
- Accessibility: ticks are decorative (`aria-hidden`); the tally line is real text and carries the count for everyone.
- All colors route through theme tokens like every other landing style. New styles go in `apps/web/src/app/styles/landing.css`.

## Engineering plan

- New component folder entry: `apps/web/src/components/landing/RecordExhibit.tsx` (name at builder's discretion), plus a frozen fixture module alongside it, following the `recorded-build-data.ts` pattern: PitchBook verbatim text and transcribed field values (static editorial content, attributed) plus card excerpts frozen from the three prod cards.
- Freeze card excerpts from prod card JSON (`/api/cards/mintlify`, `turbopuffer`, `clickhouse`) at build time, hand-reviewed. The Cold Start texts quoted in this session are reference only.
- Tests: render test over the fixture (all three pairs, tick counts, links), reduced-motion behavior, and mobile stacking. Fixture-covered like every collection surface.
- QA: `seed:web-gallery` + `qa:web:gallery` for desktop and mobile screenshots; Samay reviews screenshots before any copy is considered final.
- Full `npm run check` before ship.

## Fix list, before anything is showcased

1. Turbopuffer comps section shows "0 sources" while making four claims. Real bug on a provenance product. Find why the comps section lost its citation attribution and fix it.
2. Exa card contains "AI agents. com." mid-sentence in its stored description (legacy-format expanded description nested inside `identity.description.value`). Regenerate or repair the card; also worth a root-cause look at how the string survived.
3. Artifact-scan and hand-read the Turbopuffer and ClickHouse cards the way Mintlify was checked (Mintlify scanned clean 2026-08-11).
4. Verify the citation behind our Mintlify employee count (85) before the margin note ships.
5. The table below the exhibit still claims "Under 10 cents per full profile." Measured median full-profile cost was $0.435 to $0.481 in June. The exhibit magnifies every uncited claim near it. Re-measure or reword before ship.

## Video bookend (later task, plan frozen here)

- Company: Mintlify throughout, matching the hero.
- Cold open, about ten seconds: question card `[SAMAY]`, scroll of the PitchBook Mintlify description hunting for the answer, no answer found. Product has not appeared yet.
- Existing walkthrough runs unchanged.
- Payoff: the question returns; the card line that answers it, citation visible. Investor Lens may appear here; the video demos the extension.
- Honest-failure footage exists (the "Investor Lens run failed. Retry when ready." state) if a reliability beat is ever wanted; not part of this cut.

## Copy slots summary (all Samay, placeholders marked in the fixture)

1. Kicker line.
2. Three question titles.
3. Margin note wording (employee disagreement).
4. Tally line.
5. Link label.
6. Stack caption / attribution line.
