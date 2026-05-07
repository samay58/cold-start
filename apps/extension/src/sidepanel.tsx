import type { ColdStartCard } from "@cold-start/core";
import { CardShell } from "@cold-start/ui";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { createRoot } from "react-dom/client";
import {
  ApiError,
  buildGenerateRequest,
  buildCardRequest,
  defaultApiOrigin,
  normalizeApiOrigin,
  parseCardResponse,
  parseGenerateResponse,
  readableCompanyNameFromDomain,
  readableCardError,
  storedApiOriginOrDefault,
  type GenerationStatus,
  type Settings
} from "./extension-config";
import "./styles.css";

const DEFAULT_API_ORIGIN = defaultApiOrigin(import.meta.env);
const STORAGE_KEYS = ["coldStartApiOrigin", "coldStartApiToken"] as const;
const GENERATION_POLL_DELAY_MS = 2500;
const GENERATION_TIMEOUT_MS = 4 * 60 * 1000;

type RequestState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "readyToGenerate" }
  | { status: "generating"; generationStatus: GenerationStatus["status"] }
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
      const storedOrigin = typeof items.coldStartApiOrigin === "string" ? items.coldStartApiOrigin.trim() : "";

      resolve({
        apiOrigin: storedApiOriginOrDefault(storedOrigin, DEFAULT_API_ORIGIN),
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

async function fetchCard(domain: string, settings: Settings, signal: AbortSignal): Promise<ColdStartCard> {
  const request = buildCardRequest(domain, settings, signal, chrome.runtime.id);
  const response = await fetch(request.url, request.init);
  return parseCardResponse(response);
}

async function requestGeneration(
  domain: string,
  settings: Settings,
  signal: AbortSignal
): Promise<GenerationStatus> {
  const request = buildGenerateRequest(domain, settings, signal);
  const response = await fetch(request.url, request.init);
  return parseGenerateResponse(response);
}

function isMissingCard(caught: unknown) {
  return caught instanceof ApiError && caught.status === 404 && caught.message === "card not found";
}

function waitForNextPoll(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error("request aborted"));
      return;
    }

    const timeout = window.setTimeout(() => {
      signal.removeEventListener("abort", handleAbort);
      resolve();
    }, GENERATION_POLL_DELAY_MS);

    function handleAbort() {
      window.clearTimeout(timeout);
      reject(new Error("request aborted"));
    }

    signal.addEventListener("abort", handleAbort, { once: true });
  });
}

async function startGenerationAndPoll(
  domain: string,
  settings: Settings,
  signal: AbortSignal,
  onGenerationStatus: (status: GenerationStatus["status"]) => void
): Promise<ColdStartCard> {
  const generation = await requestGeneration(domain, settings, signal);
  onGenerationStatus(generation.status);

  if (generation.status === "cached") {
    return fetchCard(domain, settings, signal);
  }

  const deadline = Date.now() + GENERATION_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await waitForNextPoll(signal);

    try {
      return await fetchCard(domain, settings, signal);
    } catch (caught) {
      if (!isMissingCard(caught)) {
        throw caught;
      }
    }
  }

  throw new ApiError("Card generation is taking longer than expected. Keep the local worker running, then reopen Cold Start.", 202);
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
        apiOrigin: normalizeApiOrigin(apiOrigin, DEFAULT_API_ORIGIN),
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

