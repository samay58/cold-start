# Cold Start Alpha Installation Paths

Cold Start should use a separate Chrome Web Store test item for the friend alpha, published as Private to trusted testers if the tester list is known, or Unlisted if invite forwarding is acceptable. Wrap that store item with a Cold Start invite page that explains what will happen, links to the Chrome Web Store listing, and hands the user straight into the first company profile run. This gives testers the normal Chrome install path, keeps review and privacy work aligned with the future launch path, and avoids the distrust and support drag of ZIP or self-hosted installs. Private and Unlisted Chrome Web Store builds still need the same listing, privacy, permission, and review discipline as any store item, so the alpha should treat installation as part of the product, not as a temporary ops shortcut. [1][2][3][4]

## Distribution Path Comparison

In short: the Chrome Web Store is the only normal-user path that is both allowed and low-friction. Everything else is either an enterprise path, a developer path, or a support fallback.

| Path | What it is | Allowed today | Normal-user friction | Reliability | Cold Start fit |
|---|---|---:|---:|---:|---|
| Chrome Web Store Public | The extension appears in search and can be installed by anyone. [5] | Yes. [5] | Low. The user clicks `Add to Chrome`, reviews permissions, and confirms. [6] | High. Chrome owns install and update. [6] | Too exposed for the first friend alpha. Use later when the installer, privacy page, support loop, and first-run experience are proven. |
| Chrome Web Store Unlisted | The item does not appear in search, but anyone with the URL can install it. [5] | Yes. [5] | Low. It feels like a normal Chrome install. [6] | High. Store install and update still work. [6] | Strong default if tester emails are uncertain or if Samay wants a single invite link. The tradeoff is that the link can be forwarded. |
| Chrome Web Store Private to trusted testers | Only specified trusted testers, or allowed domain users, can install. [1][5] | Yes. [1][5] | Medium. The user must be signed into the Google account that was added as a tester. [1] | High once access is correct. [6] | Best for a controlled 5 to 10 person alpha if tester Google accounts are known before launch. The main support issue will be account mismatch. |
| Chrome Web Store test build | A separate `BETA` or `TESTING` item can exist next to a production item, and it can be Private, Unlisted, or Public. [1] | Yes. [1] | Low to medium, depending on visibility. [1][6] | High. It uses the store path. [6] | Best architecture for Cold Start. Keep the alpha item clearly labeled as beta so it is not confused with the later public listing. [1] |
| Enterprise or domain publishing | An admin publishes or installs the extension for a managed organization. [5][7] | Yes for managed Chrome environments. [5][7] | Low for the end user if the admin controls Chrome. High if the tester is an individual. [7] | High inside managed companies. [7] | Not a friend-alpha path unless the alpha is inside one company domain. Useful later for firms that want admin-managed deployment. |
| Enterprise force install | Chrome policy silently installs or normally installs the extension, with `update_url` configured. [7] | Yes for managed browsers. [7] | Low for managed users. Not available to ordinary personal Chrome users. [7] | High when IT controls the machine. [7] | Not for the first alpha. Keep it as a future institutional lane. |
| Self-hosted CRX | The extension package is hosted outside the Chrome Web Store. [8][9] | Limited. Windows and macOS users can install self-hosted extensions only through enterprise policies; Linux users can manually install packed extensions. [8] | High for ordinary users. [8][9] | Medium inside enterprise, weak for individuals. [8][9] | Avoid for friend alpha. It creates security and trust problems before the user has seen value. |
| GitHub Releases ZIP | A ZIP or folder is downloaded, unpacked, and loaded through `chrome://extensions` with Developer mode. [5] | Yes for local testing. [5] | High. The user must unzip, enable Developer mode, and load the folder. [5] | Low for alpha users. No normal store update path. [5][8] | Emergency fallback only. It is fine for Samay or technical testers, but wrong for non-technical investors. |
| Guided installer app | A native Mac or Windows app tries to install or configure the extension. Chrome documents application-assisted extension enablement and enterprise registry or policy approaches, but normal extension install still flows through Chrome trust and permission surfaces. [6][7][9] | Possible in narrow cases, but not a clean consumer Chrome extension path. [6][7][9] | Medium to high. It adds an app install before the browser extension. [6][7] | Risky unless the audience already expects a desktop app. | Speculative. Do not build this for the first alpha. Borrow the idea of a guided checklist, not the native installer. |
| Landing-page-assisted store install | A custom invite page explains the product, routes to the Chrome Web Store, then helps the user confirm install and start a first run. Inline install is gone, so the page can guide but cannot skip the store confirmation. [10] | Yes, as long as it points to the store and does not mimic Chrome UI or mislead users. [4][10] | Low. It makes the store path feel personal and supported. [10][11] | High if paired with real diagnostics. [11][12] | Best Cold Start product surface. It turns install into a guided first-run loop without fighting Chrome. |

