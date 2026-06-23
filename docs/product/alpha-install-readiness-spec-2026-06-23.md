# Alpha Install Readiness Spec

Date: 2026-06-23
Status: proposed
Owner: Samay
Related research: `docs/product/research/alpha-installation-paths-2026-06-23.md`

## Decision

Cold Start should run the friend alpha through a **Chrome Web Store Private alpha item, managed by a Google Group, wrapped by a custom Cold Start invite page**.

The invite page is the product surface. The Chrome Web Store is the install authority. The extension side panel is the first success surface.

The goal is not "publish the extension." The goal is:

> A smart non-technical investor or builder can go from invite link to first useful company profile in under 3 minutes, without Samay live-debugging the setup.

## What This Must Feel Like

The tester should feel:

- **Safe**: this is installed through Chrome Web Store, not a strange file download.
- **Oriented**: they know what Cold Start sees, when it runs, and what will be public.
- **In control**: it runs when they click it on a company website.
- **Guided**: if something breaks, the page or panel says exactly what to do.
- **Rewarded quickly**: the first real company profile appears before they lose curiosity.

Samay should feel:

- **Not trapped in support loops**: most failures produce a readable diagnostic payload.
- **In control of spend**: only invited testers can run generation, and run caps exist server-side.
- **Ready to learn**: install, activation, first run, and lens usage are timestamped.
- **Able to revoke access**: alpha access can be turned off without changing the Chrome listing.

## Non-Negotiables

- No unpacked ZIP as the default alpha path.
- No CRX or self-hosted install for normal friend-alpha testers.
- No billing in the alpha install flow.
- No broad `<all_urls>` permission unless a measured first-run requirement proves it is necessary.
- No claim that Cold Start knows the user's Chrome Google Account unless we implement real Google OAuth.
- No raw page content in diagnostics by default.
- No public route may expose private synthesis.

## Operating Model

Cold Start has two separate gates.

| Gate | What it controls | Mechanism | Why it exists |
|---|---|---|---|
| Chrome install gate | Who can install the alpha extension | Chrome Web Store Private listing plus Google Group | Keeps the install path official and invite-only. |
| Cold Start access gate | Who can run generation and investor lens | Cold Start invite token and backend entitlement | Keeps product access revocable, measurable, and independent of Chrome account quirks. |

This separation matters. Chrome Web Store Private answers, "Can this Google account install the extension?" Cold Start still needs to answer, "Can this tester spend money, call the backend, and see the private investor lens?"

## Primary Path

1. Samay adds tester email to `cold-start-alpha-testers@...`.
2. Samay sends `/alpha/{inviteToken}`.
3. Tester opens the invite page in desktop Chrome.
4. Invite page explains the alpha in plain English.
5. Tester clicks `Install Cold Start Alpha`.
6. Chrome Web Store opens the Private listing.
7. Tester installs the extension.
8. Tester returns to the invite page.
9. Invite page checks whether the extension is installed.
10. Invite page sends a one-time connect token to the extension.
11. Extension stores alpha access.
12. Invite page prompts tester to open a company website.
13. Tester clicks the Cold Start action icon.
14. Side panel opens on the current domain.
15. Side panel runs diagnostics.
16. Tester clicks `Build sourced profile`.
17. Basics run creates or loads `/c/{slug}`.
18. Side panel shows the first useful public profile.
19. Side panel offers `Run investor lens`.
20. Analysis run populates Why care, The case, Timing, and Next question.

The install path is one flow, but it has three surfaces:

- **Invite page**: setup and trust.
- **Chrome Web Store listing**: official install and permission review.
- **Side panel**: first value.

## User Journey

### Invite Page

The invite page should look like a quiet setup console, not a marketing landing page.

Required content:

- Title: `Cold Start Alpha`
- Promise: `Generate a sourced company profile from the company site you are viewing.`
- Trust line: `Installed through Chrome Web Store. Runs when you click it on a company website.`
- Data line: `Cold Start uses the current company page, public web sources, and your alpha access to create a sourced public card and private investor lens.`
- One primary action: `Install Chrome extension`
- One secondary action after install: `Connect extension`
- One first-run action after connect: `Open a company site`
- One support action: `Copy diagnostics`

