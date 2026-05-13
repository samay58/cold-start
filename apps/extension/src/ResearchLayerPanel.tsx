import { canRunInvestorAnalysis, type ColdStartCard } from "@cold-start/core";
import { AnimatePresence, motion, useReducedMotion, type PanInfo } from "framer-motion";
import { useMemo, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import {
  RESEARCH_LAYER_CARDS,
  layerDisplayForCard,
  layersForCard,
  type ResearchLayerDisplay,
  type ResearchLayerId
} from "./research-layer";
import {
  dormantCardCanDrag,
  dragOffsetShouldPreview,
  dragOffsetShouldSnap,
  dragOffsetShouldSuppressClick
} from "./research-layer-motion";
import { BrandMark } from "./BrandMark";

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

function formatNumber(value: number | null | undefined) {
  return typeof value === "number" ? value.toLocaleString() : "Not found";
}

function sourceLabel(count: number) {
  return `${count} ${count === 1 ? "source" : "sources"}`;
}

function formatStatus(value: ColdStartCard["identity"]["status"]) {
  return value.charAt(0).toUpperCase() + value.slice(1).replaceAll("_", " ");
}

function websiteLabel(card: ColdStartCard) {
  const website = card.identity.websiteUrl?.value ?? `https://${card.domain}`;
  try {
    return new URL(website).hostname.replace(/^www\./i, "");
  } catch {
    return card.domain;
  }
}

type CardPerson = NonNullable<ColdStartCard["team"]["keyExecs"]["value"]>[number];

function roleScore(role: string | null) {
  const normalized = role?.toLowerCase() ?? "";
  let score = 0;

  if (normalized.includes("ceo")) {
    score += 5;
  }
  if (normalized.includes("co-founder") || normalized.includes("cofounder")) {
    score += 4;
  }
  if (normalized.includes("founder")) {
    score += 3;
  }
  if (normalized.includes("chief")) {
    score += 2;
  }
  if (normalized.includes("president") || normalized.includes("editor") || normalized.includes("operating")) {
    score += 1;
  }
  if (normalized.includes("prev.") || normalized.includes("previous")) {
    score -= 2;
  }

  return score;
}

function preferredPerson(current: CardPerson, candidate: CardPerson): CardPerson {
  const currentScore = roleScore(current.role);
  const candidateScore = roleScore(candidate.role);

  if (candidateScore !== currentScore) {
    return candidateScore > currentScore ? candidate : current;
  }

  const currentRoleLength = current.role?.length ?? 0;
  const candidateRoleLength = candidate.role?.length ?? 0;

  if (candidateRoleLength === 0) {
    return current;
  }
  if (currentRoleLength === 0) {
    return candidate;
  }

  return candidateRoleLength < currentRoleLength ? candidate : current;
}

function managementPeople(card: ColdStartCard): CardPerson[] {
  const byName = new Map<string, CardPerson>();
  const people = [...(card.team.founders.value ?? []), ...(card.team.keyExecs.value ?? [])];

  for (const person of people) {
    const key = person.name.trim().toLowerCase();
    const current = byName.get(key);

    if (!current) {
      byName.set(key, person);
      continue;
    }

    byName.set(key, preferredPerson(current, person));
  }

  return Array.from(byName.values());
}

function managementSourceCount(card: ColdStartCard) {
  return new Set([
    ...card.team.founders.citationIds,
    ...card.team.keyExecs.citationIds
  ]).size;
}

function roleLabel(role: string | null) {
  return role ?? "Role not found";
}

function CoreMetric({ label, meta, value }: { label: string; meta?: string | undefined; value: ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
      {meta ? <small>{meta}</small> : null}
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
  onPointerUp,
  pose,
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
  onPointerUp: () => void;
  pose: PilePose;
  prefersReducedMotion: boolean | null;
}) {
  const canDrag = dormantCardCanDrag({ prefersReducedMotion });
  const feedbackProps = !prefersReducedMotion
    ? {
        whileHover: { scale: 1.012 },
        whileTap: { scale: 0.99 }
      }
    : {};

  return (
    <motion.div
      animate={dragging
        ? { rotate: pose.rotate - 0.9, scale: 1.025, zIndex: 30 }
        : { rotate: pose.rotate, scale: 1, zIndex: index + 1 }}
      aria-label={`Pin ${layer.title}`}
      className="cs-dormant-card"
      data-dragging={dragging ? "true" : "false"}
      data-index={index}
      drag={canDrag ? true : false}
      dragConstraints={{ bottom: 0, left: -26, right: 26, top: -360 }}
      dragElastic={0.14}
      dragMomentum={false}
      exit={{ opacity: 0, scale: 0.94, y: -18 }}
      onClick={onClick}
      onDrag={(_event, info) => onDrag(info)}
      onDragEnd={(_event, info) => onDragEnd(info)}
      onDragStart={onDragStart}
      onKeyDown={onKeyDown}
      onPointerUp={onPointerUp}
      role="button"
      style={{
        left: 8 + pose.x,
        right: 8 - pose.x,
        top: pose.y
      }}
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
  const snapPreviewLayerId = useRef<ResearchLayerId | null>(null);
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
    const nextPreviewId = dragOffsetShouldPreview(info.offset.y) ? id : null;
    snapPreviewLayerId.current = nextPreviewId;
    setSnapPreviewId(nextPreviewId);
  }

  function handleDormantDragEnd(id: ResearchLayerId, info: PanInfo) {
    const shouldSnap = snapPreviewLayerId.current === id || dragOffsetShouldSnap(info.offset.y);

    setDraggingLayerId(null);
    setSnapPreviewId(null);
    snapPreviewLayerId.current = null;

    if (dragOffsetShouldSuppressClick(info.offset)) {
      suppressClickFor.current = id;
    }

    if (shouldSnap) {
      suppressClickFor.current = id;
      activateLayer(id);
    }
  }

  function handleDormantPointerUp(id: ResearchLayerId) {
    if (snapPreviewLayerId.current !== id) {
      return;
    }

    setDraggingLayerId(null);
    setSnapPreviewId(null);
    snapPreviewLayerId.current = null;
    suppressClickFor.current = id;
    activateLayer(id);
  }

  function pilePose(index: number): PilePose {
    return PILE_POSES[index % PILE_POSES.length] ?? { x: 0, y: 0, rotate: 0 };
  }

  const dormantLayers = RESEARCH_LAYER_CARDS.filter((layer) => !activeLayerIds.includes(layer.id));
  const hq = card.identity.hq.value;
  const headcount = card.team.headcount.value;
  const people = managementPeople(card);
  const visiblePeople = people.slice(0, 4);
  const hiddenPeopleCount = people.length - visiblePeople.length;
  const managerSources = managementSourceCount(card);
  const lastRound = card.funding.lastRound.value;
  const lastRoundAmount = formatCompactCurrency(lastRound?.amountUsd);
  const activeCount = activeLayerIds.length;

  return (
    <main className="cs-research-shell">
      <header className="cs-research-topbar">
        <div className="cs-research-brand">
          <BrandMark />
          <span>Cold Start</span>
        </div>
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
        <dl className="cs-company-facts" aria-label="Core metrics">
          <CoreMetric label="Employees" value={formatNumber(headcount?.value)} meta={headcount?.asOf ? `As of ${headcount.asOf}` : undefined} />
          <CoreMetric label="Founded" value={card.identity.foundedYear.value ?? "Not found"} />
          <CoreMetric label="HQ" value={hq ? `${hq.city}, ${hq.country}` : "Not found"} />
          <CoreMetric label="Website" value={websiteLabel(card)} />
          <CoreMetric label="Status" value={formatStatus(card.identity.status)} />
          <CoreMetric
            label="Latest round"
            value={lastRound?.name ?? lastRoundAmount}
            meta={lastRound?.name && lastRoundAmount !== "Not found" ? lastRoundAmount : undefined}
          />
        </dl>

        {people.length > 0 ? (
          <section className="cs-management-team" aria-label="Management team">
            <div className="cs-management-team-head">
              <span>Management team</span>
              <span>{managerSources > 0 ? sourceLabel(managerSources) : "sources pending"}</span>
            </div>
            <ul>
              {visiblePeople.map((person) => (
                <li key={`${person.name}-${person.role ?? "role"}`}>
                  <strong>{person.name}</strong>
                  <span>{roleLabel(person.role)}</span>
                </li>
              ))}
              {hiddenPeopleCount > 0 ? (
                <li className="cs-management-more">
                  <strong>+{hiddenPeopleCount}</strong>
                  <span>additional cited leaders</span>
                </li>
              ) : null}
            </ul>
          </section>
        ) : null}
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
                  onPointerUp={() => handleDormantPointerUp(layer.id)}
                  pose={pose}
                  prefersReducedMotion={prefersReducedMotion}
                />
              );
            })}
          </AnimatePresence>
        </motion.div>
      </section>
    </main>
  );
}
