import {
  analysisBlockedReason,
  canRunInvestorAnalysis,
  hasUsablePublicProfile,
  publicProfileQuality,
  type ColdStartCard,
  type PublicProfileQuality,
  type ResearchSection
} from "@cold-start/core";
import { AnimatePresence, animate, motion, useMotionValue, type PanInfo } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { commitSpring, motionTokens, snapSpring } from "./motion-primitives";
import {
  RESEARCH_LAYER_CARDS,
  isSynthesisLayer,
  layerDisplayForCard,
  layersForCard,
  type ResearchLayerDisplay,
  type ResearchLayerId
} from "./research-layer";
import {
  dragOffsetShouldPreview,
  dragOffsetShouldSnap,
  dragOffsetShouldSuppressClick
} from "./research-layer-motion";
import { showPartialProfileGate, sourceLabel, websiteLabel } from "./company-display";
import { formatElapsed } from "./extension-format";
import type { ExtensionResearchRunEvent, ExtensionSourceSummary } from "./extension-config";
import { investorReadForCard, type InvestorReadDisplay } from "./investor-lens";
import { ResearchTrail } from "./ResearchTrail";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

type AnalysisRun = {
  generationStatus: "queued" | "running";
  startedAt: number;
};

type ActiveSectionRun = AnalysisRun & {
  layerId: ResearchLayerId;
};

type ResearchLayerPanelProps = {
  analysisNotice?: string | undefined;
  analysisRun?: AnalysisRun | undefined;
  card: ColdStartCard;
  contactRun?: AnalysisRun | undefined;
  elapsedSeconds: number;
  onRunSection: (layerId: ResearchLayerId) => void;
  onRunAnalysis: () => void;
  onRegenerate: () => void;
  queuedLayerIds?: ResearchLayerId[] | undefined;
  profileElapsedSeconds?: number | undefined;
  profileRun?: AnalysisRun | undefined;
  activeSectionElapsedSeconds?: number | undefined;
  activeSectionRun?: ActiveSectionRun | undefined;
  sections?: ResearchSection[] | undefined;
  events?: ExtensionResearchRunEvent[] | undefined;
  sources?: ExtensionSourceSummary[] | undefined;
};

const VISIBLE_SOURCE_COUNT = 3;
const PINNED_RESEARCH_LAYERS_KEY = "coldStartPinnedResearchLayers";
const researchLayerIds = new Set<ResearchLayerId>(RESEARCH_LAYER_CARDS.map((layer) => layer.id));
const DORMANT_PILE_DEPTHS = [
  { x: 0, y: 0, rotate: -0.18 },
  { x: -3, y: -1, rotate: 0.38 },
  { x: 3, y: -2, rotate: -0.46 },
  { x: -2, y: -2, rotate: 0.28 },
  { x: 2, y: -3, rotate: -0.32 },
  { x: -1, y: -3, rotate: 0.22 },
  { x: 1, y: -4, rotate: -0.24 },
  { x: -2, y: -4, rotate: 0.18 },
  { x: 2, y: -5, rotate: -0.16 }
] as const;

function dormantPileDepth(index: number) {
  const depth = DORMANT_PILE_DEPTHS[index % DORMANT_PILE_DEPTHS.length] ?? DORMANT_PILE_DEPTHS[0];
  const settledIndex = Math.min(index, 8);
  return {
    ...depth,
    scale: 1 - settledIndex * 0.002,
    zIndex: 80 - index
  };
}

function dormantStackNumber(layer: (typeof RESEARCH_LAYER_CARDS)[number]) {
  const catalogIndex = RESEARCH_LAYER_CARDS.findIndex((candidate) => candidate.id === layer.id) + 1;
  return String(catalogIndex).padStart(2, "0");
}

function defaultActiveLayers(canShowResearchLayers: boolean, hasInvestorLens: boolean, hasSynthesis: boolean): ResearchLayerId[] {
  if (!canShowResearchLayers || !hasInvestorLens) {
    return [];
  }

  return hasSynthesis ? ["theCase", "marketStructureTiming"] : ["coreIdea"];
}

