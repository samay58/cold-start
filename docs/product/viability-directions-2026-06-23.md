# Cold Start viability directions

Source capture: `/Users/samaydhawan/phoenix/01-active/archive/captures/plaud-2026-06/2026-06-22-cold-start-prototype-to-product-cb216b14.md`
First pass: `docs/product/capture-notes/2026-06-22-prototype-to-product.md`
Date: 2026-06-23

This turns the Plaud capture into a sharper product direction brief. It is not an implementation spec. It should guide what to spec next.

## Read this first

Cold Start should stop treating “more tasteful upgrades” as the default next move. The product now needs a viability pass.

The question is not whether the prototype can keep getting better. It can. The question is whether Cold Start can become a useful investor tool that someone else can install, understand, trust, and use without Samay handholding the whole experience.

The next phase should test five things:

1. Can a non-owner install and start it without heroic setup?
2. Does it produce a useful first payoff fast enough that the user keeps reading?
3. Does the investor lens actually populate the judgment surfaces that make the extension worth installing?
4. Can the economics work without pretending every user gets unlimited fresh generations?
5. Is there a narrow distribution loop that teaches us something before we build more surface area?

## Recommendation

Run a focused friend-alpha viability sprint before another broad product polish pass.

Do not start with billing, a bigger public site, more providers, or another visual redesign. Start with the smallest loop that can answer: “Would a smart friend install this and use it on a real company?”

The sprint should produce:

- one installable alpha path
- one measured first-payoff path
- one working investor-lens path
- one plain unit-economics sheet
- one friend-feedback script
- one QA kill list cleared enough to avoid embarrassment

If those do not work, more features are not the bottleneck.

## Direction one: make installation a product surface

### What the capture said

GitHub is not a usage path. Packaging and installation are unresolved. Third-party API keys make onboarding hard.

### Battle-tested read

This is not an ops footnote. It is the first product test. If the user cannot install it, the rest of Cold Start is still a private prototype.

The extension should have an alpha path that is more reliable than “clone the repo and run local setup,” but less loaded than a full launch.

### Recommended path

Use a Chrome Web Store alpha route unless review friction proves too high.

The practical path to explore is:

- Private or Unlisted Chrome Web Store item for early testers.
- Existing extension auth and deployed origin.
- A tiny first-run checklist inside the extension: connected, origin, token, profile generation available.
- A test-instructions document for Chrome review and for friends.
- A fallback ZIP/unpacked install only as backup, not the main story.

Chrome’s own docs say visibility can be Public, Unlisted, or Private, and all visibility settings still go through the same policy review. That means Private is a tester path, not a way around product or privacy quality. Google also says a developer account and one-time registration fee are required before publishing. Payment handling is the developer’s responsibility if the product charges users, so billing should not be mixed into the install test.

### What to build or spec

Create an `Alpha install readiness` spec with:

- Chrome Web Store path: Private vs Unlisted decision.
- Required screenshots, privacy disclosures, permissions explanation, and reviewer test instructions.
- First-run extension diagnostics: API origin, extension ID, auth token, profile generation status.
- Friend invite instructions: 5 steps max.
- Success metric: five testers install without a live debugging session.

### Do not do yet

- Do not build a generic onboarding wizard.
- Do not expose BYO API key setup to friends unless the whole product direction becomes developer-only.
- Do not build account management before proving install and first use.

## Direction two: make first payoff measurable, not prettier

### What the capture said

First Read was supposed to make the wait feel shorter, but the current payoff did not change the time to the main profile enough. If it cannot make the wait feel worth it, kill it or replace it.

### Current state from repo review

The code now has a source-backed First Read path in `apps/extension/src/first-read.ts`. It hides filler, avoids near-duplicates with the summary, uses source quality for evidence marks, and can surface a proof headline from citations. The follow-up spec also moved headline classification toward core ownership rather than keeping a growing regex in the render path.

