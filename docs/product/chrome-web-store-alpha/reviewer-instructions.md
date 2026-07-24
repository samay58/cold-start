# Reviewer instructions template

Complete the bracketed fields outside git before submission. Never commit the invitation fragment or connection credential.

## Release

- Extension version: `[VERSION]`
- Commit: `[FULL_COMMIT_SHA]`
- ZIP SHA256: `[SHA256]`
- API contract: `[CLIENT_CONTRACT]`
- Chrome Web Store item: `[ITEM_ID]`
- Review invitation expires: `[UTC_TIMESTAMP]`
- Reviewer allowance: 2 fresh profiles and 1 Investor Lens run
- Support contact: `semitechie.vc@gmail.com` (backup: `samay58@gmail.com`)

## Access

Invitation URL: `[HTTPS_INVITATION_URL_WITH_TOKEN_IN_FRAGMENT]`

The invitation is single-use, expires after review, and creates one revocable installation. It is intentionally low allowance. Send a new invitation through the private reviewer-notes field if the first one expires or is consumed.

## Review path

1. Use desktop Chrome 116 or later.
2. Open the invitation URL and read the public-card and data-use disclosure.
3. Install the Unlisted extension and complete the connection step.
4. Open `https://browserbase.com`.
5. Click the Cold Start toolbar icon. The side panel opens for the current company domain.
6. Create or open the sourced profile. A fresh profile may take about a minute. A cached profile opens without using an allowance.
7. Open Sources to inspect citations.
8. Run Investor Lens once. A filed Lens shows five compact categories; a withheld result explains why the evidence did not clear the bar.
9. Close and reopen the side panel. The profile remains available.
10. Open `https://cold-start.semitechie.vc/c/browserbase` to inspect the public fact card. It excludes tester identity, Investor Lens synthesis, and professional work emails.

## Expected permissions

The extension requests `sidePanel`, `activeTab`, `storage`, and access to one HTTPS Cold Start API origin. It does not request access to all websites or browsing history.

## Troubleshooting

- If the invitation is invalid, expired, or used, contact the support email for a replacement.
- If the toolbar icon is hidden, open Chrome's Extensions menu and pin Cold Start Alpha.
- If a run fails, retry once. Failed fresh runs should not consume the review allowance.
- Include the extension version and the last visible error code in support notes. Do not send credentials or copied research content.