## Recommended Cold Start Alpha Flow

In short: make the invite page the front door, the Chrome Web Store the install authority, and the extension side panel the first success surface.

1. Samay sends a personal invite link. The page says this is a small alpha for a Chrome side-panel research tool, names the one job it does, and says it will read the active company website only when the user runs it. Chrome Web Store policy expects the listing and wider product experience to describe the product honestly, so the invite copy should match the store listing and the in-extension copy. [4][20]

2. The invite page checks the browser. If the user is not on desktop Chrome, it says the alpha is desktop Chrome first. Chrome Web Store Help describes extension installation through the desktop Chrome Web Store and says extensions cannot be added while browsing as a guest or in Incognito mode. [6]

3. The invite page asks for the tester's Google account email only if the build is Private. Private trusted tester access depends on the account listed in the developer dashboard, so the page should catch account mismatch before the tester reaches the store. [1]

4. The primary button opens the Chrome Web Store item in a new tab. Inline install no longer gives the site a one-click install prompt; Chrome redirects users to the store details page where they complete installation. [10]

5. The Chrome Web Store listing does its job before the user clicks `Add to Chrome`. It should show one plain screenshot of the side panel on a real company site, one screenshot of the public `/c/{slug}` artifact, a short permission explanation, and a privacy link. Chrome recommends using listing screenshots and video to begin onboarding, and it requires privacy fields and permission justifications. [3][19][20]

6. After install, the invite page stays open and shows a `Check installation` button. A web page can talk to an extension only if the extension declares that page in `externally_connectable`, so the invite origin should be deliberately allowlisted if Cold Start wants the page to verify install state. [12]

7. The extension opens a first-run panel. The Chrome Side Panel API supports persistent side-panel UI next to browsing and can be opened from a user gesture. That is exactly the product surface Cold Start wants: the first useful run should happen while the user is on a company website. [11]

8. The user is asked to open one suggested company website, or paste a company URL. The extension should recognize the active tab, show the domain it will research, and offer one clear button: `Build first profile`. The `activeTab` permission gives temporary access to the active tab when the user invokes the extension, which is a cleaner trust story than broad default access when it is enough for the first run. [13]

9. The side panel runs a cheap health check before the profile starts. It should verify extension identity, token status, backend reachability, public generation availability, and current tab domain recognition. Chrome's runtime and message-passing APIs support extension metadata and internal communication, so these checks can be first-class UI rather than hidden console clues. [14][15]

10. The user sees the first useful result in the panel, then a link to the saved public `/c/{slug}` page. That keeps the first payoff aligned with the product promise: extension as the workbench, public card as the artifact.

## First-Run Diagnostics

In short: diagnostics should answer one question for the tester: "Am I ready to run this on the company page in front of me?"

