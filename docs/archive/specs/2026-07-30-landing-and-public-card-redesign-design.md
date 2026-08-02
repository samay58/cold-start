# Landing page and public card redesign

Date: 2026-07-30. Status: approved direction, settled in the 2026-07-30 brainstorm. The two Claude Design mockups in `docs/design/mockups/landing-page/` and `docs/design/mockups/public-card-catalogue/` are the starting point. DESIGN.md stays the visual law where the two disagree.

## What this covers

Three public web surfaces, rebuilt in this order:

- The public company card at `/c/{slug}`, rebuilt to the catalogue-card mockup.
- The Catalog at `/catalog`, a new page listing every filed profile.
- The landing page at `/`, rebuilt to the landing mockup, with a real ask-for-access form behind it.

The Chrome extension side panel is untouched. The extension consumes only `tokens.css` and `safeExternalHref` from `packages/ui`, so token changes must be additive and `safeExternalHref` stays as-is. Nothing under `apps/extension` changes.

## Deferred, not built

- The card verso: build tracings and the refiled-dates log stay in the mockup for a later pass.
- Verify and Sources standalone pages. The mockup nav shows them; the shipped nav does not.
- Public generation. The landing hero has no URL input.
- Dark mode on any web surface.
- Queue stats ("41 in the queue, 9 days") until real requests exist to count.
- Live in-progress rows on the public card (the Kyutai mockup's "Reading four more pages"). Public cards render filed state only.
- Search or filtering on the Catalog. At alpha scale a flat list is enough.

## Naming

The browse surface is "The Catalog" at `/catalog`. Spelled Catalog, never Catalogue. In prose, cards are "company profiles". The phrase "sourced company profiles" dies everywhere. Known occurrences: `apps/web/src/app/page.tsx:56`, `apps/web/src/app/layout.tsx:28`, `apps/web/src/app/c/[slug]/page.tsx:12`, `apps/web/src/app/c/[slug]/opengraph-model.ts:31`, plus assertions in `apps/web/tests/home-page.test.tsx` (two) and `apps/web/tests/opengraph-model.test.ts` (one). Replacement metadata copy: "Company profiles, cited." for the site description and "Company profile, cited." as the per-card default description.

## Shared visual language

### Typography

The mockups set everything in IBM Plex Mono and Courier Prime. That is inspiration, not law. The shipped translation:

- Display: the existing grotesk stack (`--font-display`, GT America if a licensed webfont ever lands in `--font-gt-america-next`, IBM Plex Sans 700-780 until then). Company name, hero headline, section H2s.
- Body: IBM Plex Sans 400-700 with tabular figures. Every narrative sentence, table cell, label, and button.
- Receipt: At Textual (`--font-text`, already loaded in `apps/web` as `AtTextualVAR.woff2`). Only for call numbers, dates, citation marks, evidence-mark labels, stamps, the top meta strip, event lines, and footer strips. Everywhere the mockup uses monospace, the shipped page uses At Textual, and only in those slots. Pervasive mono is the AI tell this repo already banned.

Company name uses the DESIGN.md display clamp (`clamp(50px, 6.4vw, 82px)` at 700-780, tight tracking). Section labels are sentence case in the seal color. No all-caps headers outside stamps.

### Color

Existing tokens carry the base: `--cat-ground`, `--cat-paper`, `--cat-ink`, `--cat-muted`, `--cat-rule`, `--cat-rule-strong`, `--color-seal`, and the five evidence colors. The mockups introduce a handful of tints that need new additive tokens in `packages/ui/src/tokens.css` (final names in the plan):

- Ghost-card stack fills and borders (`#EEE4CE`, `#F1E8D5`, `#CBBFA2`, `#CDC1A4`).
- Conflict panel fill and rules (`#F7EFE0`, `#D8B8AF`, `#E4CCC4`).
- Held-row background and its acknowledgment flash (`#EDE3CC`, `#DCCFF0`).
- Deep seal for held citation text and link hover (`#3C2F63`, `#4E3F79`).
- Dotted-rule tan for blank ruled lines and the next-question underline (`#C9BCA0`), and the second-tier muted `#8A8271`.

Adding tokens is safe for the extension; renaming or retuning existing ones is not.

### Card object

The card sits on the manila ground as a pulled index card. Two offset ghost layers behind it (plain bordered rects, no rotation), a 4px seal bar across the top edge, 6px radius, and the existing `CardTexture` WebGL parchment on the face. The mockup's CSS wear overlays (radial stains plus a faint diagonal fiber gradient at multiply) layer on top of the shader texture; if the two fight visually in the gallery, the shader wins and the CSS stains go. Mobile gets one ghost layer and stains only.

### Stamps

FILED and THIN FILE use the mockup's double-strike treatment: two absolutely positioned copies of the same bordered lockup, offset 1-2px, rotated about half a degree apart, the under layer at low opacity and the over layer behind a radial mask so the ink density is uneven. FILED is seal purple with the filed date; THIN FILE is muted grey-tan with "N sources on record" beneath. 2px border, 2px radius, At Textual. The card footer VETTED chip is a single-layer rotated chip and only renders real numbers: verified-class citations out of total citations.

### Evidence marks

The five states keep their existing colors and shapes: verified is a filled `#0E6B5B` square, reported an outlined `#315F9D` square, company a half-filled `#9B6A1E` square, conflict a `#B63A2A` diagonal-hatch square, unknown a dashed or ringed muted mark. 9px squares leading facts, smaller in rails. Marks never tint whole surfaces.

## The public card at /c/{slug}

New components under `apps/web/src/components/card/`. The web branch of `packages/ui/src/CardShell.tsx` retires; `/c/[slug]/page.tsx` renders the new face. Whether CardShell can be deleted outright depends on what still imports its extension branch; the plan verifies with grep and knip before removing anything. Reusable helpers (`formatCompactCurrency`, citation ledger builders, `publicEvidenceText`, sentence utilities) are kept and imported, not rewritten.

Layout: reading plate max 1120px on the manila ground. Two columns on desktop, main claim column 620-720px, sources rail 280-340px, 32-56px gap. The rail is sticky within the card so citation choreography works mid-scroll.

Top to bottom:

**Meta strip** (above the card, At Textual): "COLD START / catalog / c/{slug}" on the left, "retrieved {timestamp} · {n} sources read" on the right. Real values only.

**Header**: company name in the display stack, the sourced one-liner beneath at 19-21px, then a receipt meta line (domain link, HQ city, "founded {year}" when known). Right side carries the CALL NO. block, "CALL NO." label over the value `CS·{SLUG}·{YY}` in seal purple At Textual, year from `generatedAt`. The mockup's category segment (`VOI`) is dropped; no honest taxonomy exists for it. The FILED stamp sits beside the call number, or THIN FILE on sparse cards.

**Stat strip**: five equal slots. Stage, Raised, Headcount, Valuation, Open roles.

- Stage maps to `funding.lastRound` (round name, announce month, lead cited).
- Raised maps to `funding.totalRaisedUsd`, detail "disclosed rounds" with citations.
- Headcount maps to `team.headcount`. When the fact status is `mixed`, the label goes conflict red, the mark goes hatch, the value shows the stored value with "sources disagree, see below" linking down to the conflict panel.
- Valuation has no schema field. It renders the absent state with detail "no source in ledger". That is the honesty doctrine on display, not a bug.
- Open roles has no schema field either and renders the absent state the same way. If the gallery shows two permanently absent slots reading as broken rather than honest, the sanctioned fallback is swapping Open roles for Founded, which the schema carries. This is a render call inside the iteration loop, not a reopened decision.

Absent values render italic "not publicly disclosed" at weight 500 in the second-tier muted, with an At Textual detail line explaining why. Never hidden, never dashed out.

**Section rows**, a 112px left-label column and content, hairline rules between rows, labels in seal purple sentence case:

- **Money**: sentence bullets composed from the funding facts (total raised across disclosed rounds; the last round with date and lead; a filing bullet when a filing citation exists), then financing research-section items when present. A trailing muted bullet names what is missing ("Round size, post-money valuation, and the full investor list are not publicly disclosed") when the facts are partial. Full empty state between dashed rules: "No filing, no announced round, no reported figure." with the receipt line "No public funding found."
- **People**: founders and key execs as name-and-role pairs with citations. When headcount is `mixed`, the conflict panel renders here (below). A hiring bullet is not duplicated from Signals.
- **Signals**: the dated table. Columns date (At Textual), category tag (seal), statement with its evidence mark, citation marks. Date descending, capped at six, matching the clustered signals the card already stores. Company-claim rows carry the inline receipt caveat "company claim, not independently confirmed" in the company tint.
- **Comps**: comparable rows (name, domain, one-liner, citation). Empty state between dashed rules: "No comparable company is named by any source in this ledger." / "The section stays empty until one is."
- **Risk**: mechanically derived posture caveats, never synthesis. Two rules only: when every customer-proof citation is company-class, render "The {claim} is company-sourced only. No independent source in this ledger confirms it." with the company mark; when a load-bearing fact is stale beyond its TTL, name it. If neither rule fires, the section is omitted entirely. Risk never renders an empty state, because "no risk found" is not a claim this product makes.
- **Next question**: one question, checkbox glyph, At Textual at 20-21px on a dotted underline, sub-line "Not a recommendation. The first thing this ledger cannot answer." The question comes from a small deterministic template table keyed to ledger gaps, checked in priority order: company-only customer proof asks for one referenceable production customer; a headcount conflict asks for a current headcount and the date it was counted; no financing found asks what the company has raised and from whom; a thin file asks the Kyutai-style question about who funds it. If no template fires the section is omitted.
- **Investor read**: five labels (Why care, What must be true, What could break, Why now, What to learn next) each against a blank ruled line (the repeating dash gradient from the mockup). Locked copy beneath in At Textual: "Filled in the side panel for invited readers. This card carries sourced facts only." Renders on FILED cards only, omitted on THIN FILE cards.

**Conflict panel** (inside People when headcount is `mixed`): bordered box on the conflict fill. Header "Headcount: sources disagree" with the hatch mark. The current schema stores one value for a mixed fact, not both, so the panel has two forms. The full form, both values side by side with per-source attribution and dates, renders only if the pipeline's conflict-resolution step already records the competing values somewhere recoverable; the plan verifies this against `packages/pipeline` before promising it. The degraded form shows the stored value large, lists the disagreeing sources by name and date from the fact's citations, and carries the same footer. Either form ends with the footer strip: "Both values stand. Cold Start does not average sources." No schema changes in this pass; if the full form needs a new field, that is a follow-up with its own schema-extraction-pipeline-UI change.

**Sources rail**: header "Sources" with "tracings · {n}". Rows: citation index badge in At Textual seal, publisher or title at weight 600, a receipt line with date and slug, then the evidence mark with its class label. Display indices renumber citations 1..n in ledger order; inline marks use the same mapping. The mockup's "Read and dropped: [3], [6]" footnote needs dropped-source data the card does not carry publicly; it ships only if that data exists, otherwise the footer is omitted.

**Card footer**: call number, "filed {date}", "sourced facts only" on the left; the VETTED chip with real counts on the right. No "Turn card over" link (verso deferred).

### Citation choreography

The load-bearing interaction. Inline citation marks are At Textual `[n]` with a faint seal underline. Hover raises the mark (seal fill on the underline, light tint behind) and simultaneously acknowledges the ledger row: background to the held tint, a 2px inset seal bar on the left edge (inset shadow, not a border ribbon), translateX(3px). All transitions 140ms ease. Click holds the pair until the next click anywhere resolves it; the held row plays a one-shot 900ms acknowledgment flash from the light-purple tint down to the held tint. Non-involved rail rows dim to about half opacity while a pair is held. The page never scrolls on its own. This replaces the current hover popover and click-scroll behavior on web. Implemented as a client component wrapping the fact column and rail with shared React state; CSS transitions carry the motion, no Framer Motion here.

### Thin files

A card is a THIN FILE when it has fewer than three citations or no verified- or reported-class citation. THIN FILE swaps the stamp, keeps the stat strip (absent slots and all), renders only sections that have content plus the Money empty state and Next question, and omits People, Comps, Risk, and Investor read when empty. The Signals footer line "One signal on file. A signal needs a date and a source." renders when exactly one signal exists.

### Mobile pocket card (under 700px)

Single ghost layer, name at 34px, then four divider tabs: Card, People, Signals, Sources. Tabs are rounded-top chips; the active tab carries a top inset seal bar and merges into the content panel. Client-side state, no routing.

- Card tab: compact label-value rows (Stage, Raised, Headcount, Valuation, Comps as a one-line "none named by a source"), then Next question.
- People tab: names, the conflict panel compressed (footer shortens to "Both stand. No average is shown."), the hiring bullet if present.
- Signals tab: the same rows stacked, date and tag on one line, statement below.
- Sources tab: the full ledger. Tapping any inline citation mark on other tabs jumps to this tab; there is no hover choreography on touch.

Footer on every tab: "filed {date}" and "{n} sources".

## The Catalog at /catalog

The drawer the Browse button opens. Header: "The Catalog" in the display stack with the real count beneath ("{n} profiles filed"), set on the manila ground. Below, one flat list of profile rows in filed-date descending order, each row a compact index-card entry: company name (display face, modest size), domain and call number in At Textual, filed date, source count, a mini evidence signature (the per-class mark counts the current card already computes), and a small THIN FILE tag on sparse cards. Row hover uses the same 140ms acknowledgment language as the ledger rows: held tint, inset seal bar, translateX(3px). Rows link to `/c/{slug}`.

Data comes from the existing cached public index. The count shown here, on the landing hero, and in the landing footer all derive from that same cached index length, one source of truth, no separate COUNT query until scale forces one. Empty state, honest: "No profiles filed yet."

The current homepage profile list dies with the landing rebuild; `/catalog` is its replacement.

## The landing page at /

Sections in mockup order. All numbers live or absent.

**Nav**: seal hairline at top. "Cold Start" lockup left with the receipt descriptor "company profiles, cited". Right: Catalog (link), Extension and Ask for access (anchors). No Verify, no Sources.

**Hero**: H1 "Deeply understand the companies you care about", subhead "Get up to speed like a serious investor would." No URL input. Primary action is the seal Browse pill: "Browse the catalog" with the live count in receipt type beside it. The right column is the recorded build.

**Recorded build**: a scripted deterministic replay of a real profile assembling, built from a frozen snapshot of one real filed card checked into the repo as a data module, labeled "recorded build · {domain}" with a "replay" affordance. The animation: four source clippings slide in from the left one stage at a time (settling at slight rotations), card sections resolve from ghosted to full opacity in filing order, the seal circle inks up stage by stage, and the FILED stamp lands last with a stamp settle. An event line below the card steps through the real run's trail (the mockup's "Opened 14 documents, kept 6" beats, regenerated from the frozen card's actual generation events and counts), with an elapsed counter. Plays once when scrolled into view, holds the finished state, replays on demand; no infinite loop. Framer Motion enters `apps/web` for this sequence only (version aligned with the extension's `^12.38.0`), springs tuned to the DESIGN.md doctrine: stiff, just under critical damping, settle fast with a breath of follow-through. `prefers-reduced-motion` renders the finished card, static, with the FILED stamp already down. Mobile renders the finished card statically with no clippings, exactly as the mockup does.