The page should show live setup rows:

| Check | Success copy | Failure copy |
|---|---|---|
| Browser | `Desktop Chrome detected` | `Open this invite in desktop Chrome.` |
| Invite | `Invite accepted` | `This invite is expired or unavailable.` |
| Store access | `Use your invited Google Account` | `Chrome Web Store access depends on the Google Account that received the invite.` |
| Extension | `Cold Start Alpha installed` | `Install from Chrome Web Store first.` |
| Connection | `Extension connected` | `Click Connect extension after install.` |
| Backend | `Cold Start API reachable` | `Cold Start API is not reachable. Copy diagnostics.` |
| First run | `Ready for first company` | `Open a company website to begin.` |

Important product choice: the invite page should not pretend it can verify the user's Chrome Google Account. It can explain the account requirement, but it should not show `Signed in as invited email` unless we add real Google OAuth.

### Chrome Web Store Listing

The alpha listing should be honest, specific, and visibly alpha-only.

Name:

```text
Cold Start Alpha
```

Short summary:

```text
Create sourced company context cards from the company site you are viewing.
```

Description:

```text
Cold Start Alpha helps invited testers generate a sourced company context card from the company website they are viewing.

The public card lives at /c/{slug} and shows sourced public facts. The Chrome side panel adds a private investor lens for your alpha account.

The extension runs when you click it on a company website. It uses the current company page and public web sources to generate the card.

THIS EXTENSION IS FOR ALPHA TESTING.
```

Screenshots:

- Invite/setup page with live checks.
- Company website with Cold Start side panel open.
- Sourced public card at `/c/{slug}`.
- Private investor lens in the side panel.
- Diagnostics/support state.

Permission copy:

| Permission | Plain-English explanation |
|---|---|
| `sidePanel` | Shows Cold Start next to the company website you are viewing. |
| `activeTab` | Lets Cold Start read the current tab after you click the extension. |
| `storage` | Saves setup state, alpha access, and preferences. |
| backend host permissions | Lets the extension talk to the Cold Start API. |

Current repo note: the extension manifest already uses `sidePanel`, `activeTab`, and `storage`, with explicit Cold Start backend host permissions. Preserve that posture.

### Side Panel First Run

The side panel should not open with settings. It should open with the current company context.

If the tab is usable:

```text
Ready on cartesia.ai

Build a sourced profile from this company site.

[Build sourced profile]
```

If the tab is unsupported:

```text
Open a company website

Cold Start runs on normal company websites, not Chrome settings pages, PDFs, or internal tools.

[Try a sample company]
```

If alpha access is missing:

```text
Alpha access is not connected

Return to your invite page to connect this extension.

[Open invite page]
```

If backend is down:

```text
Cold Start API is not reachable

This is a setup issue, not a research result.

[Copy diagnostics]
```

## System Design

### Tooling Choices

Use modern tools where they remove friction. Do not add tools just to make the alpha look more mature.

| Need | Use | Why |
|---|---|---|
| Official install | Chrome Web Store Private listing | Gives testers the normal Chrome install surface and auto-update path. |
| Tester access to listing | Google Group | Easier to manage than individual trusted tester emails for every change. |
| Product access | Cold Start invite token and backend entitlement | Keeps generation and investor-lens access under Cold Start control. |
| Invite surface | Next.js route at `/alpha/[token]` | Fits the current web app and lets the invite page talk to the backend directly. |
| Invite storage | Postgres through the existing Drizzle package | Keeps alpha state near cards, runs, and extension auth. |
| Extension connection | Chrome `externally_connectable` scoped to Cold Start origins | Lets the invite page detect and connect the installed extension without broad web access. |
| Browser surface | Chrome `sidePanel` and action click | Matches the product: research beside the company site. |
| Page access | `activeTab` first | Gives temporary access after user action and keeps the permission story clean. |
| Alpha observability | Small event table or generation-run-adjacent events | Enough to know where testers get stuck without adding a full analytics stack. |
| QA | Existing extension Playwright smoke/UI tests plus one real Web Store install drill | Covers local behavior and the real install path. |
| Support | Copyable redacted diagnostic payload | Faster than screen sharing and safer than raw logs. |