| Diagnostic | What the user sees | Why it matters | Source basis |
|---|---|---|---|
| Browser support | `Desktop Chrome detected` or `Open this in desktop Chrome` | Chrome extension install and use flow is built around desktop Chrome; guest and Incognito sessions have limits. | [6] |
| Store install detected | `Cold Start installed` | A landing page can verify this only through an explicitly allowlisted web-to-extension connection. | [12] |
| Extension ID | `Extension ID matches alpha build` | Private/test builds can differ from local builds and future production builds. Runtime APIs expose extension metadata for this kind of check. | [14] |
| API origin | `Connected to cold-start.semitechie.vc` or the current deployed origin | Testers should know whether they are pointed at production, staging, or localhost. Chrome policy also rewards clear, non-misleading behavior. | [4][14] |
| Auth token | `Alpha access accepted` or `Access token missing` | The product should fail before a paid generation starts, not halfway through a confusing run. This is a product requirement, not a Chrome rule. |
| Backend reachable | `Server reachable` with response time | A failed backend should look like a setup issue, not a bad research result. Message passing and fetch-based checks are normal extension patterns. | [15] |
| Profile generation enabled | `Profile generation available` | Cold Start can keep public generation disabled while allowing extension-authenticated generation. The diagnostic should expose the actual gate. |
| Current tab domain | `Ready on cartesia.ai` or `Open a company website` | Side-panel products live beside the current tab, so the user needs confidence that Cold Start sees the right page. | [11][13] |
| Permissions posture | `Runs only when you ask` if using `activeTab`, or a plain explanation if broader access is required | Users see permission warnings during install, and broad host permissions increase review scrutiny. [2][13] |
| Public artifact link | `Will save to /c/{slug}` after completion | This ties installation to the durable output the user can share. This is product-specific, so it should be validated in the Cold Start alpha. |

## Chrome Web Store Readiness Requirements

In short: Private and Unlisted are not loopholes. They are distribution choices inside the same review system.

- Register a Chrome Web Store developer account and pay the one-time registration fee before publishing any item. Use an email Samay will check, because Google recommends a publishing email that receives important extension alerts. [16]

- Prepare the extension ZIP with `manifest.json` at the root. Chrome says the manifest metadata cannot be edited in the dashboard after upload, so name, version, icons, and description should be checked before submission. [17]

- Upload the ZIP through the Developer Dashboard. The upload flow allows a valid package to become a dashboard item, then the developer fills Store Listing, Privacy, Distribution, and Test instructions. [18]

- Choose a test distribution. A Chrome Web Store test item can be named with `DEVELOPMENT BUILD` or `BETA`, described as beta testing, and listed Private, Unlisted, or Public. Chrome warns that unlabeled duplicate production/test items can be treated as repetitive content spam. [1]

- Fill the Privacy practices tab. Chrome says this tab is where the extension states its purpose and lists or justifies permissions. [3]

- Post a privacy policy if Cold Start handles user data. Chrome's policy says the privacy policy and in-product disclosures must explain how user data is collected, used, shared, and who receives it. [4]

- Keep data collection tied to the extension's single purpose. Chrome's user data FAQ says extensions must not request permissions they do not need for current functionality, and personal or sensitive data use must be clear to users and tied to the user-facing feature. [5]

- Expect review. Chrome says most reviews finish in a few days, but some take up to a few weeks; all item submissions and updates go through review, and broad host permissions or sensitive execution permissions can increase review time. [2]

- Build the store listing as onboarding. Chrome's image rules require a 128x128 icon, a small 440x280 promotional image, and at least one screenshot; screenshots should show the actual user experience. [19]

- Use `activeTab` if it supports the product. Chrome says `activeTab` grants temporary access to the current tab when the user invokes the extension and does not display a permission warning, while broad host permissions can increase review scrutiny. [2][13]

- Explain permissions in plain language. Loom's support material is a useful pattern: it acknowledges that browser permissions sound scary, names Chrome's content script concept in plain language, and explains why the product needs access. [21]

## Non-Store And Assisted-Install Ideas Worth Exploring

In short: use assisted install as packaging around the store path, not as a replacement for it.

- Build a Cold Start invite page that behaves like a setup console. It should show the three steps, then replace each step with a live status: browser OK, extension installed, backend connected. This borrows the extension-onboarding pattern of covering pre-install, install, post-install, and first real use as distinct moments. [22]

- Use a first-run welcome page or side-panel view after install. Practitioner guidance commonly treats the post-install welcome page and first interaction as separate moments, and Chrome's runtime lifecycle APIs support install/update events for extension lifecycle work. [14][22]

