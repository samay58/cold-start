import React from "react";
import { formatShortDate } from "@cold-start/ui";
import { CiteMark } from "./choreography";
import type { CitationIndex, HeadcountConflict } from "../../lib/card-face/model";

export type ConflictPanelProps = {
  conflict: HeadcountConflict;
  index: CitationIndex;
  // Task 9's pocket card reuses this panel with tighter copy and a smaller number: verified
  // 2026-07-30 as the degraded form (the two competing values are not recoverable to one true
  // figure), so both sizes exist permanently rather than one being a loading/transition state.
  compact?: boolean;
};

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
        <CiteMark id={id} key={id} number={number} />
      ))}
    </>
  );
}

// The degraded form for a conflicting fact: the stored value, every disagreeing source, and a
// footer that refuses to average them. Anchored by id so the stat strip's headcount detail link
// (Task 6) can jump straight here.
export function ConflictPanel({ conflict, index, compact = false }: ConflictPanelProps) {
  return (
    <div className="cs-face-conflict" data-compact={compact ? "true" : undefined} id="headcount-conflict">
      <div className="cs-face-conflict-header">
        <span aria-hidden="true" className="cs-face-conflict-hatch" />
        <span className="cs-face-conflict-title">Headcount: sources disagree</span>
      </div>
      <div className="cs-face-conflict-value-row">
        <span className="cs-face-conflict-value">{conflict.value}</span>
        {conflict.asOf ? <span className="cs-face-conflict-asof">as of {formatShortDate(conflict.asOf)}</span> : null}
      </div>
      <div className="cs-face-conflict-sources">
        {conflict.sources.map((source) => (
          <p className="cs-face-conflict-source" key={source.citationId}>
            {source.label}
            {source.date ? ` · ${source.date}` : ""}
            <CiteMarks citationIds={[source.citationId]} index={index} />
          </p>
        ))}
      </div>
      <p className="cs-face-conflict-footer">
        {compact ? "Both stand. No average is shown." : "Both values stand. Cold Start does not average sources."}
      </p>
    </div>
  );
}
