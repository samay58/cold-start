import React from "react";
import { INVESTOR_READ_LABELS } from "../../lib/card-face/model";

export type ExtensionPanelProps = {
  companyName: string;
};

export function ExtensionPanel({ companyName }: ExtensionPanelProps) {
  return (
    <div className="cs-landing-panel">
      <div className="cs-landing-panel-head">
        <span className="cs-landing-panel-callno">CS · {companyName.toUpperCase()}</span>
      </div>
      <div className="cs-landing-panel-body">
        {INVESTOR_READ_LABELS.map((label) => {
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
