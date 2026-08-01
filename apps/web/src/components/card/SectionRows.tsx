import React from "react";
import type { ReactNode } from "react";
import type { ResearchSection, ResearchSectionContent } from "@cold-start/core";
import { formatMediumDate } from "@cold-start/ui";
import {
  evidenceStateForFact,
  headcountConflict,
  isThinFile,
  moneyBullets,
  nextQuestionForCard,
  publicEvidenceText,
  riskCaveats,
  signalEvidenceState,
  type CitationIndex,
  type EvidenceState,
  type FactBullet,
  type PublicCardData
} from "../../lib/card-face/model";
import { ConflictPanel } from "./ConflictPanel";

export type SectionRowsProps = {
  card: PublicCardData;
  sections: ResearchSection[];
  index: CitationIndex;
};

const INVESTOR_READ_LABELS = ["Why care", "What must be true", "What could break", "Why now", "What to learn next"];

// --- Shared row primitives ---

// One 9px evidence square per DESIGN.md's Source Quality Encoding: filled for verified,
// outlined for reported, half-filled for company, hatched for conflict. Unknown/absent
// evidence carries no mark, matching StatStrip's EvidenceMark (Task 6).
function Mark({ state }: { state: EvidenceState }) {
  if (state === "unknown") {
    return null;
  }

  return <span aria-hidden="true" className="cs-face-mark" data-state={state} />;
}

// Plain receipt spans for now, same pattern as StatStrip's CitationMarks: Task 8 swaps these
// for the interactive hover-to-hold choreography without a relayout, per the data-cite-id hook.
function CiteMarks({ citationIds, index }: { citationIds: string[]; index: CitationIndex }) {
  const marks = citationIds
    .map((id) => ({ id, number: index.displayNumber(id) }))
    .filter((entry): entry is { id: string; number: number } => entry.number !== null);

  if (marks.length === 0) {
    return null;
  }

  return (
    <>
      {marks.map(({ id, number }) => (
        <span className="cs-face-cite" data-cite-id={id} key={id}>
          [{number}]
        </span>
      ))}
    </>
  );
}

function BulletRow({ bullet, index }: { bullet: FactBullet; index: CitationIndex }) {
  return (
    <p className={bullet.muted ? "cs-face-bullet cs-face-bullet-muted" : "cs-face-bullet"}>
      <Mark state={bullet.state} />
      {bullet.text}
      <CiteMarks citationIds={bullet.citationIds} index={index} />
    </p>
  );
}

function SectionRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="cs-face-row">
      <span className="cs-face-row-label">{label}</span>
      <div className="cs-face-row-body">{children}</div>
    </div>
  );
}

function EmptyBlock({ line, receipt }: { line?: string; receipt: string }) {
  return (
    <div className="cs-face-empty">
      {line ? <p className="cs-face-empty-line">{line}</p> : null}
      <p className="cs-face-receipt-note">{receipt}</p>
    </div>
  );
}

// --- Money ---

// fundingEvidenceItems() (packages/core/src/research-sections.ts) always leads with a "Total
// raised" item and, when there is a single accounting round, a round-named item; moneyBullets
// already composes both as sentences. Skipping those two labels keeps the financing section's
// contribution to genuinely incremental rows (Investors, and any future financing item) instead
// of restating the same figures twice.
function additionalFinancingItems(card: PublicCardData, sections: ResearchSection[]): ResearchSectionContent["items"] {
  const section = sections.find((candidate) => candidate.sectionId === "financing");
  if (!section || section.status !== "available" || !section.content) {
    return [];
  }

  const roundName = card.funding.lastRound.value?.name ?? null;
  return section.content.items.filter((item) => item.label !== "Total raised" && item.label !== roundName);
}

function MoneySection({ card, sections, index }: { card: PublicCardData; sections: ResearchSection[]; index: CitationIndex }) {
  const bullets = moneyBullets(card);
  const extraItems = additionalFinancingItems(card, sections);

  if (bullets.length === 0 && extraItems.length === 0) {
    return (
      <SectionRow label="Money">
        <EmptyBlock line="No filing, no announced round, no reported figure." receipt="No public funding found." />
      </SectionRow>
    );
  }

  return (
    <SectionRow label="Money">
      {bullets.map((bullet) => (
        <BulletRow bullet={bullet} index={index} key={bullet.text} />
      ))}
      {extraItems.map((item) => {
        const state = evidenceStateForFact(card, {
          value: item.text,
          status: "verified",
          confidence: "high",
          citationIds: item.citationIds
        });
        return (
          <BulletRow
            bullet={{ text: publicEvidenceText(item.text), state, citationIds: item.citationIds }}
            index={index}
            key={`${item.label}:${item.text}`}
          />
        );
      })}
    </SectionRow>
  );
}

// --- People ---

function PeopleSection({ card, conflict, index }: { card: PublicCardData; conflict: ReturnType<typeof headcountConflict>; index: CitationIndex }) {
  const founders = card.team.founders.value ?? [];
  const execs = card.team.keyExecs.value ?? [];
  const foundersState = evidenceStateForFact(card, card.team.founders);
  const execsState = evidenceStateForFact(card, card.team.keyExecs);

  return (
    <SectionRow label="People">
      {founders.map((person) => (
        <p className="cs-face-person" key={`founder:${person.name}`}>
          <Mark state={foundersState} />
          <span className="cs-face-person-name">{person.name}</span>
          {person.role ? <span className="cs-face-person-role">, {person.role}</span> : null}
          <CiteMarks citationIds={card.team.founders.citationIds} index={index} />
        </p>
      ))}
      {execs.map((person) => (
        <p className="cs-face-person" key={`exec:${person.name}`}>
          <Mark state={execsState} />
          <span className="cs-face-person-name">{person.name}</span>
          {person.role ? <span className="cs-face-person-role">, {person.role}</span> : null}
          <CiteMarks citationIds={card.team.keyExecs.citationIds} index={index} />
        </p>
      ))}
      {conflict ? <ConflictPanel conflict={conflict} index={index} /> : null}
    </SectionRow>
  );
}

