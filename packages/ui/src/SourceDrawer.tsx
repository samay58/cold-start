import type { Citation } from "@cold-start/core";
import { sourceQualityForSource } from "@cold-start/core";
import type { CitationLedger } from "./CitationLedger";
import { citationHostname, sortedUniqueCitations, sourceClassForCitation } from "./CitationLedger";
import { formatMediumDate } from "./FactRow";
import { safeExternalHref } from "./safeExternalHref";
import { sourceDomId } from "./sourceDomId";

function SourceItem({
  citation,
  displayIndex,
  includeDomId
}: {
  citation: Citation;
  displayIndex: number;
  includeDomId: boolean;
}) {
  const href = safeExternalHref(citation.url);
  const sourceClass = sourceClassForCitation(citation);
  const host = citationHostname(citation.url);
  const fetched = formatMediumDate(citation.fetchedAt);

  return (
    <li className="cs-source-item" data-class={sourceClass} {...(includeDomId ? { id: sourceDomId(citation.id) } : {})}>
      <span className="cs-source-marker">[{displayIndex}]</span>
      <span className="cs-source-body">
        {href ? (
          <a className="cs-source-title" href={href} target="_blank" rel="noreferrer">{citation.title}</a>
        ) : (
          <span className="cs-source-title">{citation.title}</span>
        )}
        <span className="cs-source-meta">
          <span className="cs-source-class">{(citation.sourceQuality ?? sourceQualityForSource(citation)).label}</span>
          <span className="cs-source-sep"> · </span>
          {host ? <span className="cs-source-host">{host}</span> : null}
          {host ? <span className="cs-source-sep"> · </span> : null}
          <span className="cs-source-date">{fetched}</span>
        </span>
      </span>
    </li>
  );
}

export function SourceDrawer({
  citations,
  className,
  ledger,
  marker = "Sources",
  priorityLimit
}: {
  citations: Citation[];
  className?: string;
  ledger?: CitationLedger | undefined;
  marker?: string;
  priorityLimit?: number;
}) {
  const sortedCitations = sortedUniqueCitations(citations);
  const visibleCitations = typeof priorityLimit === "number" ? sortedCitations.slice(0, priorityLimit) : sortedCitations;
  const hiddenCount = Math.max(0, sortedCitations.length - visibleCitations.length);
  const includeDomIds = priorityLimit === undefined;

  return (
    <section className={className ? `cs-source-block ${className}` : "cs-source-block"} aria-label="Sources">
      <div className="cs-section-label" data-state="verified">
        <span className="cs-evidence-dot" aria-hidden="true" />
        <h2 className="cs-section-label-text">{marker}</h2>
      </div>
      {sortedCitations.length > 0 ? (
        <ol className="cs-source-list">
          {visibleCitations.map((citation, index) => (
            <SourceItem
              citation={citation}
              displayIndex={ledger?.get(citation.id)?.displayIndex ?? index + 1}
              includeDomId={includeDomIds}
              key={citation.id}
            />
          ))}
        </ol>
      ) : (
        <p className="cs-empty">No sources on file yet.</p>
      )}
      {hiddenCount > 0 ? <p className="cs-source-more">{hiddenCount} more in the full ledger below.</p> : null}
    </section>
  );
}
