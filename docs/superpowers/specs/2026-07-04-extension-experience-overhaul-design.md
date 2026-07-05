# Extension Experience Overhaul: The Card Is the Progress

Date: 2026-07-04
Status: Approved design, pending implementation plan
Owner: Samay (taste), Fable (spec and orchestration)
Companion doc: `~/.claude/FABLE-ORCHESTRATION.md` (execution doctrine, piloted by this project)

## Problem

The side panel is crowded and the crowding is worst exactly where the user waits. During a build the screen runs five concurrent progress voices: an animated mesh shader background, a breathing dot with a status line, a four-segment labeled hairline track (Sources/Proof/Profile/Filed), a live stage row repeating the current stage plus a proof line, and a recent-sources strip. Three of these say the same thing. The people tooltips carry collection metadata (role, email provenance, source host) rather than anything a user actually wants to know about a person. The net effect: the product feels dense and slow, and using it is a chore rather than a delight.

## Doctrine: earn your space

One test applied to every element on every surface: does it say something no other element on screen says, and does the user either act on it or feel it? An element that repeats information dies unless it is the designated single voice for that information.

Per screen budget: one status voice, one ambient texture, one accent moment.

The mesh-gradient background survives as the single ambient element. It is warmth, not information. It gets slightly calmer (lower speed/grain within the current props) and settles when the profile settles. This doctrine section gets added to `DESIGN.md` and is the audit lens for the full pass.

## Building phase: the card is the progress

`ResearchTrail.tsx` dissolves. Its five voices redistribute:

- **Status** moves into the company header as one whisper-line: breathing dot plus event-driven copy ("Queued", "Reading anthropic.com", "9 sources, building profile", "Filed"). This is the only element on screen that states progress.
- **The labeled four-segment track and the live stage row are deleted.** Nothing replaces them. Their information is already carried by the status line.
- **Source receipts become the first content of the profile.** In the first seconds, before any fact exists, arriving source chips fill the space where the card is forming. From roughly 3 seconds in, the screen shows what research found; there is no empty wait. (This builds the "source receipt before a card" item from the June ELEVATION list.)
- **The details tree** (`SourcePassInstrument`) stays behind one quiet toggle and auto-opens on attention or failure, preserving current behavior.

Building and profile phases render the same profile skeleton. Each slot (fact ribbon, people line, early read, signals) has three states:

1. **awaiting**: reserved space marked by a quiet rule. No skeleton shimmer.
2. **arriving**: staggered fade-rise triggered by the real generation event. Spring physics per the motion north star (Rauno Freiberg / Devouring Details).
3. **settled**: at rest.

No wall-clock animation and no estimation anywhere; a slot moves only when a generation event says so. This preserves the existing event-driven doctrine from `research-progress.ts` and `first-payoff-events.ts`.

The one celebratory beat is the existing filed/seal stamp when research files. Reduced-motion degrades every arrival to a plain fade. Full motion is the design; a freeze under Reduce Motion is a bug, but Reduce Motion is not the review environment.

Failure and attention states surface inline in the affected slot, flip the status line to its attention voice, and auto-open the details tree, matching current `needsAttention` behavior.

## People: from word salad to dossier

### Data

`personSchema` in `packages/core/src/card.ts` gains:

- `read`: string, 1 to 2 sentences, nullable. The person insight.
- `readCitationIds`: citation refs. Every non-null `read` needs refs that resolve to the top-level `citations[]`, per the existing card convention.

Both fields are stripped from the public card alongside `email`/`emailStatus`. Person reads are extension-tier judgment, not public sourced facts.

### Pipeline

A new `person_read` LLM stage:

- Routed through `modelForStage("person_read")`, resolving `LLM_PERSON_READ_MODEL`, then the synthesis model chain (same fallback pattern as `research_section`).
- Voice: the `investor-taste-kernel` system prompt family.
- Runs once per card inside the async contact-enrichment worker (`apps/web/src/inngest/contact-enrichment.ts`), after channel/email merge, covering all people in one call.
- Evidence in: GitHub profile/repos/commit metadata, X bio, personal site, news mentions already fetched for the card, plus the StableEnrich apollo person-enrich payload (employment history, education). Paid person enrichment is approved per card; apollo endpoints are ~$0.02/call with `maxCallsPerRun` caps already registered in `provider-budget.ts` (search 1x, enrich 3x), so the added cost is $0.06 to $0.08 per card plus one LLM call.
- Output per person: `read` (max 2 sentences), `readCitationIds`, or explicit null with a structured suppression reason when evidence is thin. Same honesty pattern as First Payoff's withheld state.

