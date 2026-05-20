import { hasUsablePublicProfile, type ColdStartCard } from "@cold-start/core";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { createRoot } from "react-dom/client";
import {
  defaultApiOrigin,
  normalizeApiOrigin,
  readableCompanyNameFromDomain,
  readableCardError,
  resolveStoredSettings,
  type GenerationStatus,
  type Settings
} from "./extension-config";
import { clearCachedCards, readCachedCard, writeCachedCard } from "./card-cache";
import { BrandMark } from "./BrandMark";
import { CompanyLogo } from "./CompanyLogo";
import { INSUFFICIENT_EVIDENCE_NOTICE, formatElapsed } from "./extension-format";
import type { ResearchLayerId } from "./research-layer";
import {
  fetchBootstrap,
  isActiveRun,
  markPerformance,
  pollGenerationUntilCard,
  startedAtMs,
  startGenerationAndPoll
} from "./sidepanel-network";
import type { SourcePassStage } from "./SourcePassInstrument";
import "./styles.css";

const DEFAULT_API_ORIGIN = defaultApiOrigin(import.meta.env);
const STORAGE_KEYS = ["coldStartApiOrigin", "coldStartApiToken"] as const;
const ResearchLayerPanel = lazy(() =>
  import("./ResearchLayerPanel").then((module) => ({ default: module.ResearchLayerPanel }))
);
const SourcePassInstrument = lazy(() =>
  import("./SourcePassInstrument").then((module) => ({ default: module.SourcePassInstrument }))
);

type RequestState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "readyToGenerate" }
  | { status: "generating"; generationStatus: GenerationStatus["status"]; mode: "basics"; startedAt: number }
  | {
      status: "success";
      card: ColdStartCard;
      analysisNotice?: string;
      analysisRun?: AnalysisRunState;
      contactRun?: AnalysisRunState;
      profileRefreshRun?: ProfileRefreshRunState;
    }
  | { status: "error"; message: string };

type AnalysisRunState = {
  generationStatus: "queued" | "running";
  startedAt: number;
};

type ProfileRefreshRunState = AnalysisRunState & {
  layerId: ResearchLayerId;
};

function ExtensionTopbar({
  onSettings
}: {
  onSettings?: () => void;
}) {
  if (!onSettings) {
    return null;
  }

  return (
    <>
      <div className="cs-extension-topbar">
        <button aria-label="Open settings" className="cs-icon-button" onClick={onSettings} type="button">
          <span aria-hidden="true">...</span>
        </button>
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
  title
}: {
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  onSettings?: () => void;
  title: string;
}) {
  return (
    <section aria-label={title} className={`cs-extension-frame ${className}`.trim()}>
      <ExtensionTopbar {...(onSettings ? { onSettings } : {})} />
      {children}
      {actions ? <div className="cs-extension-actions">{actions}</div> : null}
    </section>
  );
}

