# Chrome Web Store alpha packet

Use this directory for the manual Unlisted Chrome Web Store submission. The ZIP remains a generated artifact under `dist/chrome-web-store/`; store copy and images stay tracked here.

## Package

```bash
npm run alpha:package
```

The command requires a clean checked commit, a version above `release-version.json`, and the exact reviewed production permission set. It builds twice under `--verify` and compares ZIP bytes without writing an artifact:

```bash
npm run alpha:package -- --verify
```

Normal packaging writes:

```text
dist/chrome-web-store/cold-start-chrome-<version>-<commit>.zip
dist/chrome-web-store/cold-start-chrome-<version>-<commit>.zip.sha256
```

Do not advance `lastAcceptedVersion` when a ZIP is built or uploaded. Advance it only after Chrome Web Store accepts that version.

## Submission packet

- `listing.md`: listing fields and final copy.
- `permission-justifications.md`: permission and host-access explanations.
- `data-use-and-limited-use.md`: dashboard declarations and Limited Use text.
- `reviewer-instructions.md`: review steps and invitation template.
- `release-compatibility-matrix.md`: release evidence and rollback window.
- `assets/icon-128.png`: store icon.
- `assets/screenshot-1280x800.png`: current light-theme product states.
- `assets/promo-440x280.png`: small promotional tile.

Use Unlisted visibility and deferred publishing. Complete every bracketed field before submission. Keep invitation secrets, connection credentials, and Web Store credentials out of git.

## Asset provenance

The icon is copied from `apps/extension/public/icons/icon-128.png`. The screenshot uses the final Playwright `ready`, `read-full`, and `dossier-pinned` light fixtures captured on July 24, 2026. The promo tile uses `apps/extension/public/art/cold-start-wave-panel.jpg` plus the At Umami and IBM Plex Sans brand faces. All output files have the exact dimensions in their names.

Current Chrome references:

- [Listing image requirements](https://developer.chrome.com/docs/webstore/cws-dashboard-listing/)
- [Chrome Web Store program policies](https://developer.chrome.com/docs/webstore/program-policies/)
- [Chrome Web Store user data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)
- [Side Panel API](https://developer.chrome.com/docs/extensions/reference/api/sidePanel)