That is the right direction. The missing piece is measurement and strict product acceptance.

### Recommended path

Treat First Read as an evidence receipt, not a mini company overview.

It earns its place only if it gives one of these before the full card is ready:

- who it seems for, if source-backed and not duplicative
- latest proof, if entity-matched and newsworthy
- evidence posture, if it tells the user what arrived and what is still missing

The bar should be: “I learned something I did not already get from the company header.” If not, the slip should stay hidden or collapse into a receipt.

### What to build or spec

Create a `First payoff measurement` pass:

- Run 12 live domains: obvious AI infra, obscure AI infra, healthcare, consumer, public-ish company, bad website, no funding, noisy common name, seed-stage startup, recently funded startup, old company, and one broken source case.
- Record `seedCardMs`, `firstUsableCardMs`, full basics duration, citation count, source classes, and whether First Read had a substantive read.
- Screenshot the side panel at first payoff and final basics.
- Classify each run: useful, duplicate, too late, too vague, hidden correctly, or broken.

Success metric:

- At least 8 of 12 runs show a useful first payoff before the full basics card.
- Zero runs show generic AI filler.
- Zero runs show a proof headline that does not name the company.

### Do not do yet

- Do not add a new provider lane for First Read unless measurement proves the seed-card path misses timing.
- Do not use deep search or agentic research for the first payoff. That is the wrong latency shape.
- Do not keep First Read visible after it has done its job. File it into the header or receipt.

## Direction three: make the investor lens the product moment

### What the capture said

The product needs to get beyond basics and show why it matters. The deeper read is where Cold Start can feel like an investor tool instead of a sourced company tile.

### Current state from repo review

The repo now has a clearer analysis path than the earlier review implied:

- `startAnalysisGenerationAndPoll()` exists in `apps/extension/src/sidepanel-network.ts` and requests `mode: "analysis"` without a section id.
- The generate route rejects synthesis-only sections as standalone section jobs.
- `openQuestions` and `theCase` are synthesis layers in `apps/extension/src/research-layer.ts`.

That means the current direction should not be “generate more hidden sections.” It should be “make one investor-lens gesture feel obvious and valuable.”

### Recommended path

Make `Run investor lens` the main second product moment after basics.

Basics answers: what is this company, what facts are public, what sources exist.
Investor Lens answers: why care, what is the case, what can break, what question comes next.

One gesture should populate the four analysis surfaces together:

- Why care
- The case
- Timing
- Next question

Per-section refinement can remain later, but it should not be the first mental model.

### What to build or spec

Create an `Investor lens activation` spec:

- One visible Lens action once basics are usable.
- Clear disabled reason when the card lacks enough evidence.
- One running state for the lens, not four confusing section queues.
- All synthesis-backed cards update together after analysis completes.
- A receipt line that says what changed: for example, `Lens filed · 3 claims · 4 questions`.

Success metric:

- Fresh card, no prior synthesis: user clicks one Lens control and sees real content in all synthesis-backed modules after completion.
- No click path starts a section job whose output the UI does not read.
- Public routes still never expose synthesis.

### Do not do yet

- Do not create a separate “analysis page.”
- Do not make each synthesis layer feel like an independent product.
- Do not pad bull, bear, or question counts. Empty after verification is a valid result.

## Direction four: turn pricing into unit economics before billing

### What the capture said

A possible paid route is bundling third-party calls and charging a subscription. The obvious question is what a $20/month plan can support.

### Battle-tested read

This is worth exploring, but billing is not the next feature. The economics can fail even if the product is useful.

The current docs describe roughly $0.75 basics and $0.88 analysis as observed production targets after cost cuts, while provider endpoint budgets live in `packages/providers/src/provider-budget.ts`. Those numbers are useful planning inputs, not a pricing truth. They need fresh trace validation before any decision.

At those rough costs, a naive $20 plan cannot support unlimited fresh cold generations. The business only starts to make sense if some combination of these is true:

