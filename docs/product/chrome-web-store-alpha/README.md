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
- `assets/screenshot-company-profile-1280x800.png`: sourced company profile.
- `assets/screenshot-investor-lens-1280x800.png`: filed Investor Lens.
- `assets/screenshot-people-1280x800.png`: cited person dossier.
- `assets/promo-440x280.png`: small promotional tile.

Use Unlisted visibility and deferred publishing. Complete every bracketed field before submission. Keep invitation secrets, connection credentials, and Web Store credentials out of git.

## Generate assets

```bash
npm run qa:extension:store-assets -w @cold-start/extension
```

The command captures the real Baseten `read-full` Playwright fixture at 2x resolution, including its pinned person dossier, then lays those states into the three store screenshots. It also renders the small promo tile from the same At Umami, IBM Plex Sans, parchment, and seal system as the extension. The icon is copied from `apps/extension/public/icons/icon-128.png`. All submitted images are opaque PNG files at the exact dimensions in their names.

Current Chrome references:

- [Listing image requirements](https://developer.chrome.com/docs/webstore/cws-dashboard-listing/)
- [Chrome Web Store program policies](https://developer.chrome.com/docs/webstore/program-policies/)
- [Chrome Web Store user data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)
- [Side Panel API](https://developer.chrome.com/docs/extensions/reference/api/sidePanel)
