import { companySlugFromDomain, hasUsablePublicProfile, layerIdForSection, type ColdStartCard, type ResearchSection } from "@cold-start/core";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent, PointerEvent, ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { motion, useMotionTemplate, useMotionValue, useSpring } from "framer-motion";
import type { MotionStyle } from "framer-motion";
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
} from "./extension-config";
import { clearCachedCards, readCachedCard, writeCachedCard } from "./card-cache";
import { BrandMark } from "./BrandMark";
import { CompanyLogo } from "./CompanyLogo";
import { INSUFFICIENT_EVIDENCE_NOTICE, formatElapsed } from "./extension-format";
import { sectionIdForLayer, type ResearchLayerId } from "./research-layer";
import {
  fetchBootstrap,
  isActiveRun,
  markPerformance,
  pollGenerationUntilCard,
  resumeSectionGenerationAndPoll,
  sectionsForCard,
  startedAtMs,
  startBasicsGenerationAndPoll,
  startSectionGenerationAndPoll,
  type GenerationStatusListener
} from "./sidepanel-network";
import {
  acceptedSourceCountFromEvents,
  generationStageIndexFromEvents,
  RESEARCH_PROGRESS_STAGES
} from "./research-progress";
import { reducedSpring, snapSpring } from "./motion-primitives";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";
import "./styles.css";

const DEFAULT_API_ORIGIN = defaultApiOrigin(import.meta.env);
const SECTION_RUN_CONCURRENCY = 1;
const STORAGE_KEYS = ["coldStartApiOrigin", "coldStartApiToken"] as const;
const STALE_CACHE_NOTICE = "Could not check for a fresher profile. Showing the saved profile.";
const ResearchLayerPanel = lazy(() =>
  import("./ResearchLayerPanel").then((module) => ({ default: module.ResearchLayerPanel }))
);
const SourcePassInstrument = lazy(() =>
  import("./SourcePassInstrument").then((module) => ({ default: module.SourcePassInstrument }))
);
const ProgressMeshGradient = lazy(() =>
  import("@paper-design/shaders-react").then((module) => ({ default: module.MeshGradient }))
);
const ProgressStaticMeshGradient = lazy(() =>
  import("@paper-design/shaders-react").then((module) => ({ default: module.StaticMeshGradient }))
);

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

