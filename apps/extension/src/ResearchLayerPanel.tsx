import {
  canRunInvestorAnalysis,
  fundingEvidenceFromCitations,
  hasUsablePublicProfile,
  publicProfileQuality,
  type ColdStartCard,
  type PublicProfileQuality,
  type ResearchSection
} from "@cold-start/core";
import { AnimatePresence, LayoutGroup, motion, useMotionValue, useSpring, useTransform, type PanInfo } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FocusEvent, KeyboardEvent, PointerEvent } from "react";
import { commitSpring, motionTokens, reducedSpring, snapSpring } from "./motion-primitives";
import {
  RESEARCH_LAYER_CARDS,
  layerDisplayForCard,
  layersForCard,
  type ResearchLayerDisplay,
  type ResearchLayerId
} from "./research-layer";
import {
  dampenDragOffset,
  dragOffsetShouldPreview,
  dragOffsetShouldSnap,
  dragOffsetShouldSuppressClick
} from "./research-layer-motion";
import { CompanyLogo } from "./CompanyLogo";
import {
  compactProfileSummary,
  formatElapsed,
  formatOptionalCurrency,
  formatOptionalNumber
} from "./extension-format";
import type { ExtensionResearchRunEvent, ExtensionSourceSummary } from "./extension-config";
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
  onRegenerate: () => void;
  profileElapsedSeconds?: number | undefined;
  profileRun?: AnalysisRun | undefined;
  activeSectionElapsedSeconds?: number | undefined;
  activeSectionRun?: ActiveSectionRun | undefined;
  sections?: ResearchSection[] | undefined;
  events?: ExtensionResearchRunEvent[] | undefined;
  sources?: ExtensionSourceSummary[] | undefined;
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
const PILE_POSES = [
  { x: 0, y: 0, rotate: -0.35 },
  { x: 0, y: 38, rotate: 0.28 },
  { x: 0, y: 76, rotate: -0.22 },
  { x: 0, y: 114, rotate: 0.36 },
  { x: 0, y: 152, rotate: -0.30 },
  { x: 0, y: 190, rotate: 0.20 },
  { x: 0, y: 228, rotate: -0.18 },
  { x: 0, y: 266, rotate: 0.24 }
];
const PINNED_RESEARCH_LAYERS_KEY = "coldStartPinnedResearchLayers";
const researchLayerIds = new Set<ResearchLayerId>(RESEARCH_LAYER_CARDS.map((layer) => layer.id));
const SHARED_TOOLTIP_ID = "cs-company-shared-tooltip";

type PilePose = {
  x: number;
  y: number;
  rotate: number;
};