- Add a "pin the extension" step only if it matters. Loom and 1Password both document that users may need to use the puzzle icon and pin the extension to keep it visible. Cold Start should either avoid depending on the toolbar icon, or show that step in the invite page and support docs. [23][24]

- Create a visible support fallback: `Something stuck? Send this diagnostic block to Samay.` The block should include Chrome version, extension ID, API origin, current tab domain, backend check, token check, and last error. This is a product decision, and it is supported by the fact that Chrome exposes runtime metadata and message-passing primitives. [14][15]

- Keep a GitHub Releases ZIP for emergency technical support only. Google documents `Load unpacked` as a local testing path, but it requires Developer mode and folder selection, so it should not be the main invite flow. [5]

- Use CRX or self-hosting only for managed enterprise pilots. Chrome says Windows and macOS users can install self-hosted extensions only through enterprise policies, while Linux has more manual options. [8]

- Speculative: a small native helper app could guide a future institutional install, but it should not be part of the first friend alpha. The official Chrome paths for external install involve OS files, registry entries, or enterprise policies, which are more admin-like than consumer-like. [7][9]

- Test the real install and update path before inviting people. One practitioner note warns that unpacked development installs do not exercise the same permission and update behavior as a real install, and recommends a separate staging store build for tester-visible releases. [25]

## Risk Register

In short: the biggest risks are not technical publishing risks. They are trust, account mismatch, review delay, and a first run that fails silently.

| Risk | Why it matters | Mitigation |
|---|---|---|
| Review takes longer than planned | Chrome says review can take days or weeks, and new extensions plus risky permissions can take longer. [2] | Submit the alpha build early. Use deferred publishing if needed. Keep permissions narrow. [2][18] |
| Tester uses the wrong Google account | Private trusted tester access depends on the Google account listed in the dashboard. [1] | Collect tester Google emails up front. Show account mismatch help on the invite page. |
| Permissions scare testers | Users see permission prompts, and Chrome warns that broad permissions increase review scrutiny. [2][6] | Prefer `activeTab` where possible. Explain the exact reason for each permission in the listing, invite page, and first-run UI. [3][13][21] |
| Unlisted link spreads | Anyone with an Unlisted URL can install. [5] | Use Private for the first 5 to 10 testers if control matters. Use Unlisted only when link simplicity matters more. |
| Self-hosted or ZIP path feels sketchy | Windows and macOS self-hosted install is enterprise-only, and unpacked ZIP requires Developer mode. [5][8] | Keep non-store installs out of the primary alpha flow. |
| Landing page overpromises | Chrome policy applies to marketing materials and landing pages, not only the extension package. [4] | Keep invite, listing, privacy, and in-extension copy consistent. |
| Backend auth fails after install | The user may think the extension is broken if the token or API origin is wrong. | Make auth and backend checks visible before the first run. |
| User cannot find the extension | Extension icons can be hidden behind Chrome's puzzle icon. Loom and 1Password both document pinning help. [23][24] | Either make the side panel open from the invite flow, or include one pinning step with screenshots. |
| Billing distracts from install learning | Chrome has distribution and payment settings, but the alpha question is install-to-first-run, not monetization. [18] | Do not add Stripe, paid tiers, or payment copy to alpha install. Use manual invite caps and server-side run limits. |
| Store listing screenshots look generic | Chrome says screenshots should show actual experience and help users anticipate the extension. [19] | Use real Cold Start side-panel and public card screenshots, not abstract marketing images. |

## Implementation Checklist

In short: build the smallest polished path that lets 5 to 10 people install, trust, and run Cold Start without live handholding.

- Create a separate Chrome Web Store alpha item named `Cold Start BETA` or `Cold Start TESTING`, with the beta purpose stated in the description. [1]

- Decide Private versus Unlisted before submission. Private means known tester emails and tighter control; Unlisted means one easier invite URL with forwarding risk. [1][5]

- Prepare the production-like alpha extension package as a ZIP with `manifest.json` at the root, correct name, version, icons, and description. [17]

