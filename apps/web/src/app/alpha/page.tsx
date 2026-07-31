import type { Metadata } from "next";
import React from "react";

import { AlphaInviteClient } from "./AlphaInviteClient";
import { fragmentCaptureScript } from "./fragment-capture";

export const metadata: Metadata = {
  title: "Cold Start",
  description: "Install and connect Cold Start."
};

export default function AlphaInvitePage() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: fragmentCaptureScript() }} />
      <AlphaInviteClient
        extensionId={process.env.CHROME_EXTENSION_ID?.trim() ?? ""}
        storeUrl={process.env.CHROME_WEB_STORE_URL?.trim() ?? "https://chromewebstore.google.com/"}
      />
    </>
  );
}