function generationStageNote({
  activeIndex,
  elapsed,
  events,
  generationStatus
}: {
  activeIndex: number;
  elapsed: number;
  events: ExtensionResearchRunEvent[];
  generationStatus: GenerationStatus["status"];
}) {
  const acceptedCount = acceptedSourceCountFromEvents(events);

  if (generationStatus === "queued" && elapsed < 4) {
    return "Waiting for a worker";
  }

  if (activeIndex === 1 && acceptedCount !== null) {
    return `${acceptedCount} sources found`;
  }

  if (activeIndex === 0) {
    return "Looking for useful sources";
  }

  if (activeIndex === 1) {
    return "Reading what came in";
  }

  if (activeIndex === 2) {
    return "Building the first profile";
  }

  return "Filing the final card";
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

function ProgressBackground() {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [shaderEnabled, setShaderEnabled] = useState(false);

  useEffect(() => {
    if (navigator.userAgent.toLowerCase().includes("jsdom")) {
      setShaderEnabled(false);
      return;
    }

    try {
      const canvas = document.createElement("canvas");
      setShaderEnabled(Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl")));
    } catch {
      setShaderEnabled(false);
    }
  }, []);

  return (
    <div className="cs-generation-mesh" aria-hidden="true" data-reduced-motion={prefersReducedMotion ? "true" : "false"}>
      <span className="cs-generation-mesh-fallback" />
      {shaderEnabled ? (
        <Suspense fallback={null}>
          {prefersReducedMotion ? (
            <ProgressStaticMeshGradient
              className="cs-generation-mesh-shader"
              colors={["#f7f5ee", "#f4eddc", "#d9d0e8", "#6e5c9e", "#fffdf8"]}
              fit="cover"
              grainMixer={0.42}
              grainOverlay={0.08}
              mixing={0.74}
              positions={32}
              scale={1.18}
              waveX={0.22}
              waveXShift={0.28}
              waveY={0.16}
              waveYShift={0.62}
            />
          ) : (
            <ProgressMeshGradient
              className="cs-generation-mesh-shader"
              colors={["#f7f5ee", "#f4eddc", "#fffdf8", "#d9d0e8", "#6e5c9e"]}
              distortion={0.36}
              fit="cover"
              grainMixer={0.35}
              grainOverlay={0.06}
              scale={1.16}
              speed={0.16}
              swirl={0.28}
            />
          )}
        </Suspense>
      ) : null}
    </div>
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
  const events = requestState.events ?? [];
  const eventStageIndex = requestState.generationStatus === "queued" ? 0 : generationStageIndexFromEvents(events);
  const stages = RESEARCH_PROGRESS_STAGES;
  const estimatedStageIndex = requestState.generationStatus === "queued"
    ? elapsedMs / 7000
    : 1 + elapsedMs / 8000;
  const stageIndex = eventStageIndex === null
    ? estimatedStageIndex
    : eventStageIndex;
  const activeIndex = Math.min(stages.length - 1, Math.max(0, Math.floor(stageIndex)));
  const statusText =
    requestState.generationStatus === "queued" && elapsed < 4
      ? "Queued"
      : "Researching";
  const activeStage = stages[activeIndex] ?? stages[stages.length - 1];
  const stageNote = generationStageNote({
    activeIndex,
    elapsed,
    events,
    generationStatus: requestState.generationStatus
  }) ?? activeStage?.note ?? "Working from useful sources";
  return (
    <ExtensionFrame
      className="cs-generation-panel"
      title={domain}
    >
      <ProgressBackground />
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
          events={events}
          stageNote={stageNote}
          stages={stages}
        />
      </Suspense>
    </ExtensionFrame>
  );
}

function SuccessPanel({
  domain,
  onRunSection,
  onRegenerate,
  queuedLayerIds,
  requestState
}: {
  domain: string;
  onRunSection: (layerId: ResearchLayerId) => void;
  onRegenerate: () => void;
  queuedLayerIds?: ResearchLayerId[] | undefined;
  requestState: Extract<RequestState, { status: "success" }>;
}) {
  const elapsedSeconds = useElapsedSeconds(Boolean(requestState.analysisRun), requestState.analysisRun?.startedAt);
  const contactElapsedSeconds = useElapsedSeconds(Boolean(requestState.contactRun), requestState.contactRun?.startedAt);
  const profileElapsedSeconds = useElapsedSeconds(Boolean(requestState.profileRun), requestState.profileRun?.startedAt);
  const activeSectionElapsedSeconds = useElapsedSeconds(
    Boolean(requestState.activeSectionRun),
    requestState.activeSectionRun?.startedAt
  );

  return (
    <Suspense fallback={<LoadingPanel domain={domain} onSettings={() => undefined} />}>
      <ResearchLayerPanel
        analysisNotice={requestState.analysisNotice}
        analysisRun={requestState.analysisRun}
        card={requestState.card}
        sections={requestState.sections}
        events={requestState.events}
        sources={requestState.sources}
        contactElapsedSeconds={contactElapsedSeconds}
        contactRun={requestState.contactRun}
        elapsedSeconds={elapsedSeconds}
        onRunSection={onRunSection}
        onRegenerate={onRegenerate}
        queuedLayerIds={queuedLayerIds}
        profileElapsedSeconds={profileElapsedSeconds}
        profileRun={requestState.profileRun}
        activeSectionElapsedSeconds={activeSectionElapsedSeconds}
        activeSectionRun={requestState.activeSectionRun}
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
  const prefersReducedMotion = usePrefersReducedMotion();
  const mouseX = useSpring(useMotionValue(50), prefersReducedMotion ? reducedSpring : snapSpring);
  const mouseY = useSpring(useMotionValue(50), prefersReducedMotion ? reducedSpring : snapSpring);
  const splashPosition = useMotionTemplate`circle at ${mouseX}% ${mouseY}%`;
  const entrance = prefersReducedMotion
    ? undefined
    : {
        hidden: { opacity: 0, y: 8, filter: "blur(4px)" },
        visible: (index: number) => ({
          opacity: 1,
          y: 0,
          filter: "blur(0px)",
          transition: { delay: index * 0.055, ...snapSpring }
        })
      };
  const entranceProps = (index: number) => entrance
    ? { animate: "visible" as const, custom: index, initial: "hidden" as const, variants: entrance }
    : {};
  const buttonPressProps = prefersReducedMotion ? {} : { whileTap: { scale: 0.985, y: 1 } };
  const sourcePassSections = [
    {
      description: "Founders and operators",
      marker: "01",
      tone: "people",
      title: "People"
    },
    {
      description: "Strategy and focus",
      marker: "02",
      tone: "business",
      title: "Business"
    },
    {
      description: "Customers and progress",
      marker: "03",
      tone: "signals",
      title: "Traction"
    },
    {
      description: "Risks and unknowns",
      marker: "04",
      tone: "questions",
      title: "Questions"
    }
  ] as const;
  const tagline = companyName
    ? `Know ${companyName} like a professional investor would.`
    : "Know this company like a professional investor would.";

  function updateButtonPointer(event: PointerEvent<HTMLButtonElement>) {
    if (prefersReducedMotion) {
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    mouseX.set(((event.clientX - bounds.left) / bounds.width) * 100);
    mouseY.set(((event.clientY - bounds.top) / bounds.height) * 100);
  }

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

      <motion.section
        className="cs-start-hero"
        aria-label={`Build a profile for ${companyName}`}
        {...entranceProps(0)}
      >
        <h1>Get up to speed</h1>
        <p>{tagline}</p>
        <motion.div className="cs-start-actions" {...entranceProps(1)}>
          <motion.button
            className="cs-start-primary"
            onClick={onStart}
            onPointerMove={updateButtonPointer}
            style={{ "--cs-button-splash-position": splashPosition } as unknown as MotionStyle}
            type="button"
            {...buttonPressProps}
          >
            <span>Begin research</span>
            <svg aria-hidden="true" height="18" viewBox="0 0 18 18" width="18">
              <path d="M3 9h11" />
              <path d="m10 4.5 4.5 4.5L10 13.5" />
            </svg>
          </motion.button>
        </motion.div>
      </motion.section>

      <motion.section
        className="cs-start-company"
        aria-label="Current tab"
        {...entranceProps(2)}
      >
        <CompanyLogo className="cs-start-company-logo" domain={domain} label={companyName} />
        <div className="cs-start-company-copy">
          <h2>{companyName}</h2>
          <p>{domain}</p>
        </div>
        <span className="cs-start-company-rule" aria-hidden="true" />
        <span className="cs-start-status">No profile</span>
      </motion.section>

      <motion.section
        className="cs-start-pile"
        aria-label="Source pass scope"
        {...entranceProps(3)}
      >
        <span className="cs-start-pile-back cs-start-pile-back-left" aria-hidden="true" />
        <span className="cs-start-pile-back cs-start-pile-back-right" aria-hidden="true" />
        {sourcePassSections.map((section, index) => (
          <motion.article
            className="cs-start-pass-card"
            data-tone={section.tone}
            key={section.title}
            {...entranceProps(4 + index)}
          >
            <span className="cs-start-pass-icon" aria-hidden="true">
              {section.tone === "people" ? (
                <svg height="23" viewBox="0 0 24 24" width="23">
                  <path d="M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
                  <path d="M16 11a3 3 0 0 0 0-6" />
                  <path d="M3.5 19c0-3.1 2-5 4.5-5s4.5 1.9 4.5 5" />
                  <path d="M14 14.2c2.4.5 4 2.2 4 4.8" />
                </svg>
              ) : section.tone === "business" ? (
                <svg height="23" viewBox="0 0 24 24" width="23">
                  <path d="M12 3.5v17" />
                  <path d="M4.8 8.4h14.4" />
                  <path d="M7 17.2 12 8.4l5 8.8" />
                  <path d="M7 17.2h10" />
                </svg>
              ) : section.tone === "signals" ? (
                <svg height="24" viewBox="0 0 24 24" width="24">
                  <path d="M3 13h4l2.2-8 4 15 2.3-8H21" />
                </svg>
              ) : (
                <svg height="23" viewBox="0 0 24 24" width="23">
                  <path d="M12 17h.01" />
                  <path d="M9.6 8.5A2.8 2.8 0 0 1 12 7.2c1.7 0 3 1.1 3 2.6 0 1.2-.7 1.9-1.7 2.5-.8.5-1.3 1-1.3 2.1" />
                  <path d="M4.8 20.2h14.4L12 3.8 4.8 20.2Z" />
                </svg>
              )}
            </span>
            <span className="cs-start-pass-copy">
              <strong>{section.title}</strong>
              <span>{section.description}</span>
            </span>
            <span className="cs-start-pass-marker">{section.marker}</span>
          </motion.article>
        ))}
      </motion.section>
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
          setRequestState({
            ...successState,
            contactRun: { generationStatus: "running", startedAt }
          });
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
          setRequestState({
            ...successState,
            contactRun: { generationStatus: "running", startedAt }
          });
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

      const cachedCard = await readCachedCard(domain, settings).catch(() => null);
      if (cachedCard && !controller.signal.aborted) {
        showedCachedCard = true;
        setRequestState({ status: "success", card: cachedCard, sections: sectionsForCard(cachedCard), events: [], sources: [] });
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
      requestState.analysisRun ||
      sectionQueue.includes(layerId)
    ) {
      return;
    }

    setSectionQueue((current) => current.includes(layerId) ? current : [...current, layerId]);
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
    return <LoadingPanel apiOrigin={settings.apiOrigin} domain={domain} onSettings={() => setShowSettings(true)} />;
  }

  if (requestState.status === "readyToGenerate") {
    return (
      <StartGenerationPanel
        domain={domain}
        onEditSettings={() => setShowSettings(true)}
        onStart={() => handleStartGeneration(true)}
      />
    );
  }

  if (requestState.status === "generating") {
    return <GenerationPanel domain={domain} requestState={requestState} />;
  }

  if (requestState.status === "pending") {
    return (
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
  }

  if (requestState.status === "error") {
    return (
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

  return (
    <SuccessPanel
      domain={domain}
      onRunSection={handleRunSection}
      onRegenerate={() => handleStartGeneration(true)}
      queuedLayerIds={sectionQueue}
      requestState={requestState}
    />
  );
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(<SidePanel />);
}