- Keep the permission set narrow. Prefer `activeTab`, `sidePanel`, `storage`, and exact backend host access where possible; avoid broad host permissions unless the first-run product truly needs them. [2][11][13]

- Write the Chrome Web Store listing as onboarding: one-sentence purpose, what data Cold Start reads, why each permission exists, one public-card screenshot, one extension side-panel screenshot, and a support contact. [3][19][20]

- Publish a privacy policy that says what Cold Start collects, how the active tab URL/domain is used, what gets sent to the backend, what providers may receive data, how generated cards are stored, and what is public versus extension-gated. [4][5]

- Add reviewer test instructions with a known company URL, a test token or alpha access path, expected first-run result, and a support email. Chrome's publish flow has a Test instructions tab for this kind of reviewer support. [18]

- Build `/alpha` or `/invite/cold-start-alpha` as the invite page. It should have a personalized header, one product promise, a Chrome compatibility check, a store install button, a post-install check, and one first-run company suggestion.

- Add `externally_connectable` only for the invite-page origin if the page needs to verify extension installation or receive status. Do not use broad web-page matches. [12]

- Add a first-run diagnostics panel inside the extension with status rows for browser, extension ID, API origin, auth, backend, generation enabled, current tab domain, and last error. [11][14][15]

- Add a support payload button that copies a small JSON block. Include no secrets. Include enough state for Samay to debug without a screen share.

- Run a pre-alpha install drill on at least three machines: Samay's main Chrome, a fresh Chrome profile, and one external tester's machine. Test both happy path and wrong-Google-account path. Chrome's own review and install behavior can differ from unpacked local development, so test the real path. [25]

- Keep billing out of the alpha path. Use manual tester approval and server-side run caps for cost control. The alpha should answer whether install and first value work before it answers pricing. [18]

## Five Decisions Before Build

In short: these five choices set the shape of the install-readiness spec.

1. Private or Unlisted for the first 5 to 10 testers. Pick Private if control and privacy matter most. Pick Unlisted if the link must be frictionless and tester emails are unknown. [1][5]

2. Separate alpha item or future production item. The better answer is a separate `BETA` or `TESTING` item so the alpha can move quickly without confusing the later public listing. [1]

3. Permission posture. Decide whether Cold Start can ship the alpha with `activeTab` and explicit user-triggered runs, or whether it needs broader host permissions. This affects trust, review time, and install conversion. [2][13]

4. Invite-page verification depth. Decide whether the invite page should merely link to the store, or whether it should use `externally_connectable` to verify install state and guide the first run. [12]

5. Alpha support model. Decide what support promise testers get: a live Slack/text line, a diagnostic-copy button, scheduled office hours, or a simple feedback form. The product should assume setup problems will happen and make them visible before a tester gives up.

---

## References

[1] Google Chrome for Developers. "Prepare to publish: set up distribution." Chrome Extensions, n.d. https://developer.chrome.com/docs/webstore/cws-dashboard-distribution. Accessed 2026-06-23. Confidence: High.

[2] Google Chrome for Developers. "Chrome Web Store review process." Chrome Extensions, n.d. https://developer.chrome.com/docs/webstore/review-process. Accessed 2026-06-23. Confidence: High.

[3] Google Chrome for Developers. "Fill out the privacy fields." Chrome Extensions, n.d. https://developer.chrome.com/docs/webstore/cws-dashboard-privacy. Accessed 2026-06-23. Confidence: High.

[4] Google Chrome for Developers. "Chrome Web Store Developer Program Policies." Chrome Extensions, n.d. https://developer.chrome.com/docs/webstore/program-policies/policies. Accessed 2026-06-23. Confidence: High.

[5] Google Chrome Enterprise and Education Help. "Create and publish custom Chrome apps & extensions." Google Help, n.d. https://support.google.com/chrome/a/answer/2714278. Accessed 2026-06-23. Confidence: High.

[6] Google Chrome Web Store Help. "Install and manage extensions." Google Help, n.d. https://support.google.com/chrome_webstore/answer/2664769. Accessed 2026-06-23. Confidence: High.

