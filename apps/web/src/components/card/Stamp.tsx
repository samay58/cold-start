import React from "react";

// Double-struck FILED / THIN FILE stamp: two absolutely offset copies of the same bordered
// lockup, one behind a radial mask, so the ink density reads uneven like a real double-strike.
// The caller (CardFace) formats `date` and computes `sourceCount`; this component only lays out
// and labels whatever strings it is given.
export type StampProps = {
  kind: "filed" | "thin";
  date?: string;
  sourceCount?: number;
};

function sourceCountLabel(sourceCount: number): string {
  return `${sourceCount} source${sourceCount === 1 ? "" : "s"} on record`;
}

export function Stamp({ kind, date, sourceCount }: StampProps) {
  const primaryText = kind === "filed" ? "FILED" : "THIN FILE";
  const secondaryText = kind === "filed" ? date ?? null : sourceCount !== undefined ? sourceCountLabel(sourceCount) : null;

  const accessibleLabel =
    kind === "filed" ? `Filed${date ? `, ${date}` : ""}` : `Thin file${sourceCount !== undefined ? `, ${sourceCountLabel(sourceCount)}` : ""}`;

  return (
    <div className="cs-face-stamp" data-kind={kind} role="img" aria-label={accessibleLabel}>
      <span aria-hidden="true" className="cs-face-stamp-copy cs-face-stamp-under">
        <span className="cs-face-stamp-primary">{primaryText}</span>
        {secondaryText ? <span className="cs-face-stamp-secondary">{secondaryText}</span> : null}
      </span>
      <span aria-hidden="true" className="cs-face-stamp-copy cs-face-stamp-over">
        <span className="cs-face-stamp-primary">{primaryText}</span>
        {secondaryText ? <span className="cs-face-stamp-secondary">{secondaryText}</span> : null}
      </span>
    </div>
  );
}
