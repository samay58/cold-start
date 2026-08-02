import React from "react";
import type { EvidenceState } from "../../lib/card-face/model";

type LegendRow = {
  state: EvidenceState;
  label: string;
  copy: string;
};

// Labels are DESIGN.md's own Source Quality Encoding vocabulary (the "Verified / Reported /
// Company / Conflict / Unknown" table), already used as the data-state taxonomy across
// SectionRows.tsx, StatStrip.tsx, and SourcesRail.tsx. The five sentences are verbatim from the
// task-17 brief (Step 2): do not rewrite, trim, or re-punctuate them.
const ROWS: LegendRow[] = [
  { state: "verified", label: "Verified", copy: "Two independent sources say it." },
  { state: "reported", label: "Reported", copy: "One outside source says it." },
  { state: "company", label: "Company", copy: "Only the company says it." },
  { state: "conflict", label: "Conflict", copy: "The sources give different numbers." },
  { state: "unknown", label: "Unknown", copy: "No source has it." }
];

export function SourcesLegend() {
  return (
    <div className="cs-landing-legend">
      {ROWS.map((row) => (
        <div className="cs-landing-legend-row" key={row.state}>
          <span aria-hidden="true" className="cs-landing-mark-well">
            <span className="cs-landing-mark" data-state={row.state} />
          </span>
          <span className="cs-landing-legend-label">{row.label}.</span>
          <span className="cs-landing-legend-copy">{row.copy}</span>
        </div>
      ))}
    </div>
  );
}
