import { canRunInvestorAnalysis, companySlugFromDomain, hasUsablePublicProfile, layerIdForSection, type ColdStartCard, type ResearchSection } from "@cold-start/core";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { AnimatePresence, motion } from "framer-motion";
import {
  ApiError,
  defaultApiOrigin,
  normalizeApiOrigin,
  readableCompanyNameFromDomain,
  readableCardError,
  resolveStoredSettings,
  type ExtensionResearchRunEvent,
  type ExtensionSourceSummary,
  type GenerationRunStatus,
  type GenerationStatus,
  type Settings
} from "./shared/extension-config";
import { clearCachedCards, readCachedCard, writeCachedCard } from "./shared/card-cache";
import { BrandMark } from "./shared/BrandMark";
import { CompanyArc, type CompanyArcState } from "./company/CompanyArc";
import { CompanyLogo } from "./company/CompanyLogo";
import { INSUFFICIENT_EVIDENCE_NOTICE } from "./shared/extension-format";
import { sectionIdForLayer, type ResearchLayerId } from "./research/research-layer";
import { useTheme, type ThemePreference } from "./shared/theme";
import {
  fetchBootstrap,
  isActiveRun,
  markPerformance,
  pollGenerationUntilCard,
  resumeSectionGenerationAndPoll,
  sectionsForCard,
  startedAtMs,
  startAnalysisGenerationAndPoll,
  startBasicsGenerationAndPoll,
  startSectionGenerationAndPoll,
  type GenerationStatusListener
} from "./sidepanel-network";
import { motionTokens } from "./shared/motion-primitives";
import { usePrefersReducedMotion } from "./shared/usePrefersReducedMotion";
import "./styles.css";

const DEFAULT_API_ORIGIN = defaultApiOrigin(import.meta.env);
const SECTION_RUN_CONCURRENCY = 1;
const STORAGE_KEYS = ["coldStartApiOrigin", "coldStartApiToken"] as const;
const STALE_CACHE_NOTICE = "Could not check for a fresher profile. Showing the saved profile.";

type RequestState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "readyToGenerate" }
  | { status: "generating"; events?: ExtensionResearchRunEvent[]; generationStatus: GenerationStatus["status"]; mode: "basics"; startedAt: number }
  | {
      status: "success";
      card: ColdStartCard;
      sections: ResearchSection[];
      analysisNotice?: string;
      analysisRun?: AnalysisRunState;
      contactRun?: AnalysisRunState;
      profileRun?: AnalysisRunState;
      activeSectionRun?: ActiveSectionRunState;
      events?: ExtensionResearchRunEvent[];
      sources?: ExtensionSourceSummary[];
      cachedAtMs?: number;
    }
  | { status: "pending"; domain: string }
  | { status: "error"; message: string };

// A 202 from the poller means the client deadline elapsed while the run is still active. The card
// persists server-side near the end of a run, so this is recoverable: surface a calm "still
// researching" state (with a recheck) instead of a hard failure.
function stillGeneratingState(caught: unknown, generationDomain: string): RequestState | null {
  return caught instanceof ApiError && caught.status === 202
    ? { status: "pending", domain: generationDomain }
    : null;
}

type AnalysisRunState = {
  generationStatus: "queued" | "running";
  startedAt: number;
};

type ActiveSectionRunState = AnalysisRunState & {
  layerId: ResearchLayerId;
};

function runningSectionLayerId(sections: ResearchSection[]) {
  const section = sections.find((candidate) => candidate.status === "running");
  return section ? layerIdForSection(section.sectionId) : null;
}

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

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" }
];

