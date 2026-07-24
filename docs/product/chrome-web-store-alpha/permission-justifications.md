# Permission justifications

The production package must contain only these permissions. `npm run alpha:package` fails if the emitted manifest differs.

| Permission | Justification |
|---|---|
| `sidePanel` | Hosts Cold Start's only product interface beside the company website. |
| `activeTab` | Reads the current tab URL after the user clicks the toolbar action. Cold Start derives the company domain from that URL. It does not read page content. |
| `storage` | Stores the revocable connection credential, theme preference, current company context, bounded analytics queue, and bounded local card cache. |
| `https://cold-start-samay58s-projects.vercel.app/*` | Sends authenticated card, generation, and status requests to the single Cold Start API origin. No wildcard, localhost, or unrelated host access is packaged. |
| `externally_connectable` (`matches: ["https://cold-start.semitechie.vc/*"]`) | Lets only the production `/alpha` invitation page message the extension, to hand off the invitation token and installation credential after consent. Chrome enforces the origin match at the manifest level; the background listener (`chrome.runtime.onMessageExternal`) independently re-checks the sender URL before accepting a message. No other origin, including the Vercel API origin, is trusted for this channel. |

Cold Start does not request `tabs`, `history`, `<all_urls>`, content-script access, clipboard access, downloads, notifications, or remote-code permissions.

## Review checks

- Confirm the package manifest matches the table.
- Confirm no optional permissions or optional host permissions are present.
- Confirm Chrome shows no all-sites warning.
- Record the exact installation warning in the release compatibility matrix.
- Confirm the package has no `favicon` permission. Source clippings degrade to text when no cached icon is available.
