# Public Artifact Scope Review

## Recommendation in one paragraph

Collapse the public web product to one excellent shared artifact: a sourced company fact card with a compact source ledger. Do not make the public site a gallery, searchable database, dashboard, content network, memo surface, or investment recommendation page. The public `/c/{slug}` page should answer, in one screen, "what is this company, what public facts do we know, and why should I trust the evidence?" The landing page should explain Cold Start and link to one or two strong examples, not expose the full profile shelf. The extension remains the actual product surface for judgment, investor synthesis, section generation, and deeper work.

## What the public artifact should be

The public artifact should be a stable research receipt for a company.

It should feel like a sourced investing index kept by someone careful. A recipient should be able to open a shared link, spend 30 seconds, and understand the company, the strongest public facts, and the provenance of those facts without installing anything.

The page should not try to finish diligence. It should establish a clean public floor: identity, description, key facts, recent signals when supported, and the source base. The higher-order questions and private judgment should stay behind the extension.

The best mental model is "public fact card plus source ledger." Not "mini memo." Not "company profile database." Not "extension marketing page."

## What the current website is doing now

The current root page at `https://cold-start.semitechie.vc` is a public profile index. A first-time desktop reader sees:

- Cold Start.
- "Sourced company cards for first-pass diligence."
- "205 profiles filed."
- A company list with search and sort.
- A selected profile preview.
- Public research section previews.

On mobile, this is more obvious. The first screen still leads with the profile shelf, controls, and inventory count before the user has a reason to trust the artifact.

The current public company pages are closer to the right product, but still too loaded. I inspected Cartesia, The Browser Company, and Browserbase. The first screen generally works: company title, one-sentence description, filed date, source count, source mix, and key facts. The problem starts immediately after that. The page then adds "Public research / What the sources say first," another full section stack, a priority source rail, a full source ledger, open questions, and footer metadata.

The current implementation matches this shape:

- `apps/web/src/app/page.tsx` implements the searchable public shelf, selected preview, profile count, and research-section cards.
- `apps/web/src/app/c/[slug]/page.tsx` is clean and delegates rendering to `CardShell`.
- `packages/ui/src/CardShell.tsx` renders the public card, key values, public research grid, detailed sections, priority source rail, full source ledger, open question, and footer.
- `apps/web/src/lib/cards.ts` fetches the public card and merges stored public research sections with legacy sections.
- `packages/core/src/trust.ts` strips synthesis and person emails for public cards.

## What breaks parseability and craft today

The root page exposes the weakest part of the system. It makes Cold Start look like a database to browse, which invites users to judge coverage, completeness, and data quality across 205 profiles. That is not the current product promise.

The profile shelf also surfaces bad edge cases too early. The live index defaulted to Sail Research, where the preview showed "Raised ~9 people," because a headcount value landed in the raised slot. The API also shows a bad identity case for `wabi.ai`: the public name is "Waabi raises $1B and expands into robotaxis with Uber | TechCrunch." These are the wrong things to put on a homepage.

The card pages have too many repeated layers. Cartesia and Browserbase both show strong top cards, then repeat the same ideas through research cards, Proof/Money/People sections, source rail, and full ledger. Browserbase has useful evidence, but the page turns into a second report inside the fact card.

Missing data gets too much visual weight. Dia Browser honestly shows unknown raised, headcount, HQ, and founded values, but the page still gives those holes the same table machinery as strong facts. That makes absence feel like clutter instead of useful restraint.

The page is visually close to `DESIGN.md`, but it does not yet live up to the spirit of the Catalogue Card. The visual system asks for hierarchy, source discipline, and a two-zone ledger. The current site often feels like every available module is competing to be a surface.

## The one core objective

The public artifact should make a shared company link trustworthy and useful in under 30 seconds.

The page should make five things obvious immediately:

- The company name and domain.
- What the company does, in one sourced sentence.
- The 4 to 6 most reliable public facts.
- How many sources support the card and what kind of sources they are.
- The exact source ledger the reader can inspect.

Everything else is secondary.

## What to keep

Keep company identity. Name, domain, website, HQ, founded year, and status belong on the public page when sourced.