- cached public cards get reused
- analysis runs are gated and deliberate
- friend/user behavior is lower-volume than fear suggests
- paid provider calls have strict per-run budgets
- heavy users bring their own keys or buy credits

### Recommended path

Build a unit-economics worksheet before building Stripe.

The worksheet should answer:

- What is cost per basics run across 20 current traces?
- What is cost per analysis run across 20 current traces?
- How many runs does a $20/month user get at 50 percent, 70 percent, and 85 percent gross margin?
- How much does cache reuse change the picture?
- What is the abuse case: one user generating 200 obscure companies in a weekend?
- Which product limits are acceptable without making the tool feel stingy?

### Likely packaging directions

Explore three models, in this order:

1. Free alpha with manual invite and hard server-side run caps.
2. Paid personal plan with included credits and cached-card reuse.
3. BYO-provider-key mode only if the audience becomes technical users, not investors.

### Do not do yet

- Do not build subscription UI before friend alpha.
- Do not promise unlimited generations.
- Do not make payment logic part of Chrome Web Store install readiness. Chrome policy and payment responsibility are their own workstream.

## Direction five: constrain the public site to artifact gravity

### What the capture said

The public site has generated profiles and could become real, but it looks weak and adds surface area. For V1, simplify or defer.

### Battle-tested read

The public site matters because artifact gravity matters. It is not a destination homepage yet.

The strongest public loop is:

1. Generate a sourced card.
2. Share `/c/{slug}`.
3. Recipient trusts the fact base.
4. Extension user gets private synthesis when installed.

That does not require a public gallery, browsing feed, or profile refresh mechanic.

### Recommended path

Keep the public surface narrow:

- `/c/{slug}` should be excellent.
- The landing page should explain the extension and show one or two real examples.
- Generated profiles should not be presented as a content network until there is traffic and refresh logic.
- Profile refresh is a later retention mechanic, not V1 scope.

### What to build or spec

Create a `Public artifact scope` note:

- What public page must do: source-backed fact artifact, shareable link, trust surface.
- What public page must not do yet: browse, rank, recommend, refresh feed.
- Which two example cards are strong enough to show.
- What private synthesis copy appears only in the extension.

Success metric:

- A friend can open a shared public card and understand what Cold Start is without installing anything.
- The page does not imply investment recommendation or expose synthesis.

## Direction six: clear the friend-alpha QA kill list

### What the capture said

There are visible papercuts: cards do not close, weird scrolling, oversized research card placement, dense copy, weak tooltips, and sections with unclear jobs.

### Battle-tested read

These are not polish. They determine whether the first feedback loop is useful. If testers hit obvious interaction bugs, their feedback becomes about broken surface area instead of product value.

### Recommended path

Create a `Friend alpha QA checklist` and clear only the bugs that would distort feedback.

The kill list:

- card open/close invariant
- scroll position after card activation
- oversized research card placement
- First Read visible only when substantive
- Lens action visible and understandable
- people tooltip copy with source posture
- no dense multi-paragraph card bodies in the side panel
- no AI filler in module summaries
- reduced-motion behavior still readable

### What good tooltips should do

People tooltips should answer three things in tight copy:

- who this person is
- why they matter to this company
- what evidence quality supports that read

Bad tooltip: `Experienced operator with deep AI infrastructure expertise.`
Good tooltip: `Co-founder and CEO. Company site confirms role; prior technical background not yet sourced.`

### Success metric

A tester can run one company, activate Lens, open two modules, inspect one person/source, and share the public card without hitting a visible broken interaction.

## Direction seven: use distribution as a learning loop, not a launch

### What the capture said

Distribution is the biggest gap and probably the biggest learning opportunity. The uncomfortable move is asking friends to install and try it once the product is good enough.

### Battle-tested read

