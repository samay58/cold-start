import { deriveResearchSectionsFromCard, hasUsablePublicProfile, type ColdStartCard, type ResearchSection } from "@cold-start/core";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { createRoot } from "react-dom/client";
import {
  defaultApiOrigin,
  normalizeApiOrigin,
  readableCompanyNameFromDomain,
  readableCardError,
  resolveStoredSettings,
  type GenerationRunStatus,
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
      sections?: ResearchSection[];
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
        sections={requestState.sections}
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
  const sourcePassSections = [
    {
      description: "Founders and operators",
      marker: "01",
      tone: "people",
      title: "People"
    },
    {
      description: "Rounds and investors",
      marker: "02",
      tone: "funding",
      title: "Funding"
    },
    {
      description: "Launches and traction",
      marker: "03",
      tone: "signals",
      title: "Traction"
    },
    {
      description: "Source references",
      marker: "04",
      tone: "citations",
      title: "Citations"
    }
  ] as const;

  return (
    <ExtensionFrame
      className="cs-intake-panel cs-start-panel"
      title={`Open ${companyName}`}
    >
      <header className="cs-start-topbar">
        <button aria-label="Open settings" className="cs-start-settings" onClick={onEditSettings} type="button">
          <span aria-hidden="true">...</span>
        </button>
      </header>

      <section className="cs-start-hero" aria-label={`Build a profile for ${companyName}`}>
        <h1>Build the public record</h1>
        <p>Identity, people, funding, signals, and citations for this tab.</p>
        <div className="cs-start-actions">
          <button className="cs-start-primary" onClick={onStart} type="button">
            <span>Start source pass</span>
            <svg aria-hidden="true" height="18" viewBox="0 0 18 18" width="18">
              <path d="M3 9h11" />
              <path d="m10 4.5 4.5 4.5L10 13.5" />
            </svg>
          </button>
        </div>
      </section>

      <section className="cs-start-company" aria-label="Current tab">
        <CompanyLogo className="cs-start-company-logo" domain={domain} label={companyName} />
        <div className="cs-start-company-copy">
          <h2>{companyName}</h2>
          <p>{domain}</p>
        </div>
        <span className="cs-start-company-rule" aria-hidden="true" />
        <span className="cs-start-status">No profile</span>
      </section>

      <section className="cs-start-pile" aria-label="Source pass scope">
        <span className="cs-start-pile-back cs-start-pile-back-left" aria-hidden="true" />
        <span className="cs-start-pile-back cs-start-pile-back-right" aria-hidden="true" />
        {sourcePassSections.map((section) => (
          <article className="cs-start-pass-card" data-tone={section.tone} key={section.title}>
            <span className="cs-start-pass-icon" aria-hidden="true">
              {section.tone === "people" ? (
                <svg height="23" viewBox="0 0 24 24" width="23">
                  <path d="M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
                  <path d="M16 11a3 3 0 0 0 0-6" />
                  <path d="M3.5 19c0-3.1 2-5 4.5-5s4.5 1.9 4.5 5" />
                  <path d="M14 14.2c2.4.5 4 2.2 4 4.8" />
                </svg>
              ) : section.tone === "funding" ? (
                <span>$</span>
              ) : section.tone === "signals" ? (
                <svg height="24" viewBox="0 0 24 24" width="24">
                  <path d="M3 13h4l2.2-8 4 15 2.3-8H21" />
                </svg>
              ) : (
                <svg height="23" viewBox="0 0 24 24" width="23">
                  <path d="M8 7H5.5C4.7 7 4 7.7 4 8.5v4c0 .8.7 1.5 1.5 1.5H8v3.5c0 .8.7 1.5 1.5 1.5s1.5-.7 1.5-1.5v-9C11 7.7 10.3 7 9.5 7H8Z" />
                  <path d="M18 7h-2.5c-.8 0-1.5.7-1.5 1.5v4c0 .8.7 1.5 1.5 1.5H18v3.5c0 .8.7 1.5 1.5 1.5s1.5-.7 1.5-1.5v-9c0-.8-.7-1.5-1.5-1.5H18Z" />
                </svg>
              )}
            </span>
            <span className="cs-start-pass-copy">
              <strong>{section.title}</strong>
              <span>{section.description}</span>
            </span>
            <span className="cs-start-pass-marker">{section.marker}</span>
          </article>
        ))}
      </section>
    </ExtensionFrame>
  );
}

