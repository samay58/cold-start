# Claude Design Prompt Kit

Prompts for exploratory mockups of the Cold Start website and Chrome extension. Written 2026-07-27.

How to use: paste the base packet first, then exactly one exploration brief, into a single Claude Design prompt. One brief per session so each direction gets a full context window and doesn't average into its neighbors. The base packet carries the product truth and the taste bar; each brief opens a different amount of the design space. Briefs W1 and E1 hold the current canon and push it further. The rest deliberately loosen the grip.

What to expect back, and how to judge it, is at the end of this file.

---

## Base packet (paste this first, always)

```text
CONTEXT PACKET: COLD START

What the product is. Cold Start is an investor-grade company context card. An investor clicks a company's website, and Cold Start builds a sourced card: what the company does, who runs it, what is publicly known about funding, what changed recently, and what questions matter next. The public web card at cold-start.example/c/{slug} shows cited facts only. A Chrome side panel, for invited users, adds the judgment layer: an investor read with supported claims, risks, and open questions, every line citation-backed and verifier-checked. The card is the product object. It is an artifact, not a chat answer.

Who reads it. A busy investor or builder-investor deciding whether a company deserves the next ten minutes. They want facts they can trust enough to forward, a source list they can inspect when a number matters, and a sharper read than a database tile gives them.

The one promise the design must make feel natural: every claim has a place, every source has a weight, and every missing fact is honestly absent. A fact without a source renders as "not publicly disclosed," never as a pretty guess. Conflicting sources show both values, never an average. "Not found" is a successful state when it is true; never style it as failure.

The taste bar. Anti-AI-slop here does NOT mean austere minimalism. It means a strong unifying concept from a real object, carried all the way through, plus warmth, wit, and craft detail. The current identity is "the Catalogue Card": each company as a kept index card, filed by someone with taste. Whether or not your exploration keeps that concept, it must clear the same bar: nameable concept, warm and tactile surface, at least one moment of genuine wit, and detail that survives scrutiny at 1x zoom.

The graveyard. Four directions already died here. Do not resurrect them.
1. Parchment dossier: warm paper + serif + blue citation marks. Tasteful but generic; looked like every AI editorial mockup.
2. Ray Gun editorial: energetic but borrowed. The taste came from referenced magazines, not from the product's own logic.
3. Signal Ledger: disciplined but flat. One sans everywhere, blue-and-gold accents, clean rules. Read as competent default, not authored.
4. Compliance software: trust rendered as badges, filters, gray tables, disclaimers. All warmth and judgment gone.

Evidence is the design system. Source quality is a first-class visual concept with four classes: verified (independent corroboration), reported (credible secondary source), company (the company's own claim), conflict (sources disagree). These appear as small repeatable marks that lead facts and claims. Never tint whole cards or sections by trust class. Never render trust as big green banners. Citations are inline markers like [1] that resolve to a source ledger listing publisher, date, and class. The ledger is the card's tracings: "where did this come from?" answered in one glance.

Voice. Plain investor language, sentence case. Section labels are short: Why care, Who pays, Proof, Money, People, Signals, Comps, Risk, Next question, Sources. Declarative sentences. No zine labels, no corporate categories, no cute loading copy, no marketing reveal-frames.

SAMPLE CONTENT. Use this data in every frame. Never lorem ipsum, never invented companies, never generic "Acme Corp" filler.

Company: Cartesia (cartesia.ai). One-liner: builds real-time voice AI models with sub-100ms latency, sold to product teams shipping voice agents. Founded 2023, San Francisco. Founders: Karan Goel (CEO), Albert Gu (Chief Scientist). Headcount: 37 on LinkedIn [2], 52 in Apollo [8] (a live conflict; show both). Raised $91M across disclosed rounds [1][4]. Last round: Series B, March 2026, led by Kleiner Perkins [1].

Signals (each with a date and citation):
- 2026-03-04, funding: Raised Series B [1]
- 2026-05-18, launch: Shipped Sonic 3, a real-time model with cloned-voice support [5]
- 2026-06-02, customer: Announced deployment with a contact-center platform [7] (company-sourced, mark it so)
- 2026-06-20, hiring: 12 open roles, weighted toward inference infrastructure [2]

Sources for the ledger:
[1] verified, TechCrunch, 2026-03-04, cartesia-series-b
[2] reported, LinkedIn, 2026-06, linkedin.com/company/cartesia
[4] verified, SEC EDGAR filing, 2026-03-01
[5] reported, company changelog cross-covered by press, 2026-05-18
[7] company, cartesia.ai press page, 2026-06-02
[8] reported, Apollo, 2026-05

Gated synthesis (side-panel only; five filed categories in fixed order):
- Why care: Voice agents are becoming a default interface, and latency is the felt quality bar; Cartesia's sub-100ms models are the current benchmark for it. [1][5]
- What must be true: The latency lead must survive frontier labs bundling voice into general models. [5]
- What could break: The contact-center proof point is company-sourced only; no independent customer has confirmed production scale. [7]
- Why now: Series B closed four months ago; team is hiring into inference infrastructure, which is where the margin story lives. [1][2]
- What to learn next: Ask for one referenceable production customer with call-volume numbers.

HARD KILL LIST (all frames, no exceptions):
- Fonts: Inter, Geist, Roboto, Space Grotesk, JetBrains Mono, Fraunces, Mona Sans, Newsreader, Source Serif 4, and any single-family system where every element speaks in one voice.
- Dark mode on the website. The public card is light, on a warm ground, always.
- Gradient accent fields, glassmorphism, blur cards, glow, neon.
- Border radius above 8px. Shadows as decoration. Pill chrome.
- Monospace as the default voice of the interface. A mono or typewriter face is allowed only as a small earned accent (a receipt line, a call number), never for labels and body.
- Big tinted status cards, icon grids, decorative stat cards, badge and pill zoos.
- Trust rendered as color washes; skeleton shimmer; spinners.
- The SaaS landing template: centered hero, two buttons, three feature cards, logo wall, testimonial grid.
- Copy slop: em-dashes, hype vocabulary, exclamation points, teaser framing. Flat declarative sentences only.

DELIVERABLE DISCIPLINE (every brief):
- Name your concept in one sentence at the top of the work. If you cannot name it, it is not a concept.
- Design the unhappy states, not just the hero: a missing fact ("not publicly disclosed"), the headcount conflict, an empty section, and at least one in-progress state. Slop mockups only show the happy path; yours will be judged on the sad ones.
- Use the sample content above verbatim. Real dates, real citation markers, real conflict.
- Every fact on screen carries its evidence mark and citation. If you find yourself decorating instead of encoding evidence, stop and re-read the promise.
```

