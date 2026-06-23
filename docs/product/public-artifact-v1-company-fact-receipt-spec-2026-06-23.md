# Public Artifact V1 Spec: Company Fact Receipt

## Decision

Make the public website a **Company Fact Receipt**. The public `/c/{slug}` page is a stable, shareable, source-backed card that answers: what is this company, what public facts are known, and what evidence supports those facts?

This is the path forward. It preserves artifact gravity, strengthens trust in the extension, and cuts the public site down to the thing it can do better than a generic company profile: make public facts traceable.

The public site should not become a gallery, searchable database, content network, investor memo teaser, dashboard, refresh feed, or lead-generation surface. The extension remains the main product surface for private investor synthesis.

## Why this is the right path

The local review and external research converge on the same answer.

The current homepage tries to explain Cold Start, expose a public company index, and preview a card at the same time. That makes the product feel bigger but weaker. It also puts long-tail card quality in the first five seconds, which is risky while identity normalization, source labeling, and missing-data handling are still uneven.

The public card pages are closer. Their top section already has useful raw material: company name, description, filed date, source count, source mix, and key facts. The page loses force when it becomes a lightweight memo, source rail, full ledger, public research grid, open-question surface, and extension teaser all at once.

The strongest model is narrow:

- Public page: facts, evidence, timestamp, source ledger.
- Extension: why it matters, bull/bear, market timing, risks, diligence questions, private synthesis.

The public artifact should make the extension more credible by proving Cold Start’s evidence discipline. It should not try to replace the extension.

## Product principle

Facts first. Citations always. Judgment only after evidence holds.

This principle should govern copy, layout, code boundaries, and QA. If a public element does not help the reader understand the company or trust the source base, remove it, gate it, or move it lower.

## Primary user and context

The primary user is not someone browsing Cold Start for entertainment. It is a recipient of a shared company link.

They arrive with low context. They need to understand:

- What company is this?
- What does it do?
- What facts are public and supported?
- What facts are missing or weak?
- What sources were checked?
- What does the extension add privately?

They should get that in under 30 seconds without installing anything.

## Non-goals

V1 is not a public company database.

V1 is not a public investment memo.

V1 is not a Crunchbase, PitchBook, OpenCorporates, or search product competitor.

V1 is not a public ranking, scoring, or recommendation surface.

V1 is not an SEO content network.

V1 is not a public refresh workflow.

V1 is not a lead-gen page with repeated CTAs.

## Routes

| Route | V1 role | Decision |
| --- | --- | --- |
| `/c/{slug}` | Company Fact Receipt | Primary public artifact. Make this excellent. |
| `/` | Short explanation plus curated examples | Replace the public shelf. No search, sort, or full profile index. |
| `/api/cards/{slug}` | Public card API | Preserve public-only, no synthesis. |
| `/examples` | Optional later | Defer unless homepage needs more than two examples. |

## Public/private boundary

Public can show:

- Company identity.
- One sourced description.
- Public facts.
- Evidence status for each fact.
- Missing or unresolved public facts.
- Recent sourced public signals, if meaningful.
- Source ledger.
- Checked/generated timestamp.
- Quiet extension CTA.

Public must not show:

- Bull case.
- Bear case.
- Why it matters.
- Market timing.
- Investment recommendation.
- Deal score.
- Diligence plan.
- Private notes.
- Private synthesis.
- Generated investor comps unless reframed as directly sourced adjacent companies.

The current trust layer already supports the boundary. `packages/core/src/trust.ts` strips synthesis and person emails from public cards. `apps/web/src/app/api/cards/[slug]/route.ts` reads through the public card path. Keep those protections and add UI-level tests around them.

## Public card information architecture

### Zone one: receipt header

Purpose: establish the object.

Content:

- Cold Start mark.
- Label: `Public fact receipt`.
- Company domain.
- Checked date in plain English.
- Source count.

Rules:

- Do not show raw cache words like `hit`, `stale`, `partial`, or `miss`.
- Use `Checked Jun 23, 2026`, not `hit cache`.
- Keep this quiet. It is utility, not the headline.

### Zone two: company identity

Purpose: make the company instantly legible.

