"use client";

import React, { useEffect, useState } from "react";

import styles from "./alpha.module.css";
import {
  ALPHA_CONSENT_SESSION_KEY,
  ALPHA_INVITE_SESSION_KEY,
  ALPHA_STORE_VISITED_SESSION_KEY,
  browserSupportFromUserAgent,
  retainedInviteToken
} from "./alpha-invite";

const SUPPORT_HREF = "mailto:semitechie.vc@gmail.com?cc=samay58@gmail.com&subject=Cold%20Start%20alpha%20help";

type Allowance = {
  profile: { limit: number; remaining: number };
  lens: { limit: number; remaining: number };
};

type ExtensionResponse =
  | {
      ok: true;
      state: "connected" | "not_connected";
      extensionVersion: string;
      installationSuffix?: string;
      compatibility?: "current" | "old_supported";
      generationEnabled?: boolean;
      allowance?: Allowance;
    }
  | {
      ok: false;
      code: ViewCode;
      extensionVersion: string;
    };

type InviteInspection =
  | {
      ok: true;
      state: "ready";
      allowance: { profile: number; lens: number };
    }
  | {
      ok: false;
      code: ViewCode;
    };

type ViewCode =
  | "access_disabled"
  | "checking"
  | "connection_lost"
  | "connecting"
  | "disclosure"
  | "expired"
  | "firefox_connect"
  | "generation_disabled"
  | "installation_limit"
  | "invalid_invite"
  | "lens_exhausted"
  | "not_installed"
  | "offline"
  | "old_supported"
  | "profile_exhausted"
  | "ready"
  | "ready_to_connect"
  | "revoked"
  | "unknown"
  | "unsupported_browser"
  | "unsupported_version"
  | "update_required"
  | "used";

export type ViewState = {
  code: ViewCode;
  allowance?: Allowance;
  inviteAllowance?: { profile: number; lens: number };
};

type AlphaInviteClientProps = {
  extensionId: string;
  storeUrl: string;
};

function extensionMessage(extensionId: string, message: unknown): Promise<ExtensionResponse | null> {
  const runtime = typeof chrome === "undefined" ? undefined : chrome.runtime;
  if (!extensionId || !runtime?.sendMessage) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    runtime.sendMessage(extensionId, message, (unknownResponse) => {
      if (runtime.lastError || !unknownResponse || typeof unknownResponse !== "object") {
        resolve(null);
        return;
      }
      resolve(unknownResponse as ExtensionResponse);
    });
  });
}

async function inspectInvite(inviteToken: string): Promise<InviteInspection> {
  try {
    const response = await fetch("/api/alpha/invite/inspect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inviteToken })
    });
    const body = await response.json().catch(() => null);
    if (body && typeof body === "object" && "ok" in body) {
      return body as InviteInspection;
    }
  } catch {
    return { ok: false, code: navigator.onLine ? "unknown" : "offline" };
  }
  return { ok: false, code: "unknown" };
}

function connectedView(response: Extract<ExtensionResponse, { ok: true }>): ViewState {
  if (response.compatibility === "old_supported") {
    return { code: "old_supported", ...(response.allowance ? { allowance: response.allowance } : {}) };
  }
  if (response.generationEnabled === false) {
    return { code: "generation_disabled", ...(response.allowance ? { allowance: response.allowance } : {}) };
  }
  if (response.allowance?.profile.remaining === 0) {
    return { code: "profile_exhausted", allowance: response.allowance };
  }
  if (response.allowance?.lens.remaining === 0) {
    return { code: "lens_exhausted", allowance: response.allowance };
  }
  return { code: "ready", ...(response.allowance ? { allowance: response.allowance } : {}) };
}

export function invitationLinkForClipboard(origin: string, inviteToken: string) {
  return new URL(`/alpha#invite=${inviteToken}`, origin).toString();
}

export async function writeInvitationLink(
  writeText: ((value: string) => Promise<void>) | undefined,
  inviteLink: string
): Promise<"copied" | "failed"> {
  if (!writeText) {
    return "failed";
  }
  try {
    await writeText(inviteLink);
    return "copied";
  } catch {
    return "failed";
  }
}

