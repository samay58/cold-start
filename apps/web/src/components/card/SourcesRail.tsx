import React from "react";
import type { Citation } from "@cold-start/core";
import { citationHostname, formatShortDate, safeExternalHref, sourceClassForCitation, type CitationSourceClass } from "@cold-start/ui";
import type { CitationIndex } from "../../lib/card-face/model";
import { LedgerRow } from "./choreography";

export type SourcesRailProps = {
  index: CitationIndex;
};

// sourceClassForCitation's own vocabulary ("independent", "reporting") names the source, not the
// claim it supports. The rail states the latter: an independent/reporting-tier source is what
// makes a fact read as "verified" or "reported" elsewhere on this card, so the rail borrows those
// same words rather than teaching the reader a second vocabulary.
const CLASS_LABEL: Record<CitationSourceClass, string> = {
  independent: "verified",
  reporting: "reported",
  company: "company",
  vendor: "vendor",
  unknown: "unknown"
};

function SourceMark({ sourceClass }: { sourceClass: CitationSourceClass }) {
  return <span aria-hidden="true" className="cs-face-rail-mark" data-class={sourceClass} />;
}

function SourceRowContent({ citation, number }: { citation: Citation; number: number }) {
  const sourceClass = sourceClassForCitation(citation);
  const href = safeExternalHref(citation.url);
  const hostname = citationHostname(citation.url);
  const date = formatShortDate(citation.fetchedAt);

  return (
    <>
      <div className="cs-face-rail-row-top">
        <span className="cs-face-rail-number">[{number}]</span>
        {href ? (
          <a className="cs-face-rail-source-title" href={href} rel="noreferrer noopener" target="_blank">
            {citation.title}
          </a>
        ) : (
          <span className="cs-face-rail-source-title">{citation.title}</span>
        )}
      </div>
      <p className="cs-face-rail-receipt">
        {date}
        {hostname ? ` · ${hostname}` : ""}
      </p>
      <p className="cs-face-rail-class" data-class={sourceClass}>
        <SourceMark sourceClass={sourceClass} />
        {CLASS_LABEL[sourceClass]}
      </p>
    </>
  );
}

// Sticky right-column ledger: every citation on the card, in the same order its inline [n] marks
// number them. Sits inside ChoreographyProvider (CardFace wraps the whole two-column grid), so
// each LedgerRow lights up when its matching inline mark is hovered or held.
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
            <SourceRowContent citation={citation} number={index.displayNumber(citation.id) ?? position + 1} />
          </LedgerRow>
        ))}
      </div>
    </div>
  );
}