The frozen snapshot is exported from a real production card by a small script during implementation; company chosen at plan time. Every number in the replay (documents opened, facts kept, lines checked) comes from that card's real trace.

**PitchBook comparison**: H2 "Cold Start can replace PitchBook". The intro paragraph, the six comparison rows, the cost sub-caption ("one seat of PitchBook buys 250,000 profiles"), and the closing paragraph all keep the mockup copy verbatim, including the hedge "About $25k per seat per year, reported". Mobile collapses to the mockup's stacked three-line rows with its compressed wording.

**Understand the sources**: the five-state legend, three columns on desktop (mark, name, sentence plus example), the mockup copy verbatim: "Two independent sources say it." / "One outside source says it." / "Only the company says it." / "The sources give different numbers." / "No source has it." Mobile collapses to mark plus bold-inline-label sentence.

**Extension**: eyebrow "Chrome extension", H2 "A companion for understanding a company, not just looking it up.", the body copy on the five questions, and the panel replica on the right: Why care and What must be true answered with citations, the other three locked with "invited accounts" in receipt type. The replica is static content, no animation. The CTA is honest: the alpha is invite-gated, so the button reads "Ask for access" and anchors to the form, with the receipt caption "invite-only alpha". "Add to Chrome" ships only if a public store listing URL actually exists at build time; the plan checks. Mobile drops the panel replica, keeps copy and CTA.

