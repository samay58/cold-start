import type { Citation } from "@cold-start/core";
import { sourceQualityForSource } from "@cold-start/core";
import { CitationMarker } from "./CitationMarker";
import { formatMediumDate } from "./FactRow";
import { safeExternalHref } from "./safeExternalHref";
import { sourceDomId } from "./sourceDomId";

function formatSourceType(sourceType: Citation["sourceType"]): string {
  return sourceType.replaceAll("_", " ");
}

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

function sourceMix(citations: Citation[]) {
  return citations.reduce(
    (counts, citation) => {
      counts[sourceClassForCitation(citation)] += 1;
      return counts;
    },
    { independent: 0, reporting: 0, company: 0 } satisfies Record<SourceClass, number>
  );
}

export function SourceDrawer({ citations, marker = "sources" }: { citations: Citation[]; marker?: string }) {
  const sortedCitations = [...citations].sort((left, right) => {
    const leftQuality = left.sourceQuality ?? sourceQualityForSource(left);
    const rightQuality = right.sourceQuality ?? sourceQualityForSource(right);
    return sourceQualitySortRank(rightQuality.tier) - sourceQualitySortRank(leftQuality.tier);
  });
  const mix = sourceMix(citations);

  return (
    <section className="cs-section cs-source-drawer" aria-label="Sources">
      <div className="cs-section-kicker">
        <span>{marker}</span>
        {citations.length > 0 ? <span className="cs-section-kicker-aside">{citations.length} cited</span> : null}
      </div>
      <h2>Sources</h2>
      <p className="cs-source-intro">
        Independent sources rank above reporting. Company pages stay visible, but they carry less weight.
      </p>
      {citations.length > 0 ? (
        <div className="cs-rounds-legend" aria-hidden="true">
          <span><i style={{ background: "var(--color-class-independent)" }} />indep {mix.independent}</span>
          <span><i style={{ background: "var(--color-class-reporting)" }} />reporting {mix.reporting}</span>
          <span><i style={{ background: "var(--color-class-company)" }} />company {mix.company}</span>
        </div>
      ) : null}
      {citations.length > 0 ? (
        <ol className="cs-source-list">
          {sortedCitations.map((citation) => {
            const href = safeExternalHref(citation.url);
            const quality = citation.sourceQuality ?? sourceQualityForSource(citation);
            const sourceClass = sourceClassForCitation(citation);

            return (
              <li className="cs-source-item" data-class={sourceClass} id={sourceDomId(citation.id)} key={citation.id}>
                <div className="cs-source-class">
                  <span className="cs-source-class-dot" aria-hidden="true" />
                  <CitationMarker id={citation.id} />
                </div>
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
