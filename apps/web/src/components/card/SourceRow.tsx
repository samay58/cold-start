import React from "react";
import type { Citation } from "@cold-start/core";
import { citationHostname, formatShortDate, safeExternalHref, sourceClassForCitation, type CitationSourceClass } from "@cold-start/ui";

export type SourceRowProps = {
  citation: Citation;
  number: number;
};

// sourceClassForCitation's own vocabulary ("independent", "reporting") names the source, not the
// claim it supports. The rail states the latter: an independent/reporting-tier source is what
// makes a fact read as "verified" or "reported" elsewhere on this card, so the row borrows those
// same words rather than teaching the reader a second vocabulary.
export const SOURCE_CLASS_LABEL: Record<CitationSourceClass, string> = {
  independent: "verified",
  reporting: "reported",
  company: "company",
  vendor: "vendor",
  unknown: "unknown"
};

export function SourceMark({ sourceClass }: { sourceClass: CitationSourceClass }) {
  return <span aria-hidden="true" className="cs-face-rail-mark" data-class={sourceClass} />;
}

// One citation's row content: number, linked title, receipt line, and class mark/label. Shared by
// the desktop sources rail (wrapped in a `LedgerRow` for the hover/hold pairing) and the pocket
// card's Sources tab (a plain list, no pairing state), so both surfaces render a citation
// identically without duplicating the markup.
export function SourceRow({ citation, number }: SourceRowProps) {
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
        {SOURCE_CLASS_LABEL[sourceClass]}
      </p>
    </>
  );
}