function GenerationPanel({
  domain,
  requestState
}: {
  domain: string;
  requestState: Extract<RequestState, { status: "loading" | "generating" | "idle" }>;
}) {
  const companyName = readableCompanyNameFromDomain(domain);
  const activeIndex =
    requestState.status === "loading" || requestState.status === "idle"
      ? 0
      : requestState.generationStatus === "queued"
        ? 1
        : 2;
  const statusText =
    requestState.status === "generating"
      ? requestState.generationStatus === "queued"
        ? "Queued"
        : "Running"
      : "Checking cache";
  const stages = [
    { label: "Resolve", detail: "Domain, settings, cached card" },
    { label: "Plan", detail: "Funding, product, independent sources" },
    { label: "Retrieve", detail: "Source map and evidence ledger" },
    { label: "Synthesize", detail: "Rounds, description, investor read" }
  ];

  return (
    <div className="cs-extension-panel cs-generation-panel" aria-live="polite">
      <div className="cs-generation-topline">
        <div>
          <p className="cs-extension-kicker">{domain}</p>
          <h1>{companyName}</h1>
        </div>
        <span className="cs-generation-status">{statusText}</span>
      </div>

      <div className="cs-generation-instrument" aria-hidden="true">
        <span className="cs-generation-sweep" />
        <span className="cs-generation-core" />
      </div>

      <div className="cs-generation-stage-list">
        {stages.map((stage, index) => (
          <div
            className={index === activeIndex ? "cs-generation-stage is-active" : "cs-generation-stage"}
            key={stage.label}
          >
            <span className="cs-generation-stage-dot" />
            <div>
              <strong>{stage.label}</strong>
              <span>{stage.detail}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StartGenerationPanel({
  domain,
  onEditSettings,
  onStart
}: {
  domain: string;
  onEditSettings: () => void;
  onStart: () => void;
}) {
  const companyName = readableCompanyNameFromDomain(domain);

  return (
    <div className="cs-extension-panel">
      <p className="cs-extension-kicker">{domain}</p>
      <h1>Generate {companyName}?</h1>
      <p className="cs-extension-copy">Cold Start will research this company and save a sourced card.</p>
      <div className="cs-extension-actions">
        <button className="cs-extension-button" onClick={onStart} type="button">Start</button>
        <button className="cs-extension-link-button" onClick={onEditSettings} type="button">
          Edit settings
        </button>
      </div>
    </div>
  );
}

export function SidePanel() {
  const [domain, setDomain] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [requestState, setRequestState] = useState<RequestState>({ status: "idle" });
  const [showSettings, setShowSettings] = useState(false);
  const activeRequest = useRef<AbortController | null>(null);

  function abortActiveRequest() {
    activeRequest.current?.abort();
    activeRequest.current = null;
  }

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
      abortActiveRequest();
      setRequestState({ status: "idle" });
      setDomain(typeof nextDomain === "string" ? nextDomain : null);
    }

    chrome.storage.onChanged.addListener(handleStorageChange);

    return () => {
      mounted = false;
      abortActiveRequest();
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  useEffect(() => {
    if (!domain || !settings?.apiToken) {
      abortActiveRequest();
      setRequestState({ status: "idle" });
      return;
    }

    const controller = new AbortController();
    abortActiveRequest();
    activeRequest.current = controller;
    setRequestState({ status: "loading" });

    void fetchCard(domain, settings, controller.signal)
      .then((card) => {
        if (!controller.signal.aborted) {
          setRequestState({ status: "success", card });
        }
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        const message = caught instanceof Error ? caught.message : String(caught);
        if (isMissingCard(caught)) {
          setRequestState({ status: "readyToGenerate" });
        } else {
          setRequestState({ status: "error", message: readableCardError(message, settings.apiOrigin) });
        }
      });

    return () => {
      controller.abort();
      if (activeRequest.current === controller) {
        activeRequest.current = null;
      }
    };
  }, [domain, settings]);

  function handleStartGeneration() {
    if (!domain || !settings?.apiToken) {
      return;
    }

    const controller = new AbortController();
    abortActiveRequest();
    activeRequest.current = controller;
    setRequestState({ status: "generating", generationStatus: "queued" });

    void startGenerationAndPoll(domain, settings, controller.signal, (generationStatus) => {
      if (!controller.signal.aborted) {
        setRequestState({ status: "generating", generationStatus });
      }
    })
      .then((card) => {
        if (!controller.signal.aborted) {
          setRequestState({ status: "success", card });
        }
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        const message = caught instanceof Error ? caught.message : String(caught);
        setRequestState({ status: "error", message: readableCardError(message, settings.apiOrigin) });
      });
  }

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
    return <GenerationPanel domain={domain} requestState={requestState} />;
  }

  if (requestState.status === "readyToGenerate") {
    return (
      <StartGenerationPanel
        domain={domain}
        onEditSettings={() => setShowSettings(true)}
        onStart={handleStartGeneration}
      />
    );
  }

  if (requestState.status === "generating") {
    return <GenerationPanel domain={domain} requestState={requestState} />;
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

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(<SidePanel />);
}