function PanelHeader({
  eyebrow,
  logoDomain,
  logoUrl,
  title,
  value
}: {
  eyebrow: string;
  logoDomain?: string;
  logoUrl?: string | null;
  title: string;
  value?: string;
}) {
  return (
    <div className="cs-panel-header">
      {logoDomain ? (
        <CompanyLogo className="cs-panel-company-logo" domain={logoDomain} label={title} logoUrl={logoUrl} />
      ) : (
        <span className="cs-panel-brand-mark" aria-hidden="true">
          <BrandMark />
        </span>
      )}
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
  const elapsedMs = useElapsedMilliseconds(active, startedAt, 1000);
  return Math.floor(elapsedMs / 1000);
}

function useElapsedMilliseconds(active: boolean, startedAt: number | undefined, tickMs = 1000) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active || !startedAt) {
      return;
    }

    setNow(Date.now());
    const interval = window.setInterval(() => setNow(Date.now()), tickMs);
    return () => window.clearInterval(interval);
  }, [active, startedAt, tickMs]);

  return startedAt ? Math.max(0, now - startedAt) : 0;
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
  const accessMode = apiOrigin.includes("localhost") || apiOrigin.includes("127.0.0.1") ? "Local API" : "Production API";

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
    <form className="cs-extension-frame cs-extension-form cs-intake-panel" onSubmit={handleSubmit}>
      <PanelHeader eyebrow="Access" title="Connect" value="Private cards use the browser token." />

      <div className="cs-access-card">
        <div className="cs-access-card-head">
          <span>Extension token</span>
          <strong>{accessMode}</strong>
        </div>

        <label className="cs-extension-field">
          <span>Origin</span>
          <input
            autoComplete="off"
            onChange={(event) => setApiOrigin(event.target.value)}
            type="url"
            value={apiOrigin}
          />
        </label>

        <label className="cs-extension-field">
          <span>Token</span>
          <input
            autoComplete="off"
            onChange={(event) => setApiToken(event.target.value)}
            type="password"
            value={apiToken}
          />
        </label>

        {error ? <p className="cs-extension-error">{error}</p> : null}
        <div className="cs-extension-actions">
          <span>Private cards only</span>
          <button className="cs-extension-button" type="submit">Save</button>
        </div>
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
    <ExtensionFrame className="cs-check-panel" onSettings={onSettings} title="Checking cache">
      <PanelHeader eyebrow="Current tab" logoDomain={domain} title={companyName} value={domain} />
      <div className="cs-cache-card" aria-live="polite">
        <span className="cs-cache-spinner" aria-hidden="true" />
        <div>
          <strong>Checking profile</strong>
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
  const elapsedMs = useElapsedMilliseconds(true, requestState.startedAt, 120);
  const elapsed = Math.floor(elapsedMs / 1000);
  const stages: SourcePassStage[] = [
    { label: "Sources", marker: "01", note: "Finding sources" },
    { label: "Pages", marker: "02", note: "Reading pages" },
    { label: "Facts", marker: "03", note: "Shaping facts" },
    { label: "Citations", marker: "04", note: "Citing facts" }
  ];
  const stageProgress = requestState.generationStatus === "queued"
    ? elapsedMs / 7000
    : 1 + elapsedMs / 8000;
  const clampedStageProgress = Math.min(stages.length - 0.12, Math.max(0.22, stageProgress));
  const activeIndex = Math.min(stages.length - 1, Math.max(0, Math.floor(stageProgress)));
  const statusText =
    requestState.generationStatus === "queued" && elapsed < 4
      ? "Queued"
      : "Building";
  const activeStage = stages[activeIndex] ?? stages[stages.length - 1];
  const stageNote = requestState.generationStatus === "queued" && elapsed < 4
    ? "Worker queued"
    : activeStage?.note ?? "Working from cited sources";
  const progressPercent = Math.min(97, Math.max(8, (clampedStageProgress / stages.length) * 100));
  return (
    <ExtensionFrame
      className="cs-generation-panel"
      title={domain}
    >
      <header className="cs-generation-hero">
        <CompanyLogo
          className="cs-generation-logo"
          domain={domain}
          label={companyName}
        />
        <div>
          <p className="cs-generation-status">{statusText}</p>
          <h1>{companyName}</h1>
          <p className="cs-generation-domain">{domain}</p>
        </div>
        <div className="cs-generation-run-time" aria-label={`Elapsed ${formatElapsed(elapsed)}`}>
          <span>Run</span>
          <strong>{formatElapsed(elapsed)}</strong>
        </div>
      </header>

      <Suspense fallback={<div className="cs-live-card cs-live-card-refined" aria-hidden="true" />}>
        <SourcePassInstrument
          activeIndex={activeIndex}
          progressPercent={progressPercent}
          stageNote={stageNote}
          stages={stages}
        />
      </Suspense>
    </ExtensionFrame>
  );
}

