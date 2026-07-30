import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  invitationLinkForClipboard,
  JourneyPanel,
  writeInvitationLink,
  type ViewState
} from "../src/app/alpha/AlphaInviteClient";
import AlphaInvitePage from "../src/app/alpha/page";
import {
  browserSupportFromUserAgent,
  inviteTokenFromHash
} from "../src/app/alpha/alpha-invite";

describe("alpha invitation page", () => {
  it("captures either supported fragment form without accepting malformed secrets", () => {
    const token = "a".repeat(32);
    expect(inviteTokenFromHash(`#${token}`)).toBe(token);
    expect(inviteTokenFromHash(`#invite=${token}`)).toBe(token);
    expect(inviteTokenFromHash("#invite=raw token")).toBeNull();
    expect(inviteTokenFromHash("#short")).toBeNull();
  });

  it("requires desktop Chrome 116 or newer", () => {
    expect(browserSupportFromUserAgent(
      "Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/116.0.0.0 Safari/537.36"
    )).toEqual({ supported: true, browser: "chrome", chromeMajor: 116 });
    expect(browserSupportFromUserAgent(
      "Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/115.0.0.0 Safari/537.36"
    )).toEqual({ supported: false, reason: "version" });
    expect(browserSupportFromUserAgent(
      "Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Edg/126.0 Chrome/126.0 Safari/537.36"
    )).toEqual({ supported: false, reason: "browser" });
    expect(browserSupportFromUserAgent(
      "Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 CriOS/126.0 Mobile"
    )).toEqual({ supported: false, reason: "mobile" });
  });

  it("accepts desktop Firefox 140 or newer, matching the extension's strict_min_version", () => {
    expect(browserSupportFromUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:140.0) Gecko/20100101 Firefox/140.0"
    )).toEqual({ supported: true, browser: "firefox", firefoxMajor: 140 });
    expect(browserSupportFromUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:139.0) Gecko/20100101 Firefox/139.0"
    )).toEqual({ supported: false, reason: "version" });
    expect(browserSupportFromUserAgent(
      "Mozilla/5.0 (Android 15; Mobile; rv:140.0) Gecko/140.0 Firefox/140.0"
    )).toEqual({ supported: false, reason: "mobile" });
  });

  it("walks Firefox testers through install and panel-side connection", () => {
    const html = renderJourney({
      code: "firefox_connect",
      inviteAllowance: { profile: 12, lens: 6 }
    });

    expect(html).toContain("/firefox/cold-start.xpi");
    expect(html).toContain("Paste");
    expect(html).toContain("invitation link");
    expect(html).toContain("sidebar");
    expect(html).toContain("Copy invitation link");
    expect(html).toContain("Download Cold Start");
    expect((html.match(/<li>/g) ?? []).length).toBe(3);
  });

  it("rebuilds the scrubbed invitation link without putting the token in the query", () => {
    const token = "a".repeat(32);
    const link = invitationLinkForClipboard("https://cold-start.example", token);

    expect(link).toBe(`https://cold-start.example/alpha#invite=${token}`);
    expect(new URL(link).search).toBe("");
  });

  it("falls back to a selectable link when clipboard writing fails", async () => {
    const link = "https://cold-start.example/alpha#invite=secret";
    const writeText = vi.fn(async () => {
      throw new Error("clipboard denied");
    });

    await expect(writeInvitationLink(writeText, link)).resolves.toBe("failed");
    const html = renderJourney(
      { code: "firefox_connect" },
      { inviteCopyStatus: "failed", manualInviteLink: link }
    );
    expect(html).toContain("Try copy again");
    expect(html).toContain('aria-label="Invitation link"');
    expect(html).toContain("#invite=secret");
  });

  it("scrubs the fragment before hydration and keeps it only in session storage", () => {
    const html = renderToStaticMarkup(<AlphaInvitePage />);

    expect(html).toContain("window.sessionStorage.setItem");
    expect(html).toContain("window.history.replaceState");
    expect(html).not.toContain("localStorage.setItem");
  });

  it("renders every required disclosure before the affirmative action", () => {
    const html = renderJourney({
      code: "disclosure",
      inviteAllowance: { profile: 12, lens: 6 }
    });

    expect(html).toContain("reads the current company domain only when you invoke it");
    expect(html).toContain("public sourced fact card");
    expect(html).toContain("never identify who requested them");
    expect(html).toContain("named product interactions tied to this invitation");
    expect(html).toContain("kept for up to 30 days");
    expect(html).toContain("12 fresh profiles and 6 Investor Lens runs");
    expect(html).toContain("I understand, continue");
    expect(html).not.toContain("bearer");
    expect(html).not.toContain("API origin");
    expect(html).not.toContain("extension ID");
  });

  it.each([
    "access_disabled",
    "connection_lost",
    "expired",
    "generation_disabled",
    "installation_limit",
    "invalid_invite",
    "lens_exhausted",
    "offline",
    "old_supported",
    "profile_exhausted",
    "revoked",
    "unknown",
    "unsupported_browser",
    "unsupported_version",
    "update_required",
    "used"
  ] satisfies ViewState["code"][])("gives %s one recovery action", (code) => {
    const html = renderJourney({ code });
    const actions = (html.match(/class="[^"]*primaryAction[^"]*"/g) ?? []).length;

    expect(actions).toBe(1);
  });
});

function renderJourney(
  view: ViewState,
  copy: { inviteCopyStatus: "idle" | "copied" | "failed"; manualInviteLink: string | null } = {
    inviteCopyStatus: "idle",
    manualInviteLink: null
  }
) {
  return renderToStaticMarkup(
    <JourneyPanel
      view={view}
      storeUrl="https://chromewebstore.google.com/detail/cold-start/example"
      inviteCopyStatus={copy.inviteCopyStatus}
      manualInviteLink={copy.manualInviteLink}
      onConnect={vi.fn()}
      onContinue={vi.fn()}
      onCopyInvite={vi.fn()}
      onStoreClick={vi.fn()}
      onRetry={vi.fn()}
    />
  );
}