Content:

- Company name.
- Canonical domain.
- One sourced description.
- Optional website link.

Rules:

- Company name comes before product chrome.
- The description must be one sentence.
- The description should carry citation markers or sit directly beside source posture.
- If identity normalization is suspicious, block the card from curated examples and consider hiding from homepage surfaces.

### Zone three: known public facts

Purpose: give the reader the useful first read.

Content:

- 4 to 6 facts above the fold.
- Prefer: raised, last round, founders, HQ, headcount, founded year.
- Include citation markers and evidence status.

Rules:

- Hide missing facts by default.
- Show a missing fact only when absence is useful, such as revenue, named customers, or financing not found.
- Do not render six equal `not found` boxes.
- Do not show false precision. Prefer `reported total raised` when sources are indirect or conflicting.

### Zone four: evidence notes

Purpose: add useful context without turning the page into a memo.

Content:

- Optional 2 to 4 notes.
- Candidate notes: buyer, product, proof, financing, traction.
- Each note must be sourced and short.

Rules:

- No empty research cards.
- No repeated Proof/Money/People blocks.
- No open-ended diligence prompts in investor language.
- If a note is mainly an absence, phrase it as missing public evidence.

Example:

> Named customers were not verified from the public sources checked.

Not:

> Which proof point shows buyer pull beyond financing?

### Zone five: source ledger

Purpose: make provenance inspectable.

Content:

- One coherent source ledger.
- Source number.
- Title.
- Publisher/domain.
- Source type.
- Checked date.
- Claims supported if feasible.

Rules:

- One ledger, not a priority rail plus duplicate full ledger.
- On desktop, a source rail is acceptable only if it does not create a second ledger experience.
- On mobile, the ledger follows the content.
- Company-authored material must never be labeled independent.
- Citation markers must resolve to ledger rows.

### Zone six: footer contract

Purpose: state the public/private split and offer one next action.

Content:

- `Public facts only. Private synthesis lives in the extension.`
- One CTA: `Open in the extension for the investor lens.`
- Checked date and source count repeated quietly if useful.

Rules:

- No locked modules.
- No marketing banner.
- No repeated CTA stack.

## Homepage scope

The homepage should answer one question: what is Cold Start, and what does one trusted public card look like?

Recommended structure:

1. Hero: `Company facts, with receipts.`
2. One-sentence explanation: `Cold Start turns a company website into a sourced public fact receipt. Public cards show public facts and their evidence. The extension adds private investor synthesis.`
3. Two actions max: `View sample card` and `Get the extension` or `Request access`.
4. Artifact preview: one static or live quality-gated card.
5. Public/private split: public receipt vs extension lens.
6. Trust rule: every material claim cites a source; no recommendations; no private synthesis.
7. Curated examples: one or two links only.

Remove from homepage:

- Full shelf.
- Search.
- Sort.
- `205 profiles filed`.
- Selected-card preview.
- Public research stack.
- Long company list.

Do not use the homepage to prove scale yet. Scale is not persuasive while long-tail card quality is uneven. Use quality-gated examples instead.

## Evidence status system

Replace raw internal states with public evidence statuses.

| Status | Meaning | Public copy |
| --- | --- | --- |
| `Corroborated` | Two or more source classes support the fact. | `Corroborated` |
| `Reported` | A credible third-party source reports the fact, but corroboration is limited. | `Reported by one third-party source` or `Reported` |
| `Company-authored` | The company or its press release says it; no independent corroboration. | `Company-authored` |
| `Unverified` | Checked sources did not verify the fact. | `Not verified from public sources checked` |
| `Conflicting` | Sources disagree. | `Sources conflict` |

Do not show:

- `medium`
- `empty`
- `gap`
- `stale cache`
- `hit cache`
- `partial`

These can remain internal, but public labels must be human.

## Source model

V1 should tighten source labels before exposing them in the simplified card.

Recommended source classes:

- Company-authored.
- Press release.
- Third-party report.
- Primary registry or filing.
- Technical source.
- Social/profile.
- Database/profile.
- Archived snapshot.
- Unknown.

Rules:

- If the host belongs to the company, default to company-authored unless there is an explicit reason not to.
- Press releases should not become independent reports because a wire service mirrored them.
- Enrichment/database sources should not silently look as strong as primary sources.
- Conflicting funding/headcount/founding data should be shown as conflict or simplified to the most conservative phrasing.

## Public facts contract

The public card can render these fields when supported:

| Field | Render priority | Notes |
| --- | --- | --- |
| Name | Required | Bad names block curated examples. |
| Domain | Required | Canonical domain should be visible. |
| Description | Required for public card | One sentence, sourced. |
| Source count | Required | Part of trust posture. |
| Checked date | Required | Plain English. |
| Source mix | Required if sources exist | Small and quiet. |
| Funding total | High | Use reported phrasing when needed. |
| Last round | High | Show amount only when available. |
| Founders | High | Strip private emails. |
| HQ | Medium | Hide if unknown. |
| Founded year | Medium | Hide if unknown. |
| Headcount | Medium | Show method or evidence status. |
| Investors | Lower | Useful, but not above all facts by default. |
| Recent signals | Optional | Max 3, dated, sourced, meaningful. |
| Comparables | Gated by default | Public only if directly sourced and not framed as investor judgment. |
| Open questions | Gated by default | Public replacement is missing-evidence notes. |

## Missing facts

Missing facts should increase trust, not clutter.

Render absence when it tells the reader something material:

- Revenue not verified.
- Named customers not verified.
- Financing not found.
- Headcount only company-authored.
- Sources conflict on total raised.

Do not render absence for every field. A missing HQ or founding year does not deserve the same visual weight as a sourced funding fact.

## Visual direction

Use the Catalogue Card language from `DESIGN.md`, but make the page calmer and more edited.

What high craft means here:

- One reading path.
- Large company name.
- One crisp description.
- Compact fact strip.
- Small evidence marks.
- One source ledger.
- Warm, light, filed surface.
- No dashboard chrome.
- No decorative parchment cosplay.
- No public memo scaffolding.

The receipt should feel human-readable before it feels comprehensive.

The top half of the page should be screenshot-worthy. If someone screenshots it, the image should communicate: this is a careful company fact receipt with sources.

## Copy rules

Use:

- `Company facts, with receipts.`
- `Public fact receipt.`
- `Checked Jun 23, 2026.`
- `15 cited sources.`
- `Public facts only. Private synthesis lives in the extension.`
- `Open in the extension for the investor lens.`
- `Not verified from public sources checked.`

Avoid:

- `first-pass diligence` on the homepage hero.
- `score`
- `buy`
- `back`
- `pass`
- `hot`
- `investment recommendation`
- `AI-generated memo`
- `medium`
- `empty`
- `gap`
- `hit cache`
- `stale cache`

## Example policy

The homepage can show one or two examples.

A card qualifies as an example only if:

- Name is clean.
- Description is clean and sourced.
- At least 8 sources exist, unless intentionally demonstrating a thin-card state.
- At least 4 above-fold facts are supported.
- No raw internal states render.
- Source labels are sane.
- No duplicated sections appear.
- No public synthesis-like open question appears.

Do not use random newest cards as examples.

Do not show the full corpus count prominently.

## Code seams

The simplification should be straightforward later because the main seams already exist.

Likely files:

- `apps/web/src/app/page.tsx`: replace public shelf with narrow landing page.
- `apps/web/src/app/c/[slug]/page.tsx`: likely stays mostly unchanged.
- `packages/ui/src/CardShell.tsx`: simplify public rendering path.
- `packages/ui/src/SourceDrawer.tsx`: turn source presentation into one ledger system.
- `packages/ui/src/tokens.css`: simplify public card layout and remove duplicate research-grid weight.
- `apps/web/src/lib/cards.ts`: preserve public-card fetch and public-section merge, but card rendering should decide what is eligible.
- `packages/core/src/trust.ts`: preserve synthesis stripping and person-email stripping.
- `packages/core/src/source-quality.ts`: tighten or verify source labels.
- `packages/core/src/card-quality.ts`: consider example eligibility or public render eligibility if not already centralized.

This spec does not require a schema expansion to start. It likely requires better mapping from existing confidence/source fields into public evidence statuses.

