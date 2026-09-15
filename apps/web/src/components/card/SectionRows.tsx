import React from "react";
import type { ReactNode } from "react";
import type { ResearchSection } from "@cold-start/core";
import { formatMediumDate } from "@cold-start/ui";
import {
  additionalFinancingBullets,
  citationMarks,
  hasPeopleContent,
  headcountConflict,
  INVESTOR_READ_LABELS,
  isThinFile,
  moneyBullets,
  nextQuestionForCard,
  peopleRows,
  publicEvidenceText,
  resolvedEvidenceState,
  riskCaveats,
  signalEvidenceState,
  type CitationIndex,
  type EvidenceState,
  type FactBullet,
  type PublicCardData
} from "../../lib/card-face/model";
import { CiteMarks } from "./choreography";
import { ConflictPanel } from "./ConflictPanel";

export type SectionRowsProps = {
  card: PublicCardData;
  sections: ResearchSection[];
  index: CitationIndex;
};

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

function BulletRow({ bullet, index }: { bullet: FactBullet; index: CitationIndex }) {
  return (
    <p className={bullet.muted ? "cs-face-bullet cs-face-bullet-muted" : "cs-face-bullet"}>
      <Mark state={bullet.state} />
      {bullet.text}
      <CiteMarks marks={citationMarks(bullet.citationIds, index)} />
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

function MoneySection({ card, sections, index }: { card: PublicCardData; sections: ResearchSection[]; index: CitationIndex }) {
  const bullets = moneyBullets(card);
  const extraBullets = additionalFinancingBullets(card, index, sections);

  if (bullets.length === 0 && extraBullets.length === 0) {
    return (
      <SectionRow label="Money">
        <EmptyBlock line="No filing, no announced round, no reported figure." receipt="No public funding found." />
      </SectionRow>
    );
  }

  return (
    <SectionRow label="Money">
      {[...bullets, ...extraBullets].map((bullet) => (
        <BulletRow bullet={bullet} index={index} key={bullet.text} />
      ))}
    </SectionRow>
  );
}

// --- People ---

function PeopleSection({ card, conflict, index }: { card: PublicCardData; conflict: ReturnType<typeof headcountConflict>; index: CitationIndex }) {
  const people = peopleRows(card);

  return (
    <SectionRow label="People">
      {people.map((person, position) => (
        <p className="cs-face-person" key={`${person.name}:${person.role}:${position}`}>
          <Mark state={person.state} />
          <span className="cs-face-person-name">{person.name}</span>
          {person.role ? <span className="cs-face-person-role">, {person.role}</span> : null}
          <CiteMarks marks={citationMarks(person.citationIds, index)} />
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
                  <span className="cs-face-signal-caveat"> company claim, not independently confirmed</span>
                ) : null}
              </span>
              <span className="cs-face-signal-cite">
                <CiteMarks marks={citationMarks(signal.citationIds, index)} />
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
        const state = resolvedEvidenceState(card, index, {
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
            {" · "}
            {publicEvidenceText(comparable.basis ?? comparable.oneLiner)}
            <CiteMarks marks={citationMarks(citationIds, index)} />
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
  const showPeople = hasPeopleContent(card, conflict);
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
