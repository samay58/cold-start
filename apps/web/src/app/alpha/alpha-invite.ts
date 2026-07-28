export const ALPHA_INVITE_SESSION_KEY = "coldStartAlphaInvite";
export const ALPHA_CONSENT_SESSION_KEY = "coldStartAlphaConsent";
export const ALPHA_STORE_VISITED_SESSION_KEY = "coldStartAlphaStoreVisited";

const INVITE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{22,256}$/;

export type BrowserSupport =
  | { supported: true; browser: "chrome"; chromeMajor: number }
  | { supported: true; browser: "firefox"; firefoxMajor: number }
  | { supported: false; reason: "browser" | "mobile" | "version" };

export function inviteTokenFromHash(hash: string): string | null {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  const candidate = raw.startsWith("invite=")
    ? new URLSearchParams(raw).get("invite")
    : raw;
  return candidate && INVITE_TOKEN_PATTERN.test(candidate) ? candidate : null;
}

export function browserSupportFromUserAgent(userAgent: string): BrowserSupport {
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(userAgent)) {
    return { supported: false, reason: "mobile" };
  }
  if (/Edg\//.test(userAgent) || /OPR\//.test(userAgent)) {
    return { supported: false, reason: "browser" };
  }

  // Firefox 140 matches the extension's strict_min_version: the floor where the
  // built-in data-consent UI exists. Firefox testers connect inside the sidebar
  // panel (no page-to-extension messaging on Firefox), so the page only routes
  // them to instructions.
  const firefoxMatch = userAgent.match(/Firefox\/(\d+)/);
  if (firefoxMatch) {
    const firefoxMajor = Number(firefoxMatch[1]);
    return firefoxMajor >= 140
      ? { supported: true, browser: "firefox", firefoxMajor }
      : { supported: false, reason: "version" };
  }

  const match = userAgent.match(/Chrome\/(\d+)/);
  if (!match) {
    return { supported: false, reason: "browser" };
  }
  const chromeMajor = Number(match[1]);
  return chromeMajor >= 116
    ? { supported: true, browser: "chrome", chromeMajor }
    : { supported: false, reason: "version" };
}

export function retainedInviteToken(storage: Pick<Storage, "getItem">) {
  const candidate = storage.getItem(ALPHA_INVITE_SESSION_KEY);
  return candidate && INVITE_TOKEN_PATTERN.test(candidate) ? candidate : null;
}
