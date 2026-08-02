import React from "react";
import { CiteMarks } from "./choreography";
import { citationMarks, type CitationIndex, type StatSlot } from "../../lib/card-face/model";

export type StatStripProps = {
  slots: StatSlot[];
  index: CitationIndex;
};

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
        <CiteMarks marks={citationMarks(slot.citationIds, index)} />
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