function investorLensControlState({
  analysisRun,
  card,
  profileRun
}: {
  analysisRun?: AnalysisRun | undefined;
  card: ColdStartCard;
  profileRun?: AnalysisRun | undefined;
}) {
  if (card.synthesis) {
    return { disabled: true, label: "Investor Lens filed", reason: "Investor read is saved for this card." };
  }

  if (profileRun) {
    return { disabled: true, label: "Run Investor Lens", reason: "The cited profile must finish before Investor Lens can run." };
  }

  if (analysisRun) {
    return { disabled: true, label: "Investor Lens running", reason: "Reading cited sources for the investor read." };
  }

  const blockedReason = analysisBlockedReason(card);
  if (blockedReason) {
    return { disabled: true, label: "Run Investor Lens", reason: blockedReason };
  }

  return { disabled: false, label: "Run Investor Lens", reason: "Build the investor read, case, timing, and next diligence question." };
}

function pinnedLayerRecordValue(value: unknown): Record<string, ResearchLayerId[]> {
  if (!value || typeof value !== "object") {
    return {};
  }

  const record: Record<string, ResearchLayerId[]> = {};
  for (const [domain, ids] of Object.entries(value as Record<string, unknown>)) {
    if (!Array.isArray(ids)) {
      continue;
    }
    const validIds = ids.filter((id): id is ResearchLayerId => typeof id === "string" && researchLayerIds.has(id as ResearchLayerId));
    if (validIds.length > 0) {
      record[domain] = Array.from(new Set(validIds));
    }
  }
  return record;
}

function mergeLayerIds(...groups: Array<readonly ResearchLayerId[] | null | undefined>): ResearchLayerId[] {
  const merged: ResearchLayerId[] = [];
  const seen = new Set<ResearchLayerId>();
  for (const group of groups) {
    for (const id of group ?? []) {
      if (seen.has(id)) {
        continue;
      }
      seen.add(id);
      merged.push(id);
    }
  }
  return merged;
}

function readPinnedLayerIds(domain: string, fallback: ResearchLayerId[], callback: (ids: ResearchLayerId[]) => void) {
  chrome.storage.local.get([PINNED_RESEARCH_LAYERS_KEY], (items) => {
    const record = pinnedLayerRecordValue(items[PINNED_RESEARCH_LAYERS_KEY]);
    callback(record[domain] ?? fallback);
  });
}

function writePinnedLayerIds(domain: string, ids: ResearchLayerId[]) {
  chrome.storage.local.get([PINNED_RESEARCH_LAYERS_KEY], (items) => {
    const record = pinnedLayerRecordValue(items[PINNED_RESEARCH_LAYERS_KEY]);
    chrome.storage.local.set({
      [PINNED_RESEARCH_LAYERS_KEY]: {
        ...record,
        [domain]: ids
      }
    });
  });
}

function shouldQueueLayerRun(status: ResearchLayerDisplay["status"]) {
  return status === "ready" || status === "stale" || status === "failed" || status === "empty";
}

