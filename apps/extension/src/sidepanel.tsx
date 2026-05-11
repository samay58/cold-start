import { canRunInvestorAnalysis, type ColdStartCard } from "@cold-start/core";
import { CardShell } from "@cold-start/ui";
import { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { createRoot } from "react-dom/client";
import {
  ApiError,
  buildGenerateRequest,
  buildGenerationStatusRequest,
  buildCardRequest,
  defaultApiOrigin,
  normalizeApiOrigin,
  parseCardResponse,
  parseGenerateResponse,
  parseGenerationStatusResponse,
  readableCompanyNameFromDomain,
  readableCardError,
  resolveStoredSettings,
  type GenerationRunStatus,
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
  | { status: "generating"; generationStatus: GenerationStatus["status"]; mode: GenerationStatus["mode"]; startedAt: number }
  | { status: "success"; card: ColdStartCard; analysisNotice?: string }
  | { status: "error"; message: string };

type GenerationPollResult = {
  card: ColdStartCard;
  analysisNotice?: string;
};

function PlateMark({ label = "C" }: { label?: string }) {
  const initial = label.trim().charAt(0).toUpperCase() || "C";
  return <span className="cs-extension-mark" aria-hidden="true">{initial}</span>;
}

function ExtensionTopbar({
  onSettings,
  right = "extension"
}: {
  onSettings?: () => void;
  right?: string;
}) {
  return (
    <>
      <div className="cs-extension-topbar">
        <div className="cs-extension-brand">
          <PlateMark />
          <span>Cold Start</span>
        </div>
        <div className="cs-extension-topbar-right">
          <span>{right}</span>
          {onSettings ? (
            <button aria-label="Open settings" className="cs-icon-button" onClick={onSettings} type="button">
              <span aria-hidden="true">...</span>
            </button>
          ) : null}
        </div>
      </div>
      <div className="cs-extension-rule" />
    </>
  );
}

function ExtensionFrame({
  actions,
  children,
  className = "",
  onSettings,
  right,
  title
}: {
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  onSettings?: () => void;
  right?: string;
  title: string;
}) {
  return (
    <section aria-label={title} className={`cs-extension-frame ${className}`.trim()}>
      <ExtensionTopbar {...(onSettings ? { onSettings } : {})} {...(right ? { right } : {})} />
      {children}
      {actions ? <div className="cs-extension-actions">{actions}</div> : null}
    </section>
  );
}

function PanelHeader({
  eyebrow,
  markLabel,
  title,
  value
}: {
  eyebrow: string;
  markLabel?: string;
  title: string;
  value?: string;
}) {
  return (
    <div className="cs-panel-header">
      <PlateMark label={markLabel ?? title} />
      <div>
        <p className="cs-extension-kicker">{eyebrow}</p>
        <h1>{title}</h1>
        {value ? <p className="cs-extension-domain">{value}</p> : null}
      </div>
    </div>
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
      const storedToken = typeof items.coldStartApiToken === "string" ? items.coldStartApiToken.trim() : "";
      const { settings: nextSettings, shouldPersist } = resolveStoredSettings(
        { apiOrigin: storedOrigin, apiToken: storedToken },
        DEFAULT_API_ORIGIN
      );

      if (!shouldPersist) {
        resolve(nextSettings);
        return;
      }

      chrome.storage.local.set(
        {
          coldStartApiOrigin: nextSettings.apiOrigin,
          coldStartApiToken: nextSettings.apiToken
        },
        () => resolve(nextSettings)
      );
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

function useElapsedSeconds(active: boolean, startedAt?: number) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active || !startedAt) {
      return;
    }

    setNow(Date.now());
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [active, startedAt]);

  return startedAt ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0;
}

function formatElapsed(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = String(seconds % 60).padStart(2, "0");
  return `${minutes}:${remainder}`;
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

async function requestGenerationStatus(
  domain: string,
  settings: Settings,
  signal: AbortSignal,
  mode: GenerationRunStatus["mode"]
): Promise<GenerationRunStatus> {
  const request = buildGenerationStatusRequest(domain, settings, signal, mode, chrome.runtime.id);
  const response = await fetch(request.url, request.init);
  return parseGenerationStatusResponse(response);
}

function isMissingCard(caught: unknown) {
  return caught instanceof ApiError && caught.status === 404 && caught.message === "card not found";
}

function isMissingGenerationStatusRoute(caught: unknown) {
  return caught instanceof ApiError && caught.status === 405;
}

function isActiveRun(status: GenerationRunStatus["status"]): status is "queued" | "running" {
  return status === "queued" || status === "running";
}

function startedAtMs(value?: string): number {
  if (!value) {
    return Date.now();
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Date.now();
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

async function pollGenerationUntilCard(
  domain: string,
  settings: Settings,
  signal: AbortSignal,
  mode: GenerationStatus["mode"],
  onGenerationStatus: (status: GenerationStatus["status"]) => void,
  latestCard: ColdStartCard | null = null
): Promise<GenerationPollResult> {
  const deadline = Date.now() + GENERATION_TIMEOUT_MS;
  let currentCard = latestCard;

  while (Date.now() < deadline) {
    await waitForNextPoll(signal);

    try {
      const card = await fetchCard(domain, settings, signal);

      if (mode === "basics" || card.synthesis) {
        return { card };
      }

      currentCard = card;
    } catch (caught) {
      if (!isMissingCard(caught)) {
        throw caught;
      }
    }

    let runStatus: GenerationRunStatus;
    try {
      runStatus = await requestGenerationStatus(domain, settings, signal, mode);
    } catch (caught) {
      if (isMissingGenerationStatusRoute(caught)) {
        continue;
      }

      throw caught;
    }

    if (isActiveRun(runStatus.status)) {
      onGenerationStatus(runStatus.status);
    } else if (runStatus.status === "failed") {
      if (mode === "analysis" && currentCard) {
        return {
          card: currentCard,
          analysisNotice: insufficientEvidenceNotice(runStatus.error)
        };
      }

      throw new ApiError(runStatus.error ?? "Generation failed before a card was produced.", 500);
    } else if (mode === "analysis" && runStatus.status === "complete" && currentCard) {
      return {
        card: currentCard,
        analysisNotice: insufficientEvidenceNotice("analysis completed without synthesis")
      };
    }
  }

  throw new ApiError("Card generation is taking longer than expected. Keep the local worker running, then reopen Cold Start.", 202);
}

async function startGenerationAndPoll(
  domain: string,
  settings: Settings,
  signal: AbortSignal,
  mode: GenerationStatus["mode"],
  confirmStart: boolean,
  onGenerationStatus: (status: GenerationStatus["status"]) => void
): Promise<GenerationPollResult> {
  const generation = await requestGeneration(domain, settings, signal, mode, confirmStart);
  onGenerationStatus(generation.status);

  if (generation.status === "cached") {
    return { card: await fetchCard(domain, settings, signal) };
  }

  return pollGenerationUntilCard(domain, settings, signal, mode, onGenerationStatus);
}

function insufficientEvidenceNotice(error?: string) {
  if (error === "No synthesis claims survived verification") {
    return "Not enough verified evidence for an investor lens yet.";
  }

  return "Not enough verified evidence for an investor lens yet.";
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
  const setupEyebrow = DEFAULT_API_ORIGIN.startsWith("http://localhost") ? "Local access" : "Extension access";

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
    <form className="cs-extension-frame cs-extension-form" onSubmit={handleSubmit}>
      <ExtensionTopbar right="setup" />
      <PanelHeader eyebrow={setupEyebrow} title="Extension setup" value="Token stays on this browser." />

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
        <button className="cs-extension-button" type="submit">Save settings</button>
      </div>
    </form>
  );
}

function LoadingPanel({
  domain,
  onSettings
}: {
  domain: string;
  onSettings: () => void;
}) {
  const companyName = readableCompanyNameFromDomain(domain);

  return (
    <ExtensionFrame className="cs-check-panel" onSettings={onSettings} right="checking" title="Checking cache">
      <PanelHeader eyebrow="Current tab" markLabel={companyName} title={companyName} value={domain} />
      <div className="cs-cache-card" aria-live="polite">
        <span className="cs-cache-spinner" aria-hidden="true" />
        <div>
          <strong>Looking for a saved profile</strong>
          <p>If nothing exists yet, you will choose whether to generate one.</p>
        </div>
      </div>
    </ExtensionFrame>
  );
}

function GenerationPanel({
  domain,
  requestState
}: {
  domain: string;
  requestState: Extract<RequestState, { status: "generating" }>;
}) {
  const companyName = readableCompanyNameFromDomain(domain);
  const elapsed = useElapsedSeconds(true, requestState.startedAt);
  const isAnalysis = requestState.mode === "analysis";
  const isLongRunning = elapsed >= 75;
  const activeIndex =
    requestState.generationStatus === "queued"
      ? Math.min(3, Math.floor(elapsed / 7))
      : Math.min(3, 1 + Math.floor(elapsed / 8));
  const statusText =
    requestState.generationStatus === "queued" && elapsed < 4
      ? isAnalysis ? "Queued analysis" : "Queued profile"
      : isAnalysis ? "Building lens" : "Building profile";
  const stages = [
    { label: "Resolve identity", marker: "01" },
    { label: "Read sources", marker: "02" },
    { label: isAnalysis ? "Trace claims" : "Shape profile", marker: "03" },
    { label: isAnalysis ? "Prepare lens" : "Attach citations", marker: "04" }
  ];
  return (
    <ExtensionFrame
      className="cs-generation-panel"
      right={`live · ${formatElapsed(elapsed)}`}
      title={domain}
    >
      <PanelHeader eyebrow={statusText} markLabel={companyName} title={companyName} value={domain} />

      <div className="cs-live-card" aria-live="polite">
        <div className="cs-live-orbit" aria-hidden="true">
          <span className="cs-live-node" data-node="one" />
          <span className="cs-live-node" data-node="two" />
          <span className="cs-live-node" data-node="three" />
          <span className="cs-live-puck" />
        </div>
        <div className="cs-live-copy">
          <strong className="cs-shimmer-text">{stages[activeIndex]?.label ?? stages[stages.length - 1]?.label}</strong>
          <p>
            {isLongRunning
              ? "Still running in the background. You can close and reopen this panel without restarting it."
              : isAnalysis ? "Checking claims against the evidence ledger." : "Collecting enough source distance for a useful profile."}
          </p>
        </div>
      </div>

      <div className="cs-generation-stage-list">
        {stages.map((stage, index) => {
          const complete = index < activeIndex;
          const active = index === activeIndex;
          return (
            <div
              className={active ? "cs-generation-stage is-active" : "cs-generation-stage"}
              data-complete={complete ? "true" : "false"}
              key={stage.label}
            >
              <span className="cs-generation-stage-marker">{stage.marker}</span>
              <strong className={active ? "cs-shimmer-text" : undefined}>{stage.label}</strong>
              <span className="cs-generation-stage-detail">{complete ? "done" : active ? "active" : "next"}</span>
            </div>
          );
        })}
      </div>
    </ExtensionFrame>
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
    <ExtensionFrame
      actions={
        <>
        <button className="cs-extension-button" onClick={onStart} type="button">Generate profile</button>
        <button className="cs-extension-link-button" onClick={onEditSettings} type="button">
          Settings
        </button>
        </>
      }
      onSettings={onEditSettings}
      right="ready"
      title={`Generate ${companyName}?`}
    >
      <PanelHeader eyebrow="No saved profile" markLabel={companyName} title={`Generate ${companyName}?`} value={domain} />
      <div className="cs-gate-card">
        <p>Start with a sourced profile before running provider and model work.</p>
        <dl>
          <div>
            <dt>Starts with</dt>
            <dd>identity, funding, team, signals</dd>
          </div>
          <div>
            <dt>Then</dt>
            <dd>sources, citations, cached profile</dd>
          </div>
          <div>
            <dt>Later</dt>
            <dd>run the investor lens when the profile is useful</dd>
          </div>
        </dl>
      </div>
    </ExtensionFrame>
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
    const startedAt = Date.now();
    setRequestState({ status: "generating", generationStatus: "queued", mode, startedAt });

    void startGenerationAndPoll(
      generationDomain,
      generationSettings,
      controller.signal,
      mode,
      confirmStart,
      (generationStatus) => {
        if (!controller.signal.aborted) {
          setRequestState({ status: "generating", generationStatus, mode, startedAt });
        }
      }
    )
      .then((result) => {
        if (!controller.signal.aborted) {
          setRequestState(
            result.analysisNotice
              ? { status: "success", card: result.card, analysisNotice: result.analysisNotice }
              : { status: "success", card: result.card }
          );
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

  function resumeGenerationWithController(
    controller: AbortController,
    generationDomain: string,
    generationSettings: Settings,
    mode: GenerationStatus["mode"],
    generationStatus: "queued" | "running",
    runStartedAt?: string,
    latestCard: ColdStartCard | null = null
  ) {
    const startedAt = startedAtMs(runStartedAt);
    setRequestState({ status: "generating", generationStatus, mode, startedAt });

    void pollGenerationUntilCard(
      generationDomain,
      generationSettings,
      controller.signal,
      mode,
      (generationStatus) => {
        if (!controller.signal.aborted) {
          setRequestState({ status: "generating", generationStatus, mode, startedAt });
        }
      },
      latestCard
    )
      .then((result) => {
        if (!controller.signal.aborted) {
          setRequestState(
            result.analysisNotice
              ? { status: "success", card: result.card, analysisNotice: result.analysisNotice }
              : { status: "success", card: result.card }
          );
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

    void (async () => {
      let card: ColdStartCard | null = null;

      try {
        card = await fetchCard(domain, settings, controller.signal);
      } catch (caught) {
        if (controller.signal.aborted) {
          return;
        }

        if (!isMissingCard(caught)) {
          const message = caught instanceof Error ? caught.message : String(caught);
          setRequestState({ status: "error", message: readableCardError(message, settings.apiOrigin) });
          return;
        }
      }

      if (card?.synthesis) {
        setRequestState({ status: "success", card });
        return;
      }

      if (card) {
        try {
          const analysisStatus = await requestGenerationStatus(domain, settings, controller.signal, "analysis");
          if (isActiveRun(analysisStatus.status)) {
            resumeGenerationWithController(controller, domain, settings, "analysis", analysisStatus.status, analysisStatus.startedAt, card);
            return;
          }

          if (analysisStatus.status === "failed") {
            setRequestState({
              status: "success",
              card,
              analysisNotice: insufficientEvidenceNotice(analysisStatus.error)
            });
            return;
          }
        } catch (caught) {
          if (controller.signal.aborted) {
            return;
          }

          if (!isMissingGenerationStatusRoute(caught) && !isMissingCard(caught)) {
            const message = caught instanceof Error ? caught.message : String(caught);
            setRequestState({ status: "error", message: readableCardError(message, settings.apiOrigin) });
            return;
          }
        }

        setRequestState({ status: "success", card });
        return;
      }

      try {
        const basicsStatus = await requestGenerationStatus(domain, settings, controller.signal, "basics");
        if (isActiveRun(basicsStatus.status)) {
          resumeGenerationWithController(controller, domain, settings, "basics", basicsStatus.status, basicsStatus.startedAt);
          return;
        }

        if (basicsStatus.status === "failed") {
          setRequestState({ status: "error", message: readableCardError(basicsStatus.error ?? "Generation failed before a card was produced.", settings.apiOrigin) });
          return;
        }
      } catch (caught) {
        if (controller.signal.aborted) {
          return;
        }

        if (!isMissingGenerationStatusRoute(caught) && !isMissingCard(caught)) {
          const message = caught instanceof Error ? caught.message : String(caught);
          setRequestState({ status: "error", message: readableCardError(message, settings.apiOrigin) });
          return;
        }
      }

      activeRequest.current = null;
      setRequestState({ status: "readyToGenerate" });
    })();

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
      <ExtensionFrame className="cs-check-panel" right="setup" title="Loading settings">
        <PanelHeader eyebrow="Booting" title="Loading settings" value="Reading local extension settings." />
      </ExtensionFrame>
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
      <ExtensionFrame
        actions={
          <button className="cs-extension-link-button" onClick={() => setShowSettings(true)} type="button">
            Settings
          </button>
        }
        onSettings={() => setShowSettings(true)}
        right="idle"
        title="No company tab selected"
      >
        <PanelHeader eyebrow="No active domain" title="No company tab selected" value="Open a company website, then return here." />
      </ExtensionFrame>
    );
  }

  if (requestState.status === "loading" || requestState.status === "idle") {
    return <LoadingPanel domain={domain} onSettings={() => setShowSettings(true)} />;
  }

  if (requestState.status === "readyToGenerate") {
    return (
      <StartGenerationPanel
        domain={domain}
        onEditSettings={() => setShowSettings(true)}
        onStart={() => handleStartGeneration("basics", true)}
      />
    );
  }

  if (requestState.status === "generating") {
    return <GenerationPanel domain={domain} requestState={requestState} />;
  }

  if (requestState.status === "error") {
    return (
      <ExtensionFrame
        actions={
          <button className="cs-extension-link-button" onClick={() => setShowSettings(true)} type="button">
            Settings
          </button>
        }
        className="cs-extension-error-plate"
        onSettings={() => setShowSettings(true)}
        right="check"
        title="Card unavailable"
      >
        <PanelHeader eyebrow="Request failed" markLabel={domain} title="Card unavailable" value={domain} />
        <p className="cs-extension-error">{requestState.message}</p>
      </ExtensionFrame>
    );
  }

  const canAnalyze = canRunInvestorAnalysis(requestState.card);
  const showAnalyzeAction = !requestState.card.synthesis && canAnalyze;
  const showRegenerateAction = !requestState.card.synthesis && !canAnalyze;

  return (
    <div className={showAnalyzeAction || showRegenerateAction ? "cs-extension-success has-analysis-action" : "cs-extension-success"}>
      <CardShell card={requestState.card} surface="extension" />
      {requestState.analysisNotice ? (
        <div className="cs-extension-analysis-notice" role="status">
          <span>Not enough verified evidence</span>
          <p>{requestState.analysisNotice}</p>
        </div>
      ) : null}
      {showRegenerateAction ? (
        <div className="cs-extension-analyze">
          <div>
            <span className="cs-extension-analyze-kicker">Needs sources</span>
            <p>Regenerate the profile before running investor analysis.</p>
          </div>
          <button className="cs-extension-button" onClick={() => handleStartGeneration("basics", true)} type="button">
            Regenerate
          </button>
        </div>
      ) : null}
      {showAnalyzeAction ? (
        <div className="cs-extension-analyze">
          <div>
            <span className="cs-extension-analyze-kicker">Investor lens</span>
            <p>Run the cited investor read from this profile.</p>
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
