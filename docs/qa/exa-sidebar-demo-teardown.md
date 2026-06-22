# Exa Sidebar Demo Teardown

Video: `/Users/samaydhawan/Downloads/coldstart-sidebar-demo.mp4`
Captured: 2026-06-18
Shared vocabulary: [exa-sidebar-demo-vocabulary.md](./exa-sidebar-demo-vocabulary.md)

This is a working teardown note, not a verdict. Use it while watching the video so we can argue about specific moments.

Decision status: saved for discussion. None of the upgrade ideas below are approved for implementation yet.

## What The Demo Is Testing

The run is useful because Exa is a strong-fit company for Cold Start. The user already has context on Exa, so weak product judgment or vague source handling is easier to spot. The sidebar needs to do more than finish a generation; it needs to help a sharp investor understand what changed, what is credible, and what question is worth asking next.

## Timeline

| Time | Moment | What Happens | Discussion Prompt |
|---|---|---|---|
| 00:00-00:15 | Start from Exa page | Sidebar opens and moves quickly into research progress. | Is the starting promise clear enough before the app starts doing work? |
| 00:15-00:55 | Progress loop | The panel repeatedly shows source-finding, evidence-reading, profile-building, and card-filing steps. | Does this feel like real work being exposed, or like the same status repeated? |
| 01:00-01:15 | First usable profile appears | Company profile, people, metrics, and starter research state become visible. | Is this the first moment where a user feels rewarded, or is it visually too quiet? |
| 01:15-01:30 | Starter profile ready | The product says the starter profile is ready and exposes details plus a research stack. | Does "ready" mean enough? What should the user do next? |
| 01:30-01:45 | First research card opens | "Who pays" appears with concise synthesis and source chips. | Strong moment. Is the card compact enough without hiding why it matters? |
| 01:45-02:00 | Comps and signals | Comps expand, then Signals shows concrete dated events. | Which of these is more investor-useful first: recent signals or comparable companies? |
| 02:00-02:20 | Refreshing evidence | Cards show "Refreshing" and "Reading the evidence." Research stack remains below. | Does the active card clearly own attention, or does the stack compete with it? |
| 02:20-02:50 | Why care / The case runs | One active card synthesizes while other cards queue behind it. | The queueing model is conceptually good. Is it legible quickly enough? |
| 02:50-03:15 | Navigation back to profile | The video jumps back up to the Exa profile, then back into research cards. | Is there a stable mental map between profile, active research cards, and stack? |
| 03:15-03:45 | Queue behavior | The UI says another generation is already running for a card. | This is honest, but it may feel like a blocked state rather than an intentional queue. |
| 03:45-04:20 | Timing synthesis | The Timing card generates dense investor prose with subsections. | The content is promising, but does the card become too memo-like for a side panel? |
| 04:20-05:05 | The case synthesis | The case card generates another dense section. | Does "The case" overlap with "Why care" and "Timing," or does each card earn its slot? |
| 05:05-05:42 | Final state | Multiple cards show generated or queued states; the panel remains functional. | Does the ending communicate "you now have a better read on Exa"? |

## First-Pass Read

The best thing in the demo is that the sidebar feels like a real workbench, not a chatbot. It has a persistent company profile, a visible research stack, section-level jobs, citations/source counts, and honest running states. That is the right product direction.

The main weakness is that the experience does not yet fully cash out the promise of "a strong investor first read." It often shows process before judgment. The user sees work happening, but the interface does not always say why this next piece of work is the one that matters.

## Deeper Design Teardown

This pass uses the vocabulary note as the object map. The bar is not "does the sidebar generate sections?" The bar is: does a sharp user always know what the product learned, what is still uncertain, what deserves attention next, and why the evidence is worth trusting?

### Highest-Value Revisions

