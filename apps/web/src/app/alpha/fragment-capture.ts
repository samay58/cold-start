import { INVITE_TOKEN_PATTERN } from "@cold-start/core";

import { ALPHA_INVITE_SESSION_KEY } from "./alpha-invite";

// Inline <script> for the invite pages: captures the invitation token from the URL
// fragment into sessionStorage before React hydrates, then scrubs the fragment from
// the address bar. Shared by /alpha and /i/[slug] so the two pages cannot drift.
// The script must stay self-contained (it runs before any bundle), so the token
// pattern is interpolated into its source.
export function fragmentCaptureScript(): string {
  return `
(() => {
  const raw = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
  const token = raw.startsWith("invite=") ? new URLSearchParams(raw).get("invite") : raw;
  if (token && /${INVITE_TOKEN_PATTERN.source.replace(/\//g, "\\/")}/.test(token)) {
    window.sessionStorage.setItem(${JSON.stringify(ALPHA_INVITE_SESSION_KEY)}, token);
  }
  if (window.location.hash) {
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  }
})();
`;
}
