import { canRunInvestorAnalysis, type ColdStartCard } from "@cold-start/core";
import { AnimatePresence, motion, useDragControls, useReducedMotion, type PanInfo } from "framer-motion";
import { useMemo, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent, ReactNode } from "react";
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

type AnalysisRun = {
  generationStatus: "queued" | "running";
  startedAt: number;
};

type ResearchLayerPanelProps = {
  analysisNotice?: string | undefined;
  analysisRun?: AnalysisRun | undefined;
  card: ColdStartCard;
  elapsedSeconds: number;
  onRegenerate: () => void;
  onStartAnalysis: () => void;
};

const VISIBLE_SOURCE_COUNT = 3;
const PILE_POSES = [
  { x: -2, y: 0, rotate: -1.5 },
  { x: 16, y: 48, rotate: 1.1 },
  { x: -10, y: 96, rotate: -0.8 },
  { x: 12, y: 144, rotate: 1.35 },
  { x: -4, y: 192, rotate: -1.1 },
  { x: 15, y: 240, rotate: 0.9 },
  { x: 0, y: 288, rotate: -0.6 }
];

type PilePose = {
  x: number;
  y: number;
  rotate: number;
};

function formatElapsed(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = String(seconds % 60).padStart(2, "0");
  return `${minutes}:${remainder}`;
}

function initialFor(name: string) {
  return name.trim().charAt(0).toUpperCase() || "C";
}

function formatCompactCurrency(value: number | null | undefined) {
  if (typeof value !== "number") {
    return "Not found";
  }

  if (value >= 1_000_000_000) {
    return `$${Math.round(value / 100_000_000) / 10}B`;
  }

  if (value >= 1_000_000) {
    return `$${Math.round(value / 1_000_000)}M`;
  }

  return `$${value.toLocaleString()}`;
}