---

## Website briefs

The website today is one surface: the public card at `/c/{slug}`. The ambition is two surfaces: the card pushed to its full potential, and a landing page that does not yet exist. That landing page is the largest open canvas in the product.

### W1. The card, published (canon held, executed at full depth)

```text
EXPLORATION BRIEF: THE CARD, PUBLISHED

Design the public company card page at /c/cartesia as the definitive execution of the Catalogue Card concept. This brief holds the current canon; your job is depth, not reinvention.

Held fixed: warm parchment card (#F4EDDC) on manila ground (#E4DCC8), ink #20201E, one dusty-lilac seal accent #6E5C9E used as a verb (top edge, call number, FILED stamp, section labels, links, active states). Display face is a sharp grotesk (GT America energy; IBM Plex Sans 700-780 as the stand-in). Body is IBM Plex Sans with tabular figures. A single typewriter-adjacent face appears only for call numbers, source marks, and dates. Evidence marks: filled square verified #0E6B5B, outlined square reported #315F9D, half-filled square company #9B6A1E, slashed square conflict #B63A2A. 6px radius, 1px rules, the card sitting on one faint stacked-card offset shadow.

Yours to invent: everything the canon has not yet earned. The current implementation is a competent two-zone ledger (identity and key values on top, then Money, People, Signals, Comps, Sources with a right-hand source rail). Take it further. Some directions worth pursuing, none mandatory:
- The card as a physical object with a life: subtle wear where a reader's thumb would rest, a second card's edge visible beneath, tracings on the back.
- Citation choreography: what hovering [1] feels like, how a click travels to the ledger row, how the ledger row acknowledges arrival.
- The FILED stamp and VETTED stamp as genuine print artifacts: slight rotation, ink density variation, registration a hair off perfect.
- The conflict row (37 vs 52 headcount) as the page's proof of honesty: make disagreement between sources the most carefully designed moment on the page.
- A "next question" element that gives the reader their first diligence move without pretending to be a recommendation.
- Mobile (390px) as a pocket card, not a squeezed desktop: what does a catalogue card become in a hand?

Frames wanted: desktop 1440 full page, mobile 390 full page, one citation-hover detail, one conflict-row detail, one frame of the page for a company with sparse data (most facts "not publicly disclosed") that still feels kept rather than broken.
```