**Ask for access**: H2, body "Send us your name, email and one line about why this is interesting to you. A person reads it and answers either way." A real form: name, email, one-line note, Send. Inline success state: "Sent. A person reads it and answers either way." Inline failure state names the problem plainly. No queue stat until real numbers exist.

**Footer**: "Cold Start · {n} profiles filed · last filing {date}" from live data, and "Public facts, cited. Not investment advice." No VETTED stamp here; an aggregate vetted count would be fabricated.

## Access requests

- **Migration**: the next free number (0015 as of this writing; 0014 is invite elegance; the plan confirms against `packages/db/drizzle/` before generating): `access_requests` with id, name, email, note, `ip_hash`, `created_at`, `handled_at` nullable. Repository module `packages/db/src/repositories/access-requests.ts`.
- **Route** `POST /api/access-requests`: validates name (≤120 chars), email (shape-checked), note (≤500 chars). A hidden honeypot field that, when filled, returns the success response and writes nothing. Rate limiting is DB-backed because the deployment is serverless: at most 3 requests per hashed IP per hour and 1 per email per day; over the limit returns 429 with the same quiet body shape. No email automation, no admin UI.
- **Operator script** `scripts/access-requests.ts` following the `alpha-common.ts` pattern (`loadProductionEnv`, `parseCliArguments`, `runCli`, `withAlphaDb`-style connection handling): default action lists open requests newest first, `--handled <id>` stamps `handled_at`. npm script `access:requests`. Unit tests for the pure parts alongside the alpha operator tests.