function ThemeToggle({
  preference,
  onChange
}: {
  preference: ThemePreference;
  onChange: (preference: ThemePreference) => void;
}) {
  return (
    <fieldset className="cs-theme-toggle">
      <legend>Appearance</legend>
      <div className="cs-theme-toggle-options" role="radiogroup" aria-label="Theme">
        {THEME_OPTIONS.map((option) => (
          <button
            aria-checked={preference === option.value}
            className="cs-theme-toggle-option"
            data-active={preference === option.value}
            key={option.value}
            onClick={() => onChange(option.value)}
            role="radio"
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>
      <p className="cs-theme-toggle-hint">Auto follows your browser.</p>
    </fieldset>
  );
}

function SettingsForm({
  initialSettings,
  onSave,
  themePreference,
  onThemePreferenceChange
}: {
  initialSettings: Settings;
  onSave: (settings: Settings) => void;
  themePreference?: ThemePreference;
  onThemePreferenceChange?: (preference: ThemePreference) => void;
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

      {themePreference && onThemePreferenceChange ? (
        <ThemeToggle onChange={onThemePreferenceChange} preference={themePreference} />
      ) : null}
    </form>
  );
}

function LoadingPanel({
  apiOrigin = DEFAULT_API_ORIGIN,
  domain,
  onSettings
}: {
  apiOrigin?: string;
  domain: string;
  onSettings: () => void;
}) {
  const companyName = readableCompanyNameFromDomain(domain);
  const slug = companySlugFromDomain(domain);
  const cardHref = `${apiOrigin.replace(/\/+$/, "")}/c/${slug}`;

  return (
    <ExtensionFrame className="cs-loading-panel" onSettings={onSettings} title="Checking cache">
      <div className="cs-cache-card" aria-live="polite">
        <span className="cs-eye-loader" role="img" aria-label={`Looking up ${companyName}`}>
          <svg viewBox="0 0 48 28" width="42" height="25" aria-hidden="true">
            <path
              className="cs-eye-lid"
              d="M2 14 C 13 2, 35 2, 46 14 C 35 26, 13 26, 2 14 Z"
              fill="none"
              stroke="var(--color-ink)"
              strokeLinejoin="round"
              strokeWidth="2"
            />
            <g className="cs-eye-iris">
              <circle cx="24" cy="14" r="7" fill="var(--color-seal)" />
              <circle cx="24" cy="14" r="3" fill="#0b0b10" />
              <circle cx="26.4" cy="11.4" r="1.4" fill="rgba(255,255,255,0.85)" />
            </g>
          </svg>
        </span>
        <p>
          Checking if{" "}
          <a className="cs-cache-slug-link" href={cardHref} rel="noreferrer" target="_blank">
            {companyName}
          </a>{" "}
          already exists…
        </p>
      </div>
    </ExtensionFrame>
  );
}

function shouldResumeAnalysisRun(
  card: ColdStartCard,
  status: GenerationRunStatus["status"]
): status is "queued" | "running" {
  return isActiveRun(status) && (!card.synthesis || !card.synthesis.marketStructureAndTiming);
}

export function SidePanel() {
  const prefersReducedMotion = usePrefersReducedMotion();
  const { preference: themePreference, setPreference: setThemePreference } = useTheme();
  const [domain, setDomain] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [requestState, setRequestState] = useState<RequestState>({ status: "idle" });
  const [sectionQueue, setSectionQueue] = useState<ResearchLayerId[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const activeRequest = useRef<AbortController | null>(null);
  const sectionGenerationRequest = useRef<AbortController | null>(null);
  const firstCardPainted = useRef(false);

  useEffect(() => {
    markPerformance("cold-start-shell-paint");
  }, []);

  useEffect(() => {
    setSectionQueue([]);
  }, [domain]);

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

  const abortSectionGenerationRequest = useCallback(() => {
    sectionGenerationRequest.current?.abort();
    sectionGenerationRequest.current = null;
  }, []);

  const abortAllRequests = useCallback(() => {
    abortActiveRequest();
    abortSectionGenerationRequest();
  }, [abortActiveRequest, abortSectionGenerationRequest]);

  const clearActiveRequest = useCallback((controller: AbortController) => {
    if (activeRequest.current === controller) {
      activeRequest.current = null;
    }
  }, []);

  const clearSectionGenerationRequest = useCallback((controller: AbortController) => {
    if (sectionGenerationRequest.current === controller) {
      sectionGenerationRequest.current = null;
    }
  }, []);

  const watchBasicsCompletionWithController = useCallback((
    controller: AbortController,
    generationDomain: string,
    generationSettings: Settings,
    latestCard: ColdStartCard,
    startedAt: number
  ) => {
    return pollGenerationUntilCard(
      generationDomain,
      generationSettings,
      controller.signal,
      "basics",
      (generationStatus, update) => {
        if (!controller.signal.aborted) {
          setRequestState((current) => current.status === "success"
            ? {
                ...current,
                ...(update?.events ? { events: update.events } : {}),
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
      (result) => {
        if (!controller.signal.aborted) {
          setRequestState((current) => current.status === "success" ? { ...current, card: result.card, sections: sectionsForCard(result.card, current.sections) } : current);
        }
      }
    )
      .then((result) => {
        if (!controller.signal.aborted) {
          setRequestState((current) => {
            if (current.status !== "success") {
              return current;
            }

            const { contactRun: _contactRun, ...nextState } = current;
            return { ...nextState, card: result.card, sections: sectionsForCard(result.card, current.sections) };
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

  const runBasicsGenerationWithController = useCallback((
    controller: AbortController,
    generationDomain: string,
    generationSettings: Settings,
    confirmStart: boolean
  ) => {
    const mode = "basics" as const;
    const startedAt = Date.now();
    setRequestState({ status: "generating", generationStatus: "queued", mode, startedAt });

    void startBasicsGenerationAndPoll(
      generationDomain,
      generationSettings,
      controller.signal,
      confirmStart,
      (generationStatus, update) => {
        if (!controller.signal.aborted) {
          setRequestState((current) => {
            const events = update?.events ?? (current.status === "generating" ? current.events : undefined);
            return {
              status: "generating",
              generationStatus,
              mode,
              startedAt,
              ...(events ? { events } : {})
            };
          });
        }
      }
    )
      .then((result) => {
        if (!controller.signal.aborted) {
          const successState = result.analysisNotice
            ? { status: "success" as const, card: result.card, sections: result.sections, analysisNotice: result.analysisNotice }
            : { status: "success" as const, card: result.card, sections: result.sections };
          // Generation events carry the Early read and its filing state across the phase change;
          // dropping them here filed the read prematurely the moment the profile arrived.
          setRequestState((current) => ({
            ...successState,
            ...(current.status === "generating" && current.events ? { events: current.events } : {}),
            contactRun: { generationStatus: "running", startedAt }
          }));
          return watchBasicsCompletionWithController(controller, generationDomain, generationSettings, result.card, startedAt);
        }

        return undefined;
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        const pending = stillGeneratingState(caught, generationDomain);
        if (pending) {
          setRequestState(pending);
          return;
        }

        const message = caught instanceof Error ? caught.message : String(caught);
        setRequestState({ status: "error", message: readableCardError(message, generationSettings.apiOrigin) });
      })
      .finally(() => {
        clearActiveRequest(controller);
      });
  }, [clearActiveRequest, watchBasicsCompletionWithController]);

  const runSectionGenerationWithController = useCallback((
    controller: AbortController,
    generationDomain: string,
    generationSettings: Settings,
    currentState: Extract<RequestState, { status: "success" }>,
    layerId: ResearchLayerId,
    behavior: "start" | "resume" = "start"
  ) => {
    const startedAt = Date.now();
    const activeSectionRun: ActiveSectionRunState = {
      generationStatus: behavior === "resume" ? "running" : "queued",
      layerId,
      startedAt
    };

    setRequestState({ ...currentState, activeSectionRun });

    const sectionId = sectionIdForLayer(layerId);
    const handleGenerationStatus: GenerationStatusListener = (generationStatus) => {
      if (!controller.signal.aborted) {
        setRequestState((current) => current.status === "success"
          ? {
              ...current,
              activeSectionRun: {
                generationStatus: generationStatus === "queued" ? "queued" : "running",
                layerId,
                startedAt
              }
            }
          : current);
      }
    };
    const sectionRequest = behavior === "resume"
      ? resumeSectionGenerationAndPoll(
          generationDomain,
          generationSettings,
          controller.signal,
          sectionId,
          currentState.card,
          currentState.sections,
          handleGenerationStatus,
        )
      : startSectionGenerationAndPoll(
          generationDomain,
          generationSettings,
          controller.signal,
          sectionId,
          currentState.card,
          currentState.sections,
          handleGenerationStatus,
        );

    void sectionRequest
      .then((result) => {
        if (!controller.signal.aborted) {
          setRequestState((current) => {
            if (current.status !== "success") {
              return { status: "success", card: result.card, sections: result.sections };
            }

            const { activeSectionRun: _activeSectionRun, analysisNotice: _analysisNotice, ...nextState } = current;
            return {
              ...nextState,
              card: result.card,
              sections: result.sections,
              ...(result.analysisNotice ? { analysisNotice: result.analysisNotice } : {})
            };
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

          const { activeSectionRun: _activeSectionRun, ...nextState } = current;
          return {
            ...nextState,
            analysisNotice: readableCardError(message, generationSettings.apiOrigin)
          };
        });
      })
      .finally(() => {
        clearSectionGenerationRequest(controller);
      });
  }, [clearSectionGenerationRequest]);

  const resumeAnalysisWithController = useCallback((
    controller: AbortController,
    generationDomain: string,
    generationSettings: Settings,
    generationStatus: "queued" | "running",
    runStartedAt: string | undefined,
    latestCard: ColdStartCard,
    latestSections: ResearchSection[]
  ) => {
    const startedAt = startedAtMs(runStartedAt);
    setRequestState({
      status: "success",
      card: latestCard,
      sections: latestSections,
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
            sections: latestSections,
            analysisRun: {
              generationStatus: nextGenerationStatus === "queued" ? "queued" : "running",
              startedAt
            }
          });
        }
      },
      latestCard,
      false,
      undefined,
      latestSections
    )
      .then((result) => {
        if (!controller.signal.aborted) {
          setRequestState(
            result.analysisNotice
              ? { status: "success", card: result.card, sections: result.sections, analysisNotice: result.analysisNotice }
              : { status: "success", card: result.card, sections: result.sections }
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
          sections: latestSections,
          analysisNotice: readableCardError(message, generationSettings.apiOrigin)
        });
      })
      .finally(() => {
        clearActiveRequest(controller);
      });
  }, [clearActiveRequest]);

  const runAnalysisGenerationWithController = useCallback((
    controller: AbortController,
    generationDomain: string,
    generationSettings: Settings,
    currentState: Extract<RequestState, { status: "success" }>
  ) => {
    const startedAt = Date.now();
    setRequestState({ ...currentState, analysisRun: { generationStatus: "queued", startedAt } });

    void startAnalysisGenerationAndPoll(
      generationDomain,
      generationSettings,
      controller.signal,
      true,
      currentState.card,
      currentState.sections,
      (generationStatus) => {
        if (!controller.signal.aborted) {
          setRequestState((current) => current.status === "success"
            ? {
                ...current,
                analysisRun: {
                  generationStatus: generationStatus === "queued" ? "queued" : "running",
                  startedAt
                }
              }
            : current);
        }
      }
    )
      .then((result) => {
        if (!controller.signal.aborted) {
          setRequestState((current) => {
            if (current.status !== "success") {
              return { status: "success", card: result.card, sections: result.sections };
            }

            const { analysisRun: _analysisRun, ...nextState } = current;
            return {
              ...nextState,
              card: result.card,
              sections: sectionsForCard(result.card, current.sections),
              ...(result.analysisNotice ? { analysisNotice: result.analysisNotice } : {})
            };
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

          const { analysisRun: _analysisRun, ...nextState } = current;
          return { ...nextState, analysisNotice: readableCardError(message, generationSettings.apiOrigin) };
        });
      })
      .finally(() => {
        clearActiveRequest(controller);
      });
  }, [clearActiveRequest]);

  const resumeBasicsGenerationWithController = useCallback((
    controller: AbortController,
    generationDomain: string,
    generationSettings: Settings,
    generationStatus: "queued" | "running",
    runStartedAt?: string,
    latestCard: ColdStartCard | null = null,
    events: ExtensionResearchRunEvent[] = []
  ) => {
    const mode = "basics" as const;
    const startedAt = startedAtMs(runStartedAt);
    setRequestState({ status: "generating", events, generationStatus, mode, startedAt });

    void pollGenerationUntilCard(
      generationDomain,
      generationSettings,
      controller.signal,
      mode,
      (generationStatus, update) => {
        if (!controller.signal.aborted) {
          setRequestState((current) => {
            const events = update?.events ?? (current.status === "generating" ? current.events : undefined);
            return {
              status: "generating",
              generationStatus,
              mode,
              startedAt,
              ...(events ? { events } : {})
            };
          });
        }
      },
      latestCard
    )
      .then((result) => {
        if (!controller.signal.aborted) {
          const successState = result.analysisNotice
            ? { status: "success" as const, card: result.card, sections: result.sections, analysisNotice: result.analysisNotice }
            : { status: "success" as const, card: result.card, sections: result.sections };
          // Generation events carry the Early read and its filing state across the phase change;
          // dropping them here filed the read prematurely the moment the profile arrived.
          setRequestState((current) => ({
            ...successState,
            ...(current.status === "generating" && current.events ? { events: current.events } : {}),
            contactRun: { generationStatus: "running", startedAt }
          }));
          return watchBasicsCompletionWithController(controller, generationDomain, generationSettings, result.card, startedAt);
        }

        return undefined;
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        const pending = stillGeneratingState(caught, generationDomain);
        if (pending) {
          setRequestState(pending);
          return;
        }

        const message = caught instanceof Error ? caught.message : String(caught);
        setRequestState({ status: "error", message: readableCardError(message, generationSettings.apiOrigin) });
      })
      .finally(() => {
        clearActiveRequest(controller);
      });
  }, [clearActiveRequest, watchBasicsCompletionWithController]);

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

      const cachedEntry = await readCachedCard(domain, settings).catch(() => null);
      if (cachedEntry && !controller.signal.aborted) {
        showedCachedCard = true;
        setRequestState({
          status: "success",
          card: cachedEntry.card,
          sections: sectionsForCard(cachedEntry.card),
          events: [],
          sources: [],
          cachedAtMs: cachedEntry.storedAtMs
        });
      }

      try {
        const bootstrap = await fetchBootstrap(domain, settings, controller.signal);
        const card = bootstrap.card;
        const bootstrapSections = bootstrap.sections ?? [];

        if (card) {
          if (!hasUsablePublicProfile(card)) {
            runBasicsGenerationWithController(controller, domain, settings, true);
            return;
          }

          const analysisStatus = bootstrap.runs.analysis;
          if (shouldResumeAnalysisRun(card, analysisStatus.status)) {
            resumeAnalysisWithController(controller, domain, settings, analysisStatus.status, analysisStatus.startedAt, card, bootstrapSections);
            return;
          }

          const basicsStatus = bootstrap.runs.basics;
          if (isActiveRun(basicsStatus.status)) {
            const startedAt = startedAtMs(basicsStatus.startedAt);
            setRequestState({
              status: "success",
              card,
              sections: bootstrapSections,
              events: bootstrap.events ?? [],
              sources: bootstrap.sources ?? [],
              contactRun: {
                generationStatus: basicsStatus.status === "queued" ? "queued" : "running",
                startedAt
              }
            });
            watchBasicsCompletionWithController(controller, domain, settings, card, startedAt);
            return;
          }

          const successState: Extract<RequestState, { status: "success" }> = analysisStatus.status === "failed" && !card.synthesis
            ? { status: "success", card, sections: bootstrapSections, events: bootstrap.events ?? [], sources: bootstrap.sources ?? [], analysisNotice: INSUFFICIENT_EVIDENCE_NOTICE }
            : { status: "success", card, sections: bootstrapSections, events: bootstrap.events ?? [], sources: bootstrap.sources ?? [] };
          const runningLayerId = runningSectionLayerId(bootstrapSections);
          if (runningLayerId) {
            const sectionController = new AbortController();
            sectionGenerationRequest.current = sectionController;
            clearActiveRequest(controller);
            runSectionGenerationWithController(sectionController, domain, settings, successState, runningLayerId, "resume");
            return;
          }

          setRequestState(successState);
          clearActiveRequest(controller);
          return;
        }

        const basicsStatus = bootstrap.runs.basics;
        if (isActiveRun(basicsStatus.status)) {
          resumeBasicsGenerationWithController(controller, domain, settings, basicsStatus.status, basicsStatus.startedAt, null, bootstrap.events ?? []);
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
          setRequestState((current) => current.status === "success"
            ? { ...current, analysisNotice: STALE_CACHE_NOTICE }
            : current);
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
    resumeBasicsGenerationWithController,
    runBasicsGenerationWithController,
    runSectionGenerationWithController,
    settings,
    watchBasicsCompletionWithController
  ]);

  function handleStartGeneration(confirmStart: boolean) {
    if (!domain || !settings?.apiToken) {
      return;
    }

    setSectionQueue([]);
    const controller = new AbortController();
    abortAllRequests();
    activeRequest.current = controller;
    runBasicsGenerationWithController(controller, domain, settings, confirmStart);
  }

  function handleRunSection(layerId: ResearchLayerId) {
    if (!domain || !settings?.apiToken || requestState.status !== "success") {
      return;
    }

    if (
      requestState.activeSectionRun?.layerId === layerId ||
      requestState.profileRun ||
      sectionQueue.includes(layerId)
    ) {
      return;
    }

    setSectionQueue((current) => current.includes(layerId) ? current : [...current, layerId]);
  }

  function handleRunAnalysis() {
    if (!domain || !settings?.apiToken || requestState.status !== "success") {
      return;
    }

    if (
      requestState.analysisRun ||
      requestState.profileRun ||
      requestState.card.synthesis ||
      !canRunInvestorAnalysis(requestState.card)
    ) {
      return;
    }

    setSectionQueue([]);
    const controller = new AbortController();
    abortAllRequests();
    activeRequest.current = controller;
    const { activeSectionRun: _activeSectionRun, analysisNotice: _analysisNotice, ...analysisState } = requestState;
    runAnalysisGenerationWithController(controller, domain, settings, analysisState);
  }

  useEffect(() => {
    if (
      SECTION_RUN_CONCURRENCY !== 1 ||
      !domain ||
      !settings?.apiToken ||
      requestState.status !== "success" ||
      requestState.activeSectionRun ||
      requestState.profileRun ||
      requestState.analysisRun ||
      sectionQueue.length === 0
    ) {
      return;
    }

    const [nextLayerId, ...rest] = sectionQueue;
    if (!nextLayerId) {
      return;
    }

    setSectionQueue(rest);
    const controller = new AbortController();
    abortSectionGenerationRequest();
    sectionGenerationRequest.current = controller;
    runSectionGenerationWithController(controller, domain, settings, requestState, nextLayerId);
  }, [abortSectionGenerationRequest, domain, requestState, runSectionGenerationWithController, sectionQueue, settings]);

  if (!settings) {
    return (
      <ExtensionFrame title="Loading settings">
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
        onThemePreferenceChange={setThemePreference}
        themePreference={themePreference}
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

  let panel: ReactNode;
  let panelKey: string;

  if (requestState.status === "loading" || requestState.status === "idle") {
    panelKey = "loading";
    panel = <LoadingPanel apiOrigin={settings.apiOrigin} domain={domain} onSettings={() => setShowSettings(true)} />;
  } else if (
    requestState.status === "readyToGenerate" ||
    requestState.status === "generating" ||
    requestState.status === "success"
  ) {
    // Intake, building, and profile are one shell with a persistent header, so they share a
    // single panel key: the arc handles its own phase changes and never crossfades whole panels.
    panelKey = "company";
    let arc: CompanyArcState;
    if (requestState.status === "readyToGenerate") {
      arc = { phase: "intake" };
    } else if (requestState.status === "generating") {
      arc = {
        phase: "building",
        events: requestState.events ?? [],
        generationStatus: requestState.generationStatus,
        startedAt: requestState.startedAt
      };
    } else {
      const { status: _status, ...profileFields } = requestState;
      arc = { phase: "profile", ...profileFields };
    }
    panel = (
      <CompanyArc
        arc={arc}
        domain={domain}
        onEditSettings={() => setShowSettings(true)}
        onRegenerate={() => handleStartGeneration(true)}
        onRunAnalysis={handleRunAnalysis}
        onRunSection={handleRunSection}
        onStart={() => handleStartGeneration(true)}
        queuedLayerIds={sectionQueue}
      />
    );
  } else if (requestState.status === "pending") {
    panelKey = "pending";
    panel = (
      <ExtensionFrame
        actions={
          <>
            <button className="cs-extension-button" onClick={() => handleStartGeneration(true)} type="button">
              Check again
            </button>
            <button className="cs-extension-link-button" onClick={() => setShowSettings(true)} type="button">
              Settings
            </button>
          </>
        }
        onSettings={() => setShowSettings(true)}
        title="Still researching"
      >
        <PanelHeader eyebrow="In progress" logoDomain={requestState.domain} title="Still researching" value={requestState.domain} />
        <p className="cs-extension-note">Cold Start is still working on this company. It is taking a little longer than usual; check again in a moment.</p>
      </ExtensionFrame>
    );
  } else {
    panelKey = "error";
    panel = (
      <ExtensionFrame
        actions={
          <>
            <button className="cs-extension-button" onClick={() => handleStartGeneration(true)} type="button">
              Try again
            </button>
            <button className="cs-extension-link-button" onClick={() => setShowSettings(true)} type="button">
              Settings
            </button>
          </>
        }
        onSettings={() => setShowSettings(true)}
        title="Card unavailable"
      >
        <PanelHeader eyebrow="Request failed" logoDomain={domain} title="Card unavailable" value={domain} />
        <p className="cs-extension-error">{requestState.message}</p>
      </ExtensionFrame>
    );
  }

  // Panel swaps here are entry/exit/error boundaries only: the intake -> building -> profile
  // arc lives under one key and animates its own regions. Sync presence (not mode="wait") so
  // rapid status flips can never wedge the swap: the next panel mounts immediately while the
  // old one fades out on top. Reduced motion keeps a calm opacity-only fade.
  return (
    <div className="cs-panel-stage">
      <AnimatePresence initial={false}>
        <motion.div
          animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
          className="cs-panel-stage-scene"
          data-panel={panelKey}
          exit={
            prefersReducedMotion
              ? { opacity: 0, position: "absolute", inset: 0, zIndex: 1 }
              : { opacity: 0, y: -4, position: "absolute", inset: 0, zIndex: 1 }
          }
          initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
          key={panelKey}
          transition={{ duration: prefersReducedMotion ? 0.12 : 0.18, ease: motionTokens.ease }}
        >
          {panel}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(<SidePanel />);
}