### W2. The landing page: watching a card get made

```text
EXPLORATION BRIEF: THE LANDING PAGE

Design the Cold Start homepage. It does not exist yet, so this is the widest-open canvas in the product. Full concept freedom within the base packet.

What the page must accomplish, in one scroll or close to it: an investor who has never heard of Cold Start understands the object (a sourced company card), sees one get made, believes the evidence promise, and knows the judgment layer lives in the extension. The product's best demo is itself: a real card, assembling.

The strongest available material is the generation moment. In the extension, a card being built shows live source clippings sliding in, a wax seal inking up stage by stage on real pipeline events, and a FILED stamp when the card completes. The landing page may borrow that theater: a card assembling itself from cited fragments is more persuasive than any headline. Treat it as documentary footage of the product working, not as decoration.

Held fixed: light mode on a warm ground. Evidence marks and citations behave exactly as the base packet describes; the hero card uses the Cartesia sample data. The voice is flat and declarative.

Yours to invent: the page's structure, scale, rhythm, and concept. The type system may go bigger and bolder than the card's own scale if the page earns it. Some tensions worth exploring, none mandatory:
- Scale contrast: the card is dense and small; the page around it can be vast and quiet. A small perfect object on a large calm ground is its own argument.
- The scroll as the pipeline: sources found, facts extracted, claims verified, card filed. The page's sections could be the stages of generation.
- The honest sell: this product's differentiation is that it refuses to guess. Find a way to make "we render missing facts as missing" feel like a flex, because it is.
- One moment of wit somewhere a careful reader will find it.

Sample copy you may use or replace with flatter equivalents (never with marketing slop): "Click a company. Read the card." / "Every claim has a source. Every source has a weight." / "What it does, who runs it, what changed, and what to ask next." Final copy will be rewritten by a human; treat copy as voice-accurate placeholder.

Frames wanted: desktop 1440 full scroll, mobile 390 full scroll, one detail frame of the assembling-card moment mid-build, one detail of the extension handoff (how the page presents the gated judgment layer without a SaaS pricing-tier table).
```

### W3. The registry (divergent: engraved instrument)

```text
EXPLORATION BRIEF: THE REGISTRY

Divergent concept. Set the Catalogue Card aside and design the public card page and a matching landing hero around a different real object: the engraved financial instrument. Share certificates, transfer-agent registries, bond counterfoils. Documents that made ownership and obligation legible through engraving discipline: hairline rules, serial numbers, denomination panels, signatures, and a design language where forgery-resistance produced beauty.

Why this object fits: Cold Start's whole personality is provenance. A registry entry is a claim with a paper trail, which is exactly what a card is.

Held fixed: light and warm; the evidence-mark system (four classes as small marks); citation markers resolving to a ledger; the sample data; the kill list. The company name stays the only display-scale text.

Yours to invent: the full visual language. Type may leave the current stack (kill-list faces still banned): consider an engraver's lettering voice for display, a working text face with real warmth, and one earned precision accent. The accent color may leave lilac if the object argues for something else; one owned color, used as a verb, and argue the choice. Motif system is open: serial numbers, counterfoil stubs, rosettes reduced to near-nothing, security-pattern borders at whisper weight, an embossed-seal treatment for the VETTED moment.

The trap to avoid: ornament without function. Every engraved flourish on a real certificate did a job. If a motif here does not encode evidence, structure, or state, cut it. The result should feel like a modern instrument drawn by someone who studied certificates, not a costume.

Frames wanted: desktop 1440 card page, mobile 390, one landing hero in the same language, the conflict-row detail, the sparse-data card.
```

### W4. The reading room (divergent: the site as a place)

