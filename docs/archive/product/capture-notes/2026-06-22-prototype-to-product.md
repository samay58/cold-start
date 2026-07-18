# Prototype to product direction note

Source capture: `/Users/samaydhawan/phoenix/01-active/archive/captures/plaud-2026-06/2026-06-22-cold-start-prototype-to-product-cb216b14.md`
Plaud id: `cb216b14a4ae78c3b8ea77e1e3d6d920`
Date: 2026-06-22

This is a capture-led product direction note, not an implementation spec. Its job is to keep the product pivot visible when deciding what to work on next.

## Decision frame

Cold Start is at the point where more tasteful upgrades are not enough. The next useful pass should answer whether it can become a viable product attempt:

- Can someone install and run it without heroic setup?
- Does the product feel like it gives value quickly enough?
- Is there a coherent paid path if we bundle expensive third-party calls?
- Is the public site part of V1 or distracting surface area?
- Can we get real friend/user feedback without over-polishing first?

## Work that matters first

### Packaging and onboarding

The repo/GitHub path is not a product path. The hard work is making installation and setup feel straightforward, especially because users may need third-party API keys. If the product bundles those calls instead, the billing model has to carry the provider cost.

### Monetization and unit economics

A possible model is a subscription that bundles profile calls. Before building around it, calculate what a $20/month plan can actually support: profile count, provider cost, LLM cost, margin, and abuse risk.

### Perceived speed and first payoff

The current first-read idea has not changed the wait to the main card. If it cannot provide immediate payoff, kill it or replace it. The user need is simpler: give enough useful signal during the wait that the user believes the result will be worth it.

### QA and content polish

Fix the visible product papercuts: cards that do not close, awkward scrolling, oversized research card placement, dense section copy, and weak people tooltips. People tooltips should explain who someone is and why they matter without generic AI language.

### Public site scope

The public site could become a valuable generated-profile surface, but it may be too much for V1. Default should be simplify hard unless there is a clear reason it helps distribution or retention now.

### Distribution

The biggest gap is still distribution. The first non-theoretical move is to make the product good enough to ask friends to install it and give feedback.

## Practical next pass

Do not start with another broad upgrade pass. Start with a viability checklist:

- install path
- first payoff during generation
- close obvious UX bugs
- one clean paid-model calculation
- public site: simplify, defer, or justify
- small friend-feedback plan

## Related docs

- `docs/product/viability-directions-2026-06-23.md`
- `docs/superpowers/plans/2026-06-07-speed-work-backlog.md`
- `docs/superpowers/specs/2026-06-22-first-read-followups.md`
- `docs/product/diagnose-iterate-craft-playbook.md`
