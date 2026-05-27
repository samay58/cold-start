import type { Citation } from "@cold-start/core";
import { sourceQualityForSource } from "@cold-start/core";
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

function sourceQualitySortRank(tier: NonNullable<Citation["sourceQuality"]>["tier"]) {
  const rank: Record<NonNullable<Citation["sourceQuality"]>["tier"], number> = {
    independent_technical: 7,
    independent_analysis: 6,
    independent_report: 5,
    primary_company: 4,
    press_release: 2,
    enrichment: 1,
    unknown: 0
  };

  return rank[tier];
}

function hostnameFor(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function SourceDrawer({ citations, marker = "Sources" }: { citations: Citation[]; marker?: string }) {
  const sortedCitations = [...citations].sort((left, right) => {
    const leftQuality = left.sourceQuality ?? sourceQualityForSource(left);
    const rightQuality = right.sourceQuality ?? sourceQualityForSource(right);
    return sourceQualitySortRank(rightQuality.tier) - sourceQualitySortRank(leftQuality.tier);
  });

  return (
    <section className="cs-source-block" aria-label="Sources">
      <div className="cs-section-label" data-state="verified">
        <span className="cs-evidence-dot" aria-hidden="true" />
        <h2 className="cs-section-label-text">{marker}</h2>
      </div>
      {citations.length > 0 ? (
        <ol className="cs-source-list">
          {sortedCitations.map((citation) => {
            const href = safeExternalHref(citation.url);
            const sourceClass = sourceClassForCitation(citation);
            const host = hostnameFor(citation.url);
            const fetched = formatMediumDate(citation.fetchedAt);
            return (
              <li className="cs-source-item" data-class={sourceClass} id={sourceDomId(citation.id)} key={citation.id}>
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
          })}
        </ol>
      ) : (
        <p className="cs-empty">NO SOURCES ATTACHED.</p>
      )}
    </section>
  );
}