Avoid for v1:

- full account management
- Stripe or subscriptions
- native installers
- broad product analytics
- CRM imports
- onboarding surveys
- BYO provider keys
- background browsing monitors

These may become useful later. They are not needed to prove alpha install readiness.

### Data Model

Add a small alpha invite model. It can live in Postgres with the rest of the app state.

```text
alpha_invites
- id
- token_hash
- invited_email
- status: invited | accepted | revoked | expired
- tester_label
- created_at
- accepted_at
- expires_at
- revoked_at
- first_extension_connect_at
- first_profile_started_at
- first_profile_completed_at
- first_lens_completed_at
- run_limit
- run_count
- notes
```

Add an extension connection model only if needed for token rotation and diagnostics.

```text
alpha_extension_connections
- id
- invite_id
- extension_id
- extension_version
- install_channel: private | unlisted | unpacked | unknown
- api_origin
- last_seen_at
- last_diagnostic_json
- revoked_at
```

Do not store raw page text in these tables.

### Invite Page Routes

```text
GET /alpha/[token]
POST /api/alpha/invites/[token]/accept
POST /api/alpha/invites/[token]/connect-code
POST /api/alpha/diagnostics
GET /api/alpha/health
```

The connect code should be short-lived. The invite page gets it from the backend, sends it to the extension through `externally_connectable`, and the extension exchanges it for alpha access.

### Extension Messaging

Add `externally_connectable` only for Cold Start-owned origins.

Allowed messages:

```text
coldStart.alpha.ping
coldStart.alpha.connect
coldStart.alpha.status
```

Rejected by default:

```text
any message from an unlisted origin
any connect token that is expired
any request for raw page content
any request to change API origin silently
```

### Extension Storage

The extension already stores API origin and token. For alpha, store only what the product needs:

```text
coldStartApiOrigin
coldStartApiToken
coldStartAlphaInviteId
coldStartAlphaConnectedAt
coldStartInstallChannel
```

Do not store the raw invite token after exchange.

### Diagnostics Payload

The support payload should be copyable from the invite page and the extension.

Include:

```json
{
  "extensionVersion": "0.1.0",
  "chromeVersion": "redacted-or-user-agent-summary",
  "extensionId": "abc...",
  "installChannel": "private",
  "apiOrigin": "https://cold-start-samay58s-projects.vercel.app",
  "inviteStatus": "accepted",
  "currentHostname": "cartesia.ai",
  "permissionState": "activeTab-available-after-click",
  "sidePanelAvailable": true,
  "lastRunId": "uuid",
  "lastStatusCode": 202,
  "lastCardSlug": "cartesia",
  "lastLensRunId": "uuid",
  "timestamp": "2026-06-23T00:00:00.000Z",
  "rawPageContentIncluded": false
}
```

Exclude by default:

- raw page content
- full URL path and query string
- private notes
- CRM content
- cookies
- local storage values
- bearer token
- invite token

## Admin Surface

Do not build a broad admin app. Build the smallest operator surface that prevents manual chaos.

Required for alpha:

- create invite
- revoke invite
- mark tester as contacted
- see setup status
- see first profile status
- see last diagnostic payload
- reset extension access token
- export tester status as CSV or markdown

This can be a protected internal route, a script, or a simple admin page. The important part is that Samay can answer: "Who is stuck, where, and why?"

## Instrumentation

Track a small set of alpha events. These are product health events, not growth analytics.

