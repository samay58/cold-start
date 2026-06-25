import {
  analysisBlockedReason,
  canRunInvestorAnalysis,
  fundingEvidenceFromCitations,
  hasUsablePublicProfile,
  publicProfileQuality,
  type ColdStartCard,
  type PublicProfileQuality,
  type ResearchSection
} from "@cold-start/core";
import { AnimatePresence, LayoutGroup, animate, motion, useMotionValue, type PanInfo } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FocusEvent, KeyboardEvent, PointerEvent } from "react";
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
import { CompanyLogo } from "./CompanyLogo";
import {
  formatElapsed,
  formatOptionalCurrency,
  formatOptionalNumber,
  profileSummaryCopy
} from "./extension-format";
import { firstPayoffForEvents, firstPayoffIsFiled } from "./first-payoff-events";
import type { ExtensionResearchRunEvent, ExtensionSourceSummary } from "./extension-config";
import { FirstPayoffSurface } from "./FirstPayoffSurface";
import { investorReadForCard, type InvestorReadDisplay } from "./investor-lens";
import {
  acceptedSourceCountFromEvents,
  buildResearchProgressPlan,
  currentProfileProgressEvents,
  generationStageIndexFromEvents,
  hasTerminalProfileProgressEvent,
  RESEARCH_PROGRESS_STAGES
} from "./research-progress";
import { markPerformance } from "./sidepanel-network";
import { SourcePassInstrument } from "./SourcePassInstrument";
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
  contactElapsedSeconds?: number | undefined;
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
  cachedAtMs?: number | undefined;
};

type TooltipPlacement = "above" | "below";

type SharedTooltipState = {
  animate: boolean;
  body: string;
  id: string;
  left: number;
  placement: TooltipPlacement;
  title: string;
  top: number;
  width: number;
};

type TooltipTriggerProps = {
  "aria-describedby": string;
  onBlur: (event: FocusEvent<HTMLElement>) => void;
  onFocus: (event: FocusEvent<HTMLElement>) => void;
  onPointerEnter: (event: PointerEvent<HTMLElement>) => void;
  onPointerLeave: (event: PointerEvent<HTMLElement>) => void;
};

const VISIBLE_SOURCE_COUNT = 3;
const PINNED_RESEARCH_LAYERS_KEY = "coldStartPinnedResearchLayers";
const researchLayerIds = new Set<ResearchLayerId>(RESEARCH_LAYER_CARDS.map((layer) => layer.id));
const SHARED_TOOLTIP_ID = "cs-company-shared-tooltip";
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

function sourceLabel(count: number) {
  return `${count} ${count === 1 ? "source" : "sources"}`;
}

