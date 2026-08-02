"use client";

import React, { useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { ResearchSection } from "@cold-start/core";
import { formatMediumDate, safeExternalHref } from "@cold-start/ui";
import {
  buildCitationIndex,
  callNumber,
  citationMarks,
  filedDateStamp,
  hasPeopleContent,
  headcountConflict,
  isThinFile,
  nextQuestionForCard,
  signalEvidenceState,
  statSlots,
  vettedCounts,
  type CitationIndex,
  type EvidenceState,
  type PublicCardData
} from "../../lib/card-face/model";
import { CiteMarks } from "./choreography";
import { ConflictPanel } from "./ConflictPanel";
import { SourceRow } from "./SourceRow";
import { Stamp } from "./Stamp";

export type PocketTab = "card" | "people" | "signals" | "sources";

export type PocketCardProps = {
  card: PublicCardData;
  sections: ResearchSection[];
  // No index prop: CitationIndex.displayNumber is a function, and this is a client component.
  // Next.js RSC can't serialize a function from CardFace's server-rendered index prop across the
  // client boundary (confirmed at runtime: "Functions cannot be passed directly to Client
  // Components" during `qa:web:gallery`, invisible to renderToStaticMarkup-based unit tests,
  // which don't enforce the RSC boundary). `card` itself is plain JSON-shaped data, so PocketCard
  // rebuilds the same index client-side from buildCitationIndex(card) instead.
  //
  // Testability only: renderToStaticMarkup can't simulate a chip click, so the shell tests reach
  // a non-default tab by mounting PocketCard directly with this prop. Real usage never passes it;
  // the pocket always opens on the Card tab.
  initialTab?: PocketTab;
};

const TAB_LABELS: Record<PocketTab, string> = { card: "Card", people: "People", signals: "Signals", sources: "Sources" };

function visibleTabs(card: PublicCardData): PocketTab[] {
  const tabs: PocketTab[] = ["card"];
  if (hasPeopleContent(card, headcountConflict(card))) {
    tabs.push("people");
  }
  tabs.push("signals", "sources");
  return tabs;
}

// One 9px evidence square, same rule SectionRows and StatStrip render against: filled for
// verified, outlined for reported, half-filled for company, hatched for conflict, nothing for
// unknown/absent.
function Mark({ state }: { state: EvidenceState | null }) {
  if (state === null || state === "unknown") {
    return null;
  }
  return <span aria-hidden="true" className="cs-face-mark" data-state={state} />;
}

function PocketFooter({ card, sourcesRead }: { card: PublicCardData; sourcesRead: number }) {
  return (
    <div className="cs-pocket-footer">
      <span>filed {filedDateStamp(card.generatedAt)}</span>
      <span>
        {sourcesRead} source{sourcesRead === 1 ? "" : "s"}
      </span>
    </div>
  );
}

function PocketPanel({ children }: { children: ReactNode }) {
  return <div className="cs-pocket-tabpanel">{children}</div>;
}

// --- Header: name, CALL NO. block (with the FILED/THIN stamp), description, meta line ---

function PocketHeader({ card }: { card: PublicCardData }) {
  const title = card.identity.name.value ?? card.domain;
  const description = card.identity.oneLiner.value;
  const websiteHref = safeExternalHref(card.identity.websiteUrl?.value ?? `https://${card.domain}`);
  const hqCity = card.identity.hq.value?.city ?? null;
  const thin = isThinFile(card);

  return (
    <header className="cs-pocket-header">
      <div className="cs-pocket-header-top">
        <h1 className="cs-pocket-name">{title}</h1>
        <div className="cs-pocket-callno">
          <span className="cs-pocket-callno-label">CALL NO.</span>
          <span className="cs-pocket-callno-value">{callNumber(card)}</span>
          {thin ? (
            <Stamp kind="thin" sourceCount={vettedCounts(card).total} />
          ) : (
            <Stamp date={filedDateStamp(card.generatedAt)} kind="filed" />
          )}
        </div>
      </div>
      {description ? <p className="cs-pocket-description">{description}</p> : null}
      <p className="cs-pocket-meta">
        {websiteHref ? (
          <a className="cs-pocket-domain-link" href={websiteHref} rel="noreferrer noopener" target="_blank">
            {card.domain}
          </a>
        ) : (
          <span className="cs-pocket-domain-link">{card.domain}</span>
        )}
        {hqCity ? <span> · {hqCity}</span> : null}
      </p>
    </header>
  );
}

// --- Tabs ---

function TabBar({ tabs, activeTab, onSelect }: { tabs: PocketTab[]; activeTab: PocketTab; onSelect: (tab: PocketTab) => void }) {
  return (
    <div className="cs-pocket-tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          aria-selected={activeTab === tab}
          className="cs-pocket-tab"
          data-active={activeTab === tab ? "true" : undefined}
          key={tab}
          onClick={() => onSelect(tab)}
          role="tab"
          type="button"
        >
          {TAB_LABELS[tab]}
        </button>
      ))}
    </div>
  );
}