| Priority | Revision | Visible Evidence | Why It Matters | Better Target |
|---|---|---|---|---|
| P0 | Make the first payoff unmistakable. | `First payoff` and `Starter payoff` are visually quiet even after almost a minute of work. | The first minute teaches the user whether the product is worth waiting for. A quiet checkpoint makes the wait feel longer than it is. | Replace "starter profile ready" as the main emotional beat with a small earned read: one sentence of what is known, one sentence of what is not known, one recommended next card. |
| P0 | Give the active card sole attention ownership. | During `Stack competition`, the active card and `Research stack` both pull the eye. | The product is doing one expensive piece of thinking at a time. The UI should stage that work like the main event, not one row in a pile. | While a card runs, compress the stack into a queue rail: `Running: Timing`, `Up next: The case`, `3 waiting`. Restore the full stack when the user returns to choosing. |
| P0 | ~~Convert progress from verbs into artifacts.~~ | ~~`Cold start wait` repeats stage language such as finding, reading, building, and filing.~~ | ~~Verb-led progress proves activity; artifact-led progress proves competence.~~ | ~~Show concrete findings as they land: `Company source found`, `Funding coverage found`, `8 source candidates`, `3 independent sources`, `Customer proof not yet found`.~~ Completed in `409c85b`. |
| P1 | Make queueing feel deliberate, not blocked. | `Queue conflict` says another generation is already running. | This is true but emotionally wrong. It makes the user feel like they hit a system limit rather than placed work in an ordered queue. | Use calm order copy: `Timing is running. The case is queued next.` Avoid error-box framing unless something actually failed. |
| P1 | Compress generated cards into panel-native shape. | `Prose reveal` turns into dense paragraphs inside a narrow card. | The content may be good, but the medium is a side panel. First view needs answer, confidence, and evidence shape before memo detail. | Generated card opening: `Answer`, `Evidence`, `What to check next`. Longer reasoning sits behind `Details` or citation-linked expansions. |
| P1 | Separate card jobs more aggressively. | `Why care`, `The case`, and `Timing` can all feel like thesis cards. | If cards overlap, the stack feels like a list of writing prompts instead of a structured diligence model. | `Why care` is the one-line investor read. `The case` is bull versus bear. `Timing` is adoption trigger, budget owner, and market structure. `Next question` is the output of the read, not generic follow-up. |
| P2 | Make evidence weight visible, not just evidence count. | Cards show source counts and chips, but not enough difference between source types. | Ten sources are not automatically better than two primary sources. The UI should help the user discount weak evidence. | Add small repeatable evidence marks: `primary`, `independent`, `company`, `reported`, `stale`, `not found`. Use them near claims, not only in headers. |
| P2 | Give the final state a readout. | `Final read state` shows generated, queued, and idle cards, but not a clear "what you now know." | End states matter because they teach the product's value memory. The user should leave with a sharper Exa read, not just completed cards. | Add a compact `Read so far` capsule after several cards complete: strongest supported belief, biggest uncertainty, best next action. |

### The Main Interaction Problem

The sidebar currently has three objects that all want to be the center of the interaction:

- `Company profile`: the saved fact base.
- `Active research card`: the current thinking surface.
- `Research stack`: the user's map of possible next work.

All three are good objects. The issue is staging. During active generation, the `Active research card` should dominate and the `Research stack` should become context. During browsing or planning, the stack can expand and become the main object. During profile review, the profile should own the surface and research should recede.

This is the deeper version of the "stack competes with active work" issue. It is not just visual density. It is a focus contract problem.

### The Main Content Problem

The generated content sometimes answers "write me the section" when the side panel needs "tell me what to believe first."

For each completed card, the first screen should probably enforce this shape:

```text
Answer: the compressed judgment.
Evidence: source shape, not just count.
Uncertainty: the thing not proven yet.
Next move: what to read, ask, or test.
```

The memo can still exist. It just should not be the first object the user receives in a 360px-wide workbench.

### The Main Trust Problem

Source chips are valuable, but the demo does not yet make evidence quality legible enough. A source count tells the user that something was read. It does not tell the user whether the belief is anchored in a primary page, a company blog, a funding announcement, a press article, a customer page, or a weak aggregator.

The product should let the user feel the difference between:

- `Well-supported`: primary or independently corroborated.
- `Directional`: plausible but sourced from company-controlled material.
- `Unproven`: searched for and not found.
- `Stale`: old evidence that may no longer describe the company.