## QA and acceptance criteria

A public card passes V1 when a first-time recipient can answer these in under 30 seconds:

- What company is this?
- What does it do?
- What are three reliable public facts?
- Which facts are weak, missing, or company-authored?
- Where can I inspect the sources?
- What does the extension add privately?

Functional checks:

- `/api/cards/{slug}` never returns `synthesis`.
- Public UI never renders synthesis fields.
- Public UI never renders raw internal states.
- Citation markers resolve to source ledger rows.
- Company-authored sources are not labeled independent.
- Missing facts do not create empty-card clutter.
- The homepage has no search, sort, full shelf, or corpus count above the fold.
- Mobile first viewport is company-first, not navigation-first.

Craft checks:

- No duplicated Proof/Money/People/Signals/Comps sections.
- No more than one source ledger experience.
- No more than one public CTA.
- No dashboard-like widget cluster.
- No investor-recommendation language.
- No decorative design element that does not clarify evidence.

## Rejected paths

### Public gallery

Reject for V1. It shifts the product from artifact to browse destination, exposes weak cards, and makes quality unevenness the first impression.

### Searchable company index

Reject for V1. It is useful only after identity, refresh, source labeling, and long-tail card quality are reliable enough that browsing builds trust.

### Public investor memo teaser

Reject. It blurs the public/private boundary and makes the public card feel incomplete.

### Receipt-only source dump

Reject. The source ledger is essential, but the reader needs company comprehension before provenance detail.

### Extension preview page

Reject as the primary model. The public card should be useful without installing anything.

### Public refresh profile

Defer. Refresh is valuable later, but anonymous public refresh creates cost, trust, and expectation problems before the artifact is stable.

### Public comps

Gate by default. Comps are often judgment-heavy. If they stay public later, they need a narrower label such as `publicly named adjacent companies`.

## Validated external patterns

Use these as product references, not visual moodboards:

- Blacklight: one input, one public report. This validates the narrow artifact model. https://themarkup.org/blacklight
- Our World in Data: visible source posture with deeper provenance available. This validates source visibility without overwhelming the first read. https://ourworldindata.org/redesigning-our-interactive-data-visualizations
- Apple privacy labels: standardized public labels for complex evidence categories. This validates `Corroborated`, `Reported`, `Company-authored`, `Unverified`, and `Conflicting`. https://www.apple.com/privacy/labels/
- Elicit: claim-level citation discipline. This validates citation markers near facts, not only at section level. https://elicit.com/solutions/systematic-review
- Wayback Machine: timestamped capture as a trust feature. This validates checked/generated dates as part of the receipt. https://wayback.archive.org/
- CarbonPlan CDR database: explicit public-materials boundary. This validates saying what public evidence can and cannot support. https://carbonplan.org/research/cdr-database/methods

Do not copy PitchBook-style breadth. Cold Start is not trying to win public profiles by density.

## Implementation sequence

This is the recommended order once implementation is approved:

1. Replace homepage shelf with narrow landing page.
2. Simplify `CardShell` public path to receipt header, identity, fact strip, evidence notes, one ledger, footer.
3. Add public evidence-status mapping and copy.
4. Tighten source label display.
5. Add missing-fact rendering rules.
6. Add public/private and citation-resolution tests.
7. QA against one rich card, one medium card, one thin card, and one bad-identity card.

Do not start by restyling. Start by deleting surface area and enforcing the receipt contract.

## Open questions before implementation

- Which one or two cards are strong enough to be homepage examples?
- Should public evidence notes include buyer/proof/traction in V1, or should V1 be facts plus ledger only?
- Should `Comps` be removed from public immediately, or kept temporarily only when directly sourced?
- Should bad identity normalization hide the public card, hide the card from examples, or block generation quality?
- Should one-source cards render publicly with a warning, or stay API-only until they clear a higher threshold?
- Does `sourceQualityForSource` need host/domain-aware relabeling before the simplified page ships?

## Final shape

The public artifact should be small enough to trust.

One card. One company. One sentence. A few facts. Clear evidence status. One source ledger. One quiet path to the extension.

That is the product surface worth polishing.