function defaultActiveLayers(card: ColdStartCard, canShowResearchLayers: boolean, analysisRun: AnalysisRun | undefined): ResearchLayerId[] {
  return canShowResearchLayers && (card.synthesis || analysisRun) ? ["coreIdea"] : [];
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
      onBlur: () => hideTooltip(),
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

function readableRunEvent(event: ExtensionResearchRunEvent) {
  if (event.type === "card.partial") {
    return "Saved a starter profile";
  }
  if (event.type === "card.saved" || event.type === "card.enriched") {
    return "Saved the profile";
  }
  if (event.type === "source.found") {
    const count = event.metadata.acceptedCount ?? event.metadata.sourceCount;
    return typeof count === "number" && Number.isFinite(count) ? `Found ${count} sources` : "Found useful sources";
  }
  if (event.type === "source.enrichment") {
    return "Checked deeper sources";
  }
  if (event.type === "contacts.requested" || event.type === "contacts.started") {
    return "Checking people";
  }
  if (event.type === "contacts.enriched") {
    const count = event.metadata.emailCount;
    return typeof count === "number" && Number.isFinite(count) ? `Found ${count} work emails` : "Found work emails";
  }

  return event.message
    .replace(/\baccepted sources\b/gi, "sources")
    .replace(/\bcompany profile\b/gi, "profile")
    .replace(/\bcompany card\b/gi, "profile")
    .replace(/\bthe card\b/gi, "the profile")
    .replace(/\bcard\b/gi, "profile")
    .replace(/\basync contact enrichment\b/gi, "people lookup");
}

function expandedProfileSummary(value: string | null | undefined, fallback: string) {
  const normalized = (value ?? "").replace(/\s+/g, " ").trim() || fallback.replace(/\s+/g, " ").trim();
  if (normalized.length <= 360) {
    return normalized;
  }

  const sliced = normalized.slice(0, 361);
  const lastSpace = sliced.lastIndexOf(" ");
  const trimmed = (lastSpace > 180 ? sliced.slice(0, lastSpace) : normalized.slice(0, 360)).trim();
  return `${trimmed.replace(/[.,;:!?]+$/, "")}...`;
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
      <p className="cs-company-summary">{summary}</p>
      {hasMore ? (
        <button
          aria-label="Read the full company description"
          className="cs-company-summary-more"
          type="button"
          {...tooltipProps({
            body: fullSummary,
            id: "profile-summary",
            placement: "above",
            title: "Description"
          })}
        >
          <span>More</span>
        </button>
      ) : null}
    </div>
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

function peopleEmailSummary(people: CardPerson[], companyDomain: string) {
  const emails = people.flatMap((person) => person.email ? [person.email] : []);
  if (emails.length === 0) {
    return "No email found";
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

function factTooltipBody(fact: ReturnType<typeof profileFacts>[number]) {
  return [fact.value, fact.meta].filter(Boolean).join(" · ");
}

function FactRibbon({
  facts,
  tooltipProps
}: {
  facts: ReturnType<typeof profileFacts>;
  tooltipProps: (input: { body: string; id: string; placement?: TooltipPlacement; title: string }) => TooltipTriggerProps;
}) {
  if (facts.length === 0) {
    return null;
  }

  return (
    <dl className="cs-company-facts" aria-label="Core metrics">
      {facts.map((fact) => (
        <div
          key={fact.label}
          tabIndex={0}
          {...tooltipProps({
            body: factTooltipBody(fact),
            id: `fact-${fact.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
            placement: "below",
            title: fact.label
          })}
        >
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
  sourceCount
}: {
  companyDomain: string;
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
                  <span className="cs-person-email-kind">{emailKind(person.email, companyDomain)}</span>
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
                  <span>{item.title.replace(/^Question\s+/i, "")}</span>
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
        <li key={`${item.title}-${item.meta ?? item.body ?? ""}`}>
          <time>{item.body ?? "Undated"}</time>
          <div>
            <strong>{item.title}</strong>
            {item.meta ? <span>{item.meta}</span> : null}
          </div>
        </li>
      ))}
    </ol>
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
  pose,
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
  pose: PilePose;
  previewing: boolean;
  snapReady: boolean;
  prefersReducedMotion: boolean | null;
}) {
  const motionTransition = prefersReducedMotion ? { duration: 0 } : snapSpring;
  const feedbackProps = !prefersReducedMotion
    ? {
        whileTap: { scale: dragging ? 1.004 : 0.996 }
      }
    : {};

  return (
    <motion.div
      animate={dragging
        ? {
            x: pose.x,
            y: pose.y - (snapReady ? 10 : previewing ? 6 : 3),
            rotate: pose.rotate - (snapReady ? 0.45 : 0.24),
            scale: snapReady ? 1.018 : 1.01,
            zIndex: 30
          }
        : { x: pose.x, y: pose.y, rotate: pose.rotate, scale: 1, zIndex: index + 1 }}
      aria-label={`Pin ${layer.title}`}
      className="cs-dormant-card"
      data-dragging={dragging ? "true" : "false"}
      data-index={index}
      data-previewing={previewing ? "true" : "false"}
      data-snap-ready={snapReady ? "true" : "false"}
      drag="y"
      dragConstraints={{ bottom: 0, top: -220 }}
      dragElastic={0.035}
      dragMomentum={false}
      dragTransition={{ bounceDamping: 38, bounceStiffness: 720, power: 0.12, timeConstant: 140 }}
      exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.975, y: pose.y - 28 }}
      layoutId={`research-layer-${layer.id}`}
      onClick={onClick}
      onDrag={(_event, info) => onDrag(info)}
      onDragEnd={(_event, info) => onDragEnd(info)}
      onDragStart={onDragStart}
      onKeyDown={onKeyDown}
      role="button"
      style={{
        left: 8,
        right: 8,
        top: 0
      }}
      tabIndex={0}
      transition={motionTransition}
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

function analysisLayerIsRunning(card: ColdStartCard, id: ResearchLayerId, analysisRun: AnalysisRun | undefined) {
  if (!analysisRun) {
    return false;
  }

  if (!card.synthesis) {
    return id === "coreIdea";
  }

  return id === "marketStructureTiming" && !card.synthesis.marketStructureAndTiming;
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

function ResearchProgressPanel({
  events = [],
  isRunning,
  resolvedCount,
  sources = [],
  totalCount
}: {
  events?: ExtensionResearchRunEvent[] | undefined;
  isRunning: boolean;
  resolvedCount: number;
  sources?: ExtensionSourceSummary[] | undefined;
  totalCount: number;
}) {
  const meaningfulEvents = events
    .map((event) => ({ id: event.id, message: readableRunEvent(event) }))
    .filter((event, index, all) => all.findIndex((candidate) => candidate.message === event.message) === index);
  const latestEvent = meaningfulEvents[0] ?? null;
  const secondaryEvent = meaningfulEvents.find((event) => event.id !== latestEvent?.id) ?? null;
  const stateCopy = isRunning ? "Researching" : "Research saved";
  const sourceCopy = sources.length > 0 ? `${plural(sources.length, "source")} found` : "Looking for useful sources";
  const sectionCopy = `${resolvedCount} of ${totalCount} sections ready`;

  return (
    <div className="cs-research-progress" aria-label="Research progress">
      <div className="cs-research-progress-main">
        <span className="cs-research-progress-dot" data-running={isRunning ? "true" : "false"} aria-hidden="true" />
        <div>
          <strong>{stateCopy}</strong>
          <small>
            {sourceCopy}
            {` · ${sectionCopy}`}
          </small>
        </div>
      </div>
      {latestEvent ? (
        <div className="cs-research-progress-event" role="status">
          {latestEvent.message}
        </div>
      ) : null}
      {secondaryEvent ? <p className="cs-research-progress-note">Also: {secondaryEvent.message}</p> : null}
      {sources.length > 0 ? (
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
  onRegenerate,
  profileElapsedSeconds = 0,
  profileRun,
  activeSectionElapsedSeconds = 0,
  activeSectionRun,
  sections,
  events,
  sources
}: ResearchLayerPanelProps) {
  const companyName = readableCompanyName(card);
  const canStartInvestorLens = canRunInvestorAnalysis(card);
  const canShowResearchLayers = hasUsablePublicProfile(card);
  const quality = publicProfileQuality(card);
  const layers = useMemo(() => layersForCard(card, sections), [card, sections]);
  const [activeLayerIds, setActiveLayerIds] = useState<ResearchLayerId[]>(() => defaultActiveLayers(card, canShowResearchLayers, analysisRun));
  const [expandedLayerId, setExpandedLayerId] = useState<ResearchLayerId | null>(() => {
    if (canStartInvestorLens && (card.synthesis || analysisRun)) {
      return "coreIdea";
    }

    return null;
  });
  const [draggingLayerId, setDraggingLayerId] = useState<ResearchLayerId | null>(null);
  const [snapPreviewId, setSnapPreviewId] = useState<ResearchLayerId | null>(null);
  const [snapReadyId, setSnapReadyId] = useState<ResearchLayerId | null>(null);
  const snapPreviewLayerId = useRef<ResearchLayerId | null>(null);
  const snapReadyLayerId = useRef<ResearchLayerId | null>(null);
  const suppressClickFor = useRef<ResearchLayerId | null>(null);
  const prefersReducedMotion = usePrefersReducedMotion();
  const { tooltip, triggerProps } = useSharedTooltip(prefersReducedMotion);
  const trayPullRaw = useMotionValue(0);
  const trayPull = useSpring(trayPullRaw, prefersReducedMotion ? reducedSpring : snapSpring);
  const trayScaleX = useTransform(trayPull, [0, 70, 150], [1, 0.975, 0.946]);
  const trayScaleY = useTransform(trayPull, [0, 70, 150], [1, 0.988, 0.972]);
  const trayLift = useTransform(trayPull, [0, 70, 150], [0, -2, -7]);
  const dropZoneOpacity = useTransform(trayPull, [0, 24, 74], [0.22, 0.58, 1]);
  const dropZoneScale = useTransform(trayPull, [0, 70, 150], [0.982, 1, 1.018]);
  const dropZoneY = useTransform(trayPull, [0, 70, 150], [5, 0, -2]);

  useEffect(() => {
    let cancelled = false;
    readPinnedLayerIds(card.domain, defaultActiveLayers(card, canShowResearchLayers, analysisRun), (ids) => {
      if (cancelled) {
        return;
      }
      setActiveLayerIds(ids);
      setExpandedLayerId((current) => current && ids.includes(current) ? current : ids[0] ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [analysisRun, canShowResearchLayers, card]);

  function activateLayer(id: ResearchLayerId) {
    const layer = layers.find((candidate) => candidate.id === id);
    if (!layer) {
      return;
    }

    setActiveLayerIds((current) => {
      if (current.includes(id)) {
        return current;
      }
      const next = [...current, id];
      writePinnedLayerIds(card.domain, next);
      return next;
    });
    setExpandedLayerId(id);

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
    if (suppressClickFor.current) {
      suppressClickFor.current = null;
      return;
    }

    activateLayer(id);
  }

  function handleDormantDragStart(id: ResearchLayerId) {
    setDraggingLayerId(id);
    trayPullRaw.set(0);
  }

  function handleDormantDrag(id: ResearchLayerId, info: PanInfo) {
    const nextPreviewId = dragOffsetShouldPreview(info.offset.y) ? id : null;
    const nextReadyId = dragOffsetShouldSnap(info.offset.y, info.velocity.y) ? id : null;
    const pull = Math.max(0, -dampenDragOffset(info.offset.y));

    trayPullRaw.set(prefersReducedMotion ? 0 : pull);
    snapPreviewLayerId.current = nextPreviewId;
    snapReadyLayerId.current = nextReadyId;
    setSnapPreviewId(nextPreviewId);
    setSnapReadyId(nextReadyId);
  }

  function handleDormantDragEnd(id: ResearchLayerId, info: PanInfo) {
    const shouldSnap = snapReadyLayerId.current === id || dragOffsetShouldSnap(info.offset.y, info.velocity.y);

    setDraggingLayerId(null);
    setSnapPreviewId(null);
    setSnapReadyId(null);
    snapPreviewLayerId.current = null;
    snapReadyLayerId.current = null;
    trayPullRaw.set(0);

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
  const activeRunVisible = Boolean(profileRun || analysisRun || activeSectionRun);
  const showResearchProgress = activeRunVisible || (sources?.length ?? 0) > 0 || (events?.length ?? 0) > 0;
  const resolvedSectionCount = sections?.filter((section) => section.status !== "not_started" && section.status !== "running").length ?? 0;
  const dropZoneCopy = snapReadyId ? "Release to add" : snapPreviewId ? "Lift to add" : "Add module";
  const rawSummary = card.identity.description?.value?.shortDescription ?? card.identity.oneLiner.value;
  const summary = compactProfileSummary(rawSummary, card.domain);
  const fullSummary = expandedProfileSummary(rawSummary, card.domain);

  if (!canShowResearchLayers) {
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
            <ProfileSummary fullSummary={fullSummary} summary={summary} tooltipProps={triggerProps} />
          </div>
        </div>
        <FactRibbon facts={facts} tooltipProps={triggerProps} />
        <PeopleLine
          companyDomain={card.domain}
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
        {showResearchProgress ? (
          <ResearchProgressPanel
            events={events}
            isRunning={activeRunVisible}
            resolvedCount={resolvedSectionCount}
            sources={sources}
            totalCount={RESEARCH_LAYER_CARDS.length}
          />
        ) : null}

        <div className="cs-active-enrichments">
          <AnimatePresence initial={false}>
          {activeLayerIds.map((id) => {
            const display = layerDisplayForCard(card, id, sections);
            if (!display) {
              return null;
            }

            const layer = layers.find((candidate) => candidate.id === id);
            const refreshing = Boolean(activeSectionRun?.layerId === id);
            const waitingForProfile = Boolean(profileRun && display.status !== "populated");
            const running = Boolean(
              waitingForProfile ||
              display.status === "running" ||
              (layer?.source === "analysis" && analysisLayerIsRunning(card, id, analysisRun))
            );
            const expanded = expandedLayerId === id;
            const state = running || refreshing ? "running" : display.status;
            const actionLabel = waitingForProfile
              ? undefined
              : display.status === "stale"
              ? "Refresh"
              : display.status === "failed"
                ? "Retry"
                : display.status === "needs-analysis"
                  ? "Generate"
                  : display.status === "empty"
                    ? "Refresh"
                    : undefined;
            const handleLayerAction = actionLabel
              ? () => {
                  onRunSection(id);
                }
              : undefined;
            const statusCopy = waitingForProfile
              ? `Finishing profile · ${formatElapsed(profileElapsedSeconds)}`
              : running
              ? `Synthesizing · ${formatElapsed(elapsedSeconds)}`
              : refreshing
                ? layer?.source === "analysis"
                  ? `Synthesizing · ${formatElapsed(activeSectionElapsedSeconds)}`
                  : `Refreshing · ${formatElapsed(activeSectionElapsedSeconds)}`
                : sourceLabel(display.sourceCount);
            const runningCopy = waitingForProfile
              ? "Getting the profile ready"
              : refreshing
              ? layer?.source === "analysis"
                ? "Reading the evidence"
                : id === "competition"
                ? "Looking for adjacent companies"
                : id === "signals"
                  ? "Checking recent traction"
                  : "Refreshing the evidence"
              : "Reading cited sources";
            const bodyId = `research-layer-${id}-body`;

            return (
              <motion.article
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="cs-active-enrichment"
                data-expanded={expanded ? "true" : "false"}
                data-layer-id={id}
                data-state={state}
                exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.985, y: -8 }}
                initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0.72, scale: 0.985, y: 10 }}
                key={id}
                layout
                layoutId={`research-layer-${id}`}
                transition={prefersReducedMotion ? { duration: 0 } : commitSpring}
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
                    transition={{ duration: prefersReducedMotion ? 0 : motionTokens.feedbackMs, ease: motionTokens.easeOut }}
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
                      display={display}
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

        {analysisNotice ? (
          <div className="cs-research-notice" role="status">
            <strong>Not enough verified evidence</strong>
            <p>{analysisNotice}</p>
          </div>
        ) : null}

      </section>

      <motion.section
        className="cs-card-tray"
        aria-label="Dormant enrichment cards"
        data-drop-visible={draggingLayerId ? "true" : "false"}
        data-snap-preview={snapPreviewId ? "true" : "false"}
        data-snap-ready={snapReadyId ? "true" : "false"}
      >
        <motion.div
          className="cs-drop-zone"
          aria-hidden={!draggingLayerId}
          data-label={dropZoneCopy}
          {...(!draggingLayerId || prefersReducedMotion ? {} : { style: { opacity: dropZoneOpacity, scale: dropZoneScale, y: dropZoneY } })}
        >
          {dropZoneCopy}
        </motion.div>
        <motion.div
          className="cs-card-pile-motion"
          {...(prefersReducedMotion ? {} : { style: { scaleX: trayScaleX, scaleY: trayScaleY, y: trayLift } })}
        >
          <motion.div className="cs-card-pile" layout>
            <AnimatePresence>
              {dormantLayers.map((layer, index) => {
                const pose = pilePose(index);
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
                    onDrag={(info) => handleDormantDrag(layer.id, info)}
                    onDragEnd={(info) => handleDormantDragEnd(layer.id, info)}
                    onDragStart={() => handleDormantDragStart(layer.id)}
                    onKeyDown={(event) => handleDormantKeyDown(event, layer.id)}
                    pose={pose}
                    previewing={previewing}
                    snapReady={snapReady}
                    prefersReducedMotion={prefersReducedMotion}
                  />
                );
              })}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      </motion.section>
      <SharedTooltip tooltip={tooltip} />
    </main>
    </LayoutGroup>
  );
}
