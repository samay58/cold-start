import React from "react";
import { INVESTOR_READ_LABELS } from "../../lib/card-face/model";

export type ExtensionPanelProps = {
  companyName: string;
  lens?: { whyCare: string; whatMustBeTrue: string } | undefined;
};

// Renders recordedBuild.lens when present: the first two rows (Why care, What must be true)
// answered with frozen, hand-reviewed prose, the remaining three locked with the receipt value
// "invited accounts". With no lens, all five rows render locked.
export function ExtensionPanel({ companyName, lens }: ExtensionPanelProps) {
  const answered: Partial<Record<(typeof INVESTOR_READ_LABELS)[number], string>> = lens
    ? { "Why care": lens.whyCare, "What must be true": lens.whatMustBeTrue }
    : {};

  return (
    <div className="cs-landing-panel">
      <div className="cs-landing-panel-head">
        <span className="cs-landing-panel-callno">CS · {companyName.toUpperCase()}</span>
      </div>
      <div className="cs-landing-panel-body">
        {INVESTOR_READ_LABELS.map((label) => {
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
              <span className="cs-landing-panel-locked-value">
                <span aria-hidden="true" className="cs-landing-panel-lock-mark" />
                invited accounts
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
