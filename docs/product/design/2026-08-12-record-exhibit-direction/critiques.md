# Record exhibit mockups: concepts, rounds, pick

2026-08-12. Three directions, five rounds on the pick, built as self-contained HTML with the product's real fonts (IBM Plex Sans, IBM Plex Mono, At Textual) and DESIGN.md tokens, screenshotted with Playwright at 1440px. The Paper MCP server is configured and healthy on this machine, but this session started before it was added, so its tools cannot load here; a fresh session gets them. HTML also renders the licensed At Textual face, which Paper cannot load. Mockup sources sit beside the screenshots in this folder.

All content is the frozen fixture from `record-exhibit-data.ts`, verbatim. Every [SAMAY] slot renders its working placeholder. Nine ticks in every direction.

## The diagnosis these had to beat

No object. No concept. Ticks read as list bullets. Nothing rewards a second look. The old version was two text columns with hairline rules: a settings page, not an exhibit.

## Direction 1: the printout and the card

One line: a continuous-feed database printout beside the filed catalogue card it failed to be.
Kills: no-object, no-material-difference.

- Round 1: material contrast lands immediately. Broken: right-edge sprocket holes missing, the disagreement slip covered their record's values (register risk, reads as hiding their data), ticks floated outside the card edge like stray marks, FILED read as a badge chip.
- Round 2: holes fixed both edges, perforation edges added, slip moved below the record and tucked under its bottom edge, ticks moved inside the card's own left margin, FILED restyled as a two-line stamp. Still elementary: green-bar banding sliced through text rows like a rendering artifact, and the two objects floated apart with a dead gap between them.
- Round 3: banding kept only on the big strip, wider and fainter. The card now laps onto the printout's sprocket strip (covers holes, never data). The lap states "one desk, two documents" without a word.

## Direction 2: pasted into the ledger

One line: their record is a cold slip pasted onto our ruled sheet and it stops; our lines are written on the ruling and keep going.
Kills: ticks-as-bullets, no-concept.

- Round 1: the paste-up reads, but text floated between rules instead of sitting on them, and the sheet read as notebook stationery, not the product's paper. The link floated in dead ruling.
- Round 2: tighter ruling the text actually sits on, seal top edge plus call number to make the sheet Cold Start's own paper, ticks moved onto the margin rule so they read as tally marks. The best single moment of the whole exploration appears here: three lilac ticks on the margin rule directly opposite their three printed dashes.
- Round 3: their column tightened. Honest verdict: the concept fully lands on two of three pairs. On Mintlify their record is physically taller than our three-line excerpt, so the empty ruling sits under OUR column and reads backwards. A layout cannot fix that; the content shape is what it is.

## Direction 3: the mounted exhibit

One line: two specimens of the same company mounted on one mat with a caption plate.
Kills: no-object and the second-look failure.

- Round 1: handsome instantly. Broken: the [SAMAY] questions were demoted onto the plates and stopped leading, the slip covered their values again, tape at 45 degrees read as slashes across the card.
- Round 2: questions promoted back above the mats, plates keep attribution and link, tape flattened to hinge angles, slip relocated, mounts got micro-rotations.
- Round 3: mat tone separated from the desk. Honest verdict: the wit is curatorial hardware, not argument. Mounting both records as precious specimens flatters their thin file, and four stacked mats drift toward the stacked-boxes pattern DESIGN.md bans.

## The pick: Direction 1

