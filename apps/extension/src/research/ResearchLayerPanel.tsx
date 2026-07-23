import {
  analysisBlockedReason,
  publicProfileQuality,
  type ColdStartCard,
  type PublicProfileQuality,
  type ResearchSection
} from "@cold-start/core";
import { AnimatePresence, animate, motion, useMotionValue, type PanInfo } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { commitSpring, motionTokens, snapSpring } from "../shared/motion-primitives";
import {
  RESEARCH_LAYER_CARDS,
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
import { showPartialProfileGate, sourceLabel } from "../company/company-display";
import { LENS_RUN_FAILED_NOTICE, formatElapsed } from "../shared/extension-format";
import type { ExtensionResearchRunEvent } from "../shared/extension-config";
import { AnalysisWaitInstrument } from "./AnalysisWaitInstrument";
import { investorReadForCard, LENS_WAITS_FOR_PROFILE_REASON } from "./investor-lens";
import { InvestorReadCard, LensSlot, type LensSlotState } from "./InvestorReadCard";
import { LensWithheldCard } from "./LensWithheldCard";
import type { TooltipPropsFor } from "../shared/SharedTooltip";
import { usePrefersReducedMotion } from "../shared/usePrefersReducedMotion";

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
  elapsedSeconds: number;
  onRunSection: (layerId: ResearchLayerId) => void;
  onRunAnalysis: (forceRefresh?: boolean) => void;
  onRegenerate: () => void;
  queuedLayerIds?: ResearchLayerId[] | undefined;
  profileElapsedSeconds?: number | undefined;
  profileRun?: AnalysisRun | undefined;
  activeSectionElapsedSeconds?: number | undefined;
  activeSectionRun?: ActiveSectionRun | undefined;
  sections?: ResearchSection[] | undefined;
  events?: ExtensionResearchRunEvent[] | undefined;
  tooltipProps: TooltipPropsFor;
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

// The memo is the first Lens output; nothing auto-opens from the pile anymore. Modules are
// browsable detail behind the read, opened by the reader or restored from their pins.
const DEFAULT_ACTIVE_LAYERS: ResearchLayerId[] = [];

function investorLensControlState({
  card,
  profileRun
}: {
  card: ColdStartCard;
  profileRun?: AnalysisRun | undefined;
}) {
  if (profileRun) {
    return { disabled: true, reason: LENS_WAITS_FOR_PROFILE_REASON };
  }

  const blockedReason = analysisBlockedReason(card);
  if (blockedReason) {
    return { disabled: true, reason: blockedReason };
  }

  return { disabled: false, reason: "Weigh the case, timing, and next question against cited sources." };
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
  runningCopy = "Extracting structure from cited sources",
  tooltipProps
}: {
  actionLabel?: string | undefined;
  display: ResearchLayerDisplay;
  onAction?: (() => void) | undefined;
  running: boolean;
  runningCopy?: string;
  tooltipProps: TooltipPropsFor;
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
      <SourceChips sources={display.sources} tooltipProps={tooltipProps} />
      {action}
    </>
  );

  if (display.items && display.items.length > 0) {
    if (display.id === "investors") {
      return (
        <>
          <MoneyLayerItems investors={display.investors} items={display.items} />
          {sourceChips}
        </>
      );
    }
    if (display.id === "signals") {
      return (
        <>
          <SignalLayerItems items={display.items} />
          {sourceChips}
        </>
      );
    }
    return (
      <>
        {display.lead ? <p className="cs-layer-lead">{display.lead}</p> : null}
        <ul className="cs-layer-items">
          {display.items.map((item) => (
            <li data-has-meta={item.meta ? "true" : "false"} key={`${item.title}-${item.meta ?? item.body ?? ""}`}>
              {item.meta ? <span>{item.meta}</span> : null}
              <div>
                <strong>{item.title}</strong>
                {item.body ? <p>{item.body}</p> : null}
              </div>
            </li>
          ))}
        </ul>
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

function MoneyLayerItems({
  investors,
  items
}: {
  investors?: string[] | undefined;
  items: NonNullable<ResearchLayerDisplay["items"]>;
}) {
  const [hero, ...rounds] = items;
  // The composed single-round line carries its compact amount in meta so the hero slot can
  // show the figure; the note keeps the round and date without repeating the number.
  const heroAmount = hero?.meta && hero.meta.startsWith("$") ? hero.meta : null;
  const heroFigure = heroAmount
    ?? (hero?.title.toLowerCase() === "total raised" && hero.body
      ? hero.body.replace(/^Total raised is\s*/i, "").replace(/[.]$/, "")
      : hero?.title);
  const heroNote = heroAmount
    ? hero?.body?.replace(/^Raised\s+\$[\d.,]+\s*[KMB]?\s+in\s+an?\s+/i, "").replace(/[.]$/, "")
    : hero?.title.toLowerCase() === "total raised" ? undefined : hero?.body;

  return (
    <section className="cs-layer-money-ledger" aria-label="Funding summary">
      {hero ? (
        <div className="cs-layer-money-hero">
          <span>Total raised</span>
          <strong>{heroFigure}</strong>
          {heroNote ? <p>{heroNote}</p> : null}
        </div>
      ) : null}
      {investors && investors.length > 0 ? (
        <div className="cs-layer-money-investors" aria-label="Named investors">
          <span>Investors</span>
          <p>{investors.join(" · ")}</p>
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

function InvestorLensControl({
  card,
  onRunAnalysis,
  profileRun
}: {
  card: ColdStartCard;
  onRunAnalysis: (forceRefresh?: boolean) => void;
  profileRun?: AnalysisRun | undefined;
}) {
  const state = investorLensControlState({ card, profileRun });
  return (
    <button
      aria-label="Run Investor Lens"
      className="cs-investor-lens-control"
      disabled={state.disabled}
      onClick={() => onRunAnalysis()}
      type="button"
    >
      <span className="cs-investor-lens-control-index" aria-hidden="true">IL</span>
      <span className="cs-investor-lens-control-copy">
        <strong>Investor Lens</strong>
        <span>{state.reason}</span>
      </span>
      <span className="cs-investor-lens-control-action" aria-hidden="true">
        <span className="cs-investor-lens-control-seal">
          <span />
        </span>
        <span>{state.disabled ? "Sealed" : "Run lens"}</span>
      </span>
    </button>
  );
}

// Genuine run failure, distinct from a withheld verdict: the pipeline attempted synthesis and
// did not complete, with no synthesisWithheld record to explain why. The normal Investor Lens
// control below this card is still the retry action; this only states what happened.
function LensFailedCard() {
  return (
    <div aria-label="Lens run failed" className="cs-lens-failed" role="status">
      <strong>{LENS_RUN_FAILED_NOTICE}</strong>
      <p>The last run did not produce a read. Retry when ready.</p>
    </div>
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
  // showPartialProfileGate only routes here when !hasUsablePublicProfile(card), and
  // analysisBlockedReason's first two checks are that same condition, so it is never null here.
  const lensReason = analysisBlockedReason(card);

  return (
    <section className="cs-partial-profile" aria-label="Incomplete company profile">
      <div className="cs-partial-profile-copy">
        <p className="cs-research-label">{status}</p>
        <p>{body}</p>
      </div>
      <button className="cs-extension-button" onClick={onRegenerate} type="button">
        Regenerate profile
      </button>
      <div className="cs-lens-sealed cs-lens-sealed-partial" data-sealed="true">
        <strong>Investor Lens</strong>
        <span>{lensReason}</span>
      </div>
    </section>
  );
}

function SourceChips({
  sources,
  tooltipProps
}: {
  sources: ResearchLayerDisplay["sources"];
  tooltipProps: TooltipPropsFor;
}) {
  if (sources.length === 0) {
    return null;
  }

  const visibleSources = sources.slice(0, VISIBLE_SOURCE_COUNT);
  const hiddenSources = sources.slice(VISIBLE_SOURCE_COUNT);

  return (
    <div className="cs-source-chips" aria-label="Sources">
      {visibleSources.map((source) => (
        <a
          className="cs-source-chip"
          data-class={source.sourceClass}
          href={source.href}
          key={source.id}
          rel="noreferrer"
          target="_blank"
          title={`${source.qualityLabel}: ${source.title}`}
        >
          <i aria-hidden="true" />
          {source.domain}
        </a>
      ))}
      {hiddenSources.length > 0 ? (
        <button
          className="cs-panel-more cs-source-more"
          type="button"
          {...tooltipProps({
            body: hiddenSources.map((source) => `${source.domain}: ${source.title}`).join("\n"),
            id: `layer-sources-${sources.map((source) => source.id).join("-")}`,
            placement: "above",
            title: "Also cited"
          })}
        >
          {`+${hiddenSources.length}`}
        </button>
      ) : null}
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
  tooltipProps
}: ResearchLayerPanelProps) {
  const quality = publicProfileQuality(card);
  const layers = useMemo(() => layersForCard(card, sections), [card, sections]);
  const activeSectionLayerId = activeSectionRun?.layerId;
  const lastSectionLayerRef = useRef<{ domain: string; layerId: ResearchLayerId } | null>(null);
  const pendingLayerActivationsRef = useRef<{ domain: string; ids: ResearchLayerId[] }>({ domain: card.domain, ids: [] });
  const [activeLayerIds, setActiveLayerIds] = useState<ResearchLayerId[]>(DEFAULT_ACTIVE_LAYERS);
  const [expandedLayerId, setExpandedLayerId] = useState<ResearchLayerId | null>(null);
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
    readPinnedLayerIds(card.domain, DEFAULT_ACTIVE_LAYERS, (ids) => {
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
  }, [card.domain]);

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
    if (display && shouldQueueLayerRun(display.status) && !profileRun) {
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
  const insertionSlotCopy = draggingLayer ? `File ${draggingLayer.title}` : "File card";
  const insertionSlotHint = snapReadyId
    ? "Release to file it in Research"
    : snapPreviewId
      ? "Keep pulling toward the filing space"
      : "Lift a card to file it";
  const investorRead = investorReadForCard(card);
  const lensRunning = Boolean(analysisRun && !card.synthesis);
  // Three distinct, honest end states once synthesis is not present: withheld (a recorded
  // evidence-gate verdict), failed (the run did not complete and left no such record), or
  // neither (analysis has simply not run yet). The client never infers withholding from
  // !card.synthesis alone; card.synthesisWithheld is the only signal for that state.
  const lensWithheld = !lensRunning && !card.synthesis && Boolean(card.synthesisWithheld);
  const lensFailed = !lensRunning && !card.synthesis && !lensWithheld && analysisNotice === LENS_RUN_FAILED_NOTICE;
  // Same precedence the ternary below used to encode directly: running always wins, then a
  // filed read, then a withheld verdict, and trigger (with an optional failed-run notice folded
  // in) is the fallback. LensSlot's crossfade keys off this single discriminator.
  const lensSlotState: LensSlotState = lensRunning
    ? "running"
    : investorRead
      ? "result"
      : lensWithheld && card.synthesisWithheld
        ? "withheld"
        : "trigger";
  // The withheld and run-failed outcomes each carry their own receipt in the lens slot; only a
  // real, unclassified notice keeps the generic research-status box below.
  const visibleAnalysisNotice = analysisNotice === LENS_RUN_FAILED_NOTICE ? undefined : analysisNotice;

  // The identity header and the early read render above this panel in the CompanyArc shell;
  // the gate here only decides between the research layer and the honest partial state.
  if (showPartialProfileGate(card, events)) {
    return <PartialProfilePanel card={card} onRegenerate={onRegenerate} quality={quality} />;
  }

  return (
    <>
      <section className="cs-research-layer" aria-label="Research layer">
        <div className="cs-lens-slot">
          <LensSlot
            prefersReducedMotion={prefersReducedMotion}
            result={investorRead ? <InvestorReadCard card={card} read={investorRead} tooltipProps={tooltipProps} /> : null}
            running={
              <AnalysisWaitInstrument
                elapsedSeconds={elapsedSeconds}
                events={events}
                prefersReducedMotion={prefersReducedMotion}
              />
            }
            state={lensSlotState}
            trigger={
              <>
                {lensFailed ? <LensFailedCard /> : null}
                <InvestorLensControl card={card} onRunAnalysis={onRunAnalysis} profileRun={profileRun} />
              </>
            }
            withheld={
              lensWithheld && card.synthesisWithheld ? (
                <LensWithheldCard card={card} onRetry={() => onRunAnalysis(true)} withheld={card.synthesisWithheld} />
              ) : null
            }
          />
        </div>

        <div className="cs-active-enrichments">
          <AnimatePresence initial={false}>
          {activeLayerIds.map((id) => {
            const display = layerDisplayForCard(card, id, sections);
            if (!display) {
              return null;
            }

            const layer = layers.find((candidate) => candidate.id === id);
            const isAnalysisLayer = layer?.source === "analysis";
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
              : isAnalysisLayer
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
                      tooltipProps={tooltipProps}
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

        {visibleAnalysisNotice ? (
          <div className="cs-research-notice" role="status">
            <strong>Research status</strong>
            <p>{visibleAnalysisNotice}</p>
          </div>
        ) : null}

      </section>

      <AnimatePresence initial={false}>
        {dormantLayers.length > 0 ? (
          <motion.section
            animate={{ opacity: 1, y: 0 }}
            className="cs-card-tray"
            aria-label="Research card stack"
            data-dragging={draggingLayerId ? "true" : "false"}
            data-ready={snapReadyId ? "true" : "false"}
            exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
            initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
            key="research-card-stack"
            transition={{ duration: prefersReducedMotion ? 0.1 : 0.16, ease: motionTokens.easeOut }}
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
        ) : null}
      </AnimatePresence>
    </>
  );
}