function metadataSourceCount(event: ExtensionResearchRunEvent) {
  const value = event.metadata.sourceCount;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function filedSourceCount(events: ExtensionResearchRunEvent[], sources: ExtensionSourceSummary[]) {
  const profileEvents = currentProfileProgressEvents(events);

  for (const event of [...profileEvents].reverse()) {
    if (event.type !== "card.saved" && event.type !== "card.enriched") {
      continue;
    }
    const count = metadataSourceCount(event);
    if (count !== null) {
      return count;
    }
  }

  return sources.length;
}

function shouldQueueLayerRun(status: ResearchLayerDisplay["status"]) {
  return status === "ready" || status === "stale" || status === "failed" || status === "empty";
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function useSharedTooltip(prefersReducedMotion: boolean) {
  const [tooltip, setTooltip] = useState<SharedTooltipState | null>(null);
  const previousTooltipId = useRef<string | null>(null);

  function showTooltip(input: {
    body: string;
    id: string;
    placement?: TooltipPlacement;
    target: HTMLElement;
    title: string;
  }) {
    const rect = input.target.getBoundingClientRect();
    const width = Math.min(340, Math.max(240, window.innerWidth - 32));
    const left = clamp(rect.left + rect.width / 2 - width / 2, 16, Math.max(16, window.innerWidth - width - 16));
    const placement = input.placement ?? "above";
    const top = placement === "above" ? rect.top - 10 : rect.bottom + 10;
    const previousId = previousTooltipId.current;
    previousTooltipId.current = input.id;
    setTooltip({
      animate: Boolean(previousId && previousId !== input.id && !prefersReducedMotion),
      body: input.body,
      id: input.id,
      left,
      placement,
      title: input.title,
      top,
      width
    });
  }

  function hideTooltip() {
    setTooltip(null);
  }

  function triggerProps(input: {
    body: string;
    id: string;
    placement?: TooltipPlacement;
    title: string;
  }): TooltipTriggerProps {
    return {
      "aria-describedby": SHARED_TOOLTIP_ID,
      onBlur: (event) => {
        const nextTarget = event.relatedTarget;
        if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
          return;
        }
        hideTooltip();
      },
      onFocus: (event) => showTooltip({ ...input, target: event.currentTarget }),
      onPointerEnter: (event) => showTooltip({ ...input, target: event.currentTarget }),
      onPointerLeave: () => hideTooltip()
    };
  }

  return { tooltip, triggerProps };
}

function SharedTooltip({ tooltip }: { tooltip: SharedTooltipState | null }) {
  if (!tooltip) {
    return null;
  }

  return (
    <div
      className="cs-shared-tooltip"
      data-animate={tooltip.animate ? "true" : "false"}
      data-placement={tooltip.placement}
      id={SHARED_TOOLTIP_ID}
      role="tooltip"
      style={{
        left: tooltip.left,
        top: tooltip.top,
        width: tooltip.width
      }}
    >
      <strong>{tooltip.title}</strong>
      <span>{tooltip.body}</span>
    </div>
  );
}

function ProfileSummary({
  fullSummary,
  summary,
  tooltipProps
}: {
  fullSummary: string;
  summary: string;
  tooltipProps: (input: { body: string; id: string; placement?: TooltipPlacement; title: string }) => TooltipTriggerProps;
}) {
  const hasMore = fullSummary !== summary;
  return (
    <div className="cs-company-summary-wrap">
      {hasMore ? (
        <p className="cs-company-summary">
          {summary}{" "}
          <button
            aria-label="Read the full company description"
            className="cs-company-summary-more"
            type="button"
            {...tooltipProps({
              body: fullSummary,
              id: "profile-summary",
              placement: "below",
              title: "Description"
            })}
          >
            (more)
          </button>
        </p>
      ) : (
        <p className="cs-company-summary">{summary}</p>
      )}
    </div>
  );
}

function SourcesCheckedStamp({
  prefersReducedMotion,
  sourceCount
}: {
  prefersReducedMotion: boolean;
  sourceCount: number;
}) {
  const meta = sourceCount > 0 ? sourceLabel(sourceCount) : "Filed with sources";

  return (
    <motion.div
      aria-label="Sources checked"
      animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
      className="cs-early-read-filed"
      initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.94, y: 8 }}
      layout
      layoutId="sources-checked"
      transition={prefersReducedMotion ? { duration: 0.12, ease: "easeOut" } : { duration: 0.52, ease: [0.21, 1, 0.35, 1] }}
    >
      <span className="cs-early-read-filed-stamp">Sources checked</span>
      <span className="cs-early-read-filed-meta">{meta}</span>
    </motion.div>
  );
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

function emailKind(email: string, companyDomain: string) {
  const domain = email.split("@")[1]?.toLowerCase().replace(/^www\./, "") ?? "";
  const targetDomain = companyDomain.toLowerCase().replace(/^www\./, "");
  if (domain === targetDomain) {
    return "work";
  }
  if (["gmail.com", "icloud.com", "me.com", "outlook.com", "hotmail.com", "yahoo.com", "proton.me", "protonmail.com"].includes(domain)) {
    return "personal";
  }
  return "other domain";
}

