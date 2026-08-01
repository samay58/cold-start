import React from "react";
import type { CitationIndex } from "../../lib/card-face/model";
import { LedgerRow } from "./choreography";
import { SourceRow } from "./SourceRow";

export type SourcesRailProps = {
  index: CitationIndex;
};

// Sticky right-column ledger: every citation on the card, in the same order its inline [n] marks
// number them. Sits inside ChoreographyProvider (CardFace wraps the whole two-column grid), so
// each LedgerRow lights up when its matching inline mark is hovered or held. The row anatomy
// itself lives in SourceRow.tsx, shared verbatim with the pocket card's plain Sources tab list
// (Task 9), which has no LedgerRow/choreography pairing to wrap it in.
export function SourcesRail({ index }: SourcesRailProps) {
  return (
    <div className="cs-face-rail-panel">
      <div className="cs-face-rail-header">
        <span className="cs-face-rail-header-title">Sources</span>
        <span className="cs-face-rail-header-meta">tracings · {index.ordered.length}</span>
      </div>
      <div className="cs-face-rail-rows">
        {index.ordered.map((citation, position) => (
          <LedgerRow id={citation.id} key={citation.id}>
            <SourceRow citation={citation} number={index.displayNumber(citation.id) ?? position + 1} />
          </LedgerRow>
        ))}
      </div>
    </div>
  );
}