## Honesty rules

Every number on the site is real or absent: profile counts, filed dates, source counts, vetted counts, replay event numbers. Nothing renders a fabricated stat, and nothing renders a placeholder stat waiting for data; the element is absent until the number is real. Absent facts on cards say "not publicly disclosed". Empty sections say what was looked for and found nothing, then stop.

## Architecture notes

- New card face: `apps/web/src/components/card/` (server components for structure, client components only where state lives: choreography, pocket tabs, the recorded build, the access form).
- CSS: `apps/web/src/app/globals.css` becomes an import manifest over partials in `apps/web/src/app/styles/` (card, catalog, landing, shared), matching the extension's `styles.css` convention. The dead `.cs-index-*` block (~400 lines), the unwired `.cs-web-research*` block, and the old `.cs-home-*` layout are removed in the same pass.
- `packages/ui` changes are limited to additive tokens. The extension surface, `manifest`, and everything under `apps/extension` are untouched.
- No API route shapes change, so no contract bump. Public card routes still strip synthesis; nothing in this work reads synthesis on the web.
- Metadata (layout description, per-card OG description, OG images) updates with the naming sweep. The OG image route should be checked against the new card face for visual drift but is not a redesign target.

## Iteration loop and merge bar

A new `qa:web:gallery` renders the surfaces into a screenshot gallery for the polish loop:

- A Playwright config lands in `apps/web` (Playwright is currently extension-only). Specs follow the extension gallery pattern: spec files, not tsx drivers, because `addInitScript` breaks under tsx.
- A fixture seed script inserts three cards into local Postgres: a rich card with a headcount conflict, a THIN FILE card, and a card with empty Comps and Money. The specs screenshot `/`, `/catalog`, and the three `/c/{slug}` pages at 1440 and 390 wide into `~/Downloads/cold-start-qa/{timestamp}/web/`, with interaction states captured for the choreography (hover, held) and the pocket tabs.
- The loop is render, inspect, refine, rerun until the interaction design holds up at 1x zoom.

Merge bar per phase: `npm run check` green (which now includes the new web tests), `evo:ux-gate` green, gallery reviewed. Rollout order: card first, then Catalog, then landing plus access form, each landing on main independently shippable.

## Plan-phase verification items

Facts the implementation plan must verify before committing to an approach, all flagged above in place:

- Whether the pipeline's conflict-resolution step records competing values recoverably (decides the conflict panel's full vs degraded form).
- What still imports `CardShell`'s extension branch (decides whether the file shrinks or dies).
- The next free migration number at generation time.
- Whether a public Chrome Web Store listing URL exists (decides the extension CTA).
- Whether dropped-source data is publicly recoverable (decides the ledger footnote).
- Which real production card becomes the recorded-build snapshot.