```text
EXPLORATION BRIEF: THE READING ROOM

Divergent concept. Design the website as a place rather than a page: the reading room where the cards live. The library's card catalogue, the request desk, the lamp over the table. The user does not browse a site; they visit the collection and pull a card.

The interaction is the concept: arriving at the homepage is entering the room; searching for a company is opening a drawer; the card page is the card out of the drawer, on the table, under the light. Navigation, search, and the card itself should all be expressions of one continuous space.

The trap, named up front: skeuomorphic kitsch. No wood textures, no 3D drawers, no rendered lamps. The place is built from structure, light, motion, and typography: the drawer is a spatial motion pattern and an information structure, not a picture of a drawer. Think of how a great museum wayfinding system implies a building. If a frame would look at home in a cozy-game asset pack, it is wrong.

Held fixed: light and warm; evidence marks; citations and ledger; sample data; kill list. Yours to invent: palette (one owned accent, argued), type system (kill-list faces banned), the spatial model, the motion concepts (annotate them as static frames with notes; no need to animate), and where the wit lives.

Frames wanted: the room (homepage) at 1440, the drawer moment (search or browse state), the card on the table (card page) at 1440, mobile 390 of the card, one annotation frame explaining the spatial model in one diagram.
```

### W5. Wildcard (maximum freedom)

```text
EXPLORATION BRIEF: WILDCARD

Everything in the base packet holds: the product truth, the evidence discipline, the sample data, the graveyard, the kill list, the deliverable discipline. Nothing else does.

Propose your own concept for the Cold Start website: card page plus landing. The one requirement is that it starts from a real object or real practice that has already solved the problem of making claims trustworthy on paper: field notebooks, auction lot catalogues, herbarium sheets, ship manifests, assay reports, patent drawings, provenance records for paintings, whatever you can defend. Name the object. State in two sentences why its logic fits a product whose promise is "every claim has a place, every source has a weight, every missing fact is honestly absent." Then carry it all the way through: type, color, motif, structure, states.

Halfway commitments produce the graveyard's corpses. If the concept only shows up in the header, it is a costume. The test: someone should be able to look at the sparse-data card, with most fields reading "not publicly disclosed," and still name your object.

Frames wanted: card page 1440, landing 1440, mobile 390, conflict detail, sparse-data card, one-sentence concept statement set in the design itself.
```

---

## Extension briefs