function SuccessPanel({
  domain,
  onRefreshProfile,
  onRegenerate,
  onStartAnalysis,
  requestState,
  settings
}: {
  domain: string;
  onRefreshProfile: (layerId: ResearchLayerId) => void;
  onRegenerate: () => void;
  onStartAnalysis: () => void;
  requestState: Extract<RequestState, { status: "success" }>;
  settings: Settings;
}) {
  const elapsedSeconds = useElapsedSeconds(Boolean(requestState.analysisRun), requestState.analysisRun?.startedAt);
  const contactElapsedSeconds = useElapsedSeconds(Boolean(requestState.contactRun), requestState.contactRun?.startedAt);
  const profileRefreshElapsedSeconds = useElapsedSeconds(
    Boolean(requestState.profileRefreshRun),
    requestState.profileRefreshRun?.startedAt
  );

  return (
    <Suspense fallback={<LoadingPanel domain={domain} onSettings={() => undefined} />}>
      <ResearchLayerPanel
        analysisNotice={requestState.analysisNotice}
        analysisRun={requestState.analysisRun}
        card={requestState.card}
        contactElapsedSeconds={contactElapsedSeconds}
        contactRun={requestState.contactRun}
        elapsedSeconds={elapsedSeconds}
        onRefreshProfile={onRefreshProfile}
        onRegenerate={onRegenerate}
        onStartAnalysis={() => {
          if (!settings.apiToken || !domain) {
            return;
          }

          onStartAnalysis();
        }}
        profileRefreshElapsedSeconds={profileRefreshElapsedSeconds}
        profileRefreshRun={requestState.profileRefreshRun}
      />
    </Suspense>
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
          <button className="cs-extension-button" onClick={onStart} type="button">Build profile</button>
          <button className="cs-extension-link-button" onClick={onEditSettings} type="button">
            Access
          </button>
        </>
      }
      className="cs-intake-panel cs-start-panel"
      onSettings={onEditSettings}
      title={`Open ${companyName}`}
    >
      <PanelHeader eyebrow="No profile" logoDomain={domain} title={companyName} value={domain} />
      <div className="cs-gate-card">
        <div className="cs-pass-lockup">
          <span className="cs-pass-index">01</span>
          <div>
            <span>Source pass</span>
            <h2>Build the public record.</h2>
            <p>Identity, people, funding, signals, and citations for this tab.</p>
          </div>
        </div>
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
  const profileRefreshRequest = useRef<AbortController | null>(null);
  const firstCardPainted = useRef(false);

  useEffect(() => {
    markPerformance("cold-start-shell-paint");
  }, []);

  useEffect(() => {
    if (requestState.status !== "success" || !domain || !settings) {
      return;
    }

    if (!firstCardPainted.current) {
      markPerformance("cold-start-first-card-paint");
      firstCardPainted.current = true;
    }

    void writeCachedCard(domain, settings, requestState.card);
  }, [domain, requestState, settings]);

  const abortActiveRequest = useCallback(() => {
    activeRequest.current?.abort();
    activeRequest.current = null;
  }, []);

  const abortProfileRefreshRequest = useCallback(() => {
    profileRefreshRequest.current?.abort();
    profileRefreshRequest.current = null;
  }, []);

  const abortAllRequests = useCallback(() => {
    abortActiveRequest();
    abortProfileRefreshRequest();
  }, [abortActiveRequest, abortProfileRefreshRequest]);

  const clearActiveRequest = useCallback((controller: AbortController) => {
    if (activeRequest.current === controller) {
      activeRequest.current = null;
    }
  }, []);

  const clearProfileRefreshRequest = useCallback((controller: AbortController) => {
    if (profileRefreshRequest.current === controller) {
      profileRefreshRequest.current = null;
    }
  }, []);

  const watchBasicsCompletionWithController = useCallback((
    controller: AbortController,
    generationDomain: string,
    generationSettings: Settings,
    latestCard: ColdStartCard,
    startedAt: number
  ) => {
    void pollGenerationUntilCard(
      generationDomain,
      generationSettings,
      controller.signal,
      "basics",
      (generationStatus) => {
        if (!controller.signal.aborted) {
          setRequestState((current) => current.status === "success"
            ? {
                ...current,
                contactRun: {
                  generationStatus: generationStatus === "queued" ? "queued" : "running",
                  startedAt
                }
              }
            : current);
        }
      },
      latestCard,
      true,
      (card) => {
        if (!controller.signal.aborted) {
          setRequestState((current) => current.status === "success" ? { ...current, card } : current);
        }
      }
    )
      .then((result) => {
        if (!controller.signal.aborted) {
          setRequestState((current) => {
            if (current.status !== "success") {
              return { status: "success", card: result.card };
            }

            const { contactRun: _contactRun, ...nextState } = current;
            return { ...nextState, card: result.card };
          });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setRequestState((current) => {
            if (current.status !== "success") {
              return current;
            }

            const { contactRun: _contactRun, ...nextState } = current;
            return nextState;
          });
        }
      });
  }, []);

  const runGenerationWithController = useCallback((
    controller: AbortController,
    generationDomain: string,
    generationSettings: Settings,
    mode: "basics",
    confirmStart: boolean
  ) => {
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
          const successState = result.analysisNotice
            ? { status: "success" as const, card: result.card, analysisNotice: result.analysisNotice }
            : { status: "success" as const, card: result.card };
          if (mode === "basics") {
            setRequestState({
              ...successState,
              contactRun: { generationStatus: "running", startedAt }
            });
            watchBasicsCompletionWithController(controller, generationDomain, generationSettings, result.card, startedAt);
            return;
          }

          setRequestState(successState);
        }
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        const message = caught instanceof Error ? caught.message : String(caught);
        setRequestState({ status: "error", message: readableCardError(message, generationSettings.apiOrigin) });
      })
      .finally(() => {
        clearActiveRequest(controller);
      });
  }, [clearActiveRequest, watchBasicsCompletionWithController]);

  const runAnalysisWithController = useCallback((
    controller: AbortController,
    generationDomain: string,
    generationSettings: Settings,
    currentCard: ColdStartCard
  ) => {
    const startedAt = Date.now();
    setRequestState({
      status: "success",
      card: currentCard,
      analysisRun: { generationStatus: "queued", startedAt }
    });

    void startGenerationAndPoll(
      generationDomain,
      generationSettings,
      controller.signal,
      "analysis",
      true,
      (generationStatus) => {
        if (!controller.signal.aborted) {
          setRequestState({
            status: "success",
            card: currentCard,
            analysisRun: {
              generationStatus: generationStatus === "queued" ? "queued" : "running",
              startedAt
            }
          });
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
        setRequestState({
          status: "success",
          card: currentCard,
          analysisNotice: readableCardError(message, generationSettings.apiOrigin)
        });
      })
      .finally(() => {
        clearActiveRequest(controller);
      });
  }, [clearActiveRequest]);

  const runProfileRefreshWithController = useCallback((
    controller: AbortController,
    generationDomain: string,
    generationSettings: Settings,
    currentState: Extract<RequestState, { status: "success" }>,
    layerId: ResearchLayerId
  ) => {
    const startedAt = Date.now();
    const profileRefreshRun: ProfileRefreshRunState = {
      generationStatus: "queued",
      layerId,
      startedAt
    };

    setRequestState({ ...currentState, profileRefreshRun });

    void startGenerationAndPoll(
      generationDomain,
      generationSettings,
      controller.signal,
      "basics",
      true,
      (generationStatus) => {
        if (!controller.signal.aborted) {
          setRequestState((current) => current.status === "success"
            ? {
                ...current,
                profileRefreshRun: {
                  generationStatus: generationStatus === "queued" ? "queued" : "running",
                  layerId,
                  startedAt
                }
              }
            : current);
        }
      },
      {
        forceRefresh: true,
        latestCard: currentState.card,
        waitForRunCompletion: true
      }
    )
      .then((result) => {
        if (!controller.signal.aborted) {
          setRequestState((current) => {
            if (current.status !== "success") {
              return { status: "success", card: result.card };
            }

            const { profileRefreshRun: _profileRefreshRun, ...nextState } = current;
            return { ...nextState, card: result.card };
          });
        }
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        const message = caught instanceof Error ? caught.message : String(caught);
        setRequestState((current) => {
          if (current.status !== "success") {
            return { status: "error", message: readableCardError(message, generationSettings.apiOrigin) };
          }

          const { profileRefreshRun: _profileRefreshRun, ...nextState } = current;
          return {
            ...nextState,
            analysisNotice: readableCardError(message, generationSettings.apiOrigin)
          };
        });
      })
      .finally(() => {
        clearProfileRefreshRequest(controller);
      });
  }, [clearProfileRefreshRequest]);

  const resumeAnalysisWithController = useCallback((
    controller: AbortController,
    generationDomain: string,
    generationSettings: Settings,
    generationStatus: "queued" | "running",
    runStartedAt: string | undefined,
    latestCard: ColdStartCard
  ) => {
    const startedAt = startedAtMs(runStartedAt);
    setRequestState({
      status: "success",
      card: latestCard,
      analysisRun: { generationStatus, startedAt }
    });

    void pollGenerationUntilCard(
      generationDomain,
      generationSettings,
      controller.signal,
      "analysis",
      (nextGenerationStatus) => {
        if (!controller.signal.aborted) {
          setRequestState({
            status: "success",
            card: latestCard,
            analysisRun: {
              generationStatus: nextGenerationStatus === "queued" ? "queued" : "running",
              startedAt
            }
          });
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
        setRequestState({
          status: "success",
          card: latestCard,
          analysisNotice: readableCardError(message, generationSettings.apiOrigin)
        });
      })
      .finally(() => {
        clearActiveRequest(controller);
      });
  }, [clearActiveRequest]);

  const resumeGenerationWithController = useCallback((
    controller: AbortController,
    generationDomain: string,
    generationSettings: Settings,
    mode: "basics",
    generationStatus: "queued" | "running",
    runStartedAt?: string,
    latestCard: ColdStartCard | null = null
  ) => {
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
      })
      .finally(() => {
        clearActiveRequest(controller);
      });
  }, [clearActiveRequest]);

  useEffect(() => {
    let mounted = true;

    markPerformance("cold-start-settings-read-start");
    void Promise.all([readActiveDomain(), readSettings()]).then(([activeDomain, savedSettings]) => {
      if (!mounted) {
        return;
      }

      markPerformance("cold-start-settings-read-end");
      setDomain(activeDomain);
      setSettings(savedSettings);
    });

    function handleStorageChange(changes: Record<string, chrome.storage.StorageChange>, areaName: string) {
      if (areaName !== "session" || !changes.activeDomain) {
        return;
      }

      const nextDomain = changes.activeDomain.newValue;
      abortAllRequests();
      firstCardPainted.current = false;
      setRequestState({ status: "idle" });
      setDomain(typeof nextDomain === "string" ? nextDomain : null);
    }

    chrome.storage.onChanged.addListener(handleStorageChange);

    return () => {
      mounted = false;
      abortAllRequests();
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, [abortAllRequests]);

  useEffect(() => {
    if (!domain || !settings?.apiToken) {
      abortAllRequests();
      setRequestState({ status: "idle" });
      return;
    }

    const controller = new AbortController();
    abortAllRequests();
    activeRequest.current = controller;
    setRequestState({ status: "loading" });

    void (async () => {
      let showedCachedCard = false;

      const cachedCard = await readCachedCard(domain, settings).catch(() => null);
      if (cachedCard && !controller.signal.aborted) {
        showedCachedCard = true;
        setRequestState({ status: "success", card: cachedCard });
      }

      try {
        const bootstrap = await fetchBootstrap(domain, settings, controller.signal);
        const card = bootstrap.card;

        if (card) {
          if (!hasUsablePublicProfile(card)) {
            runGenerationWithController(controller, domain, settings, "basics", true);
            return;
          }

          const analysisStatus = bootstrap.runs.analysis;
          if (isActiveRun(analysisStatus.status) && !card.synthesis) {
            resumeAnalysisWithController(controller, domain, settings, analysisStatus.status, analysisStatus.startedAt, card);
            return;
          }

          const basicsStatus = bootstrap.runs.basics;
          if (isActiveRun(basicsStatus.status)) {
            const startedAt = startedAtMs(basicsStatus.startedAt);
            setRequestState({
              status: "success",
              card,
              contactRun: {
                generationStatus: basicsStatus.status === "queued" ? "queued" : "running",
                startedAt
              }
            });
            watchBasicsCompletionWithController(controller, domain, settings, card, startedAt);
            return;
          }

          setRequestState(
            analysisStatus.status === "failed" && !card.synthesis
              ? { status: "success", card, analysisNotice: INSUFFICIENT_EVIDENCE_NOTICE }
              : { status: "success", card }
          );
          clearActiveRequest(controller);
          return;
        }

        const basicsStatus = bootstrap.runs.basics;
        if (isActiveRun(basicsStatus.status)) {
          resumeGenerationWithController(controller, domain, settings, "basics", basicsStatus.status, basicsStatus.startedAt);
          return;
        }

        if (basicsStatus.status === "failed") {
          setRequestState({
            status: "error",
            message: readableCardError(basicsStatus.error ?? "Generation failed before a card was produced.", settings.apiOrigin)
          });
          clearActiveRequest(controller);
          return;
        }

        clearActiveRequest(controller);
        setRequestState({ status: "readyToGenerate" });
      } catch (caught) {
        if (controller.signal.aborted) {
          return;
        }

        if (showedCachedCard) {
          clearActiveRequest(controller);
          return;
        }

        const message = caught instanceof Error ? caught.message : String(caught);
        clearActiveRequest(controller);
        setRequestState({ status: "error", message: readableCardError(message, settings.apiOrigin) });
      }
    })();

    return () => {
      controller.abort();
      if (activeRequest.current === controller) {
        activeRequest.current = null;
      }
    };
  }, [
    abortAllRequests,
    clearActiveRequest,
    domain,
    resumeAnalysisWithController,
    resumeGenerationWithController,
    runGenerationWithController,
    settings,
    watchBasicsCompletionWithController
  ]);

  function handleStartGeneration(mode: "basics", confirmStart: boolean) {
    if (!domain || !settings?.apiToken) {
      return;
    }

    const controller = new AbortController();
    abortAllRequests();
    activeRequest.current = controller;
    runGenerationWithController(controller, domain, settings, mode, confirmStart);
  }

  function handleRefreshProfile(layerId: ResearchLayerId) {
    if (!domain || !settings?.apiToken || requestState.status !== "success" || requestState.profileRefreshRun) {
      return;
    }

    const controller = new AbortController();
    abortProfileRefreshRequest();
    profileRefreshRequest.current = controller;
    runProfileRefreshWithController(controller, domain, settings, requestState, layerId);
  }

  if (!settings) {
    return (
      <ExtensionFrame className="cs-check-panel" title="Loading settings">
        <PanelHeader eyebrow="Loading" title="Settings" value="Reading extension settings." />
      </ExtensionFrame>
    );
  }

  if (!settings.apiToken || showSettings) {
    return (
      <SettingsForm
        initialSettings={settings}
        onSave={(nextSettings) => {
          void clearCachedCards().finally(() => {
            firstCardPainted.current = false;
            setSettings(nextSettings);
            setShowSettings(false);
          });
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
        title="No company tab selected"
      >
        <PanelHeader eyebrow="Idle" title="No company tab" value="Open a company website, then return here." />
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
          <>
            <button className="cs-extension-button" onClick={() => handleStartGeneration("basics", true)} type="button">
              Try again
            </button>
            <button className="cs-extension-link-button" onClick={() => setShowSettings(true)} type="button">
              Settings
            </button>
          </>
        }
        className="cs-extension-error-plate"
        onSettings={() => setShowSettings(true)}
        title="Card unavailable"
      >
        <PanelHeader eyebrow="Request failed" logoDomain={domain} title="Card unavailable" value={domain} />
        <p className="cs-extension-error">{requestState.message}</p>
      </ExtensionFrame>
    );
  }

  return (
    <SuccessPanel
      domain={domain}
      onRefreshProfile={handleRefreshProfile}
      onRegenerate={() => handleStartGeneration("basics", true)}
      onStartAnalysis={() => {
        if (!domain || !settings.apiToken || requestState.status !== "success") {
          return;
        }

        const controller = new AbortController();
        abortActiveRequest();
        activeRequest.current = controller;
        runAnalysisWithController(controller, domain, settings, requestState.card);
      }}
      requestState={requestState}
      settings={settings}
    />
  );
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(<SidePanel />);
}