Keep the one-sentence sourced description. This is the fastest way to make the card useful.

Keep key facts. Funding, last round, founders, headcount, HQ, and founding year are the right first facts when they are actually supported.

Keep source mix and source count. The source posture is part of the product, not decoration.

Keep a source ledger. The ledger is the trust contract. It should be easy to inspect, but it should be one coherent ledger rather than a rail plus duplicate full list.

Keep generated timestamp and cache state, but make them quiet. They matter for trust, not for marketing.

Keep a restrained extension relationship. "Open in extension for the investor lens" is enough.

## What to simplify

Simplify research sections into evidence notes. Public sections like buyer, proof, traction, financing, competition, and product can be useful, but not as six equal cards plus repeated full sections. Use them as optional supporting evidence below the top card.

Simplify signals. Show up to three recent sourced signals only when they are actually meaningful. Do not render an empty signals module.

Simplify comparables. Keep comparables lower on the page and only when the basis is sourced. They should not imply investment judgment.

Simplify confidence language. Use small source-class marks and source ledger explanations. Avoid badge soup.

Simplify "open questions." If a question stays public, frame it as a missing-evidence note, not investor synthesis. "No named customer proof found in public sources" is safer and more useful than a diligence prompt that sounds like private judgment.

Simplify missing facts. Do not show six "not found" boxes. Show only material absences, and keep them visually quiet.

## What to remove or defer

Remove the public gallery/search/index for now. It adds surface area, exposes weak data, and does not serve the shared-link job.

Remove homepage inventory counts like "205 profiles filed." Counts make the site feel like a browsable database and invite quality audits across long-tail cards.

Remove the selected-card preview from the landing page. It is a second public card surface with its own failure modes.

Remove duplicate source presentations. Use one source ledger, with optional priority grouping inside it.

Remove duplicate Proof/Money/People structures. Pick one reading order.

Defer profile refresh as a public interaction. Refresh belongs in the extension or authenticated workflow until the public artifact is stable.

Defer searchable public profile index. Revisit only when profile quality, identity normalization, and refresh policy are strong enough that browsing helps trust rather than harms it.

Gate bull case, bear case, why it matters, risks, market timing, and investor next steps behind the extension.

## Public page information architecture

Recommended `/c/{slug}` structure:

| Zone | Content | Rule |
| --- | --- | --- |
| Header | Cold Start mark, company domain, filed date, source count | Quiet utility, not a product billboard. |
| Hero | Company name, sourced one-sentence description, source mix | The reader should know what this is before seeing modules. |
| Fact strip | 4 to 6 facts: raised, last round, founders, HQ, headcount, founded | Hide missing facts unless absence is material. |
| Evidence notes | Optional 2 to 4 notes: buyer, proof, traction, product, financing | Render only available notes. No empty cards. |
| Recent signals | Optional, max 3 | Only if dated, sourced, and meaningful. |
| Source ledger | One ledger with source class, title, host, date | This is the proof surface. It should be complete and calm. |
| Footer | Public/private contract, cache timestamp, extension CTA | Quiet and explicit. |

The page should not start with navigation choices. It should start with the company.

## Landing page scope

The landing page should be a simple explanation of the artifact loop:

- Generate a company profile from the extension.
- Share a stable sourced public card.
- Keep private synthesis in the extension.

It can show one or two hand-picked example cards, but only if those examples are quality-gated. No full shelf. No live search. No sort controls. No public inventory count.

The landing page should answer, "What is Cold Start and why would I trust a shared card?" It should not ask users to browse.

## Extension relationship and call-to-action

The public page should be useful without the extension. That is what makes the URL worth sharing.

The extension should be framed as the place for the investor lens, not as the thing required to make the public page make sense. The CTA can be:

> Open in the extension for the investor lens.

The public page can say what is gated:

- Why it matters.
- Bull and bear case.
- Risks and diligence questions.
- Market structure and timing.
- Saved/private research sections.
- Refresh and deeper generation.

Do not tease private synthesis on the public card. Do not show locked modules. Do not make the public page feel incomplete without installation.

## Visual and craft direction

High craft here means restraint, not ornament.