function LayerContent({
  actionLabel,
  display,
  onAction,
  running,
  runningCopy = "Extracting structure from cited sources"
}: {
  actionLabel?: string | undefined;
  display: ResearchLayerDisplay;
  onAction?: (() => void) | undefined;
  running: boolean;
  runningCopy?: string;
}) {
  if (running) {
    return (
      <div className="cs-layer-running-copy" aria-live="polite">
        <span className="cs-layer-running-sheen" aria-hidden="true" />
        <span className="cs-layer-running-text">{runningCopy}</span>
        <span className="cs-layer-skeleton" aria-hidden="true" />
        <span className="cs-layer-skeleton cs-layer-skeleton-short" aria-hidden="true" />
      </div>
    );
  }

  const action = onAction && actionLabel
    ? <button className="cs-layer-action" onClick={onAction} type="button">{actionLabel}</button>
    : null;
  const sourceChips = (
    <>
      <SourceChips sources={display.sources} />
      {action}
    </>
  );

  if (display.items && display.items.length > 0) {
    const evidenceItems = display.items.filter((item) => item.kind !== "question");
    const questionItems = display.items.filter((item) => item.kind === "question");
    if (display.id === "investors") {
      return (
        <>
          <MoneyLayerItems items={evidenceItems} />
          {sourceChips}
        </>
      );
    }
    if (display.id === "signals") {
      return (
        <>
          <SignalLayerItems items={evidenceItems} />
          {sourceChips}
        </>
      );
    }
    if (display.id === "theCase") {
      return (
        <>
          <TheCaseLayerItems items={display.items} />
          {sourceChips}
        </>
      );
    }
    return (
      <>
        {evidenceItems.length > 0 ? (
          <ul className="cs-layer-items">
            {evidenceItems.map((item) => (
              <li key={`${item.title}-${item.meta ?? item.body ?? ""}`}>
                <div>
                  <strong>{item.title}</strong>
                  {item.body ? <p>{item.body}</p> : null}
                </div>
                {item.meta ? <span>{item.meta}</span> : null}
              </li>
            ))}
          </ul>
        ) : null}
        {questionItems.length > 0 ? (
          <section className="cs-layer-questions" aria-label="Open questions">
            <div className="cs-layer-questions-head">
              <span aria-hidden="true">?</span>
              <strong>Open questions</strong>
            </div>
            <ol>
              {questionItems.map((item) => (
                <li key={`${item.title}-${item.body ?? ""}`}>
                  <span className="cs-question-tag">{item.title}</span>
                  {item.body ? <p>{item.body}</p> : null}
                </li>
              ))}
            </ol>
          </section>
        ) : null}
        {sourceChips}
      </>
    );
  }

  if (display.rows && display.rows.length > 0) {
    return (
      <>
        <dl className="cs-layer-rows">
          {display.rows.map((row) => (
            <div key={row.label}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
        {sourceChips}
      </>
    );
  }

  return (
    <>
      <p>{display.body}</p>
      {sourceChips}
    </>
  );
}

function MoneyLayerItems({ items }: { items: NonNullable<ResearchLayerDisplay["items"]> }) {
  const [hero, ...rounds] = items;
  const heroFigure = hero?.title.toLowerCase() === "total raised" && hero.body
    ? hero.body.replace(/^Total raised is\s*/i, "").replace(/[.]$/, "")
    : hero?.title;
  const heroNote = hero?.title.toLowerCase() === "total raised" ? undefined : hero?.body?.replace(/^Backers:\s*/i, "");

  return (
    <section className="cs-layer-money-ledger" aria-label="Funding summary">
      {hero ? (
        <div className="cs-layer-money-hero">
          <span>Total raised</span>
          <strong>{heroFigure}</strong>
          {heroNote ? <p>{heroNote}</p> : null}
        </div>
      ) : null}
      {rounds.length > 0 ? (
        <ol>
          {rounds.map((round) => (
            <li key={`${round.title}-${round.meta ?? round.body ?? ""}`}>
              <span>{round.meta ?? "Filed"}</span>
              <div>
                <strong>{round.title}</strong>
                {round.body ? <p>{round.body}</p> : null}
              </div>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}

function SignalLayerItems({ items }: { items: NonNullable<ResearchLayerDisplay["items"]> }) {
  return (
    <ol className="cs-layer-signal-ledger" aria-label="Recent signals">
      {items.map((item) => (
        <li key={`${item.title}-${item.date ?? item.meta ?? ""}`}>
          <strong>{item.title}</strong>
          {item.body ? <p>{item.body}</p> : null}
          <span className="cs-signal-meta">
            <i className="cs-signal-dot" data-class={item.sourceClass ?? "reporting"} aria-hidden="true" />
            {item.date ? <time>{item.date}</time> : null}
            {item.meta ? <span className="cs-signal-source">{item.meta}</span> : null}
            {item.corroboration && item.corroboration > 1 ? (
              <span className="cs-signal-corroboration">{`×${item.corroboration} corroborated`}</span>
            ) : null}
          </span>
        </li>
      ))}
    </ol>
  );
}

function TheCaseLayerItems({ items }: { items: NonNullable<ResearchLayerDisplay["items"]> }) {
  return (
    <div className="cs-layer-case" aria-label="Bull and bear case">
      {items.map((item) => (
        <section className="cs-layer-case-side" data-kind={item.meta ?? item.kind ?? "evidence"} key={`${item.title}-${item.body ?? ""}`}>
          <h4>{item.title}</h4>
          {item.body ? <p>{item.body}</p> : null}
        </section>
      ))}
    </div>
  );
}

function InvestorLensControl({
  analysisRun,
  card,
  onRunAnalysis,
  profileRun
}: {
  analysisRun?: AnalysisRun | undefined;
  card: ColdStartCard;
  onRunAnalysis: () => void;
  profileRun?: AnalysisRun | undefined;
}) {
  if (card.synthesis) {
    return null;
  }

  const state = investorLensControlState({ analysisRun, card, profileRun });
  return (
    <div className="cs-investor-lens-control">
      <div>
        <strong>Investor Lens</strong>
        <span>{state.reason}</span>
      </div>
      <button
        className="cs-investor-lens-button"
        disabled={state.disabled}
        onClick={onRunAnalysis}
        type="button"
      >
        {state.label}
      </button>
    </div>
  );
}

function InvestorReadCard({ read }: { read: InvestorReadDisplay }) {
  return (
    <article className="cs-investor-read" aria-label="Investor Read">
      <div className="cs-investor-read-head">
        <div>
          <span>Investor Read</span>
          <small>{read.evidenceStatus}</small>
        </div>
      </div>
      <p className="cs-investor-read-lede">{read.whyItMightMatter}</p>
      {read.evidenceThatHolds.length > 0 ? (
        <div className="cs-investor-read-proof" aria-label="Evidence that held">
          <strong>Evidence that held</strong>
          {read.evidenceThatHolds.map((chip) => (
            <span data-posture={chip.sourcePosture} key={`${chip.sourcePosture}-${chip.label}`}>
              <i aria-hidden="true" />
              {chip.label}
            </span>
          ))}
        </div>
      ) : null}
      <dl className="cs-investor-read-grid">
        <div>
          <dt>Could break</dt>
          <dd>{read.whatCouldBreak}</dd>
        </div>
        <div>
          <dt>Next question</dt>
          <dd>{read.bestNextQuestion}</dd>
        </div>
      </dl>
    </article>
  );
}

// Rendered under the shared CompanyArc header, which already carries the company identity;
// this section only explains the gap and offers the honest next actions.
function PartialProfilePanel({
  card,
  onRegenerate,
  quality
}: {
  card: ColdStartCard;
  onRegenerate: () => void;
  quality: PublicProfileQuality;
}) {
  const status = quality.hasCitations ? "Profile saved with gaps" : "No cited profile yet";
  const body = quality.hasCitations
    ? "Some cited facts were saved, but not enough to open Research."
    : "No cited sources were saved. Rebuild the profile from public sources.";
  const lensReason = analysisBlockedReason(card) ?? "The cited profile must finish before Investor Lens can run.";

  return (
    <section className="cs-partial-profile" aria-label="Incomplete company profile">
      <div className="cs-partial-profile-copy">
        <p className="cs-research-label">{status}</p>
        <p>{body}</p>
      </div>
      <dl className="cs-partial-profile-status" aria-label="Profile status">
        <div>
          <dt>Sources</dt>
          <dd>{card.citations.length > 0 ? sourceLabel(card.citations.length) : "None"}</dd>
        </div>
        <div>
          <dt>Website</dt>
          <dd>{websiteLabel(card)}</dd>
        </div>
      </dl>
      <button className="cs-extension-button" onClick={onRegenerate} type="button">
        Regenerate profile
      </button>
      <div className="cs-investor-lens-control cs-investor-lens-control-partial">
        <div>
          <strong>Investor Lens</strong>
          <span>{lensReason}</span>
        </div>
        <button className="cs-investor-lens-button" disabled type="button">
          Run Investor Lens
        </button>
      </div>
    </section>
  );
}

function SourceChips({ sources }: { sources: ResearchLayerDisplay["sources"] }) {
  if (sources.length === 0) {
    return null;
  }

  const visibleSources = sources.slice(0, VISIBLE_SOURCE_COUNT);
  const hiddenCount = sources.length - visibleSources.length;

  return (
    <div className="cs-source-chips" aria-label="Sources">
      {visibleSources.map((source) => (
        <a
          className="cs-source-chip"
          href={source.href}
          key={source.id}
          rel="noreferrer"
          target="_blank"
          title={`${source.qualityLabel}: ${source.title}`}
        >
          {source.domain}
        </a>
      ))}
      {hiddenCount > 0 ? <span className="cs-source-chip cs-source-chip-muted">+{hiddenCount}</span> : null}
    </div>
  );
}

function DormantPileCard({
  dragging,
  index,
  layer,
  onClick,
  onDrag,
  onDragEnd,
  onDragStart,
  onKeyDown,
  previewing,
  snapReady,
  prefersReducedMotion
}: {
  dragging: boolean;
  index: number;
  layer: (typeof RESEARCH_LAYER_CARDS)[number];
  onClick: () => void;
  onDrag: (info: PanInfo) => void;
  onDragEnd: (info: PanInfo) => void;
  onDragStart: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  previewing: boolean;
  snapReady: boolean;
  prefersReducedMotion: boolean | null;
}) {
  const dragY = useMotionValue(0);
  const motionTransition = prefersReducedMotion ? { duration: 0.1, ease: "easeOut" as const } : snapSpring;
  const depth = dormantPileDepth(index);
  const stackNumber = dormantStackNumber(layer);
  const actionLabel = layer.source === "analysis" ? "Lens" : "";
  const restingMotion = prefersReducedMotion
    ? { x: Math.round(depth.x / 2), y: 0, rotate: 0, scale: 1 }
    : { x: depth.x, y: depth.y, rotate: depth.rotate, scale: depth.scale };
  const activeMotion = {
    x: 0,
    y: 0,
    rotate: 0,
    scale: snapReady ? 1.018 : 1.012
  };
  const feedbackProps = !prefersReducedMotion && !dragging
    ? {
        whileTap: { scale: 0.996 }
      }
    : {};

  function settleDragY() {
    if (prefersReducedMotion) {
      dragY.set(0);
      return;
    }

    void animate(dragY, 0, snapSpring);
  }

  return (
    <motion.div
      animate={dragging ? activeMotion : restingMotion}
      className="cs-dormant-card-frame"
      exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.975, y: -8 }}
      style={{ zIndex: dragging ? 120 : depth.zIndex }}
      transition={motionTransition}
    >
      <motion.div
        aria-label={`File ${layer.title} into Research`}
        className="cs-dormant-card"
        data-dragging={dragging ? "true" : "false"}
        data-index={index}
        data-layer-source={layer.source}
        data-previewing={previewing ? "true" : "false"}
        data-snap-ready={snapReady ? "true" : "false"}
        drag="y"
        dragConstraints={{ bottom: 0, top: -320 }}
        dragElastic={0.16}
        dragMomentum={false}
        dragTransition={{ bounceDamping: 38, bounceStiffness: 720, power: 0.12, timeConstant: 140 }}
        onClick={onClick}
        onDrag={(_event, info) => onDrag(info)}
        onDragEnd={(_event, info) => {
          onDragEnd(info);
          settleDragY();
        }}
        onDragStart={onDragStart}
        onKeyDown={onKeyDown}
        role="button"
        style={{ y: dragY }}
        tabIndex={0}
        {...feedbackProps}
      >
        <span className="cs-card-grip" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        <span className="cs-dormant-card-index" aria-hidden="true">
          <span>{stackNumber}</span>
        </span>
        <span className="cs-dormant-card-copy">
          <strong>{layer.title}</strong>
          <small>{layer.description}</small>
        </span>
        <span className="cs-card-action-mark" aria-hidden="true">{actionLabel}</span>
      </motion.div>
    </motion.div>
  );
}

export function ResearchLayerPanel({
  analysisNotice,
  analysisRun,
  card,
  contactRun,
  elapsedSeconds,
  onRunSection,
  onRunAnalysis,
  onRegenerate,
  queuedLayerIds = [],
  profileElapsedSeconds = 0,
  profileRun,
  activeSectionElapsedSeconds = 0,
  activeSectionRun,
  sections,
  events = [],
  sources = []
}: ResearchLayerPanelProps) {
  const canStartInvestorLens = canRunInvestorAnalysis(card);
  const canShowResearchLayers = hasUsablePublicProfile(card);
  const quality = publicProfileQuality(card);
  const layers = useMemo(() => layersForCard(card, sections), [card, sections]);
  const hasInvestorLens = Boolean(card.synthesis || analysisRun);
  const defaultLayerIds = useMemo(
    () => defaultActiveLayers(canShowResearchLayers, hasInvestorLens, Boolean(card.synthesis)),
    [canShowResearchLayers, hasInvestorLens, card.synthesis]
  );
  const activeSectionLayerId = activeSectionRun?.layerId;
  const lastSectionLayerRef = useRef<{ domain: string; layerId: ResearchLayerId } | null>(null);
  const pendingLayerActivationsRef = useRef<{ domain: string; ids: ResearchLayerId[] }>({ domain: card.domain, ids: [] });
  const [activeLayerIds, setActiveLayerIds] = useState<ResearchLayerId[]>(() => defaultLayerIds);
  const [expandedLayerId, setExpandedLayerId] = useState<ResearchLayerId | null>(() => {
    if (canStartInvestorLens && hasInvestorLens) {
      return "coreIdea";
    }

    return null;
  });
  const [draggingLayerId, setDraggingLayerId] = useState<ResearchLayerId | null>(null);
  const [snapPreviewId, setSnapPreviewId] = useState<ResearchLayerId | null>(null);
  const [snapReadyId, setSnapReadyId] = useState<ResearchLayerId | null>(null);
  const snapReadyLayerId = useRef<ResearchLayerId | null>(null);
  const suppressClickFor = useRef<ResearchLayerId | null>(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    lastSectionLayerRef.current = null;
    pendingLayerActivationsRef.current = { domain: card.domain, ids: [] };
  }, [card.domain]);

  useEffect(() => {
    let cancelled = false;
    readPinnedLayerIds(card.domain, defaultLayerIds, (ids) => {
      if (cancelled) {
        return;
      }
      const sectionLayerId = lastSectionLayerRef.current?.domain === card.domain
        ? lastSectionLayerRef.current.layerId
        : null;
      const pendingLayerIds = pendingLayerActivationsRef.current.domain === card.domain
        ? pendingLayerActivationsRef.current.ids
        : [];
      const nextIds = mergeLayerIds(ids, sectionLayerId ? [sectionLayerId] : null, pendingLayerIds);
      setActiveLayerIds(nextIds);
      setExpandedLayerId((current) => sectionLayerId ?? (current && nextIds.includes(current) ? current : nextIds[0] ?? null));
    });
    return () => {
      cancelled = true;
    };
  }, [card.domain, defaultLayerIds]);

  useEffect(() => {
    const layerId = activeSectionLayerId;
    if (!layerId) {
      return;
    }

    lastSectionLayerRef.current = { domain: card.domain, layerId };
    setActiveLayerIds((current) => current.includes(layerId) ? current : [...current, layerId]);
    setExpandedLayerId(layerId);
  }, [activeSectionLayerId, card.domain]);

  function activateLayer(id: ResearchLayerId) {
    const layer = layers.find((candidate) => candidate.id === id);
    const display = layerDisplayForCard(card, id, sections);
    if (!layer) {
      return;
    }

    pendingLayerActivationsRef.current = {
      domain: card.domain,
      ids: mergeLayerIds(
        pendingLayerActivationsRef.current.domain === card.domain ? pendingLayerActivationsRef.current.ids : [],
        [id]
      )
    };
    setActiveLayerIds((current) => {
      if (current.includes(id)) {
        return current;
      }
      const next = [...current, id];
      writePinnedLayerIds(card.domain, next);
      return next;
    });
    setExpandedLayerId(id);
    // Open Questions and The Case come from the consolidated synthesis (investor lens), not a
    // per-section run, so activating them must not queue a section job; their explicit Lens control
    // starts the full analysis instead. Card and section-backed analysis layers still run their
    // own section on activation.
    if (display && shouldQueueLayerRun(display.status) && !profileRun && !isSynthesisLayer(id)) {
      onRunSection(id);
    }
  }

  function toggleExpanded(id: ResearchLayerId) {
    setExpandedLayerId(id);
  }

  function handleDormantKeyDown(event: KeyboardEvent<HTMLDivElement>, id: ResearchLayerId) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      activateLayer(id);
    }
  }

  function handleDormantClick(id: ResearchLayerId) {
    if (suppressClickFor.current === id) {
      suppressClickFor.current = null;
      return;
    }

    activateLayer(id);
  }

  function handleDormantDragStart(id: ResearchLayerId) {
    setDraggingLayerId(id);
    suppressClickFor.current = id;
  }

  function handleDormantDrag(id: ResearchLayerId, info: PanInfo, index: number) {
    const nextPreviewId = dragOffsetShouldPreview(info.offset.y, index) ? id : null;
    const nextReadyId = dragOffsetShouldSnap(info.offset.y, info.velocity.y, index) ? id : null;

    snapReadyLayerId.current = nextReadyId;
    setSnapPreviewId(nextPreviewId);
    setSnapReadyId(nextReadyId);
  }

  function handleDormantDragEnd(id: ResearchLayerId, info: PanInfo, index: number) {
    const shouldSnap = snapReadyLayerId.current === id || dragOffsetShouldSnap(info.offset.y, info.velocity.y, index);

    setDraggingLayerId(null);
    setSnapPreviewId(null);
    setSnapReadyId(null);
    snapReadyLayerId.current = null;

    if (dragOffsetShouldSuppressClick(info.offset)) {
      suppressClickFor.current = id;
    }
    window.setTimeout(() => {
      if (suppressClickFor.current === id) {
        suppressClickFor.current = null;
      }
    }, 250);

    if (shouldSnap) {
      suppressClickFor.current = id;
      activateLayer(id);
    }
  }

  const dormantLayers = RESEARCH_LAYER_CARDS.filter((layer) => !activeLayerIds.includes(layer.id));
  const draggingLayer = draggingLayerId ? RESEARCH_LAYER_CARDS.find((layer) => layer.id === draggingLayerId) : null;
  const activeCount = activeLayerIds.length;
  const profileRunVisible = Boolean(profileRun);
  const profileOrAnalysisRunVisible = Boolean(profileRun || analysisRun);
  const finalizingProfileVisible = Boolean(contactRun && !profileRun);
  const showResearchProgress = profileOrAnalysisRunVisible || finalizingProfileVisible || sources.length > 0 || events.length > 0;
  const resolvedSectionCount = layers.filter((layer) => layer.availability !== "ready").length;
  const insertionSlotCopy = draggingLayer ? `File ${draggingLayer.title}` : "File card";
  const insertionSlotHint = snapReadyId
    ? "Release to file it in Research"
    : snapPreviewId
      ? "Keep pulling toward the filing space"
      : "Lift a card to file it";
  const investorRead = investorReadForCard(card);

  // The identity header and the early read render above this panel in the CompanyArc shell;
  // the gate here only decides between the research layer and the honest partial state.
  if (showPartialProfileGate(card, events)) {
    return <PartialProfilePanel card={card} onRegenerate={onRegenerate} quality={quality} />;
  }

  return (
    <>
      <section className="cs-research-layer" aria-label="Research layer">
        <div className="cs-research-layer-head">
          <span>Research</span>
          <span>{activeCount} / {RESEARCH_LAYER_CARDS.length}</span>
        </div>
        <InvestorLensControl
          analysisRun={analysisRun}
          card={card}
          onRunAnalysis={onRunAnalysis}
          profileRun={profileRun}
        />
        {showResearchProgress ? (
          <ResearchTrail
            mode="profile"
            events={events}
            isFinalizingProfile={finalizingProfileVisible}
            isRunning={profileOrAnalysisRunVisible}
            isProfileRunning={profileRunVisible}
            resolvedCount={resolvedSectionCount}
            sources={sources}
            totalCount={RESEARCH_LAYER_CARDS.length}
          />
        ) : null}

        <div className="cs-active-enrichments">
          {investorRead ? <InvestorReadCard read={investorRead} /> : null}
          <AnimatePresence initial={false}>
          {activeLayerIds.map((id) => {
            const display = layerDisplayForCard(card, id, sections);
            if (!display) {
              return null;
            }

            const layer = layers.find((candidate) => candidate.id === id);
            const isAnalysisLayer = layer?.source === "analysis";
            const isSynthesisLayerId = isSynthesisLayer(id);
            const refreshing = Boolean(activeSectionRun?.layerId === id);
            const queued = queuedLayerIds.includes(id);
            // The investor lens is one full-analysis run that produces card.synthesis, which feeds
            // every analysis layer. So while the lens runs, each analysis layer reads as
            // synthesizing rather than queued behind it. Card layers keep their own per-section
            // queue, and the section-backed analysis layers (Why care, Timing) still refresh from a
            // per-section run.
            const runningUnderLens = Boolean(isAnalysisLayer && analysisRun && display.status !== "saved");
            const waitingForProfile = Boolean(profileRun && display.status !== "saved");
            const running = Boolean(
              waitingForProfile ||
              display.status === "running" ||
              runningUnderLens
            );
            const visiblyQueued = queued && !running && !refreshing;
            const queuedBehindAnalysis = visiblyQueued && Boolean(analysisRun);
            const queuedBehindSection = visiblyQueued && Boolean(activeSectionRun);
            const expanded = expandedLayerId === id;
            const state = running || refreshing ? "running" : visiblyQueued ? "queued" : display.status;
            const actionLabel = waitingForProfile || visiblyQueued
              ? undefined
              : isSynthesisLayerId
                ? undefined
                : display.status === "stale" || display.status === "failed" || display.status === "ready" || display.status === "empty"
                  ? "Queue"
                  : undefined;
            const handleLayerAction = actionLabel
              ? () => {
                  onRunSection(id);
                }
              : undefined;
            const statusCopy = waitingForProfile
              ? `Finishing profile · ${formatElapsed(profileElapsedSeconds)}`
              : visiblyQueued
                ? queuedBehindAnalysis
                  ? "Queued behind Investor Lens"
                  : queuedBehindSection
                    ? "Queued behind current card"
                    : "Queued"
                : refreshing
                  ? isAnalysisLayer
                    ? `Synthesizing · ${formatElapsed(activeSectionElapsedSeconds)}`
                    : `Refreshing · ${formatElapsed(activeSectionElapsedSeconds)}`
                  : running
                    ? `Synthesizing · ${formatElapsed(elapsedSeconds)}`
                    : display.status === "failed"
                      ? "Run failed"
                      : display.status === "empty"
                        ? "Not found"
                        : display.statusLine ?? sourceLabel(display.sourceCount);
            const runningCopy = waitingForProfile
              ? "Getting the profile ready"
              : refreshing
                ? isAnalysisLayer
                  ? "Reading the evidence"
                  : id === "competition"
                    ? "Looking for adjacent companies"
                    : id === "signals"
                      ? "Checking recent traction"
                      : "Refreshing the evidence"
                : "Reading cited sources";
            const contentDisplay = queuedBehindAnalysis
              ? {
                  ...display,
                  body: "This card will run after the current analysis finishes."
                }
              : queuedBehindSection
                ? {
                    ...display,
                    body: "This card will run after the active research card finishes."
                  }
                : display;
            const bodyId = `research-layer-${id}-body`;

            return (
              <motion.article
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="cs-active-enrichment"
                data-expanded={expanded ? "true" : "false"}
                data-layer-id={id}
                data-source-class={display.sources[0]?.sourceClass ?? "none"}
                data-state={state}
                exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.985, y: -8 }}
                initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0.72, scale: 0.985, y: 10 }}
                key={id}
                layout
                transition={prefersReducedMotion ? { duration: 0.1, ease: "easeOut" } : commitSpring}
              >
                <button
                  aria-controls={bodyId}
                  aria-expanded={expanded}
                  className="cs-active-enrichment-head"
                  onClick={() => toggleExpanded(id)}
                  type="button"
                >
                  <span className="cs-active-dot" aria-hidden="true" />
                  <span>
                    <strong>{display.title}</strong>
                    <small>{statusCopy}</small>
                  </span>
                  <motion.span
                    animate={{ rotate: expanded ? 180 : 0 }}
                    className="cs-active-chevron"
                    transition={{ duration: prefersReducedMotion ? 0.1 : motionTokens.feedbackMs, ease: motionTokens.easeOut }}
                    aria-hidden="true"
                  >
                    ⌄
                  </motion.span>
                </button>
                <div
                  aria-hidden={!expanded}
                  className="cs-active-enrichment-body-frame"
                  data-expanded={expanded ? "true" : "false"}
                  id={bodyId}
                >
                  <div className="cs-active-enrichment-body">
                    <LayerContent
                      actionLabel={actionLabel}
                      display={contentDisplay}
                      onAction={running || refreshing ? undefined : handleLayerAction}
                      running={running || refreshing}
                      runningCopy={runningCopy}
                    />
                  </div>
                </div>
              </motion.article>
            );
          })}
          </AnimatePresence>
        </div>

        <AnimatePresence initial={false}>
          {draggingLayerId ? (
            <motion.div
              animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
              className="cs-module-insertion-slot"
              data-preview={snapPreviewId ? "true" : "false"}
              data-ready={snapReadyId ? "true" : "false"}
              exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.992 }}
              initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.992 }}
              transition={prefersReducedMotion ? { duration: 0.1, ease: "easeOut" } : { duration: motionTokens.stateMs, ease: motionTokens.easeOut }}
            >
              <span>{insertionSlotCopy}</span>
              <small>{insertionSlotHint}</small>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {analysisNotice ? (
          <div className="cs-research-notice" role="status">
            <strong>Research status</strong>
            <p>{analysisNotice}</p>
          </div>
        ) : null}

      </section>

      <motion.section
        className="cs-card-tray"
        aria-label="Research card stack"
        data-dragging={draggingLayerId ? "true" : "false"}
        data-ready={snapReadyId ? "true" : "false"}
      >
        <div className="cs-card-tray-head">
          <span>Research stack</span>
          <small>{dormantLayers.length} waiting</small>
        </div>
        <div className="cs-card-pile-motion">
          <div className="cs-card-pile">
            <AnimatePresence>
              {dormantLayers.map((layer, index) => {
                const dragging = draggingLayerId === layer.id;
                const previewing = snapPreviewId === layer.id;
                const snapReady = snapReadyId === layer.id;
                return (
                  <DormantPileCard
                    dragging={dragging}
                    index={index}
                    key={layer.id}
                    layer={layer}
                    onClick={() => handleDormantClick(layer.id)}
                    onDrag={(info) => handleDormantDrag(layer.id, info, index)}
                    onDragEnd={(info) => handleDormantDragEnd(layer.id, info, index)}
                    onDragStart={() => handleDormantDragStart(layer.id)}
                    onKeyDown={(event) => handleDormantKeyDown(event, layer.id)}
                    previewing={previewing}
                    snapReady={snapReady}
                    prefersReducedMotion={prefersReducedMotion}
                  />
                );
              })}
            </AnimatePresence>
          </div>
        </div>
      </motion.section>
    </>
  );
}