This is a high-craft detail because it turns the UI from "AI wrote a card" into "the product is teaching me how strong the card is."

## Moment-by-Moment Notes

### `Cold Start Wait` Wants A Better Contract

The opening minute is not too long by itself. The problem is that the user cannot tell what the system has learned until the payoff arrives. The wait would feel better if each progress state left behind a small residue of evidence.

Better shape:

```text
Finding sources
Found: exa.ai, docs.exa.ai, TechCrunch funding coverage
Still looking: customer proof, pricing, recent launches
```

This keeps the current honesty but makes the wait accumulative.

### `Starter Payoff` Should Recommend The First Move

The `Starter profile panel` currently marks completion. It should also hand the user into a recommended path. For Exa, a plausible recommendation is not generic. It might be:

```text
Starter read: Exa is an AI search infrastructure company with recent funding and a visible developer motion.
Best next card: Who pays, because the investment question is whether search API demand becomes budgeted workflow spend.
```

Even if the exact copy changes, the interaction principle should hold: after base generation, the product should not just say ready. It should say what is worth doing next.

### `First Investor Read` Is Directionally The Right Product

`Who pays` is one of the strongest moments because it feels like an actual investor-native card. It is specific enough to be useful and narrow enough to belong in the side panel. This is the pattern to protect.

The thing to watch is density creep. If every generated card becomes a small essay, the best idea in the product gets buried.

### `Stack Competition` Is A Staging Issue, Not A Styling Issue

The visual system has good raw ingredients: numbered cards, lens badges, source counts, subtle motion, parchment-like surfaces. The problem is that during generation these ingredients are all still speaking at roughly the same volume.

Better behavior:

- When no card is active, show the full `Research stack`.
- When a card is running, promote that card into a stable stage and compress the stack.
- When a card completes, briefly show the payoff before returning to the stack.
- When multiple cards have completed, show a `Read so far` capsule before inviting more generation.

### `Queue Handoff` Needs To Feel Like A Workflow

The current queue message is accurate, but it gives the user a system explanation rather than a product explanation. The user does not need to know that another generation is already running. The user needs to know what is running, what is next, and whether their click was accepted.

Better copy:

```text
Timing is running.
The case is queued next.
```

If the user queues a third card:

```text
Queued after The case.
```

This turns an apparent limitation into a calm work queue.

### `Prose Reveal` Needs A Stronger First Screen

When `Timing` and `The case` complete, the content should not begin as paragraph-first memo prose. The first screen needs a compact readout. A possible component shape:

```text
Timing
Answer: The market window is driven by AI-native search moving from demo behavior into developer infrastructure.
Evidence: 2 primary sources, 3 independent reports, 1 funding source.
Risk: customer-budget proof is still thin.
Next: verify named production deployments.
```

Then the long explanation can sit under `How we got there` or `Details`.

### `Final Read State` Should Say What Was Learned

The final screen currently proves that the machinery works across multiple cards. It does not fully prove that the user now has a better Exa read.

The better ending is a small summary object:

```text
Read so far
Supported: Exa has credible developer/search infrastructure momentum.
Unclear: whether usage is becoming durable budgeted workflow spend.
Next question: which customers rely on Exa in production, not pilots or experiments?
```

That is the product's promise in miniature.

## Working Issues

### Status Feels Repetitive Early

The opening progress loop shows real stages, but the visible change between states is subtle. "Finding sources" repeats long enough that the run can feel stalled even when it is advancing.

Possible improvement: make each stage expose a concrete artifact as soon as it exists. For example: "Found company page," "Found funding coverage," "Found 5 recent launches," "No reliable customer proof yet."

### Ready State Needs A Stronger Payoff

"Starter profile ready" is accurate, but the user has to infer what changed. The panel could be more explicit about the read it has earned.

Possible improvement: add a compact "what we know now" line: `Exa is an AI search/API company with recent funding, active launch cadence, and strong developer-tool positioning. The next useful read is who pays and why now.`

### Research Stack Competes With Active Work

The stack is visually useful, but during active synthesis it sometimes competes with the card that is currently running. The user's eye bounces between the active card and the waiting stack.