```text
alpha.invite_opened
alpha.store_click
alpha.extension_ping_success
alpha.extension_connect_success
alpha.extension_connect_failed
alpha.first_domain_detected
alpha.profile_start_clicked
alpha.profile_completed
alpha.lens_start_clicked
alpha.lens_completed
alpha.diagnostics_copied
alpha.support_requested
```

Each event should include:

- invite id
- timestamp
- install channel if known
- extension version if known
- current hostname if relevant
- run id if relevant
- failure reason if relevant

Do not track full browsing history. Do not track all tabs. Do not collect background page views.

## Alpha Limits

Use simple run caps before billing exists.

Default:

- 5 invited testers.
- 10 profile runs per tester.
- 5 investor lens runs per tester.
- manual extension token reset.
- manual invite revocation.

If the first 5 testers pass the install flow, expand to 10.

## Fallback Paths

### Fallback A: Unlisted Chrome Web Store

Use if Private creates too many wrong-Google-account failures.

Rules:

- keep backend invite gate mandatory
- keep alpha listing unsearchable
- keep run caps
- treat link sharing as expected

### Fallback B: Technical ZIP

Use only for technical testers or while waiting on Chrome review.

Rules:

- label as developer fallback
- do not send to non-technical investors
- no promise of auto-update
- require manual version checks
- do not count ZIP installs as successful alpha installs

### Fallback C: Enterprise Pilot

Use later for a firm or company with admin support.

Rules:

- not part of friend alpha
- separate runbook
- likely domain publishing or force install
- requires buyer/admin consent

## Acceptance Criteria

The alpha install path is ready when:

- A non-developer Google account can install the Private build.
- A clean Chrome profile can go from `/alpha/{invite}` to first profile without local repo setup.
- The invite page never asks the tester to paste a secret token manually in the happy path.
- The extension shows a useful current-domain state on first open.
- Diagnostics explain at least these failures: wrong Google account, extension missing, backend unreachable, unsupported page, missing alpha access, and generation disabled.
- The public card is generated or loaded successfully.
- The investor lens can run after basics.
- Samay can see which step each tester reached.
- Samay can revoke a tester.
- No raw page content is copied in diagnostics by default.
- Public API responses still never expose synthesis.

## Test Plan

### Local Verification

- Unit test invite token parsing and status transitions.
- Unit test diagnostics redaction.
- Unit test manifest permissions for alpha build.
- Unit test `externally_connectable` origin allowlist.
- Unit test unsupported URL handling.

### Extension QA

- Build extension with production origin.
- Load extension in a clean Chrome profile.
- Verify side panel opens on action click.
- Verify domain detection on a normal website.
- Verify unsupported pages produce clear copy.
- Verify missing token state.
- Verify valid token state.
- Verify backend down state by pointing to a bad origin.

### Real Install Drill

Run this before inviting friends:

1. Create one invite for a non-developer Google account.
2. Add that account to the tester Google Group.
3. Install from Chrome Web Store Private listing.
4. Connect extension from `/alpha/{invite}`.
5. Generate a profile for a fresh company.
6. Run investor lens.
7. Copy diagnostics.
8. Revoke invite.
9. Confirm generation is blocked after revoke.

### Friend Alpha Drill

Invite 5 testers only after the real install drill passes.

Measure:

- time from invite open to extension installed
- time from extension installed to first profile started
- time from first profile started to first usable card
- whether support was needed
- failure reason if support was needed
- whether tester ran investor lens
- whether tester understood public card versus private lens

## Work Plan

### Phase 1: Chrome Package And Policy Kit

Outcome: alpha item can be submitted.

- Create alpha build naming and versioning.
- Confirm production manifest permissions.
- Prepare listing copy.
- Prepare privacy policy copy.
- Prepare permission explanations.
- Prepare screenshots.
- Prepare reviewer instructions.

### Phase 2: Invite And Entitlement

Outcome: Cold Start controls product access.

- Add alpha invite model.
- Add invite accept route.
- Add connect-code route.
- Add revoke route or script.
- Add run caps to generation gates.
- Add alpha event recording.

