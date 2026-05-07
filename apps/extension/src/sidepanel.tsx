import type { ColdStartCard } from "@cold-start/core";
import { CardShell } from "@cold-start/ui";
import { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
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
  | { status: "generating"; generationStatus: GenerationStatus["status"]; mode: GenerationStatus["mode"] }
  | { status: "success"; card: ColdStartCard }
  | { status: "error"; message: string };

function PlateMark({ label = "C" }: { label?: string }) {
  const initial = label.trim().charAt(0).toUpperCase() || "C";
  return <span className="cs-extension-mark" aria-hidden="true">{initial}</span>;
}

function ExtensionTopbar({ right = "extension" }: { right?: string }) {
  return (
    <>
      <div className="cs-extension-topbar">
        <div className="cs-extension-brand">
          <PlateMark />
          <span>COLD START</span>
          <span>N° 14</span>
        </div>
        <span className="cs-extension-topbar-right">{right}</span>
      </div>
      <div className="cs-extension-rule" />
    </>
  );
}

function ExtensionPlate({
  actions,
  children,
  className = "",
  eyebrow,
  markLabel,
  right,
  title
}: {
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  eyebrow: string;
  markLabel?: string;
  right?: string;
  title: string;
}) {
  return (
    <section className={`cs-extension-plate ${className}`.trim()}>
      <ExtensionTopbar {...(right ? { right } : {})} />
      <div className="cs-extension-hero">
        <PlateMark label={markLabel ?? title} />
        <div>
          <p className="cs-extension-kicker">{eyebrow}</p>
          <h1>{title}</h1>
        </div>
      </div>
      {children}
      {actions ? <div className="cs-extension-actions">{actions}</div> : null}
    </section>
  );
}

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
  signal: AbortSignal,
  mode: GenerationStatus["mode"],
  confirmStart: boolean
): Promise<GenerationStatus> {
  const request = buildGenerateRequest(domain, settings, signal, mode, confirmStart, chrome.runtime.id);
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
  mode: GenerationStatus["mode"],
  confirmStart: boolean,
  onGenerationStatus: (status: GenerationStatus["status"]) => void
): Promise<ColdStartCard> {
  const generation = await requestGeneration(domain, settings, signal, mode, confirmStart);
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
    <form className="cs-extension-plate cs-extension-form" onSubmit={handleSubmit}>
      <ExtensionTopbar right="setup" />
      <div className="cs-extension-hero">
        <PlateMark />
        <div>
          <p className="cs-extension-kicker">Local access</p>
          <h1>Extension setup</h1>
        </div>
      </div>
      <p className="cs-extension-copy">Token stays local. Requests use the extension route.</p>

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
      <div className="cs-extension-actions">
        <button className="cs-extension-button" type="submit">Save</button>
      </div>
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
        ? requestState.mode === "analysis" ? "Analysis queued" : "Basics queued"
        : requestState.mode === "analysis" ? "Analyzing" : "Building basics"
      : "Checking cache";
  const stages = [
    { marker: "i", label: "Resolve identity", detail: "0.6s", progress: 1 },
    { marker: "ii", label: "Plan retrieval", detail: "1.4s", progress: 1 },
    { marker: "iii", label: "Catalogue sources", detail: requestState.status === "generating" ? "8/11" : "queued", progress: activeIndex >= 2 ? 0.72 : 0.36 },
    { marker: "iv", label: requestState.status === "generating" && requestState.mode === "analysis" ? "Synthesize lens" : "Synthesize card", detail: activeIndex >= 2 ? "queued" : "waiting", progress: activeIndex >= 2 ? 0.2 : 0 }
  ];

  return (
    <ExtensionPlate
      className="cs-generation-panel"
      eyebrow={statusText}
      markLabel={companyName}
      right="live · 0:09"
      title={domain}
    >
      <p className="cs-extension-copy">First observation. Researching from scratch.</p>
      <div className="cs-generation-stage-list">
        {stages.map((stage, index) => (
          <div
            className={index === activeIndex ? "cs-generation-stage is-active" : "cs-generation-stage"}
            key={stage.label}
          >
            <span className="cs-generation-stage-marker">{stage.marker}{index < activeIndex ? " ✓" : index === activeIndex ? " →" : " ·"}</span>
            <strong>{stage.label}</strong>
            <span className="cs-generation-stage-bar"><i style={{ width: `${Math.round(stage.progress * 100)}%` }} /></span>
            <span className="cs-generation-stage-detail">{stage.detail}</span>
          </div>
        ))}
      </div>

      <div className="cs-generation-source-class" aria-hidden="true">
        <p>Source class · 11 retrieved</p>
        <div className="cs-generation-bars">
          {[48, 42, 54].map((height) => <span data-class="independent" key={`i-${height}`} style={{ height }} />)}
          {[34, 40, 36, 28].map((height) => <span data-class="reporting" key={`r-${height}`} style={{ height }} />)}
          {[22, 20].map((height) => <span data-class="company" key={`c-${height}`} style={{ height }} />)}
        </div>
        <div className="cs-generation-legend">
          <span><i data-class="independent" />indep 3</span>
          <span><i data-class="reporting" />reporting 4</span>
          <span><i data-class="company" />company 2</span>
        </div>
      </div>
    </ExtensionPlate>
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
    <ExtensionPlate
      actions={
        <>
        <button className="cs-extension-button" onClick={onStart} type="button">Start</button>
        <button className="cs-extension-link-button" onClick={onEditSettings} type="button">
          Edit settings
        </button>
        </>
      }
      eyebrow={domain}
      markLabel={companyName}
      title={`Generate ${companyName}?`}
    >
      <p className="cs-extension-copy">Research the company and save a sourced card.</p>
    </ExtensionPlate>
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

  function runGenerationWithController(
    controller: AbortController,
    generationDomain: string,
    generationSettings: Settings,
    mode: GenerationStatus["mode"],
    confirmStart: boolean
  ) {
    setRequestState({ status: "generating", generationStatus: "queued", mode });

    void startGenerationAndPoll(
      generationDomain,
      generationSettings,
      controller.signal,
      mode,
      confirmStart,
      (generationStatus) => {
        if (!controller.signal.aborted) {
          setRequestState({ status: "generating", generationStatus, mode });
        }
      }
    )
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
        setRequestState({ status: "error", message: readableCardError(message, generationSettings.apiOrigin) });
      });
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
          runGenerationWithController(controller, domain, settings, "basics", false);
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

  function handleStartGeneration(mode: GenerationStatus["mode"], confirmStart: boolean) {
    if (!domain || !settings?.apiToken) {
      return;
    }

    const controller = new AbortController();
    abortActiveRequest();
    activeRequest.current = controller;
    runGenerationWithController(controller, domain, settings, mode, confirmStart);
  }

  if (!settings) {
    return (
      <ExtensionPlate eyebrow="Booting" right="setup" title="Loading settings">
        <p className="cs-extension-copy">Reading local extension settings.</p>
      </ExtensionPlate>
    );
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
      <ExtensionPlate
        actions={
          <button className="cs-extension-link-button" onClick={() => setShowSettings(true)} type="button">
            Edit settings
          </button>
        }
        eyebrow="No active domain"
        title="No company tab selected"
      >
        <p className="cs-extension-copy">Open a company website, then return to the side panel.</p>
      </ExtensionPlate>
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
        onStart={() => handleStartGeneration("basics", false)}
      />
    );
  }

  if (requestState.status === "generating") {
    return <GenerationPanel domain={domain} requestState={requestState} />;
  }

  if (requestState.status === "error") {
    return (
      <ExtensionPlate
        actions={
          <button className="cs-extension-link-button" onClick={() => setShowSettings(true)} type="button">
            Edit settings
          </button>
        }
        className="cs-extension-error-plate"
        eyebrow={domain}
        markLabel={domain}
        right="check"
        title="Card unavailable"
      >
        <p className="cs-extension-error">{requestState.message}</p>
      </ExtensionPlate>
    );
  }

  return (
    <div className={requestState.card.synthesis ? "cs-extension-success" : "cs-extension-success has-analysis-action"}>
      <CardShell card={requestState.card} surface="extension" />
      {!requestState.card.synthesis ? (
        <div className="cs-extension-analyze">
          <div>
            <span className="cs-extension-analyze-kicker">iv · investor lens · gated</span>
            <p>Run cited analysis for this card.</p>
          </div>
          <button className="cs-extension-button" onClick={() => handleStartGeneration("analysis", true)} type="button">
            Analyze
          </button>
        </div>
      ) : null}
    </div>
  );
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(<SidePanel />);
}
