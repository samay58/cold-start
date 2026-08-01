import React from "react";
import type { CitationIndex, StatSlot } from "../../lib/card-face/model";

export type StatStripProps = {
  slots: StatSlot[];
  index: CitationIndex;
};

// Plain receipt marks for now: Task 8 swaps this span for the interactive citation choreography
// without a relayout, per the data-cite-id hook it reads.
function CitationMarks({ citationIds, index }: { citationIds: string[]; index: CitationIndex }) {
  const marks = citationIds
    .map((id) => ({ id, number: index.displayNumber(id) }))
    .filter((entry): entry is { id: string; number: number } => entry.number !== null);

  if (marks.length === 0) {
    return null;
  }

  return (
    <>
      {marks.map(({ id, number }) => (
        <span className="cs-face-stat-cite" data-cite-id={id} key={id}>
          [{number}]
        </span>
      ))}
    </>
  );
}

// One square evidence mark per DESIGN.md's evidence-mark language: filled for verified,
// outlined for reported, outlined with a half-width inner fill for company-sourced, and a
// hatched conflict mark for status "mixed". Absent and unresolved slots carry no mark.
function EvidenceMark({ state }: { state: StatSlot["state"] }) {
  if (state === null || state === "unknown") {
    return null;
  }

  return <span aria-hidden="true" className="cs-face-stat-mark" data-state={state} />;
}

function StatSlotCell({ slot, index }: { slot: StatSlot; index: CitationIndex }) {
  const absent = slot.value === null;
  const isHeadcountConflict = slot.key === "headcount" && slot.conflict;

  return (
    <div className="cs-face-stat" data-key={slot.key}>
      <span className="cs-face-stat-label" data-conflict={slot.conflict ? "true" : undefined}>
        {slot.label}
      </span>
      <span className="cs-face-stat-value">
        <EvidenceMark state={slot.state} />
        {absent ? <span className="cs-face-stat-absent">not publicly disclosed</span> : slot.value}
      </span>
      <span className="cs-face-stat-detail">
        {isHeadcountConflict ? (
          <a className="cs-face-stat-conflict-link" href="#headcount-conflict">
            {slot.detail}
          </a>
        ) : (
          slot.detail
        )}
        <CitationMarks citationIds={slot.citationIds} index={index} />
      </span>
    </div>
  );
}

// Five columns, one per statSlots() entry, between the header and the section rows (Task 7).
export function StatStrip({ slots, index }: StatStripProps) {
  return (
    <div className="cs-face-stats">
      {slots.map((slot) => (
        <StatSlotCell index={index} key={slot.key} slot={slot} />
      ))}
    </div>
  );
}
