# Cold Start Extension Generation Reliability

## User Evidence

- Opening the side panel after auth sometimes still lands on a setup or generate state that references localhost instead of the deployed API origin.
- Cartesia is a table-stakes company. If `cartesia.ai` cannot resolve into a useful cited profile, the product is not usable.
- Clicking Generate or Analyze can leave the side panel showing a generic staged progress screen for too long, including 90 seconds or more on the last analysis step.
- Closing and reopening the extension during a long run should not ask the user to generate again. It should detect the active background run and resume the progress screen.
- Latest screenshots showed a low-quality Cartesia profile rendered as `partial` with `No sources`, `Not found` metrics, and an Analyze CTA. That state should not be considered a usable base for analysis.

## Approved Fix

Build a durable extension generation state machine. On open, the side panel resolves settings, domain, finished card, active basics run, and active analysis run before deciding whether to render setup, a card, progress, retry, or generate.

No-source partial cards are not analyzable. The app should guide the user to regenerate basics instead of offering investor analysis on an uncited card.

## Out Of Scope

- Full enrichment-card UX redesign.
- Provider replacement.
- New admin console.
- New backend service.

## Validation

- Extension tests cover active-run resume, no-source partial handling, analysis polling, and localhost default migration.
- API tests cover unusable cached cards not being treated as cache hits.
- Full workspace typecheck, test, extension build, and diff whitespace checks pass.