// --- Card tab: compact stat rows, Comps, Next question ---

function compsValue(card: PublicCardData): string {
  const comparables = card.comparables;
  if (comparables.length === 0) {
    return "none named by a source";
  }
  const [first, ...rest] = comparables;
  return rest.length > 0 ? `${first!.name} +${rest.length}` : first!.name;
}

function CardTab({ card, sections, index }: { card: PublicCardData; sections: ResearchSection[]; index: CitationIndex }) {
  const slots = statSlots(card);
  const nextQuestion = nextQuestionForCard(card, sections);

  return (
    <PocketPanel>
      <div className="cs-pocket-stats">
        {slots.map((slot) => (
          <div className="cs-pocket-stat-row" data-key={slot.key} key={slot.key}>
            <span className="cs-pocket-stat-label" data-conflict={slot.conflict ? "true" : undefined}>
              {slot.label}
            </span>
            <span className="cs-pocket-stat-value">
              <Mark state={slot.state} />
              {slot.value === null ? <span className="cs-face-stat-absent">not publicly disclosed</span> : slot.value}
            </span>
          </div>
        ))}
        <div className="cs-pocket-stat-row" data-key="comps">
          <span className="cs-pocket-stat-label">Comps</span>
          <span className="cs-pocket-stat-value">
            {card.comparables.length === 0 ? (
              <span className="cs-face-stat-absent">{compsValue(card)}</span>
            ) : (
              compsValue(card)
            )}
          </span>
        </div>
      </div>
      {nextQuestion ? (
        <div className="cs-pocket-question">
          <p className="cs-pocket-question-text">{nextQuestion.question}</p>
          <p className="cs-pocket-question-subline">{nextQuestion.subline}</p>
        </div>
      ) : null}
      <PocketFooter card={card} sourcesRead={index.ordered.length} />
    </PocketPanel>
  );
}

// --- People tab: name/role pairs, compact conflict panel, hiring bullet ---

function PeopleTab({ card, index, onJumpToSources }: { card: PublicCardData; index: CitationIndex; onJumpToSources: () => void }) {
  const founders = card.team.founders.value ?? [];
  const execs = card.team.keyExecs.value ?? [];
  const conflict = headcountConflict(card);
  const hiringSignal = card.signals.find((signal) => signal.category === "hiring");

  return (
    <PocketPanel>
      <div className="cs-pocket-people">
        {founders.map((person) => (
          <p className="cs-face-person" key={`founder:${person.name}`}>
            <span className="cs-face-person-name">{person.name}</span>
            {person.role ? <span className="cs-face-person-role">, {person.role}</span> : null}
          </p>
        ))}
        {execs.map((person) => (
          <p className="cs-face-person" key={`exec:${person.name}`}>
            <span className="cs-face-person-name">{person.name}</span>
            {person.role ? <span className="cs-face-person-role">, {person.role}</span> : null}
          </p>
        ))}
      </div>
      {conflict ? <ConflictPanel compact conflict={conflict} index={index} onCiteClick={onJumpToSources} /> : null}
      {hiringSignal ? (
        <p className="cs-face-bullet">
          <Mark state={signalEvidenceState(card, hiringSignal)} />
          {hiringSignal.title}
          <CiteMarks marks={citationMarks(hiringSignal.citationIds, index)} onCiteClick={onJumpToSources} />
        </p>
      ) : null}
      <PocketFooter card={card} sourcesRead={index.ordered.length} />
    </PocketPanel>
  );
}

