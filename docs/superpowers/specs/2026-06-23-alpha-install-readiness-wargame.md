# Alpha Install Readiness Wargame

**Question**: Should Cold Start build the friend alpha around a Private Chrome Web Store item plus invite page, or choose a simpler Unlisted or ZIP-based path?
**Date**: 2026-06-23
**Scope**: Friend-alpha install, onboarding, access, diagnostics, and first run. Billing, public launch, and enterprise deployment are out of scope.

## Source Packet

- `docs/product/research/alpha-installation-paths-2026-06-23.md`: official Chrome research and practitioner install patterns.
- `/Users/samaydhawan/.codex/attachments/90fecb7d-5844-41c1-9b9a-10bb58ee47ac/pasted-text.txt`: web-AI research comparing Private, Unlisted, ZIP, CRX, enterprise, and assisted install paths.
- `apps/extension/manifest.config.ts`: current extension manifest uses `sidePanel`, `activeTab`, `storage`, and explicit backend host permissions.
- `SECURITY.md`: public routes must never expose synthesis; extension auth depends on extension identity plus bearer token.
- `docs/product/viability-directions-2026-06-23.md`: the current product question is whether a smart friend can install, understand, trust, and use Cold Start without Samay handholding.

## Issue Ledger

1. Install trust
2. Tester friction
3. Security and entitlement clarity
4. Review and permission risk
5. Samay support cost
6. Speed to alpha

## Round 1

### Install Trust

Builder claim: Chrome Web Store Private gives the alpha the official Chrome trust surface while keeping the build invite-only.

Skeptic counter: Private introduces Google-account mismatch, which can make a tester feel blocked before they ever see the product.

Current state: Private wins on trust, but only if the invite page explicitly handles wrong-account failure.

### Tester Friction

Builder claim: A custom invite page can make Private feel guided: install, connect, open company, run first profile.

Skeptic counter: Too many checks can make a friend alpha feel like enterprise setup.

Current state: The invite page should show three main steps. Diagnostics should appear as status rows and support payload, not as a long wizard.

### Security And Entitlement Clarity

Builder claim: Separate the Chrome install gate from the Cold Start backend access gate. Chrome controls install; Cold Start controls generation and investor-lens access.

Skeptic counter: Two gates mean more state, more tokens, and more implementation work.

Current state: Two gates are necessary. Chrome Web Store Private is not a product auth system.

## Round 2

### Review And Permission Risk

Builder claim: The current manifest already follows a narrow-permission posture with `sidePanel`, `activeTab`, and `storage`.

Skeptic counter: Future always-on detection could require broader host access, so the alpha may be underpowered.

Current state: Ship narrow alpha. Request broader or optional permissions only after measured need.

### Samay Support Cost

Builder claim: Diagnostics and event tracking reduce one-off handholding.

Skeptic counter: An admin surface can become a full product before the alpha earns it.

Current state: Build only create invite, revoke invite, status, last diagnostic, and reset token. No broad admin app.

### Speed To Alpha

Builder claim: Private Chrome Web Store plus invite page validates the real install path.

Skeptic counter: Unlisted or ZIP could start faster.

Current state: ZIP does not count as alpha install validation. Unlisted is a valid fallback after Chrome review, especially if Private account friction is high.

## Concessions

- Private is not always smoother than Unlisted.
- Wrong Google account is the most likely human setup failure.
- The invite page must not claim it can verify Chrome account identity unless Cold Start adds Google OAuth.
- ZIP is useful for technical debugging, but it should not be sent to normal friend-alpha testers.
- The support surface must stay small or it will delay the actual alpha.

## Unresolved Questions

- What Google Group should own the Private listing?
- Should alpha invites be email-bound or token-only?
- Which company should be the first sample run?
- What is the initial run cap for basics and investor lens?
- What support channel should testers use?

## Judge Summary

The Private Chrome Web Store plus invite page path is the right primary build. It tests the real user path, protects trust, and avoids teaching the wrong lesson through sideloading. The risk is Google-account friction, so the spec needs a ready Unlisted fallback and very clear wrong-account copy.

## Best Current Call

Proceed with a Private Google Group-backed Chrome Web Store alpha item, a Cold Start invite page, a separate backend entitlement gate, narrow extension permissions, first-run diagnostics, and a tiny operator surface.

## Fastest Uncertainty-Reducing Move

Submit a minimally complete Private alpha package and run one clean-profile install drill with a non-developer Google account before building more onboarding surface area.