### Phase 3: Invite Page

Outcome: tester has one guided setup surface.

- Build `/alpha/[token]`.
- Add browser detection.
- Add install CTA.
- Add extension ping check.
- Add connect handoff.
- Add first company prompt.
- Add copy diagnostics.

### Phase 4: Extension First Run

Outcome: side panel is useful on first open.

- Add alpha access status.
- Add diagnostics panel.
- Add unsupported page states.
- Add current-domain ready state.
- Add first profile CTA.
- Add recovery actions.

### Phase 5: QA And Launch

Outcome: invite 5 testers with confidence.

- Run clean-profile install drill.
- Run extension QA.
- Submit Chrome Web Store review.
- Prepare tester email.
- Invite 5 testers.
- Review failure reasons after 48 hours.

## Spec Wargame

Question: Is the Private Chrome Web Store plus invite-page path the right first build, or should Cold Start choose a simpler Unlisted or ZIP-based path?

Source packet:

- Research playbook: Chrome Web Store Private and Unlisted both go through review; self-hosting and CRX are not normal-user paths.
- Pasted web-AI research: Google Group-backed Private is the best operational form of Private; Unlisted is the backup.
- Current extension manifest: `sidePanel`, `activeTab`, `storage`, and explicit backend hosts already match the narrow-permission path.
- Security doc: public routes must never expose synthesis; extension auth is bearer-token plus extension identity.
- Viability doc: the product question is whether a smart friend can install, understand, trust, and use the product without Samay handholding.

Issue ledger:

| Issue | Builder | Skeptic | Judgment |
|---|---|---|---|
| Install trust | Private Chrome Web Store feels official and invite-only. | Google-account mismatch creates support pain. | Use Private with Google Group first, but build Unlisted fallback. |
| User friction | Invite page can make setup feel guided. | Too many checks can feel like enterprise setup. | Keep page to three main steps and show diagnostics only when useful. |
| Security | Separate Chrome install gate from Cold Start backend access. | More tokens and state increase implementation work. | Worth it. Chrome install access is not product entitlement. |
| Review risk | Narrow permissions reduce review and trust risk. | `activeTab` may not support all future features. | Ship narrow alpha. Add optional permissions later if measured need appears. |
| Samay support cost | Diagnostics and event state reduce handholding. | Admin surfaces can sprawl. | Build tiny operator surface only: create, revoke, status, diagnostics. |
| Speed to alpha | Unlisted or ZIP might be faster. | Faster path may teach the wrong thing. | ZIP does not count as alpha install success. Unlisted is fallback after review, not primary. |

Concessions:

- Private is not always smoother than Unlisted. The wrong-Google-account issue is real.
- The invite page must not overbuild account management.
- The extension cannot truthfully claim it knows the Chrome account email without OAuth.
- A technical ZIP fallback is useful for debugging, but not for validating user install readiness.

Best current call:

Proceed with Private Google Group-backed Chrome Web Store alpha plus Cold Start invite page. Build Unlisted as a policy-approved fallback, not a separate product path.

Fastest uncertainty-reducing move:

Submit a minimally complete Private alpha package and run one clean-profile install drill with a non-developer Google account before writing more onboarding UI.

## Open Decisions

1. What Google Group owns alpha install access?
2. Does the alpha invite token map to an email, or can it be anonymous but revocable?
3. What is the first sample company shown on the invite page?
4. What run cap should the first 5 testers get?
5. What is the support channel: text Samay, email, Slack, or form?
6. What exact privacy wording describes provider sharing for generation?

## Recommended Defaults

- Google Group: `cold-start-alpha-testers`.
- Invite token: email-bound, but do not require Google OAuth in v1.
- Sample company: one fresh AI infra company that reliably generates a good card.
- First cap: 10 basics runs and 5 investor lens runs per tester.
- Support channel: copy diagnostics plus direct email to Samay.
- Initial visibility: Private. Switch to Unlisted only if two or more testers hit Google-account friction before first run.
