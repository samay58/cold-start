import { companySlugFromDomain, type ColdStartCard } from "@cold-start/core";
import { CardShell } from "@cold-start/ui";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const DEFAULT_API_ORIGIN = "http://localhost:3000";
const STORAGE_KEYS = ["coldStartApiOrigin", "coldStartApiToken"] as const;

type Settings = {
  apiOrigin: string;
  apiToken: string;
};

type RequestState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; card: ColdStartCard }
  | { status: "error"; message: string };

function readActiveDomain(): Promise<string | null> {
  return new Promise((resolve) => {
    chrome.storage.session.get("activeDomain", (items) => {
      resolve(typeof items.activeDomain === "string" ? items.activeDomain : null);
    });
  });
}

function readSettings(): Promise<Settings> {
  return new Promise((resolve) => {
    chrome.storage.local.get([...STORAGE_KEYS], (items) => {
      resolve({
        apiOrigin: typeof items.coldStartApiOrigin === "string" && items.coldStartApiOrigin.trim()
          ? items.coldStartApiOrigin
          : DEFAULT_API_ORIGIN,
        apiToken: typeof items.coldStartApiToken === "string" ? items.coldStartApiToken : ""
      });
    });
  });
}

function saveSettings(settings: Settings): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set(
      {
        coldStartApiOrigin: settings.apiOrigin,
        coldStartApiToken: settings.apiToken
      },
      resolve
    );
  });
}

function normalizeApiOrigin(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return DEFAULT_API_ORIGIN;
  }

  return new URL(trimmed).origin;
}

async function fetchCard(domain: string, settings: Settings, signal: AbortSignal): Promise<ColdStartCard> {
  const slug = companySlugFromDomain(domain);
  const response = await fetch(`${settings.apiOrigin}/api/extension/cards/${encodeURIComponent(slug)}`, {
    headers: {
      Authorization: `Bearer ${settings.apiToken}`
    },
    signal
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: unknown } | null;
    const detail = typeof body?.error === "string" ? body.error : `request failed with ${response.status}`;
    throw new Error(detail);
  }

  return response.json() as Promise<ColdStartCard>;
}

function SettingsForm({
  initialSettings,
  onSave
}: {
  initialSettings: Settings;
  onSave: (settings: Settings) => void;
}) {
  const [apiOrigin, setApiOrigin] = useState(initialSettings.apiOrigin);
  const [apiToken, setApiToken] = useState(initialSettings.apiToken);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      const nextSettings = {
        apiOrigin: normalizeApiOrigin(apiOrigin),
        apiToken: apiToken.trim()
      };

      if (!nextSettings.apiToken) {
        setError("Token required.");
        return;
      }

      setError(null);
      void saveSettings(nextSettings).then(() => onSave(nextSettings));
    } catch {
      setError("Enter a valid API origin.");
    }
  }

  return (
    <form className="cs-extension-panel" onSubmit={handleSubmit}>
      <p className="cs-extension-kicker">Cold Start</p>
      <h1>Extension setup</h1>
      <p className="cs-extension-copy">Token is stored locally and sent as a bearer token.</p>

      <label className="cs-extension-field">
        <span>API origin</span>
        <input
          autoComplete="off"
          onChange={(event) => setApiOrigin(event.target.value)}
          type="url"
          value={apiOrigin}
        />
      </label>

      <label className="cs-extension-field">
        <span>API token</span>
        <input
          autoComplete="off"
          onChange={(event) => setApiToken(event.target.value)}
          type="password"
          value={apiToken}
        />
      </label>

      {error ? <p className="cs-extension-error">{error}</p> : null}
      <button className="cs-extension-button" type="submit">Save</button>
    </form>
  );
}

function SidePanel() {
  const [domain, setDomain] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [requestState, setRequestState] = useState<RequestState>({ status: "idle" });
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    let mounted = true;

    void Promise.all([readActiveDomain(), readSettings()]).then(([activeDomain, savedSettings]) => {
      if (!mounted) {
        return;
      }

      setDomain(activeDomain);
      setSettings(savedSettings);
    });

    function handleStorageChange(changes: Record<string, chrome.storage.StorageChange>, areaName: string) {
      if (areaName !== "session" || !changes.activeDomain) {
        return;
      }

      const nextDomain = changes.activeDomain.newValue;
      setDomain(typeof nextDomain === "string" ? nextDomain : null);
    }

    chrome.storage.onChanged.addListener(handleStorageChange);

    return () => {
      mounted = false;
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  useEffect(() => {
    if (!domain || !settings?.apiToken) {
      setRequestState({ status: "idle" });
      return;
    }

    const controller = new AbortController();
    setRequestState({ status: "loading" });

    void fetchCard(domain, settings, controller.signal)
      .then((card) => setRequestState({ status: "success", card }))
      .catch((caught: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        setRequestState({ status: "error", message: caught instanceof Error ? caught.message : String(caught) });
      });

    return () => controller.abort();
  }, [domain, settings]);

  if (!settings) {
    return <div className="cs-extension-empty">Loading settings...</div>;
  }

  if (!settings.apiToken || showSettings) {
    return (
      <SettingsForm
        initialSettings={settings}
        onSave={(nextSettings) => {
          setSettings(nextSettings);
          setShowSettings(false);
        }}
      />
    );
  }

  if (!domain) {
    return (
      <div className="cs-extension-panel">
        <p className="cs-extension-kicker">Cold Start</p>
        <h1>No company tab selected</h1>
        <p className="cs-extension-copy">Open a company website and click the extension again.</p>
        <button className="cs-extension-link-button" onClick={() => setShowSettings(true)} type="button">
          Edit settings
        </button>
      </div>
    );
  }

  if (requestState.status === "loading" || requestState.status === "idle") {
    return <div className="cs-extension-empty">Loading {domain}...</div>;
  }

  if (requestState.status === "error") {
    return (
      <div className="cs-extension-panel">
        <p className="cs-extension-kicker">{domain}</p>
        <h1>Card unavailable</h1>
        <p className="cs-extension-error">{requestState.message}</p>
        <button className="cs-extension-link-button" onClick={() => setShowSettings(true)} type="button">
          Edit settings
        </button>
      </div>
    );
  }

  return <CardShell card={requestState.card} surface="extension" />;
}

createRoot(document.getElementById("root")!).render(<SidePanel />);