function sentenceCase(value: string) {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function sourceHostLabel(sourceUrl: string | null | undefined) {
  if (!sourceUrl) {
    return null;
  }

  try {
    return new URL(sourceUrl).hostname.replace(/^www\./i, "");
  } catch {
    return null;
  }
}

function personTooltipBody(person: CardPerson, companyDomain: string) {
  const emailStatus = person.email
    ? `${sentenceCase(emailKind(person.email, companyDomain))} email found.`
    : "No verified email found yet.";
  const source = sourceHostLabel(person.sourceUrl);

  return [
    `${personRole(person)}.`,
    emailStatus,
    source ? `Source: ${source}.` : null
  ].filter(Boolean).join(" ");
}

function peopleEmailSummary(people: CardPerson[], companyDomain: string) {
  const emails = people.flatMap((person) => person.email ? [person.email] : []);
  if (emails.length === 0) {
    return "No verified email found";
  }

  const workCount = emails.filter((email) => emailKind(email, companyDomain) === "work").length;
  if (workCount === emails.length) {
    return `${workCount} work email${workCount === 1 ? "" : "s"}`;
  }
  return `${emails.length} email${emails.length === 1 ? "" : "s"} found`;
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
  const lastRoundFact = card.funding.lastRound;
  const lastRound = lastRoundFact.value;
  const lastRoundAmount = formatOptionalCurrency(lastRound?.amountUsd);
  const totalRaised = formatOptionalCurrency(card.funding.totalRaisedUsd.value);
  const citationFunding = fundingEvidenceFromCitations(card).find((item) => item.amountLabel);
  const facts: Array<{ label: string; value: string; meta?: string | undefined }> = [];

  const employees = formatOptionalNumber(headcount?.value);
  if (employees) {
    facts.push({
      label: "Employees",
      value: employees,
      ...(headcount?.asOf ? { meta: headcount.asOf } : {})
    });
  }

  if (lastRound?.name === "Reported financing" && lastRoundAmount && lastRoundFact.status === "inferred") {
    facts.push({
      label: "Funding",
      value: lastRoundAmount,
      meta: "reported"
    });
  } else if (lastRound?.name) {
    facts.push({
      label: "Round",
      value: lastRound.name,
      ...(lastRoundAmount ? { meta: lastRoundAmount } : {})
    });
  } else if (totalRaised) {
    facts.push({ label: "Raised", value: totalRaised });
  } else if (citationFunding?.amountLabel) {
    facts.push({
      label: "Funding",
      value: citationFunding.amountLabel,
      meta: citationFunding.status === "closed" ? "reported" : "reported target"
    });
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
  companyDomain,
  contactElapsedSeconds = 0,
  contactRun,
  confidence,
  people,
  sourceCount,
  tooltipProps
}: {
  companyDomain: string;
  contactElapsedSeconds?: number;
  contactRun?: AnalysisRun | undefined;
  confidence?: ColdStartCard["team"]["founders"]["confidence"] | null;
  people: CardPerson[];
  sourceCount: number;
  tooltipProps: (input: { body: string; id: string; placement?: TooltipPlacement; title: string }) => TooltipTriggerProps;
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
    : peopleEmailSummary(people, companyDomain);
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
        {visiblePeople.map((person) => {
          const name = person.name.trim();
          const tooltip = name
            ? tooltipProps({
              body: personTooltipBody(person, companyDomain),
              id: `person-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
              placement: "above",
              title: name
            })
            : undefined;

          return (
            <article
              className="cs-people-person"
              data-has-email={person.email ? "true" : "false"}
              key={`${person.name}-${person.email ?? person.role ?? "person"}`}
              tabIndex={tooltip ? 0 : undefined}
              {...tooltip}
            >
              <span className="cs-person-avatar" aria-hidden="true">{personInitials(person.name)}</span>
              <span className="cs-person-main">
                <span className="cs-people-name">{person.name}</span>
                <span className="cs-people-role">{personRole(person)}</span>
                {person.email ? (
                  <span className="cs-person-email">
                    <a href={`mailto:${person.email}`}>{person.email}</a>
                    <span className="cs-person-email-kind">{emailKind(person.email, companyDomain)}</span>
                    <button aria-label={`Copy ${person.email}`} onClick={() => copyEmail(person.email!)} type="button">Copy</button>
                  </span>
                ) : null}
              </span>
              <span className="cs-person-contact-state" aria-hidden="true">
                {person.email ? "@" : ""}
              </span>
            </article>
          );
        })}
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
    ? "Some cited facts were saved, but not enough to open Research."
    : "No cited sources were saved. Rebuild the profile from public sources.";
  const lensReason = analysisBlockedReason(card) ?? "The cited profile must finish before Investor Lens can run.";

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

function formatSavedDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "earlier";
  }

  return new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short", timeZone: "UTC" }).format(parsed);
}

function plural(value: number, singular: string, pluralWord = `${singular}s`) {
  return `${value} ${value === 1 ? singular : pluralWord}`;
}

function sourceKindLabel(sourceType: ExtensionSourceSummary["sourceType"]) {
  switch (sourceType) {
    case "company_site":
      return "primary";
    case "enrichment":
      return "enrichment";
    case "filing":
      return "filing";
    case "github":
      return "GitHub";
    case "news":
      return "news";
    case "rdap":
      return "domain";
    case "other":
      return "other";
  }
}

function progressPlanHasAttention(plan: ReturnType<typeof buildResearchProgressPlan>) {
  return plan.some((stage) =>
    stage.status === "attention" ||
    stage.status === "failed" ||
    stage.substeps.some((substep) => substep.status === "attention" || substep.status === "failed")
  );
}

function currentProgressProof(plan: ReturnType<typeof buildResearchProgressPlan>, activeIndex: number, fallback: string) {
  const stage = plan[activeIndex];
  const latestSubstep = [...(stage?.substeps ?? [])].reverse().find((substep) => substep.status !== "running");
  return latestSubstep?.message ?? stage?.proofLine ?? fallback;
}

function ResearchProgressPanel({
  events = [],
  isFinalizingProfile,
  isRunning,
  isProfileRunning,
  resolvedCount,
  sources = [],
  totalCount
}: {
  events?: ExtensionResearchRunEvent[] | undefined;
  isFinalizingProfile: boolean;
  isRunning: boolean;
  isProfileRunning: boolean;
  resolvedCount: number;
  sources?: ExtensionSourceSummary[] | undefined;
  totalCount: number;
}) {
  const eventSourceCount = acceptedSourceCountFromEvents(events);
  const sourceCount = Math.max(sources.length, eventSourceCount ?? 0);
  const activeIndex = generationStageIndexFromEvents(events) ?? (sourceCount > 0 ? 1 : 0);
  const stageNote =
    activeIndex === 1 && sourceCount > 0
      ? `${plural(sourceCount, "source")} found`
      : activeIndex === 2
        ? "Building first cited profile"
        : activeIndex === 3
          ? "Saving with sources attached"
          : "Checking company, product, funding, and proof sources";
  const [detailsOpen, setDetailsOpen] = useState(false);
  const plan = buildResearchProgressPlan({
    activeIndex,
    complete: !isProfileRunning,
    events,
    sources,
    stageNote,
    stages: RESEARCH_PROGRESS_STAGES
  });
  const currentProfileEvents = currentProfileProgressEvents(events);
  const profileEventsSeen = currentProfileEvents.length > 0;
  const profileComplete =
    !isProfileRunning &&
    (hasTerminalProfileProgressEvent(events) || (!isRunning && sourceCount > 0 && totalCount > 0 && resolvedCount >= totalCount));
  const needsAttention = progressPlanHasAttention(plan);
  const showLiveProgress = needsAttention || (!profileComplete && (isProfileRunning || profileEventsSeen));
  const showDetailsControl = profileEventsSeen && !needsAttention;
  const showDetailsTree = needsAttention || detailsOpen;
  const currentStage = plan[activeIndex];
  const stateCopy = isFinalizingProfile
    ? "Starter profile ready"
    : profileComplete ? "Research filed" : isRunning ? "Researching" : "Research saved";
  const sourceCopy = sourceCount > 0
    ? isFinalizingProfile
      ? `Filling in contacts and details · ${plural(sourceCount, "source")}`
      : profileComplete
      ? plural(sourceCount, "source")
      : `${plural(sourceCount, "source")} found`
    : isFinalizingProfile
      ? "Filling in contacts and details"
    : "Checking company, product, funding, and proof sources";
  const sectionCopy = profileComplete
    ? `${resolvedCount} of ${totalCount} sections`
    : `${resolvedCount} of ${totalCount} sections ready`;
  const liveStageCopy = needsAttention ? "Needs attention" : currentStage?.label ?? "Researching";
  const liveProofCopy = currentProgressProof(plan, activeIndex, stageNote);

  return (
    <div
      className="cs-research-progress"
      aria-label="Research progress"
      data-attention={needsAttention ? "true" : "false"}
      data-mode={profileComplete ? "filed" : "live"}
    >
      <div className="cs-research-progress-main">
        <span className="cs-research-progress-dot" data-running={!profileComplete && isRunning ? "true" : "false"} aria-hidden="true" />
        <div>
          <strong>{stateCopy}</strong>
          <small>
            {sourceCopy}
            {` · ${sectionCopy}`}
          </small>
        </div>
      </div>
      {showLiveProgress ? (
        <div className="cs-research-progress-live" aria-live="polite">
          <span>{liveStageCopy}</span>
          <small>{liveProofCopy}</small>
        </div>
      ) : null}
      {showDetailsControl ? (
        <button
          aria-expanded={detailsOpen}
          className="cs-research-progress-details-toggle"
          onClick={() => setDetailsOpen((current) => !current)}
          type="button"
        >
          {detailsOpen ? "Hide details" : "Details"}
        </button>
      ) : null}
      {showDetailsTree ? (
        <SourcePassInstrument
          activeIndex={activeIndex}
          complete={profileComplete || !isProfileRunning}
          events={events}
          sources={sources}
          stageNote={stageNote}
          stages={RESEARCH_PROGRESS_STAGES}
          variant="compact"
        />
      ) : null}
      {sources.length > 0 && (!profileComplete || detailsOpen || needsAttention) ? (
        <div className="cs-research-source-strip" aria-label="Recent sources">
          {sources.slice(0, VISIBLE_SOURCE_COUNT).map((source) => (
            <a href={source.url} key={source.id} rel="noreferrer" target="_blank" title={source.snippet}>
              <span>{source.domain}</span>
              <small>{sourceKindLabel(source.sourceType)}</small>
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function ResearchLayerPanel({
  analysisNotice,
  analysisRun,
  card,
  contactElapsedSeconds = 0,
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
  sources = [],
  cachedAtMs
}: ResearchLayerPanelProps) {
  const companyName = readableCompanyName(card);
  const isStaleRead = card.cacheStatus === "stale" || cachedAtMs !== undefined;
  const freshnessLabel = isStaleRead
    ? `Saved ${formatSavedDate(card.generatedAt)}${profileRun || analysisRun || activeSectionRun ? " · refreshing" : ""}`
    : null;
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
  const firstPayoffMarkedVisible = useRef(false);
  const prefersReducedMotion = usePrefersReducedMotion();
  const { tooltip, triggerProps } = useSharedTooltip(prefersReducedMotion);

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
  const people = managementPeople(card);
  const managerSources = managementSourceCount(card);
  const facts = profileFacts(card);
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
  const { fullSummary, summary } = profileSummaryCopy(card);
  const firstPayoff = firstPayoffForEvents(events);
  const firstPayoffFiled = firstPayoffIsFiled(events) || (!firstPayoff && card.cacheStatus === "hit");
  const showFirstPayoff = Boolean(firstPayoff?.status === "substantive_first_read" && !firstPayoffFiled);
  const showSourcesChecked = firstPayoffFiled;
  const firstPayoffSourceCount = filedSourceCount(events, sources);
  const investorRead = investorReadForCard(card);

  useEffect(() => {
    if (!showFirstPayoff || firstPayoffMarkedVisible.current) {
      return;
    }
    firstPayoffMarkedVisible.current = true;
    markPerformance("cold-start-first-read-visible");
  }, [showFirstPayoff]);

  if (!canShowResearchLayers && !showFirstPayoff && !showSourcesChecked) {
    return <PartialProfilePanel card={card} onRegenerate={onRegenerate} quality={quality} />;
  }

  return (
    <LayoutGroup id="cold-start-research-layer">
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
            {freshnessLabel ? <span className="cs-freshness-mark">{freshnessLabel}</span> : null}
            <ProfileSummary fullSummary={fullSummary} summary={summary} tooltipProps={triggerProps} />
            {showSourcesChecked ? (
              <SourcesCheckedStamp
                prefersReducedMotion={prefersReducedMotion}
                sourceCount={firstPayoffSourceCount}
              />
            ) : null}
          </div>
        </div>
        <FactRibbon facts={facts} />
        <PeopleLine
          companyDomain={card.domain}
          contactElapsedSeconds={contactElapsedSeconds}
          contactRun={contactRun}
          confidence={managementConfidence(card)}
          people={people}
          sourceCount={managerSources}
          tooltipProps={triggerProps}
        />
      </section>

      <AnimatePresence initial={false}>
        {showFirstPayoff && firstPayoff ? (
          <FirstPayoffSurface firstPayoff={firstPayoff} />
        ) : null}
      </AnimatePresence>

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
          <ResearchProgressPanel
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
      <SharedTooltip tooltip={tooltip} />
    </main>
    </LayoutGroup>
  );
}
