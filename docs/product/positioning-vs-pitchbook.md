# Positioning vs PitchBook

Last updated: 2026-07-27. How we articulate Cold Start's differentiation to interested parties and investors, and what belongs in a side-by-side demo. Update the cost figures from `npm run evo:generation-benchmark` before reusing them; the numbers below are from the 2026-07-27 run.

## Core pitch

PitchBook is a database of what already got filed. Cold Start generates the profile at the moment you need it, cites every claim, and keeps it alive afterward.

1. **Coverage on demand.** Any company with a website gets a full cited card in about a minute. The newest companies, the ones seed investors actually chase, are exactly where database coverage is thinnest. The name is the wedge.
2. **Depth of understanding, not fields.** The card explains the concept, who pays, and what makes the product work. The gated read adds a verified bull case, bear case, and the open questions for a first call. Every synthesis claim passes a verifier; unsupported lines get dropped, not padded.
3. **Living profile.** Generation is the start, not the end. Background enrichment keeps filling in people and sections after the first render, and stale sections regenerate on the next open (signals refresh on a 6-hour clock). A database row waits for an analyst.
4. **Citations.** Every fact links to a public source you can click. PitchBook numbers are proprietary; you can't inspect where they came from.
5. **The math.** Measured on recent production runs (evo benchmark, 2026-07-27): average ~$0.01 per generation run, $0.17 worst case; a full card with analysis lands well under $1. PitchBook seats reportedly run ~$25k+/yr (pricing is not public; keep the "reported" qualifier in anything written, or get a real quote). Even pricing a card at a full dollar, one seat buys ~25,000 cards. At measured cost it is six figures of cards per seat.

Lead with 1 and 3 together: fresh coverage of companies databases haven't caught up to, plus a verified first-pass read that keeps itself current. Citations and price are proof points, not the headline.

## Side-by-side table

| Dimension | Cold Start | PitchBook |
|---|---|---|
| Company founded <12 months ago | Full cited card on demand | Thin or no profile |
| Depth | Concept, buyer, mechanism; verified bull/bear + open questions | Category tags and fields |
| After generation | Keeps enriching; stale sections regenerate on next open | Static until an analyst touches it |
| Sources | Every fact links to a public source | Proprietary, uninspectable |
| Economics | Well under $1 per full card (measured) | ~$25k+/seat/yr (reported) |
| Shareability | Public URL, no login | Seat-licensed only |

## Demo shape

Three companies, side by side, screenshots timestamped:

1. Just-launched: PitchBook has nothing, Cold Start has a full card.
2. Fresh seed round: PitchBook is thin and stale.
3. Covered growth company: parity check. Win on citations and the read, not raw data.

## What to leave out

Historical round ledgers, filing-derived valuations, fund/LP data, exit comps. PitchBook wins those and the comparison invites the question. Both products ship a browser extension, so "where it lives" is not a differentiator either.

Honest frame: not a deal-comps replacement. A replacement for the first 10 minutes on any company, which is most of what a seat gets used for.

## Claims discipline

- Cost figures come from `npm run evo:generation-benchmark` against recent production runs. Re-run before quoting them; do not reuse stale numbers.
- The living-profile claim covers what ships today: post-render background enrichment plus TTL-driven section regeneration on open. Do not claim continuous push updates; that is not built.
- PitchBook pricing is reported, never confirmed. Written materials keep the qualifier.
