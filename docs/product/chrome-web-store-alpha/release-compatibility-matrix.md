# Release compatibility matrix

Copy the template row for each submitted build. Keep the current and previous accepted release until the new build, API, and rollback path are proven together.

| Store version | Commit | ZIP SHA256 | Web Store status | Chrome range | Client contract | API contracts accepted | API origin | Install warning observed | Fresh-profile rehearsal | Rollback artifact |
|---|---|---|---|---|---|---|---|---|---|---|
| `[VERSION]` | `[SHA]` | `[SHA256]` | Draft | 116+ | `[CONTRACT]` | `[CURRENT, PREVIOUS]` | `https://cold-start-samay58s-projects.vercel.app` | `[EXACT CHROME COPY]` | `[DATE / RESULT]` | `[VERSION / SHA256]` |

## Release proof

- Package command ran from a clean checked commit.
- Extension version is above `release-version.json`.
- Package and emitted manifest versions match.
- Manifest and host permissions match the reviewed allowlist.
- ZIP contains no maps, `.DS_Store`, settings, fixtures, environment files, or detected credentials.
- ZIP checksum matches the uploaded file.
- Chrome 116 is the functional floor because `chrome.sidePanel.open()` is used.
- Alpha access is additive to the existing synthesis-withheld contract. The current installed build and the alpha build both complete bootstrap, cached read, fresh profile, running Lens, filed or withheld Lens, retry, and watchdog recovery against the same contract.
- Exact installation warning is recorded.
- Fresh-profile review path passes from invitation through reopen.
- Previous accepted ZIP and API rollback remain available.

Do not mark a row accepted until the Chrome Web Store has accepted that version. Then update `release-version.json` in a separate reviewed commit.
