import { canRunInvestorAnalysis, publicProfileQuality, type ColdStartCard, type PublicProfileQuality } from "@cold-start/core";
import { AnimatePresence, motion, type PanInfo } from "framer-motion";
import { useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
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
import { CompanyLogo } from "./CompanyLogo";
import { formatElapsed } from "./extension-format";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

type AnalysisRun = {
  generationStatus: "queued" | "running";
  startedAt: number;
};

type ProfileRefreshRun = AnalysisRun & {
  layerId: ResearchLayerId;
};

type ResearchLayerPanelProps = {
  analysisNotice?: string | undefined;
  analysisRun?: AnalysisRun | undefined;
  card: ColdStartCard;
  contactElapsedSeconds?: number | undefined;
  contactRun?: AnalysisRun | undefined;
  elapsedSeconds: number;
  onRefreshProfile: (layerId: ResearchLayerId) => void;
  onRegenerate: () => void;
  onStartAnalysis: () => void;
  profileRefreshElapsedSeconds?: number | undefined;
  profileRefreshRun?: ProfileRefreshRun | undefined;
};

const VISIBLE_SOURCE_COUNT = 3;
const PILE_POSES = [
  { x: -1, y: 0, rotate: -0.8 },
  { x: 8, y: 34, rotate: 0.7 },
  { x: -6, y: 68, rotate: -0.55 },
  { x: 7, y: 102, rotate: 0.8 },
  { x: -3, y: 136, rotate: -0.65 },
  { x: 8, y: 170, rotate: 0.5 },
  { x: 0, y: 204, rotate: -0.35 }
];

type PilePose = {
  x: number;
  y: number;
  rotate: number;
};

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

function formatOptionalNumber(value: number | null | undefined) {
  return typeof value === "number" ? value.toLocaleString() : null;
}

function formatOptionalCurrency(value: number | null | undefined) {
  const formatted = formatCompactCurrency(value);
  return formatted === "Not found" ? null : formatted;
}

function sourceLabel(count: number) {
  return `${count} ${count === 1 ? "source" : "sources"}`;
}

function websiteLabel(card: ColdStartCard) {
  const website = card.identity.websiteUrl?.value ?? `https://${card.domain}`;
  try {
    return new URL(website).hostname.replace(/^www\./i, "");
  } catch {
    return card.domain;
  }
}

function readableCompanyName(card: ColdStartCard) {
  const extracted = card.identity.name.value?.trim();
  if (extracted && extracted.toLowerCase() !== card.domain.toLowerCase()) {
    return extracted;
  }

  const root = card.domain.replace(/^www\./i, "").split(".")[0] ?? card.domain;
  return root
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ") || card.domain;
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
  let preferred = current;

  if (candidateScore !== currentScore) {
    preferred = candidateScore > currentScore ? candidate : current;
  } else {
    const currentRoleLength = current.role?.length ?? 0;
    const candidateRoleLength = candidate.role?.length ?? 0;

    if (candidateRoleLength === 0) {
      preferred = current;
    } else if (currentRoleLength === 0) {
      preferred = candidate;
    } else {
      preferred = candidateRoleLength < currentRoleLength ? candidate : current;
    }
  }

  return {
    ...preferred,
    sourceUrl: preferred.sourceUrl ?? current.sourceUrl ?? candidate.sourceUrl,
    email: preferred.email ?? current.email ?? candidate.email ?? null,
  };
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

function personRole(person: CardPerson) {
  return person.role?.trim() || "Role not verified";
}

function personInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const initials = parts.length >= 2
    ? `${parts[0]?.charAt(0) ?? ""}${parts[parts.length - 1]?.charAt(0) ?? ""}`
    : parts[0]?.slice(0, 2) ?? "";

  return initials.toUpperCase() || "P";
}

function peopleEmailCount(people: CardPerson[]) {
  return people.filter((person) => person.email).length;
}

function managementConfidence(card: ColdStartCard) {
  const confidenceRank = { high: 3, medium: 2, low: 1 } as const;
  return [card.team.founders, card.team.keyExecs]
    .filter((fact) => (fact.value ?? []).some((person) => person.email))
    .map((fact) => fact.confidence)
    .sort((left, right) => confidenceRank[right] - confidenceRank[left])[0] ?? null;
}

function profileFacts(card: ColdStartCard): Array<{ label: string; value: string; meta?: string | undefined }> {
  const hq = card.identity.hq.value;
  const headcount = card.team.headcount.value;
  const lastRound = card.funding.lastRound.value;
  const lastRoundAmount = formatOptionalCurrency(lastRound?.amountUsd);
  const totalRaised = formatOptionalCurrency(card.funding.totalRaisedUsd.value);
  const facts: Array<{ label: string; value: string; meta?: string | undefined }> = [];

  const employees = formatOptionalNumber(headcount?.value);
  if (employees) {
    facts.push({
      label: "Employees",
      value: employees,
      ...(headcount?.asOf ? { meta: headcount.asOf } : {})
    });
  }

  if (lastRound?.name) {
    facts.push({
      label: "Round",
      value: lastRound.name,
      ...(lastRoundAmount ? { meta: lastRoundAmount } : {})
    });
  } else if (totalRaised) {
    facts.push({ label: "Raised", value: totalRaised });
  }

  if (hq?.city || hq?.country) {
    facts.push({ label: "HQ", value: [hq.city, hq.country].filter(Boolean).join(", ") });
  } else if (card.identity.foundedYear.value) {
    facts.push({ label: "Founded", value: String(card.identity.foundedYear.value) });
  }

  return facts.slice(0, 3);
}

function FactRibbon({ facts }: { facts: ReturnType<typeof profileFacts> }) {
  if (facts.length === 0) {
    return null;
  }

  return (
    <dl className="cs-company-facts" aria-label="Core metrics">
      {facts.map((fact) => (
        <div key={fact.label}>
          <dt>{fact.label}</dt>
          <dd>{fact.value}</dd>
          {fact.meta ? <small>{fact.meta}</small> : null}
        </div>
      ))}
    </dl>
  );
}

function PeopleLine({
  contactElapsedSeconds = 0,
  contactRun,
  confidence,
  people,
  sourceCount
}: {
  contactElapsedSeconds?: number;
  contactRun?: AnalysisRun | undefined;
  confidence?: ColdStartCard["team"]["founders"]["confidence"] | null;
  people: CardPerson[];
  sourceCount: number;
}) {
  if (people.length === 0) {
    return null;
  }

  const orderedPeople = [
    ...people.filter((person) => person.email),
    ...people.filter((person) => !person.email),
  ];
  const visiblePeople = orderedPeople.slice(0, 4);
  const hiddenPeopleCount = orderedPeople.length - visiblePeople.length;
  const emailCount = peopleEmailCount(people);
  const contactStatus = contactRun
    ? `Checking emails · ${formatElapsed(contactElapsedSeconds)}`
    : emailCount > 0
      ? `${emailCount} verified work email${emailCount === 1 ? "" : "s"}`
      : "No verified work email found";
  const confidenceStatus = !contactRun && emailCount > 0 && confidence ? ` · ${confidence} confidence` : "";

  function copyEmail(email: string) {
    void navigator.clipboard?.writeText(email);
  }

  return (
    <section className="cs-people-line" aria-label="Management team">
      <div className="cs-people-line-head">
        <span className="cs-people-line-label">People</span>
        <span className="cs-people-line-source">
          {contactStatus}
          {confidenceStatus}
          {sourceCount > 0 ? ` · ${sourceLabel(sourceCount)}` : ""}
        </span>
      </div>
      <div className="cs-people-line-list">
        {visiblePeople.map((person) => (
          <article
            className="cs-people-person"
            data-has-email={person.email ? "true" : "false"}
            key={`${person.name}-${person.email ?? person.role ?? "person"}`}
          >
            <span className="cs-person-avatar" aria-hidden="true">{personInitials(person.name)}</span>
            <span className="cs-person-main">
              <span className="cs-people-name">{person.name}</span>
              <span className="cs-people-role">{personRole(person)}</span>
              {person.email ? (
                <span className="cs-person-email">
                  <a href={`mailto:${person.email}`}>{person.email}</a>
                  <button aria-label={`Copy ${person.email}`} onClick={() => copyEmail(person.email!)} type="button">Copy</button>
                </span>
              ) : null}
            </span>
            <span className="cs-person-contact-state" aria-hidden="true">
              {person.email ? "@" : ""}
            </span>
          </article>
        ))}
        {hiddenPeopleCount > 0 ? (
          <span className="cs-people-more">
            +{hiddenPeopleCount}
          </span>
        ) : null}
      </div>
    </section>
  );
}

function LayerContent({
  display,
  running,
  runningCopy = "Extracting structure from cited sources"
}: {
  display: ResearchLayerDisplay;
  running: boolean;
  runningCopy?: string;
}) {
  if (running) {
    return (
      <div className="cs-layer-running-copy" aria-live="polite">
        <span className="cs-shimmer-text">{runningCopy}</span>
        <span className="cs-layer-progress" aria-hidden="true">
          <span />
        </span>
        <span className="cs-layer-skeleton" aria-hidden="true" />
        <span className="cs-layer-skeleton cs-layer-skeleton-short" aria-hidden="true" />
      </div>
    );
  }

  const sourceChips = <SourceChips sources={display.sources} />;

  if (display.items && display.items.length > 0) {
    return (
      <>
        <ul className={`cs-layer-items ${display.id === "investors" ? "cs-layer-items-funding" : ""}`.trim()}>
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

function PartialProfilePanel({
  card,
  onRegenerate,
  quality
}: {
  card: ColdStartCard;
  onRegenerate: () => void;
  quality: PublicProfileQuality;
}) {
  const companyName = readableCompanyName(card);
  const status = quality.hasCitations ? "Profile saved with gaps" : "No cited profile yet";
  const body = quality.hasCitations
    ? "A few cited facts landed, but not enough to open the research layer."
    : "No cited source survived. Rebuild the public record.";

  return (
    <main className="cs-research-shell cs-research-shell-partial">
      <section className="cs-partial-profile" aria-label="Incomplete company profile">
        <div className="cs-partial-profile-copy">
          <p className="cs-research-label">{status}</p>
          <h1>{companyName}</h1>
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
      </section>
    </main>
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
  pose: PilePose;
  prefersReducedMotion: boolean | null;
}) {
  const canDrag = dormantCardCanDrag();
  const feedbackProps = !prefersReducedMotion
    ? {
        whileHover: { scale: 1.008, y: -1 },
        whileTap: { scale: 0.992 }
      }
    : {};

  return (
    <motion.div
      animate={dragging
        ? { rotate: pose.rotate - 0.45, scale: 1.018, zIndex: 30 }
        : { rotate: pose.rotate, scale: 1, zIndex: index + 1 }}
      aria-label={`Pin ${layer.title}`}
      className="cs-dormant-card"
      data-dragging={dragging ? "true" : "false"}
      data-index={index}
      drag={canDrag ? "y" : false}
      dragConstraints={{ bottom: 0, top: -220 }}
      dragElastic={0.035}
      dragMomentum={false}
      dragTransition={{ bounceDamping: 32, bounceStiffness: 560 }}
      exit={{ opacity: 0, scale: 0.97, y: -10 }}
      layoutId={`research-layer-${layer.id}`}
      onClick={onClick}
      onDrag={(_event, info) => onDrag(info)}
      onDragEnd={(_event, info) => onDragEnd(info)}
      onDragStart={onDragStart}
      onKeyDown={onKeyDown}
      role="button"
      style={{
        left: 8 + pose.x,
        right: 8 - pose.x,
        top: pose.y
      }}
      tabIndex={0}
      transition={{ type: "spring", stiffness: 620, damping: 42, mass: 0.62 }}
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
  contactElapsedSeconds = 0,
  contactRun,
  elapsedSeconds,
  onRefreshProfile,
  onRegenerate,
  onStartAnalysis,
  profileRefreshElapsedSeconds = 0,
  profileRefreshRun
}: ResearchLayerPanelProps) {
  const companyName = readableCompanyName(card);
  const canStartInvestorLens = canRunInvestorAnalysis(card);
  const quality = publicProfileQuality(card);
  const layers = useMemo(() => layersForCard(card), [card]);
  const [activeLayerIds, setActiveLayerIds] = useState<ResearchLayerId[]>(() => {
    if (canStartInvestorLens && (card.synthesis || analysisRun)) {
      return ["coreIdea"];
    }

    return [];
  });
  const [expandedLayerId, setExpandedLayerId] = useState<ResearchLayerId | null>(() => {
    if (canStartInvestorLens && (card.synthesis || analysisRun)) {
      return "coreIdea";
    }

    return null;
  });
  const [draggingLayerId, setDraggingLayerId] = useState<ResearchLayerId | null>(null);
  const [snapPreviewId, setSnapPreviewId] = useState<ResearchLayerId | null>(null);
  const snapPreviewLayerId = useRef<ResearchLayerId | null>(null);
  const suppressClickFor = useRef<ResearchLayerId | null>(null);
  const prefersReducedMotion = usePrefersReducedMotion();

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

    if (layer.source === "card" && layer.availability === "empty" && !profileRefreshRun) {
      onRefreshProfile(id);
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
    const shouldSnap = snapPreviewLayerId.current === id || dragOffsetShouldSnap(info.offset.y, info.velocity.y);

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

  function pilePose(index: number): PilePose {
    return PILE_POSES[index % PILE_POSES.length] ?? { x: 0, y: 0, rotate: 0 };
  }

  const dormantLayers = RESEARCH_LAYER_CARDS.filter((layer) => !activeLayerIds.includes(layer.id));
  const people = managementPeople(card);
  const managerSources = managementSourceCount(card);
  const facts = profileFacts(card);
  const activeCount = activeLayerIds.length;

  if (!canStartInvestorLens) {
    return <PartialProfilePanel card={card} onRegenerate={onRegenerate} quality={quality} />;
  }

  return (
    <main className="cs-research-shell">
      <section className="cs-company-context" aria-label="Company context">
        <div className="cs-company-context-main">
          <CompanyLogo
            className="cs-company-logo"
            domain={card.domain}
            label={companyName}
            logoUrl={card.identity.logoUrl}
          />
          <div>
            <h1>{companyName}</h1>
            <a className="cs-company-domain" href={`https://${card.domain}`} rel="noreferrer" target="_blank">
              {websiteLabel(card)}
            </a>
            <p>{card.identity.oneLiner.value ?? card.domain}</p>
          </div>
        </div>
        <FactRibbon facts={facts} />
        <PeopleLine
          contactElapsedSeconds={contactElapsedSeconds}
          contactRun={contactRun}
          confidence={managementConfidence(card)}
          people={people}
          sourceCount={managerSources}
        />
      </section>

      <section className="cs-research-layer" aria-label="Research layer">
        <div className="cs-research-layer-head">
          <span>Research</span>
          <span>{activeCount} / {RESEARCH_LAYER_CARDS.length}</span>
        </div>

        <div className="cs-active-enrichments">
          {activeLayerIds.map((id) => {
            const display = layerDisplayForCard(card, id);
            if (!display) {
              return null;
            }

            const layer = layers.find((candidate) => candidate.id === id);
            const running = Boolean(analysisRun && layer?.source === "analysis" && !card.synthesis);
            const refreshing = Boolean(profileRefreshRun?.layerId === id && layer?.source === "card" && display.status === "empty");
            const expanded = expandedLayerId === id || running || refreshing;
            const state = running || refreshing ? "running" : display.status;
            const statusCopy = running
              ? `Synthesizing · ${formatElapsed(elapsedSeconds)}`
              : refreshing
                ? `Refreshing · ${formatElapsed(profileRefreshElapsedSeconds)}`
                : sourceLabel(display.sourceCount);
            const runningCopy = refreshing
              ? id === "competition"
                ? "Searching for adjacent companies and market-map evidence"
                : id === "signals"
                  ? "Searching for recent traction and launch signals"
                  : "Refreshing cited profile evidence"
              : "Extracting structure from cited sources";

            return (
              <article className="cs-active-enrichment" data-expanded={expanded ? "true" : "false"} data-layer-id={id} data-state={state} key={id}>
                <button className="cs-active-enrichment-head" onClick={() => toggleExpanded(id)} type="button">
                  <span className="cs-active-dot" aria-hidden="true" />
                  <span>
                    <strong>{display.title}</strong>
                    <small>{statusCopy}</small>
                  </span>
                  <motion.span
                    animate={{ rotate: expanded ? 180 : 0 }}
                    className="cs-active-chevron"
                    transition={{ duration: prefersReducedMotion ? 0 : 0.12 }}
                    aria-hidden="true"
                  >
                    ⌄
                  </motion.span>
                </button>
                <div
                  aria-hidden={!expanded}
                  className="cs-active-enrichment-body-frame"
                  data-expanded={expanded ? "true" : "false"}
                >
                  <div className="cs-active-enrichment-body">
                    <LayerContent display={display} running={running || refreshing} runningCopy={runningCopy} />
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        {analysisNotice ? (
          <div className="cs-research-notice" role="status">
            <strong>Not enough verified evidence</strong>
            <p>{analysisNotice}</p>
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
          {snapPreviewId ? "Release to pin" : "Pin card"}
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
                />
              );
            })}
          </AnimatePresence>
        </motion.div>
      </section>
    </main>
  );
}