export function AlphaInviteClient({ extensionId, storeUrl }: AlphaInviteClientProps) {
  const [view, setView] = useState<ViewState>({ code: "checking" });
  const [inviteCopy, setInviteCopy] = useState<{
    status: "idle" | "copied" | "failed";
    link: string | null;
  }>({ status: "idle", link: null });

  useEffect(() => {
    let active = true;

    const refresh = async () => {
      if (!navigator.onLine) {
        if (active) setView({ code: "offline" });
        return;
      }
      const browserSupport = browserSupportFromUserAgent(navigator.userAgent);
      if (!browserSupport.supported) {
        if (active) {
          setView({
            code: browserSupport.reason === "version" ? "unsupported_version" : "unsupported_browser"
          });
        }
        return;
      }

      // Firefox has no page-to-extension messaging (Bugzilla 1319168), so the page
      // cannot detect or connect the installation. It inspects the invitation,
      // gathers the same disclosure consent, then hands off to the sidebar panel,
      // which redeems the pasted invitation link itself.
      if (browserSupport.browser === "firefox") {
        const firefoxInvite = retainedInviteToken(window.sessionStorage);
        if (!firefoxInvite) {
          if (active) setView({ code: "invalid_invite" });
          return;
        }
        const firefoxInspection = await inspectInvite(firefoxInvite);
        if (!firefoxInspection.ok) {
          if (active) setView({ code: firefoxInspection.code });
          return;
        }
        const firefoxConsented = window.sessionStorage.getItem(ALPHA_CONSENT_SESSION_KEY) === "yes";
        if (active) {
          setView(
            firefoxConsented
              ? { code: "firefox_connect", inviteAllowance: firefoxInspection.allowance }
              : { code: "disclosure", inviteAllowance: firefoxInspection.allowance }
          );
        }
        return;
      }

      const status = await extensionMessage(extensionId, {
        type: "cold-start.alpha.status",
        version: 1
      });
      if (status?.ok && status.state === "connected") {
        if (active) setView(connectedView(status));
        return;
      }
      if (status && !status.ok && ["access_disabled", "offline", "update_required"].includes(status.code)) {
        if (active) setView({ code: status.code });
        return;
      }

      const inviteToken = retainedInviteToken(window.sessionStorage);
      if (!inviteToken) {
        if (active) setView({ code: status ? "connection_lost" : "invalid_invite" });
        return;
      }
      const inspection = await inspectInvite(inviteToken);
      if (!inspection.ok) {
        if (active) {
          setView({
            code: inspection.code === "used" && status ? "connection_lost" : inspection.code
          });
        }
        return;
      }

      const consented = window.sessionStorage.getItem(ALPHA_CONSENT_SESSION_KEY) === "yes";
      if (!consented) {
        if (active) setView({ code: "disclosure", inviteAllowance: inspection.allowance });
        return;
      }
      if (!status) {
        if (active) setView({ code: "not_installed", inviteAllowance: inspection.allowance });
        return;
      }
      if (active) setView({ code: "ready_to_connect", inviteAllowance: inspection.allowance });
    };

    void refresh();
    const handleOnline = () => void refresh();
    const handleFocus = () => void refresh();
    window.addEventListener("online", handleOnline);
    window.addEventListener("focus", handleFocus);
    return () => {
      active = false;
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("focus", handleFocus);
    };
  }, [extensionId]);

  const continueAfterDisclosure = () => {
    window.sessionStorage.setItem(ALPHA_CONSENT_SESSION_KEY, "yes");
    setView({ code: "checking" });
    window.dispatchEvent(new Event("focus"));
  };

  const connect = async () => {
    const inviteToken = retainedInviteToken(window.sessionStorage);
    if (!inviteToken) {
      setView({ code: "invalid_invite" });
      return;
    }

    setView({ code: "connecting" });
    const response = await extensionMessage(extensionId, {
      type: "cold-start.alpha.connect",
      version: 1,
      inviteToken,
      consent: true,
      storeVisited: window.sessionStorage.getItem(ALPHA_STORE_VISITED_SESSION_KEY) === "yes",
      reducedMotion: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
      theme:
        document.documentElement.dataset.theme === "dark" ||
        window.matchMedia?.("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
    });
    if (!response) {
      setView({ code: navigator.onLine ? "not_installed" : "offline" });
      return;
    }
    if (!response.ok) {
      setView({ code: response.code });
      return;
    }

    window.sessionStorage.removeItem(ALPHA_INVITE_SESSION_KEY);
    window.sessionStorage.removeItem(ALPHA_CONSENT_SESSION_KEY);
    window.sessionStorage.removeItem(ALPHA_STORE_VISITED_SESSION_KEY);
    setView(connectedView(response));
  };

  const copyInvitationLink = async () => {
    const inviteToken = retainedInviteToken(window.sessionStorage);
    if (!inviteToken) {
      setInviteCopy({ status: "failed", link: null });
      return;
    }
    const link = invitationLinkForClipboard(window.location.origin, inviteToken);
    const writeText = navigator.clipboard?.writeText?.bind(navigator.clipboard);
    const status = await writeInvitationLink(writeText, link);
    setInviteCopy({ status, link });
  };

  return (
    <main className={styles.shell} id="main-content">
      <article className={styles.card} aria-live="polite">
        <header className={styles.header}>
          <a className={styles.brand} href="/" aria-label="Cold Start home">
            <span className={styles.aperture} aria-hidden="true" />
            <span>Cold Start</span>
          </a>
          <span className={styles.filing}>Private release</span>
        </header>

        <div className={styles.body}>
          <section className={styles.intro}>
            <div className={styles.seal} aria-hidden="true">CS</div>
            <p className={styles.eyebrow}>Private field test</p>
            <h1>Company context, when you need it.</h1>
            <p className={styles.lede}>
              Cold Start opens beside a company website and builds a sourced profile in about a minute.
            </p>
          </section>

          <JourneyPanel
            view={view}
            storeUrl={storeUrl}
            onConnect={() => void connect()}
            onContinue={continueAfterDisclosure}
            onCopyInvite={() => void copyInvitationLink()}
            onStoreClick={() => window.sessionStorage.setItem(ALPHA_STORE_VISITED_SESSION_KEY, "yes")}
            onRetry={() => window.location.reload()}
            inviteCopyStatus={inviteCopy.status}
            manualInviteLink={inviteCopy.link}
          />
        </div>

        <footer className={styles.footer}>
          <span>Built for a small group of early readers.</span>
          <a href={SUPPORT_HREF}>Ask Samay for help</a>
        </footer>
      </article>
    </main>
  );
}

type JourneyPanelProps = {
  view: ViewState;
  storeUrl: string;
  inviteCopyStatus: "idle" | "copied" | "failed";
  manualInviteLink: string | null;
  onConnect: () => void;
  onContinue: () => void;
  onCopyInvite: () => void;
  onStoreClick: () => void;
  onRetry: () => void;
};

export function JourneyPanel({
  view,
  storeUrl,
  inviteCopyStatus,
  manualInviteLink,
  onConnect,
  onContinue,
  onCopyInvite,
  onStoreClick,
  onRetry
}: JourneyPanelProps) {
  if (view.code === "checking" || view.code === "connecting") {
    return (
      <section className={styles.panel}>
        <p className={styles.stateLabel}>{view.code === "connecting" ? "Connecting" : "Checking invitation"}</p>
        <h2>{view.code === "connecting" ? "Setting up Cold Start" : "One moment"}</h2>
        <p>The page is checking the invitation and your browser.</p>
        <span className={styles.progress} aria-hidden="true" />
      </section>
    );
  }

  if (view.code === "disclosure") {
    const profileLimit = view.inviteAllowance?.profile ?? 12;
    const lensLimit = view.inviteAllowance?.lens ?? 6;
    return (
      <section className={styles.panel}>
        <p className={styles.stateLabel}>Before you continue</p>
        <h2>A small, observable alpha</h2>
        <ul className={styles.disclosures}>
          <li>Cold Start reads the current company domain only when you invoke it.</li>
          <li>Generating creates or updates a public sourced fact card.</li>
          <li>Public cards show facts and sources. They never identify who requested them.</li>
          <li>The alpha records named product interactions tied to this invitation for reliability and product improvement. It does not record page content, searches, or general browsing.</li>
          <li>Raw usage events are kept for up to 30 days. You can ask us to delete invitation-linked events at any time. De-identified operational totals may remain.</li>
          <li>This invitation includes {profileLimit} fresh profiles and {lensLimit} Investor Lens runs. Opening existing work is free.</li>
        </ul>
        <button className={styles.primaryAction} type="button" onClick={onContinue}>
          I understand, continue
        </button>
      </section>
    );
  }

  if (view.code === "firefox_connect") {
    return (
      <section className={styles.panel}>
        <p className={styles.stateLabel}>Firefox setup</p>
        <h2>Install, then connect in the sidebar</h2>
        <ul className={styles.disclosures}>
          <li>Copy this invitation link, then download Cold Start.</li>
          <li>Open any company site and click the Cold Start toolbar button to open the sidebar.</li>
          <li>Paste the link in the sidebar and choose Connect.</li>
        </ul>
        <div className={styles.firefoxActions}>
          <button className={styles.primaryAction} type="button" onClick={onCopyInvite}>
            {inviteCopyStatus === "copied"
              ? "Invitation link copied"
              : inviteCopyStatus === "failed"
                ? "Try copy again"
                : "Copy invitation link"}
          </button>
          <a className={styles.secondaryAction} href="/firefox/cold-start.xpi">
            Download Cold Start
          </a>
        </div>
        {inviteCopyStatus === "failed" && manualInviteLink ? (
          <label className={styles.manualInviteLink}>
            <span>Copy this link</span>
            <input
              aria-label="Invitation link"
              onFocus={(event) => event.currentTarget.select()}
              readOnly
              value={manualInviteLink}
            />
          </label>
        ) : null}
      </section>
    );
  }

  if (view.code === "not_installed") {
    return (
      <StatePanel
        label="Step one"
        title="Install Cold Start"
        copy="Chrome will handle the install. Return to this page afterward and the connection step will be waiting."
        action={<a className={styles.primaryAction} href={storeUrl} onClick={onStoreClick} target="_blank" rel="noreferrer">Open Chrome Web Store</a>}
      />
    );
  }

  if (view.code === "ready_to_connect") {
    return (
      <StatePanel
        label="Step two"
        title="Connect this installation"
        copy="One click connects the extension to this invitation. The connection stays in Chrome and can be revoked."
        action={<button className={styles.primaryAction} type="button" onClick={onConnect}>Connect Cold Start</button>}
      />
    );
  }

  if (view.code === "ready") {
    return (
      <StatePanel
        label="Filed"
        title="Cold Start is ready"
        copy={allowanceCopy(view.allowance)}
        action={<a className={styles.primaryAction} href="https://linear.app" target="_blank" rel="noreferrer">Try Linear</a>}
      />
    );
  }

  const state = stateCopy(view.code, storeUrl);
  return (
    <StatePanel
      label={state.label}
      title={state.title}
      copy={state.copy}
      action={
        state.action === "retry"
          ? <button className={styles.primaryAction} type="button" onClick={onRetry}>Try again</button>
          : state.action === "store"
            ? <a className={styles.primaryAction} href={storeUrl} target="_blank" rel="noreferrer">Update Cold Start</a>
            : <a className={styles.primaryAction} href={SUPPORT_HREF}>Ask Samay for help</a>
      }
    />
  );
}

function StatePanel({
  label,
  title,
  copy,
  action
}: {
  label: string;
  title: string;
  copy: string;
  action: React.ReactNode;
}) {
  return (
    <section className={styles.panel}>
      <p className={styles.stateLabel}>{label}</p>
      <h2>{title}</h2>
      <p>{copy}</p>
      {action}
    </section>
  );
}

function allowanceCopy(allowance: Allowance | undefined) {
  return allowance
    ? `${allowance.profile.remaining} fresh profiles and ${allowance.lens.remaining} Lens runs remain. Open Linear, click Cold Start, and begin there.`
    : "Open Linear, click Cold Start in Chrome, and begin with a sourced profile.";
}

function stateCopy(code: ViewCode, storeUrl: string) {
  void storeUrl;
  const states: Record<
    Exclude<
      ViewCode,
      "checking" | "connecting" | "disclosure" | "firefox_connect" | "not_installed" | "ready" | "ready_to_connect"
    >,
    { label: string; title: string; copy: string; action: "retry" | "store" | "support" }
  > = {
    access_disabled: {
      label: "Temporarily paused",
      title: "The alpha is resting",
      copy: "Existing public cards remain available, but new alpha access is paused for the moment.",
      action: "support"
    },
    connection_lost: {
      label: "Connection needed",
      title: "This installation lost its connection",
      copy: "Chrome may have cleared the extension’s local storage, or this installation may have been revoked.",
      action: "support"
    },
    expired: {
      label: "Invitation expired",
      title: "This invitation is no longer active",
      copy: "Invitations expire so a link cannot quietly remain usable forever.",
      action: "support"
    },
    generation_disabled: {
      label: "New research paused",
      title: "Your connection is intact",
      copy: "Existing cards and filed Lens results still open, but new profile and Lens runs are temporarily paused.",
      action: "support"
    },
    installation_limit: {
      label: "Installation limit",
      title: "This invitation is already attached elsewhere",
      copy: "Each friend-alpha invitation is limited to its intended Chrome installation.",
      action: "support"
    },
    invalid_invite: {
      label: "Invitation needed",
      title: "Open the invitation Samay sent you",
      copy: "The private invitation carries the connection needed for this alpha.",
      action: "support"
    },
    lens_exhausted: {
      label: "Lens allowance used",
      title: "Your filed work stays available",
      copy: "You can keep opening profiles and existing Lens results. Ask Samay if you want more fresh Lens runs.",
      action: "support"
    },
    offline: {
      label: "Offline",
      title: "Reconnect to continue",
      copy: "The invitation and installation are safe. Cold Start needs a network connection to finish setup.",
      action: "retry"
    },
    old_supported: {
      label: "Update available",
      title: "This version still works, but a newer one is ready",
      copy: "Update before your first run so the invitation and side panel use the same release.",
      action: "store"
    },
    profile_exhausted: {
      label: "Profile allowance used",
      title: "Every profile you made stays open",
      copy: "Opening existing cards is free. Ask Samay if you want to research another new company.",
      action: "support"
    },
    revoked: {
      label: "Access removed",
      title: "This invitation has been revoked",
      copy: "No new alpha work can run from this invitation. Existing public cards remain available.",
      action: "support"
    },
    unknown: {
      label: "Could not connect",
      title: "Cold Start hit a setup problem",
      copy: "Nothing was charged or consumed. Try once more, then ask Samay if the problem returns.",
      action: "retry"
    },
    unsupported_browser: {
      label: "Desktop browser required",
      title: "Open this invitation in Chrome or Firefox on a computer",
      copy: "Cold Start runs in Chrome’s side panel or Firefox’s sidebar and is not available in mobile browsers, Safari, or Edge yet.",
      action: "support"
    },
    unsupported_version: {
      label: "Browser update required",
      title: "Update your browser before installing",
      copy: "Cold Start needs Chrome 116 or newer, or Firefox 140 or newer, for the sidebar connection.",
      action: "support"
    },
    update_required: {
      label: "Update required",
      title: "Cold Start needs the current release",
      copy: "This installation is too old to connect safely to the alpha.",
      action: "store"
    },
    used: {
      label: "Invitation already used",
      title: "This invitation has already been connected",
      copy: "If you reinstalled Chrome or cleared the extension, Samay can repair the connection.",
      action: "support"
    }
  };
  return states[code as keyof typeof states];
}