function sourceLabel(count: number) {
  return `${count} ${count === 1 ? "source" : "sources"}`;
}

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function LayerContent({
  display,
  running
}: {
  display: ResearchLayerDisplay;
  running: boolean;
}) {
  if (running) {
    return (
      <div className="cs-layer-running-copy" aria-live="polite">
        <span className="cs-shimmer-text">Extracting structure from cited sources</span>
        <small>Longer runs continue safely in the background.</small>
        <span className="cs-layer-skeleton" aria-hidden="true" />
        <span className="cs-layer-skeleton cs-layer-skeleton-short" aria-hidden="true" />
      </div>
    );
  }

  const sourceChips = <SourceChips sources={display.sources} />;

  if (display.items && display.items.length > 0) {
    return (
      <>
        <ul className="cs-layer-items">
          {display.items.map((item) => (
            <li key={`${item.title}-${item.meta ?? item.body ?? ""}`}>
              <div>
                <strong>{item.title}</strong>
                {item.body ? <p>{item.body}</p> : null}
              </div>
              {item.meta ? <span>{item.meta}</span> : null}
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
          title={source.title}
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
  pose,
  prefersReducedMotion,
  total
}: {
  dragging: boolean;
  index: number;
  layer: (typeof RESEARCH_LAYER_CARDS)[number];
  onClick: () => void;
  onDrag: (info: PanInfo) => void;
  onDragEnd: (info: PanInfo) => void;
  onDragStart: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  pose: PilePose;
  prefersReducedMotion: boolean | null;
  total: number;
}) {
  const dragControls = useDragControls();
  const canDrag = !prefersReducedMotion;
  const feedbackProps = canDrag
    ? {
        whileHover: { y: pose.y - 3, scale: 1.012 },
        whileTap: { scale: 0.99 }
      }
    : {};

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!canDrag || event.button !== 0) {
      return;
    }

    dragControls.start(event);
  }

  return (
    <motion.div
      animate={dragging
        ? { rotate: pose.rotate - 0.9, scale: 1.025, x: pose.x, y: pose.y, zIndex: 30 }
        : { rotate: pose.rotate, scale: 1, x: pose.x, y: pose.y, zIndex: total - index }}
      aria-label={`Pin ${layer.title}`}
      className="cs-dormant-card"
      data-dragging={dragging ? "true" : "false"}
      data-index={index}
      drag={canDrag ? true : false}
      dragConstraints={{ bottom: 0, left: -26, right: 26, top: -360 }}
      dragControls={dragControls}
      dragElastic={0.14}
      dragListener={false}
      dragMomentum={false}
      exit={{ opacity: 0, scale: 0.94, y: -18 }}
      layout
      onClick={onClick}
      onDrag={(_event, info) => onDrag(info)}
      onDragEnd={(_event, info) => onDragEnd(info)}
      onDragStart={onDragStart}
      onKeyDown={onKeyDown}
      onPointerDown={handlePointerDown}
      role="button"
      tabIndex={0}
      transition={{ type: "spring", stiffness: 420, damping: 34, mass: 0.75 }}
      {...feedbackProps}
    >
      <span className="cs-card-grip" aria-hidden="true">⋮</span>
      <span className="cs-dormant-card-copy">
        <strong>{layer.title}</strong>
        <small>{layer.description}</small>
      </span>
      {layer.source === "analysis" ? <span className="cs-card-plus" aria-hidden="true">+</span> : null}
    </motion.div>
  );
}

export function ResearchLayerPanel({
  analysisNotice,
  analysisRun,
  card,
  elapsedSeconds,
  onRegenerate,
  onStartAnalysis
}: ResearchLayerPanelProps) {
  const companyName = card.identity.name.value ?? card.domain;
  const canStartInvestorLens = canRunInvestorAnalysis(card);
  const layers = useMemo(() => layersForCard(card), [card]);
  const [activeLayerIds, setActiveLayerIds] = useState<ResearchLayerId[]>(() => {
    if (card.synthesis || analysisRun) {
      return ["coreIdea"];
    }

    return [];
  });
  const [expandedLayerId, setExpandedLayerId] = useState<ResearchLayerId | null>(() => {
    if (card.synthesis || analysisRun) {
      return "coreIdea";
    }

    return null;
  });
  const [draggingLayerId, setDraggingLayerId] = useState<ResearchLayerId | null>(null);
  const [snapPreviewId, setSnapPreviewId] = useState<ResearchLayerId | null>(null);
  const suppressClickFor = useRef<ResearchLayerId | null>(null);
  const prefersReducedMotion = useReducedMotion();

  function activateLayer(id: ResearchLayerId) {
    const layer = layers.find((candidate) => candidate.id === id);
    if (!layer) {
      return;
    }

    setActiveLayerIds((current) => current.includes(id) ? current : [...current, id]);
    setExpandedLayerId(id);

    if (layer.source === "analysis" && layer.availability === "needs-analysis" && canStartInvestorLens && !analysisRun) {
      onStartAnalysis();
    }
  }

  function toggleExpanded(id: ResearchLayerId) {
    setExpandedLayerId((current) => current === id ? null : id);
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
  }

  function handleDormantDrag(id: ResearchLayerId, info: PanInfo) {
    setSnapPreviewId(dragOffsetShouldPreview(info.offset.y) ? id : null);
  }

  function handleDormantDragEnd(id: ResearchLayerId, info: PanInfo) {
    setDraggingLayerId(null);
    setSnapPreviewId(null);

    if (dragOffsetShouldSuppressClick(info.offset)) {
      suppressClickFor.current = id;
    }

    if (dragOffsetShouldSnap(info.offset.y)) {
      suppressClickFor.current = id;
      activateLayer(id);
    }
  }

  function pilePose(index: number): PilePose {
    return PILE_POSES[index % PILE_POSES.length] ?? { x: 0, y: 0, rotate: 0 };
  }

  const dormantLayers = RESEARCH_LAYER_CARDS.filter((layer) => !activeLayerIds.includes(layer.id));
  const hq = card.identity.hq.value;
  const activeCount = activeLayerIds.length;

  return (
    <main className="cs-research-shell">
      <header className="cs-research-topbar">
        <div className="cs-research-brand">
          <span className="cs-research-mark" aria-hidden="true">C</span>
          <span>Cold Start</span>
        </div>
        <span className="cs-research-topbar-meta">extension</span>
      </header>

      <section className="cs-company-context" aria-label="Company context">
        <div className="cs-company-context-main">
          <span className="cs-company-logo" aria-hidden="true">{initialFor(companyName)}</span>
          <div>
            <p className="cs-research-label">Company</p>
            <h1>{companyName}</h1>
            <p>{card.identity.oneLiner.value ?? card.domain}</p>
          </div>
        </div>
        <dl className="cs-company-facts">
          <Fact label="Founded" value={card.identity.foundedYear.value ?? "Not found"} />
          <Fact label="HQ" value={hq ? `${hq.city}, ${hq.country}` : "Not found"} />
          <Fact label="Stage" value={card.funding.lastRound.value?.name ?? "Not found"} />
          <Fact label="Latest round" value={formatCompactCurrency(card.funding.lastRound.value?.amountUsd)} />
        </dl>
      </section>

      <section className="cs-research-layer" aria-label="Research layer">
        <div className="cs-research-layer-head">
          <span>Research layer</span>
          <span>{activeCount} / {RESEARCH_LAYER_CARDS.length}</span>
        </div>

        <motion.div className="cs-active-enrichments" layout>
          {activeLayerIds.map((id) => {
            const display = layerDisplayForCard(card, id);
            if (!display) {
              return null;
            }

            const layer = layers.find((candidate) => candidate.id === id);
            const running = Boolean(analysisRun && layer?.source === "analysis" && !card.synthesis);
            const expanded = expandedLayerId === id || running;
            const state = running ? "running" : display.status;

            return (
              <motion.article className="cs-active-enrichment" data-state={state} key={id} layout>
                <button className="cs-active-enrichment-head" onClick={() => toggleExpanded(id)} type="button">
                  <span className="cs-active-dot" aria-hidden="true" />
                  <span>
                    <strong>{display.title}</strong>
                    <small>{running ? `Synthesizing · ${formatElapsed(elapsedSeconds)}` : sourceLabel(display.sourceCount)}</small>
                  </span>
                  <motion.span
                    animate={{ rotate: expanded ? 180 : 0 }}
                    className="cs-active-chevron"
                    transition={{ duration: prefersReducedMotion ? 0 : 0.16 }}
                    aria-hidden="true"
                  >
                    ⌄
                  </motion.span>
                </button>
                <AnimatePresence initial={false}>
                  {expanded ? (
                    <motion.div
                      animate={{ height: "auto", opacity: 1 }}
                      className="cs-active-enrichment-body"
                      exit={{ height: 0, opacity: 0 }}
                      initial={{ height: 0, opacity: 0 }}
                      transition={{ duration: prefersReducedMotion ? 0 : 0.22, ease: [0.16, 1, 0.3, 1] }}
                    >
                      <LayerContent display={display} running={running} />
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </motion.article>
            );
          })}
          {activeLayerIds.length === 0 ? (
            <div className="cs-empty-research-layer">
              <span>Add enrichment</span>
              <p>Pin a research card to build the investor layer.</p>
            </div>
          ) : null}
        </motion.div>

        {analysisNotice ? (
          <div className="cs-research-notice" role="status">
            <strong>Not enough verified evidence</strong>
            <p>{analysisNotice}</p>
          </div>
        ) : null}

        {!canStartInvestorLens ? (
          <div className="cs-research-notice" role="status">
            <strong>Needs sources</strong>
            <p>Regenerate the profile before running investor analysis.</p>
            <button type="button" onClick={onRegenerate}>Regenerate</button>
          </div>
        ) : null}
      </section>

      <section
        className="cs-card-tray"
        aria-label="Dormant enrichment cards"
        data-drop-visible={draggingLayerId ? "true" : "false"}
        data-snap-preview={snapPreviewId ? "true" : "false"}
      >
        <div className="cs-drop-zone" aria-hidden={!draggingLayerId}>
          {snapPreviewId ? "Release to pin" : "Add enrichment"}
        </div>
        <motion.div className="cs-card-pile" layout>
          <AnimatePresence>
            {dormantLayers.map((layer, index) => {
              const pose = pilePose(index);
              const dragging = draggingLayerId === layer.id;
              return (
                <DormantPileCard
                  dragging={dragging}
                  index={index}
                  key={layer.id}
                  layer={layer}
                  onClick={() => handleDormantClick(layer.id)}
                  onDrag={(info) => handleDormantDrag(layer.id, info)}
                  onDragEnd={(info) => handleDormantDragEnd(layer.id, info)}
                  onDragStart={() => handleDormantDragStart(layer.id)}
                  onKeyDown={(event) => handleDormantKeyDown(event, layer.id)}
                  pose={pose}
                  prefersReducedMotion={prefersReducedMotion}
                  total={dormantLayers.length}
                />
              );
            })}
          </AnimatePresence>
        </motion.div>
      </section>
    </main>
  );
}