Three sentences. D1 is the only direction where the argument, the material, and the product language are the same thing: their record is a cold system printout, ours is the filed catalogue card the site already speaks, and the card physically landing on the printout's margin says "one desk, two documents" with zero editorial words. Its stack beat is the strongest of the three because the six identical sentences become a property of their artifact, a continuous-feed report, rather than a styled list. D2's best moment survives inside D1 (pair 2's ticks sit at the same heights as their dashes) and D3's hardware added charm but framed the comparison as a museum instead of a working desk.

Shots: `d1-r5.png` (final desktop), `d1-mobile.png` (390px, their material first, vertical lap), `d1-detail.png` (tally stroke against a marked line at reading scale).

## Rounds 4 and 5: the de-slop pass (Samay's call, correct)

Samay flagged the ticks as left lilac ribbons and the tally line as gibberish. Both true. Sources loaded before the pass: the frontend-design skill, `ai-slop-tells.md` and `cursor-design.md` from the phoenix design-taste folder, DESIGN.md again.

- The ribbon problem: a straight colored bar on the left edge of a card is a named kill-list tell. Replaced everywhere with hand tally strokes: slanted like pen marks, slightly uneven heights and angles, one per line their record cannot hold.
- The tally problem: "Nine lines. No field on the left for any of them." was the plan doc's working placeholder, and rendered in place it reads as nonsense. The working placeholder is now "Nine marked lines across three cards. No field on their records holds any of them," preceded by a real hand tally: a crossed group of five plus four strokes. The count became function, not decoration. The line stays [SAMAY].
- Uniform-rhythm slop: three pairs sat in the identical composition. Now each pair sits differently on the desk: varied record widths, vertical offsets, and lap depths. Beat 1 left-aligned instead of centered.
- Shadow grammar upgraded to the Cursor reference: a 1px low-alpha ring plus one deep soft falloff, so the paper objects sit on the desk instead of floating.
- Green-bar banding dropped: its band edges crossed text rows and read as a rendering artifact. The holes, perforation, and report typography carry the material.
- Round 5 fixed a round-4 regression: pair 2's deeper lap clipped the record's attribution caption and crowded the dashes. The dashes are the show; the lap pulled back and captions standardized left.

## Round 6: Samay's copy and clarity notes, applied

- Kicker is now his line: "The tools we use to understand these companies barely scratch the surface." Still his slot.
- The printout opens with its own printed header row naming PitchBook and the access date, so the section can never be mistaken for our card, desktop or mobile.
- Every record fragment carries the company logo, name, and a PitchBook source tag; every Cold Start card carries the logo beside its name. Both sides identified at a glance.
- "Both values stand" cut from the disagreement slip. The bottom tally row is gone entirely; the section ends on the third pair.
- Logos are live favicons frozen into the folder (mintlify.png, turbopuffer.png, clickhouse.png); implementation should reuse the card pipeline's vetted logo path instead.

## Register self-check on the pick

PitchBook text verbatim, full contrast, attributed with access date on every artifact. No dimming: the printout is cold white, their ink full-contrast; the green-bar tint is period material, not a strawman wash (drop it if it ever reads as dimming). No checkmarks, no X marks, no feature grid, no word counts, no "we are better" anywhere. The card lap covers only sprocket holes, never their data. Ticks appear only in our card's margin. Every copy line on the page is a [SAMAY] placeholder.

## What implementation needs that the current DOM lacks

- A printout object: wrapper with two tractor-strip pseudo-elements (sprocket holes, dashed separation), top and bottom perforation edges, and the wide-pitch band tint on the beat-1 strip only. The current RecordColumn is a plain definition list.
- A mini catalogue-card object for the excerpt: parchment surface, seal top hairline, call number, small two-line FILED stamp, offset under-card pseudo for stacked depth, and a left margin wide enough to hold the ticks inside the card. The current ExcerptColumn has none of this.
- The disagreement note as a physical slip: a sibling of the record paper, overlapping its bottom edge, receipt face. Currently it is a hung note inside the definition list.
- Pair-level overlap: record 46 percent, card negative-margin lap with higher z-order and a left-side shadow. Below 700px the lap turns vertical: their record first, card overlapping upward.
- Beat 1 becomes one printout strip with per-row company labels, not a list of quotes.
- The tally line gains the aria-hidden nine-tick cluster beside the real text.
- A shared paper-noise overlay class (SVG turbulence data URI) for parchment and slip surfaces; the real card face already has its WebGL texture, so the web implementation can reuse that instead.
- Mono note: IBM Plex Mono appears only on their printout material. That is the earned-accent case; if it reads as costume in review, the one-line fallback is Plex Sans on the record fragments while the strip keeps mono.
- Motion stays as specced: ticks draw once on scroll with roughly 60ms stagger; everything else is still print.
