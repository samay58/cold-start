import type { Citation } from "@cold-start/core";
import { sourceQualityForSource, sourceQualityTierRank } from "@cold-start/core";
import { formatMediumDate } from "./FactRow";
import { safeExternalHref } from "./safeExternalHref";
import { sourceDomId } from "./sourceDomId";

type SourceClass = "independent" | "reporting" | "company";

function sourceClassForCitation(citation: Citation): SourceClass {
  const tier = (citation.sourceQuality ?? sourceQualityForSource(citation)).tier;

  if (tier === "independent_technical" || tier === "independent_analysis") {
    return "independent";
  }

  if (tier === "independent_report") {
    return "reporting";
  }

  return "company";
}

function hostnameFor(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function uniqueCitations(citations: Citation[]) {
  const seen = new Set<string>();

  return citations.filter((citation) => {
    if (seen.has(citation.id)) {
      return false;
    }

    seen.add(citation.id);
    return true;
  });
}

function SourceItem({ citation, includeDomId }: { citation: Citation; includeDomId: boolean }) {
  const href = safeExternalHref(citation.url);
  const sourceClass = sourceClassForCitation(citation);
  const host = hostnameFor(citation.url);
  const fetched = formatMediumDate(citation.fetchedAt);

  return (
    <li className="cs-source-item" data-class={sourceClass} {...(includeDomId ? { id: sourceDomId(citation.id) } : {})}>
      <span className="cs-source-marker">[{citation.id}]</span>
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
  marker = "Sources",
  priorityLimit
}: {
  citations: Citation[];
  className?: string;
  marker?: string;
  priorityLimit?: number;
}) {
  const sortedCitations = uniqueCitations([...citations].sort((left, right) => {
    const leftQuality = left.sourceQuality ?? sourceQualityForSource(left);
    const rightQuality = right.sourceQuality ?? sourceQualityForSource(right);
    return sourceQualityTierRank(rightQuality.tier) - sourceQualityTierRank(leftQuality.tier);
  }));
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
          {visibleCitations.map((citation) => <SourceItem citation={citation} includeDomId={includeDomIds} key={citation.id} />)}
        </ol>
      ) : (
        <p className="cs-empty">No sources on file yet.</p>
      )}
      {hiddenCount > 0 ? <p className="cs-source-more">{hiddenCount} more in the full ledger below.</p> : null}
    </section>
  );
}
