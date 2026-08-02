import React from "react";

type ComparisonRow = {
  label: string;
  coldStart: string;
  coldStartNote?: string;
  pitchbook: string;
};

// Copy is verbatim from the task-17 brief (Step 2): every label and value below is quoted
// exactly, in the order given. Do not rewrite, trim, or re-punctuate any of it.
const ROWS: ComparisonRow[] = [
  {
    label: "A company founded in the last year",
    coldStart: "A full cited profile in about a minute",
    pitchbook: "Thin profile, or none at all"
  },
  {
    label: "Depth",
    coldStart:
      "What it does, who pays, why it works, plus a bull case, a bear case, and the questions for a first call",
    pitchbook: "Generic tags and fields"
  },
  {
    label: "After it is built",
    coldStart: "Keeps enriching, and stale sections rebuild the next time you open it",
    pitchbook: "Static until an analyst updates the row"
  },
  {
    label: "Sources",
    coldStart: "Every fact links to a public source you can open",
    pitchbook: "Proprietary numbers you cannot trace"
  },
  {
    label: "Cost",
    coldStart: "Under 10 cents per full profile",
    coldStartNote: "one seat of PitchBook buys 250,000 profiles",
    pitchbook: "About $25k per seat per year, reported"
  },
  {
    label: "Sharing",
    coldStart: "A public link, no login",
    pitchbook: "Seat licensed"
  }
];

export function ComparisonTable() {
  return (
    <div className="cs-landing-table">
      <div aria-hidden="true" className="cs-landing-table-head">
        <span className="cs-landing-table-head-spacer" />
        <span className="cs-landing-table-head-coldstart">Cold Start</span>
        <span className="cs-landing-table-head-pitchbook">PitchBook</span>
      </div>

      {ROWS.map((row) => (
        <div className="cs-landing-table-row" key={row.label}>
          <span className="cs-landing-table-label">{row.label}</span>
          <div className="cs-landing-table-cell">
            <span className="cs-landing-table-source">Cold Start</span>
            <span className="cs-landing-table-value">{row.coldStart}</span>
            {row.coldStartNote ? <span className="cs-landing-table-note">{row.coldStartNote}</span> : null}
          </div>
          <div className="cs-landing-table-cell">
            <span className="cs-landing-table-source">PitchBook</span>
            <span className="cs-landing-table-value cs-landing-table-value-muted">{row.pitchbook}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