Possible improvement: during an active section run, collapse the stack into a smaller queue rail or a single "2 waiting" control. Restore the fuller stack once the active card completes.

### Queueing Is Honest But Emotionally Flat

"Another generation is already running for this card" is true, but it reads like a system limitation. The product probably wants to say: "Queued behind current card" or "Up next after Timing."

Possible improvement: make queue order concrete and calm. `Queued: The case -> Next question`. Avoid language that sounds like the user made a mistake.

### Section Labels May Overlap Conceptually

"Why care," "The case," and "Timing" are all plausible investor cards, but in the demo they risk feeling like adjacent flavors of synthesis. The distinction is clearer in our heads than it may be in the panel.

Possible improvement: tighten each card's job:

- `Why care`: one investor thesis in 2-3 sentences.
- `The case`: bull/bear, with only supported claims.
- `Timing`: why now, buyer budget, adoption trigger, market structure.
- `Next question`: the highest-leverage diligence question after reading the above.

### Dense Prose Escapes The Side Panel

The generated Timing and Case sections contain useful thinking, but the paragraphs are long for a narrow Chrome side panel. They read more like a memo excerpt than a panel-native research card.

Possible improvement: section cards should open with a decision-grade capsule, then expandable evidence. The first view should answer: `What should I believe, and how strongly?`

## What Is Working

- The product has a real object model: profile, section cards, source counts, generated states, queued states.
- The source counts and source chips keep the UI anchored in evidence.
- The individual research cards are directionally right. "Who pays," "Timing," "Proof," and "Next question" are the right kind of investor-native language.
- The running states are honest. The app does not fake instant intelligence.

## Questions For Us

- Should the demo optimize for showing the machinery, or for getting to the first investor read faster?
- Which card should be the first active research card for Exa: `Who pays`, `Why care`, `Timing`, or `Signals`?
- Should the research stack behave like a visible queue, or should it mostly disappear while one section is active?
- Is dense generated prose acceptable if it is accurate, or should every side-panel section force a tighter format?
- What is the "end state" we want the user to feel: profile saved, research complete, or ready for a call?

## Candidate Iteration Themes

1. ~~Make progress states artifact-led rather than verb-led.~~ Completed in `409c85b`.
2. Give "starter profile ready" a stronger summary payoff.
3. Make queued research feel intentional and ordered.
4. Separate the jobs of `Why care`, `The case`, and `Timing`.
5. Compress generated section prose into side-panel-native cards.
6. Add evidence-quality marks beside claims, not only source counts in headers.
7. Give multi-card completion a `Read so far` state so the session ends with judgment, not just card statuses.

## Proposed Upgrade Queue

This is the cleanest implementation order if we want maximum product improvement without boiling the ocean.

Use this queue as tomorrow's discussion agenda, not as a committed build plan. The decision is still TBD on whether we do any of these.

### Upgrade 1: Starter Payoff Card

Add an earned-read state after the base profile is ready.

Minimum version:

```text
What we know
[one-line company read]

What is not proven yet
[one-line uncertainty]

Recommended next card
[card name] because [reason]
```

This targets the first minute of perceived value.

### Upgrade 2: Active Run Staging

When a research card is running, reduce the full stack to a queue summary.

Minimum version:

```text
Running: Timing
Up next: The case
Waiting: 3 cards
```

This targets attention ownership and makes the UI feel more composed.

### Upgrade 3: Queue Copy And Acceptance Feedback

Replace blocked-state wording with ordered workflow language.

Bad feel:

```text
Another generation is already running for this card.
```

Better feel:

```text
Timing is running.
The case is queued next.
```

This targets user confidence during async work.

### Upgrade 4: Generated Card Capsule

Make every generated card open with `Answer`, `Evidence`, `Uncertainty`, and `Next move`.

This targets memo drift and makes the side panel useful at a glance.

### Upgrade 5: Evidence Weight Marks

Keep source counts, but add source-quality labels where claims appear.

Minimum vocabulary:

```text
primary
independent
company
reported
stale
not found
```

This targets trust. It is also one of the highest-taste things we can add because it makes the interface feel careful rather than merely generative.
