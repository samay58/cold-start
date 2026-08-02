import React from "react";

export type ExtensionPanelProps = {
  companyName: string;
  lens?: { whyCare: string; whatMustBeTrue: string } | undefined;
};

// Same five-row order as the real card face's locked "Investor read" teaser
// (apps/web/src/components/card/SectionRows.tsx's INVESTOR_READ_LABELS) and the extension's own
// investor lens packet.
const LABELS = ["Why care", "What must be true", "What could break", "Why now", "What to learn next"] as const;

// Renders recordedBuild.lens when present: the first two rows (Why care, What must be true)
// answered with the frozen lens prose verbatim, the remaining three locked with the receipt value
// "invited accounts". With no lens, all five rows render locked. The lens strings are quoted
// production synthesis output (Task 16); they are not rewritten, trimmed, or re-punctuated here.
export function ExtensionPanel({ companyName, lens }: ExtensionPanelProps) {
  const answered: Partial<Record<(typeof LABELS)[number], string>> = lens
    ? { "Why care": lens.whyCare, "What must be true": lens.whatMustBeTrue }
    : {};

  return (
    <div className="cs-landing-panel">
      <div aria-hidden="true" className="cs-landing-panel-bar" />
      <div className="cs-landing-panel-head">
        <span className="cs-landing-panel-callno">CS · {companyName.toUpperCase()}</span>
      </div>
      <div className="cs-landing-panel-body">
        {LABELS.map((label) => {
          const value = answered[label];
          if (value) {
            return (
              <div className="cs-landing-panel-row" key={label}>
                <span className="cs-landing-panel-label">{label}</span>
                <p className="cs-landing-panel-value">{value}</p>
              </div>
            );
          }

          return (
            <div className="cs-landing-panel-row cs-landing-panel-row-locked" key={label}>
              <span className="cs-landing-panel-label cs-landing-panel-label-locked">{label}</span>
              <span className="cs-landing-panel-locked-value">invited accounts</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