// --- Signals tab: stacked date/category/statement rows ---

function SignalsTab({ card, index, onJumpToSources }: { card: PublicCardData; index: CitationIndex; onJumpToSources: () => void }) {
  const signals = card.signals.slice(0, 6);

  return (
    <PocketPanel>
      {signals.length === 0 ? (
        <p className="cs-face-receipt-note">No recent signal with a usable source.</p>
      ) : (
        <div className="cs-pocket-signals">
          {signals.map((signal) => {
            const state = signalEvidenceState(card, signal);
            return (
              <div className="cs-pocket-signal" key={`${signal.date}:${signal.title}`}>
                <p className="cs-pocket-signal-meta">
                  <span className="cs-pocket-signal-date">{formatMediumDate(signal.date)}</span>
                  <span className="cs-pocket-signal-category">{signal.category.toLowerCase()}</span>
                </p>
                <p className="cs-pocket-signal-statement">
                  <Mark state={state} />
                  {signal.title}
                  {state === "company" ? <span className="cs-face-signal-caveat"> company claim</span> : null}
                  <CiteMarks marks={citationMarks(signal.citationIds, index)} onCiteClick={onJumpToSources} />
                </p>
              </div>
            );
          })}
        </div>
      )}
      <PocketFooter card={card} sourcesRead={index.ordered.length} />
    </PocketPanel>
  );
}

// --- Sources tab: the same row anatomy as the desktop rail, plainly listed ---

function SourcesTab({ card, index }: { card: PublicCardData; index: CitationIndex }) {
  return (
    <PocketPanel>
      <div className="cs-pocket-sources">
        {index.ordered.map((citation, position) => (
          <div className="cs-pocket-source-row" key={citation.id}>
            <SourceRow citation={citation} number={index.displayNumber(citation.id) ?? position + 1} />
          </div>
        ))}
      </div>
      <PocketFooter card={card} sourcesRead={index.ordered.length} />
    </PocketPanel>
  );
}

// The mobile face below 700px: a header identical in substance to the desktop's (name, call
// number, stamp, description, meta line) over a set of divider tabs instead of the desktop's
// two-column reading grid. Card and Signals always show (with honest empty states); People shows
// only when there's a name or a headcount conflict to report, matching the desktop's presence
// rule; Investor read and Risk never appear here, per the pocket's cut-down mobile scope.
export function PocketCard({ card, sections, initialTab = "card" }: PocketCardProps) {
  const [activeTab, setActiveTab] = useState<PocketTab>(initialTab);
  const index = useMemo(() => buildCitationIndex(card), [card]);
  const tabs = visibleTabs(card);
  const onJumpToSources = () => setActiveTab("sources");

  return (
    <div>
      <PocketHeader card={card} />
      <TabBar activeTab={activeTab} onSelect={setActiveTab} tabs={tabs} />
      <div className="cs-pocket-panel">
        {activeTab === "card" ? <CardTab card={card} index={index} sections={sections} /> : null}
        {activeTab === "people" ? <PeopleTab card={card} index={index} onJumpToSources={onJumpToSources} /> : null}
        {activeTab === "signals" ? <SignalsTab card={card} index={index} onJumpToSources={onJumpToSources} /> : null}
        {activeTab === "sources" ? <SourcesTab card={card} index={index} /> : null}
      </div>
    </div>
  );
}
