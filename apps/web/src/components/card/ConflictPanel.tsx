import React from "react";
import { formatShortDate } from "@cold-start/ui";
import { CiteMarks } from "./choreography";
import { citationMarks, type CitationIndex, type HeadcountConflict } from "../../lib/card-face/model";

export type ConflictPanelProps = {
  conflict: HeadcountConflict;
  index: CitationIndex;
  // Task 9's pocket card reuses this panel with tighter copy and a smaller number: verified
  // 2026-07-30 as the degraded form (the two competing values are not recoverable to one true
  // figure), so both sizes exist permanently rather than one being a loading/transition state.
  compact?: boolean;
  // Pocket-only: when provided, citation marks render as plain non-interactive receipt spans
  // (choreography.tsx's CiteMarks own cs-pocket-cite convention) that call this instead of
  // pairing with a sources rail that isn't on screen. Absent (the desktop path) keeps the
  // interactive CiteMark and requires no ChoreographyProvider change here.
  onCiteClick?: (id: string) => void;
};

// The degraded form for a conflicting fact: the stored value, every disagreeing source, and a
// footer that refuses to average them. Anchored by id so the stat strip's headcount detail link
// (Task 6) can jump straight here.
export function ConflictPanel({ conflict, index, compact = false, onCiteClick }: ConflictPanelProps) {
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
            <CiteMarks marks={citationMarks([source.citationId], index)} onCiteClick={onCiteClick} />
          </p>
        ))}
      </div>
      <p className="cs-face-conflict-footer">
        {compact ? "Both stand. No average is shown." : "Both values stand. Cold Start does not average sources."}
      </p>
    </div>
  );
}