The extension is a Chrome side panel, roughly 360 to 420px wide, full height. It is a workbench, not a dashboard: the current company pinned on top, research modules beneath, everything dense and scannable. It has a warm paper dark mode (ground #1B1612, aged off-white ink #E8DDC9, lifted lilac #BBA8DF); the website never does.

### E1. The first ninety seconds (canon held, staged as theater)

```text
EXPLORATION BRIEF: THE FIRST NINETY SECONDS

Design the extension side panel's opening arc as a storyboard: the user clicks the extension on cartesia.ai and, over roughly ninety seconds, watches a sourced card get built. This brief holds the Catalogue Card canon (At Umami display voice, IBM Plex Sans body, warm parchment surfaces, the lilac seal, evidence marks, 6px radii). Your job is to make the wait the best part.

The real sequence, driven by actual pipeline events (never fake progress):
1. Intake: the panel recognizes the domain and offers to build the card. One quiet decision, no ceremony.
2. Building: live source clippings appear as they are found (a TechCrunch fragment, a LinkedIn snapshot, an SEC filing line), each already carrying its evidence mark. A wax-seal progress object inks up stage by stage as real stages complete. A one-line whisper narrates the current stage in plain language ("Reading recent signals").
3. Early read: before the full card lands, the panel states what it already knows for sure: what the company does, who it serves, the latest proof headline, each cited. If no honest claim survives yet, it says so plainly instead of padding.
4. Filed: the seal sets as a FILED stamp. The finished card arrives as a settled object, not a page refresh.

Yours to invent: the staging, pacing, and object life of that arc. How a clipping enters and retires. What the seal's inking actually looks like at five stages. How the early read earns attention without shouting. The single most important transition in the product is building-to-filed; design it like a scene, and annotate the motion in the margins of static frames.

Also wanted: the same arc in the warm paper dark mode, and the honest failure frame (a stage that found nothing: the panel says "No public funding found" as a calm fact, and the seal still completes, because absence is a finding).

Frames wanted: panel at 400px width for each of the four stages, one dark-mode frame of the building stage, the failure frame, and margin annotations for the two most important transitions.
```

### E2. The Lens payoff

```text
EXPLORATION BRIEF: THE LENS PAYOFF

Design the judgment moment: the user has a finished card and asks for the investor read. This is the most information-dense and most trust-sensitive surface in the product. Canon held (At Umami display, IBM Plex Sans body, warm parchment, lilac seal, evidence marks, panel width 360 to 420px).

The content is the five filed categories from the base packet, in fixed order: Why care, What must be true, What could break, Why now, What to learn next. The current form is one filed catalogue sheet with five indexed rows: one row open at a time, every closed row keeping a one-line preview so the whole read scans before the reader commits. Supporting claims lead with a filled ink square, breaking claims with a slashed square. A posture line states how much of the read rests on company-sourced material. One lilac seal on the sheet header. No colored fills, no ribbons, no card pile.

Two moments to design with particular care:
1. The wait. Analysis takes real time (synthesis, then verification). The wait surface shows the actual stages, including the verifier pass, and the verifier moment should feel like an inspection stamp: this read was checked, and claims that failed were removed. Removal is a feature; find a way to let the reader feel that claims can die here.
2. The withheld state. When the underlying card is too thin, the product refuses to synthesize and says why, with the specific reason and what would change it. Design refusal as integrity, not as an error screen. This state is the product's character under pressure.

Yours to invent: everything about how the sheet breathes: the open-row transition, how previews truncate, how citation marks sit in reading text at this density, how the posture line reads at a glance, where one small moment of wit lives in a surface this serious.

Frames wanted: the wait mid-verification, the arrived read with Why care open, the read with What could break open (it carries the company-sourced caveat), the withheld state, one dark-mode frame, all at 400px.
```

### E3. The workbench, reimagined (divergent)

```text
EXPLORATION BRIEF: THE WORKBENCH, REIMAGINED

Divergent concept. Keep the product mechanics and the base packet's discipline; set aside the Catalogue Card's visual language and propose a different concept for the side panel as a whole.

The mechanics that must survive, whatever the concept: a persistent company identity zone at top; research modules (Why care, Who pays, Proof, Money, Comps, Risk, Next question) that expand in place, each showing state (ready, running, saved, blocked, not found), a real evidence count, and its latest real event; live generation driven by actual pipeline events; cited people with hoverable dossiers; a light mode and a dark mode that read as the same instrument under different light; 360 to 420px width, dense but breathable.

The concept seed is open, with one constraint: the panel is a working instrument that receives evidence and files judgment, so pick a real practice where that already happens and mine its logic. Candidates you may take or beat: the registrar's intake desk, the telegraph room where dispatches arrive and get sorted, the lab notebook where observations are logged and countersigned, the darkroom where an image develops in stages. Name the concept in one sentence, then commit fully: type (kill-list faces banned; mono only as an earned accent), one owned accent used as a verb, motif system, motion concepts annotated on static frames.

The bar from the base packet applies with extra force here, because side panels rot into dashboards: if a frame could be mistaken for a browser devtools panel, a SaaS analytics rail, or a chat sidebar, it has failed. Warmth and wit are requirements, not garnish.

Frames wanted: resting state with a filed card at 400px, building state mid-generation, one expanded module with cited content, the not-found state styled as success, one dark-mode frame, concept statement set in the design.
```

---

## Judging what comes back

Five checks, in order:

- Can you name the concept from the frames alone, without reading the designer's statement? If not, it is styling, not a concept.
- Look at the sparse-data and withheld frames first. Slop collapses exactly where content thins; an authored design holds its shape with most fields honestly empty.
- Find the conflict row. If disagreement between sources is not one of the best-designed moments, the design missed the product.
- Squint test for the graveyard: does any frame drift toward parchment-generic, borrowed-editorial, competent-flat, or compliance-gray?
- Where is the wit? One genuine moment per direction. Zero means it is sterile; five means it is a toy.

Directions that pass go to a second round: same brief, plus your margin notes, asking for depth on the two strongest frames rather than breadth.