Do not confuse “distribution” with “growth.” The next distribution loop is manual, narrow, and diagnostic.

The point is not to get users. The point is to learn which promise is real.

### Recommended path

Recruit six testers:

- two investors or deal people
- two builders who evaluate tools quickly
- one person who will be annoyed by install friction
- one person who will be skeptical of AI research quality

Give each person one job:

- install it
- run it on a company they actually care about
- say where they trusted it, where they did not, and what they would do next

Ask for evidence, not opinions:

- Did they finish install?
- Did they understand first payoff?
- Did they click Lens?
- Did they inspect a source?
- Did they share or save the card?
- Which sentence or surface felt most useful?
- Which moment made them doubt it?

### Success metric

At least three testers independently name a real use case after trying it. Not “cool demo.” A real use case.

Examples:

- pre-call company screen
- partner meeting prep
- quick founder background check
- market-map sanity check
- source-backed public card to send someone

## Suggested order

### Sprint 1: alpha readiness

Goal: someone else can install and run it.

Ship or spec:

- Chrome Web Store alpha path
- first-run diagnostics
- friend install instructions
- QA kill list

### Sprint 2: first payoff and Lens

Goal: the product feels useful before and after basics complete.

Ship or spec:

- first-payoff measurement run
- Lens activation path
- synthesis module receipt
- no hidden or wasted section jobs

### Sprint 3: economics and sharing

Goal: know whether this can be a product instead of a demo.

Ship or spec:

- unit-economics worksheet from real traces
- run-cap model for alpha
- public artifact scope
- friend feedback script

## The hard calls

### Keep

- The public/private split.
- The Chrome extension as the primary product surface.
- The stable `/c/{slug}` artifact.
- The Evidence Receipt direction for First Read.
- The Catalogue Card design language.
- Verification over confident synthesis.

### Change

- Treat install as product, not repo setup.
- Treat Lens as the second core moment, not a hidden section behavior.
- Treat pricing as a trace-backed economics question, not a subscription UI task.
- Treat public pages as artifacts, not a browsing product.
- Treat friend testing as a necessary product phase, not a launch.

### Kill or defer

- New provider lane for First Read until measurement proves need.
- Public profile gallery.
- Profile refresh as V1 scope.
- Billing implementation.
- Generic onboarding wizard.
- More broad visual polish before the alpha loop.

## Immediate next specs to write

1. `alpha-install-readiness`: Chrome Web Store alpha path, first-run diagnostics, friend setup.
2. `first-payoff-measurement`: 12-domain run matrix and acceptance bar.
3. `investor-lens-activation`: one Lens gesture, one running state, four populated synthesis modules.
4. `unit-economics-alpha`: trace-backed cost model and run caps.
5. `friend-alpha-feedback`: tester list, script, and evidence capture format.

Do these before broad feature work.

## References

Local:

- `INTENT.md`
- `SPEC.md`
- `DESIGN.md`
- `docs/product/capture-notes/2026-06-22-prototype-to-product.md`
- `docs/superpowers/specs/2026-06-21-first-read-fast-payoff-design.md`
- `docs/superpowers/specs/2026-06-22-first-read-followups.md`
- `docs/superpowers/specs/2026-06-22-investor-lens-display-and-followups.md`
- `packages/providers/src/provider-budget.ts`
- `apps/extension/src/first-read.ts`
- `apps/extension/src/sidepanel-network.ts`
- `apps/web/src/app/api/generate/route.ts`

External distribution facts to verify during install-readiness spec:

- [Chrome Web Store distribution visibility](https://developer.chrome.com/docs/webstore/cws-dashboard-distribution)
- [Chrome Web Store developer registration](https://developer.chrome.com/docs/webstore/register)
- [Chrome Web Store payment responsibilities](https://developer.chrome.com/docs/webstore/program-policies/accepting-payment)
- [Chrome Web Store review process](https://developer.chrome.com/docs/webstore/review-process)
