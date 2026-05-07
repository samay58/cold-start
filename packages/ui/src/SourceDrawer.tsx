import type { Citation } from "@cold-start/core";
import { sourceQualityForSource } from "@cold-start/core";
import { CitationMarker } from "./CitationMarker";
import { formatMediumDate } from "./FactRow";
import { safeExternalHref } from "./safeExternalHref";
import { sourceDomId } from "./sourceDomId";

function formatSourceType(sourceType: Citation["sourceType"]): string {
  return sourceType.replaceAll("_", " ");
}

export function SourceDrawer({ citations }: { citations: Citation[] }) {
  const sortedCitations = [...citations].sort((left, right) => {
    const leftQuality = left.sourceQuality ?? sourceQualityForSource(left);
    const rightQuality = right.sourceQuality ?? sourceQualityForSource(right);
    return sourceQualitySortRank(rightQuality.tier) - sourceQualitySortRank(leftQuality.tier);
  });

  return (
    <section className="cs-section cs-source-drawer" aria-label="Sources">
      <h2>Sources</h2>
      {citations.length > 0 ? (
        <ol className="cs-source-list">
          {sortedCitations.map((citation) => {
            const href = safeExternalHref(citation.url);
            const quality = citation.sourceQuality ?? sourceQualityForSource(citation);

            return (
              <li className="cs-source-item" id={sourceDomId(citation.id)} key={citation.id}>
                <CitationMarker id={citation.id} />
                <div>
                  {href ? (
                    <a href={href} target="_blank" rel="noreferrer">
                      {citation.title}
                    </a>
                  ) : (
                    <span>{citation.title}</span>
                  )}
                  <p className="cs-source-meta">
                    <span className="cs-source-quality">{quality.label}</span> · {formatSourceType(citation.sourceType)} · fetched {formatMediumDate(citation.fetchedAt)}
                  </p>
                  <p className="cs-source-rationale">{quality.rationale}</p>
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="cs-empty">No public sources are attached to this card.</p>
      )}
    </section>
  );
}

function sourceQualitySortRank(tier: NonNullable<Citation["sourceQuality"]>["tier"]) {
  const rank: Record<NonNullable<Citation["sourceQuality"]>["tier"], number> = {
    independent_technical: 7,
    independent_analysis: 6,
    independent_report: 5,
    primary_company: 4,
    press_release: 2,
    enrichment: 1,
    unknown: 0,
  };

  return rank[tier];
}