The card should feel filed, sourced, and readable. Warm parchment is fine, but it should stay screen-first. Avoid decorative parchment cosplay. The existing colors and type direction are close: At Umami display, IBM Plex Sans body, At Textual evidence accent, dusty-lilac seal, warm off-white surfaces, 4 to 6px radii, visible rules.

Concrete craft moves:

- Use one dominant reading path: hero, fact strip, evidence, ledger.
- Let the company name and one-line description breathe.
- Keep evidence marks small and consistent.
- Make source quality inspectable through the ledger, not through many labels.
- Replace empty cards with absence notes only when the absence matters.
- Use fewer boxes. A ledger can be a table-like surface without every claim becoming a card.
- Keep the extension CTA in the footer or a quiet side note.
- On mobile, the first viewport should include company name, description, and at least three facts. It should not be consumed by search controls or the profile shelf.

The visual standard should be: if someone screenshots the top half of the page, it should look like a careful research card, not a SaaS dashboard.

## Risks and constraints

Public data quality varies widely. Browserbase has enough evidence to support a rich card. Cartesia is thinner but still works. Dia Browser shows useful honesty around unknowns. Sail Research and Wabi show why the homepage shelf is risky: weak data and bad identity normalization become the first impression.

The public/private split looks sound at the route and trust layer. The tested public API responses for Cartesia, Dia Browser, Browserbase, Sail Research, Runloop, and Wabi did not include `synthesis`. `packages/core/src/trust.ts` also strips synthesis and person emails. The higher risk is not direct leakage. The higher risk is public UI implying private judgment through open questions and research-section language.

The current component structure makes simplification feasible later. The route is already small. `CardShell` owns most of the page composition. The root page can be replaced without touching card generation. The data layer already returns public cards and public sections separately.

The data model supports more fields than the public page should show. The scope decision should come before component work, or the UI will keep reflecting all available data rather than the reader's job.

## Suggested next spec

Write a focused `public-artifact-v1` spec before implementation.

The spec should include:

- A one-screen desktop and mobile wireframe.
- Exact public IA for `/c/{slug}`.
- A quality gate for which facts render above the fold.
- Rules for hiding unknowns and weak fields.
- A single source-ledger design.
- Root landing page copy and example-card policy.
- Explicit public/private field boundary.
- Acceptance criteria for first-read comprehension.

Acceptance criteria should be practical:

- A first-time reader can name the company, what it does, three sourced facts, and source posture within 30 seconds.
- Public pages expose no synthesis.
- The landing page contains no searchable shelf.
- Thin cards do not create ugly holes.
- Mobile first viewport is company-first, not navigation-first.

## Rejected directions and why

Single clean sourced fact card: accept this as the base model. It is the strongest fit.

Public card plus source ledger: accept this as the recommendation. The ledger is what makes the artifact trustworthy.

Public card with one "best next question": reject for v1 unless reframed as missing evidence. It risks sounding like gated investor synthesis.

Public card as extension preview: reject as the primary model. The public page must be useful on its own. A marketing preview weakens the artifact.

Landing page that only explains the extension and links to examples: accept, with restraint. It should explain the artifact loop and show one or two quality-gated examples.

Public gallery or searchable profile index: reject for now. It creates a browsing product, exposes edge cases, and shifts attention away from shared-link trust.

Refreshable company profile page: defer. Refresh is useful, but public refresh raises product, rate-limit, cache, and quality questions before the artifact is stable.

"Receipt of research" page focused mostly on sources: reject as too narrow. Sources matter, but the reader still needs company identity and facts before the ledger.

## Open questions

- Should public research sections appear at all, or should public cards only show normalized facts plus source ledger in v1?
- If public evidence notes stay, what is the maximum count before the page becomes a memo again?
- What quality threshold should decide whether a card is eligible as a public example?
- Should identity-normalization failures block root visibility, card visibility, or both?
- Should public "open questions" be removed entirely, or converted into "missing public evidence" notes?
- What should the public card do when there is only one source?
- Is the public landing page allowed to mention the number of profiles generated privately, or should all counts stay hidden until the shelf is ready?
