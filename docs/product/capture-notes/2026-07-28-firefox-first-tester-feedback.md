# First Firefox tester feedback capture (2026-07-28, late night)

Samay ran the first live Firefox temporary-install as a trial tester (invite emailed to himself at semitechie / samay58). Raw feedback from that session plus the incident it surfaced, filed for the next working session.

## Incident: first Firefox connect burned the invite

Symptom: first Connect press showed "Could not connect. Try again"; every retry showed "This invitation was already connected elsewhere." Root cause: `connectAlphaInvitation` called `chrome.storage.local.setAccessLevel` between the successful redeem response and the credential write. Firefox's storage schema has no `setAccessLevel` on `storage.local`, so the call threw on every Firefox connect, the invite was consumed server-side, and the access token was never stored. The unit tests mocked `setAccessLevel` as always-succeeding even in the Firefox-shaped harness, which is why it survived to a live tester.

Fixed client-side the same night (credential write now comes first; `setAccessLevel` is feature-detected and best-effort; the lifecycle flush cannot fail a connect; regression tests model the real Firefox storage surface). Invite `4cef1602-2010-48ae-83d5-c32e9aaade1b` stays burned; a fresh one needs the production env on the machine that mints.

## Follow-ups filed for the next session

1. **First-screen copy cut.** Samay: simplify the words, literally reduce them; current copy reads AI-sloppy. Applies to the connect/invitation screen the tester meets first (FirefoxInviteForm and the /alpha page copy). Workshop mode: Samay owns the lines, session QAs for slop.

2. **First-screen wow factor.** The first screen a tester meets should carry more intensity, in line with the product ethos (the catalogue-card, evidence-first identity), not a plain form. Discuss direction before building; brainstorm first, this is creative work.

3. **Invite-link clunk.** The email-a-link, paste-a-link flow feels clunky end to end. Firefox cannot do page-to-extension messaging (Bugzilla 1319168), so some paste step is structural, but the surrounding experience (what the email says, what the /alpha page shows Firefox users, what the panel field accepts) is all improvable.

4. **Server-side redeem resilience (design decision needed).** Two gaps make a single client hiccup fatal today:
   - `redeem_alpha_invite` counts all installations for the invite, including revoked ones, against `max_installations`. Revoking a burned installation therefore does not free the seat, and `alpha:revoke --installation` cannot repair a tester. Proposal: count only `revoked_at is null` rows (new migration).
   - Redeem is strictly one-shot. Proposal to discuss: a short re-redeem grace window (same invite token re-issues credentials for the just-created installation within ~15 minutes, rotating the access token), so a client-side failure right after redemption self-heals on retry instead of burning the invite. Weigh against the link-hijack window it opens.

5. **Test-harness honesty.** The Firefox-shaped mocks must model what Firefox actually implements (this incident's lesson, now partly encoded in `alpha-connect.test.ts`). Sweep `background.test.ts` and `connection-panel.test.tsx` for the same always-succeeding `setAccessLevel` assumption where a Firefox-shaped runtime is simulated.