function shouldResumeAnalysisRun(
  card: ColdStartCard,
  status: GenerationRunStatus["status"]
): status is "queued" | "running" {
  return isActiveRun(status) && (!card.synthesis || !card.synthesis.marketStructureAndTiming);
}

function shouldForceMarketAnalysisRefresh(card: ColdStartCard) {
  return Boolean(card.synthesis && !card.synthesis.marketStructureAndTiming);
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
          setRequestState((current) => current.status === "success" ? { ...current, card, sections: deriveResearchSectionsFromCard(card) } : current);
        }
      }
    )
      .then((result) => {
        if (!controller.signal.aborted) {
          setRequestState((current) => {
            if (current.status !== "success") {
              return { status: "success", card: result.card, sections: deriveResearchSectionsFromCard(result.card) };
            }

            const { contactRun: _contactRun, ...nextState } = current;
            return { ...nextState, card: result.card, sections: deriveResearchSectionsFromCard(result.card) };
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
            ? { status: "success" as const, card: result.card, sections: deriveResearchSectionsFromCard(result.card), analysisNotice: result.analysisNotice }
            : { status: "success" as const, card: result.card, sections: deriveResearchSectionsFromCard(result.card) };
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
      sections: deriveResearchSectionsFromCard(currentCard),
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
            sections: deriveResearchSectionsFromCard(currentCard),
            analysisRun: {
              generationStatus: generationStatus === "queued" ? "queued" : "running",
              startedAt
            }
          });
        }
      },
      { forceRefresh: shouldForceMarketAnalysisRefresh(currentCard) }
    )
      .then((result) => {
        if (!controller.signal.aborted) {
          setRequestState(
            result.analysisNotice
              ? { status: "success", card: result.card, sections: deriveResearchSectionsFromCard(result.card), analysisNotice: result.analysisNotice }
              : { status: "success", card: result.card, sections: deriveResearchSectionsFromCard(result.card) }
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
          sections: deriveResearchSectionsFromCard(currentCard),
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
              return { status: "success", card: result.card, sections: deriveResearchSectionsFromCard(result.card) };
            }

            const { profileRefreshRun: _profileRefreshRun, ...nextState } = current;
            return { ...nextState, card: result.card, sections: deriveResearchSectionsFromCard(result.card) };
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
      sections: deriveResearchSectionsFromCard(latestCard),
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
            sections: deriveResearchSectionsFromCard(latestCard),
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
              ? { status: "success", card: result.card, sections: deriveResearchSectionsFromCard(result.card), analysisNotice: result.analysisNotice }
              : { status: "success", card: result.card, sections: deriveResearchSectionsFromCard(result.card) }
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
          sections: deriveResearchSectionsFromCard(latestCard),
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
              ? { status: "success", card: result.card, sections: deriveResearchSectionsFromCard(result.card), analysisNotice: result.analysisNotice }
              : { status: "success", card: result.card, sections: deriveResearchSectionsFromCard(result.card) }
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
        setRequestState({ status: "success", card: cachedCard, sections: deriveResearchSectionsFromCard(cachedCard) });
      }

      try {
        const bootstrap = await fetchBootstrap(domain, settings, controller.signal);
        const card = bootstrap.card;
        const bootstrapSections = bootstrap.sections ?? [];

        if (card) {
          if (!hasUsablePublicProfile(card)) {
            runGenerationWithController(controller, domain, settings, "basics", true);
            return;
          }

          const analysisStatus = bootstrap.runs.analysis;
          if (shouldResumeAnalysisRun(card, analysisStatus.status)) {
            resumeAnalysisWithController(controller, domain, settings, analysisStatus.status, analysisStatus.startedAt, card);
            return;
          }

          const basicsStatus = bootstrap.runs.basics;
          if (isActiveRun(basicsStatus.status)) {
            const startedAt = startedAtMs(basicsStatus.startedAt);
            setRequestState({
              status: "success",
              card,
              sections: bootstrapSections,
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
              ? { status: "success", card, sections: bootstrapSections, analysisNotice: INSUFFICIENT_EVIDENCE_NOTICE }
              : { status: "success", card, sections: bootstrapSections }
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
