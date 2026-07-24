import type { Metadata } from "next";
import React from "react";

import { AlphaInviteClient } from "./AlphaInviteClient";
import { ALPHA_INVITE_SESSION_KEY } from "./alpha-invite";

export const metadata: Metadata = {
  title: "Friend alpha | Cold Start",
  description: "Install and connect the Cold Start friend alpha."
};

const fragmentCaptureScript = `
(() => {
  const raw = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
  const token = raw.startsWith("invite=") ? new URLSearchParams(raw).get("invite") : raw;
  if (token && /^[A-Za-z0-9_-]{22,256}$/.test(token)) {
    window.sessionStorage.setItem(${JSON.stringify(ALPHA_INVITE_SESSION_KEY)}, token);
  }
  if (window.location.hash) {
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  }
})();
`;

export default function AlphaInvitePage() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: fragmentCaptureScript }} />
      <AlphaInviteClient
        extensionId={process.env.CHROME_EXTENSION_ID?.trim() ?? ""}
        storeUrl={process.env.CHROME_WEB_STORE_URL?.trim() ?? "https://chromewebstore.google.com/"}
      />
    </>
  );
}