### Content doctrine for reads

A read must be non-obvious, specific, and decision-relevant. In scope: domain fit ("built payments infra at Stripe for six years; this is her domain"), repeat-founder history with outcomes, trajectory outliers, honest flags (three companies in four years; no public footprint). Banned: restating the role, adjectives without evidence, filler of any kind. Thin evidence produces null, and the tooltip stays quiet. Never pad.

### Surface

- The shared tooltip grows a structured dossier variant (name, role, the read, provenance whisper), same 240 to 340px footprint as today's `SharedTooltip`.
- The people line goes on a diet. Visible: name, role, email (email is the action, it stays). Moving into the dossier: channel links (GitHub/X/Site), the email-kind chip, the copy affordance.

## The full pass

Every remaining surface gets audited against the doctrine before any code moves: intake, building, profile, research-layer module pile, card tray, lens memo. Each audit produces a kill/keep/move list with Playwright screenshots (existing `qa:extension:ui` harness). Fable reviews every list before implementation starts, so deletions are deliberate. "Earn your space" must not become "delete things the agent did not understand."

## Speed, perceived and real

Perceived: the identity band renders at 0s from intake context (favicon, domain), source receipts from roughly 3s, first facts as extraction lands. The screen accretes value for the whole wait.

Real: one packet re-measures post-deploy first-usable p90 via `npm run measure:first-usable` (the async-enrichment fix shipped 2026-07-01 but was never verified against the locked baseline of p90 179s, target at or below ~143s). Only if the tail has not collapsed: tune `INNGEST_CARD_ENRICHMENT_CONCURRENCY` / `INNGEST_CONTACT_ENRICHMENT_CONCURRENCY` against the account limit from the Inngest dashboard. No new pipeline work. Lean extraction stays dead (established 2026-06-26: extraction is not the bottleneck).

## Orchestration

This overhaul is the pilot for `~/.claude/FABLE-ORCHESTRATION.md`. Summary of the execution shape (the doctrine file is authoritative):

- Phase 0, Fable: this spec plus packet decomposition.
- Phase 1, audit sweep: six Sonnet agents in parallel, one per surface, structured kill/keep/move output with screenshots. Fable reviews all six before code moves.
- Phase 2, build: parallel worktree packets. Opus 4.8 on the assembly/motion core and the dossier tooltip; Sonnet 5 on the person_read stage, schema/API plumbing, and surface diets; Haiku 4.5 on CSS sweeps, dead-style removal, and test scaffolds. Every packet lands with its tests and a machine-checkable done-definition.
- Phase 3, verify and integrate: Opus adversarial review, full e2e, contract bump; Fable does integration, the final taste pass, and prepares the Reduce-Motion-OFF walkthrough build.

Token ledger: output tokens by model tier logged at each phase boundary into `docs/superpowers/specs/2026-07-04-extension-experience-overhaul-ledger.md`. Success bar: Fable at or below 20 percent of output tokens, all gates green, and Samay rates the result fantastic. Only then do pointer lines get added to `~/phoenix/CLAUDE.md` and other active projects.

## Testing and rollout

- Unit tests land with their packets: `read-region`, `research-progress`, people/tooltip tests reworked; new `person_read` tests in core and llm; `first-payoff` core logic untouched.
- Playwright UI and smoke specs updated for the assembly surface. `audit:css` stays green (theme tokens only, no raw colors).
- `personSchema` change is a card-shape change: bump `packages/core/api-contract.json` and rebuild the extension.
- Full `npm run check` green before merge. CI mirrors it.
- Samay's visual sign-off with macOS Reduce Motion OFF is the final gate before deploy.
- Deploy order: web first (schema is tolerant of absent optional fields), then extension rebuild and reload.

## Non-goals

- No public web page (`/c/{slug}`) redesign in this pass.
- No new latency pipeline work beyond measurement and the existing env concurrency levers.
- No design-language change: the Catalogue Card stays. This pass removes what does not earn its space; it does not restyle what does.
- No per-person on-hover LLM calls. Reads are generated once per card, server-side.