[7] Google Chrome Enterprise and Education Help. "Configure ExtensionSettings policy." Google Help, n.d. https://support.google.com/chrome/a/answer/9867568. Accessed 2026-06-23. Confidence: High.

[8] Google Chrome for Developers. "Distribute your extension." Chrome Extensions, n.d. https://developer.chrome.com/docs/extensions/how-to/distribute. Accessed 2026-06-23. Confidence: High.

[9] Google Chrome for Developers. "Use alternative installation methods." Chrome Extensions, n.d. https://developer.chrome.com/docs/extensions/how-to/distribute/install-extensions. Accessed 2026-06-23. Confidence: High.

[10] Google Chrome for Developers. "Inline-installation deprecation migration FAQ." Chrome Extensions, n.d. https://developer.chrome.com/docs/extensions/mv2/inline-faq. Accessed 2026-06-23. Confidence: High.

[11] Google Chrome for Developers. "chrome.sidePanel." Chrome Extensions API Reference, n.d. https://developer.chrome.com/docs/extensions/reference/api/sidePanel. Accessed 2026-06-23. Confidence: High.

[12] Google Chrome for Developers. "externally_connectable." Chrome Extensions Manifest Reference, n.d. https://developer.chrome.com/docs/extensions/reference/manifest/externally-connectable. Accessed 2026-06-23. Confidence: High.

[13] Google Chrome for Developers. "The activeTab permission." Chrome Extensions, n.d. https://developer.chrome.com/docs/extensions/develop/concepts/activeTab. Accessed 2026-06-23. Confidence: High.

[14] Google Chrome for Developers. "chrome.runtime." Chrome Extensions API Reference, n.d. https://developer.chrome.com/docs/extensions/reference/api/runtime. Accessed 2026-06-23. Confidence: High.

[15] Google Chrome for Developers. "Message passing." Chrome Extensions, n.d. https://developer.chrome.com/docs/extensions/develop/concepts/messaging. Accessed 2026-06-23. Confidence: High.

[16] Google Chrome for Developers. "Register your developer account." Chrome Extensions, n.d. https://developer.chrome.com/docs/webstore/register. Accessed 2026-06-23. Confidence: High.

[17] Google Chrome for Developers. "Prepare your extension." Chrome Extensions, n.d. https://developer.chrome.com/docs/webstore/prepare. Accessed 2026-06-23. Confidence: High.

[18] Google Chrome for Developers. "Publish in the Chrome Web Store." Chrome Extensions, n.d. https://developer.chrome.com/docs/webstore/publish. Accessed 2026-06-23. Confidence: High.

[19] Google Chrome for Developers. "Supplying Images." Chrome Extensions, n.d. https://developer.chrome.com/docs/webstore/images. Accessed 2026-06-23. Confidence: High.

[20] Google Chrome for Developers. "Best Practices." Chrome Extensions, n.d. https://developer.chrome.com/docs/webstore/best-practices. Accessed 2026-06-23. Confidence: High.

[21] Atlassian Support. "Loom Chrome extension permissions request." Loom, n.d. https://support.atlassian.com/loom/docs/loom-chrome-extension-permissions-request. Accessed 2026-06-23. Confidence: Medium.

[22] AdoptKit. "Chrome Extension Onboarding: Best Practices." AdoptKit, 2025. https://www.adoptkit.com/posts/chrome-extension-onboarding-best-practices. Accessed 2026-06-23. Confidence: Medium.

[23] Atlassian Support. "Install the Chrome Extension." Loom, n.d. https://support.atlassian.com/loom/docs/install-the-chrome-extension. Accessed 2026-06-23. Confidence: Medium.

[24] 1Password Support. "If you don't see the 1Password icon in your browser's toolbar." 1Password, n.d. https://support.1password.com/missing-browser-button/. Accessed 2026-06-23. Confidence: Medium.

[25] Gokul Kathirvel. "Testing 'install' and 'update' flows in chrome extensions." gokatz.me, n.d. https://gokatz.me/blog/test-install-update-flow-chrome-extensions/. Accessed 2026-06-23. Confidence: Medium.

---

*Captured: 2026-06-23*
