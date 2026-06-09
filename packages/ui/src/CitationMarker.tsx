import { sourceQualityForSource } from "@cold-start/core";
import type { CitationLedger, CitationLedgerEntry } from "./CitationLedger";
import { citationHostname } from "./CitationLedger";
import { formatMediumDate } from "./FactRow";
import { sourceDomId } from "./sourceDomId";

function CitationPopover({ entry }: { entry: CitationLedgerEntry }) {
  const { citation } = entry;
  const host = citationHostname(citation.url);
  const fetched = formatMediumDate(citation.fetchedAt);
  const qualityLabel = (citation.sourceQuality ?? sourceQualityForSource(citation)).label;

  return (
    <span aria-hidden="true" className="cs-citation-popover">
      <strong className="cs-citation-popover-title">{citation.title}</strong>
      <span className="cs-citation-popover-meta">
        {host ? <span>{host}</span> : null}
        <span>{fetched}</span>
      </span>
      <span className="cs-citation-popover-class" data-class={entry.sourceClass}>
        <span className="cs-evidence-dot" aria-hidden="true" />
        {qualityLabel}
      </span>
    </span>
  );
}

export function CitationAnchor({
  entry,
  id
}: {
  entry: CitationLedgerEntry | null;
  id: string;
}) {
  const display = entry ? String(entry.displayIndex) : id;
  const ariaLabel = entry ? `Source ${entry.displayIndex}: ${entry.citation.title}` : `Source ${id}`;

  return (
    <a
      aria-label={ariaLabel}
      className="cs-citation"
      href={`#${sourceDomId(id)}`}
      {...(entry ? { "data-class": entry.sourceClass } : {})}
    >
      [{display}]
      {entry ? <CitationPopover entry={entry} /> : null}
    </a>
  );
}

export function CitationMarker({ id, ledger }: { id: string; ledger?: CitationLedger }) {
  return <CitationAnchor entry={ledger?.get(id) ?? null} id={id} />;
}