// --- Signals ---

function SignalsSection({ card, index }: { card: PublicCardData; index: CitationIndex }) {
  const signals = card.signals.slice(0, 6);

  if (signals.length === 0) {
    return (
      <SectionRow label="Signals">
        <EmptyBlock receipt="No recent signal with a usable source." />
      </SectionRow>
    );
  }

  return (
    <SectionRow label="Signals">
      <div className="cs-face-signals">
        {signals.map((signal) => {
          const state = signalEvidenceState(card, signal);
          return (
            <div className="cs-face-signal" key={`${signal.date}:${signal.title}`}>
              <span className="cs-face-signal-date">{formatMediumDate(signal.date)}</span>
              <span className="cs-face-signal-category">{signal.category.toLowerCase()}</span>
              <span className="cs-face-signal-statement">
                <Mark state={state} />
                {signal.title}
                {state === "company" ? (
                  <span className="cs-face-signal-caveat"> — company claim, not independently confirmed</span>
                ) : null}
              </span>
              <span className="cs-face-signal-cite">
                <CiteMarks citationIds={signal.citationIds} index={index} />
              </span>
            </div>
          );
        })}
      </div>
      {signals.length === 1 ? (
        <p className="cs-face-receipt-note">One signal on file. A signal needs a date and a source.</p>
      ) : null}
    </SectionRow>
  );
}

// --- Comps ---

function CompsSection({ card, index }: { card: PublicCardData; index: CitationIndex }) {
  if (card.comparables.length === 0) {
    return (
      <SectionRow label="Comps">
        <EmptyBlock
          line="No comparable company is named by any source in this ledger."
          receipt="The section stays empty until one is."
        />
      </SectionRow>
    );
  }

  return (
    <SectionRow label="Comps">
      {card.comparables.map((comparable) => {
        const citationIds = comparable.citationIds ?? [];
        const state = evidenceStateForFact(card, {
          value: comparable.name,
          status: "verified",
          confidence: comparable.confidence ?? "high",
          citationIds
        });
        return (
          <p className="cs-face-comp" key={comparable.name}>
            <Mark state={state} />
            <span className="cs-face-comp-name">{comparable.name}</span>
            <span className="cs-face-comp-domain"> · {comparable.domain}</span>
            {" — "}
            {publicEvidenceText(comparable.basis ?? comparable.oneLiner)}
            <CiteMarks citationIds={citationIds} index={index} />
          </p>
        );
      })}
    </SectionRow>
  );
}

// --- Risk ---

function RiskSection({ risks, index }: { risks: FactBullet[]; index: CitationIndex }) {
  return (
    <SectionRow label="Risk">
      {risks.map((bullet) => (
        <BulletRow bullet={bullet} index={index} key={bullet.text} />
      ))}
    </SectionRow>
  );
}

// --- Next question ---

function NextQuestionSection({ question }: { question: NonNullable<ReturnType<typeof nextQuestionForCard>> }) {
  return (
    <SectionRow label="Next question">
      <p className="cs-face-question-text">
        <span aria-hidden="true" className="cs-face-question-check" />
        {question.question}
      </p>
      <p className="cs-face-question-subline">{question.subline}</p>
    </SectionRow>
  );
}

// --- Investor read ---

function InvestorReadSection() {
  return (
    <SectionRow label="Investor read">
      <div className="cs-face-investor">
        {INVESTOR_READ_LABELS.map((label) => (
          <div className="cs-face-investor-item" key={label}>
            <span className="cs-face-investor-label">{label}</span>
            <span aria-hidden="true" className="cs-face-investor-rule" />
          </div>
        ))}
      </div>
      <p className="cs-face-investor-locked">
        Filled in the side panel for invited readers. This card carries sourced facts only.
      </p>
    </SectionRow>
  );
}

// The section rows below the stat strip, in order: Money, People (with the headcount
// ConflictPanel folded in when sources disagree), Signals, Comps, Risk, Next question, and the
// locked Investor read teaser. Money and Signals always render (with an honest empty state);
// the rest render only when they have something to say, per the section-presence rules in the
// Task 7 brief.
export function SectionRows({ card, sections, index }: SectionRowsProps) {
  const thin = isThinFile(card);
  const conflict = headcountConflict(card);
  const founders = card.team.founders.value ?? [];
  const execs = card.team.keyExecs.value ?? [];
  const showPeople = founders.length > 0 || execs.length > 0 || conflict !== null;
  const showComps = thin ? card.comparables.length > 0 : true;
  const risks = riskCaveats(card, sections);
  const nextQuestion = nextQuestionForCard(card, sections);

  return (
    <div className="cs-face-sections">
      <MoneySection card={card} index={index} sections={sections} />
      {showPeople ? <PeopleSection card={card} conflict={conflict} index={index} /> : null}
      <SignalsSection card={card} index={index} />
      {showComps ? <CompsSection card={card} index={index} /> : null}
      {risks.length > 0 ? <RiskSection index={index} risks={risks} /> : null}
      {nextQuestion ? <NextQuestionSection question={nextQuestion} /> : null}
      {!thin ? <InvestorReadSection /> : null}
    </div>
  );
}
