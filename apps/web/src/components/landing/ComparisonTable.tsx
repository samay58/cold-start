import React from "react";

type ComparisonRow = {
  label: string;
  coldStart: string;
  coldStartNote?: string;
  pitchbook: string;
};

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
    coldStart: "Keeps researching, and refreshes old sections when you return",
    pitchbook: "Static until an analyst updates the row"
  },
  {
    label: "Sources",
    coldStart: "Every fact links to a public source you can open",
    pitchbook: "Proprietary numbers you cannot trace"
  },
  {
    label: "Cost",
    // Measured 2026-08-12 on 30 days of real prod traffic: median basics+analysis pair for
    // the same domain, all four cost streams, $0.178 over 61 domains (p90 $0.242).
    coldStart: "18 cents per full profile",
    coldStartNote: "one seat of PitchBook buys 140,000 profiles",
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
