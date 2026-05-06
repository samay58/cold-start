import type { Citation } from "@cold-start/core";
import { CitationMarker } from "./CitationMarker";

function formatSourceType(sourceType: Citation["sourceType"]): string {
  return sourceType.replaceAll("_", " ");
}

export function SourceDrawer({ citations }: { citations: Citation[] }) {
  return (
    <section className="cs-section cs-source-drawer" aria-label="Sources">
      <h2>Sources</h2>
      {citations.length > 0 ? (
        <ol className="cs-source-list">
          {citations.map((citation) => (
            <li className="cs-source-item" id={`source-${citation.id}`} key={citation.id}>
              <CitationMarker id={citation.id} />
              <div>
                <a href={citation.url} target="_blank" rel="noreferrer">
                  {citation.title}
                </a>
                <p className="cs-source-meta">
                  {formatSourceType(citation.sourceType)} · fetched {citation.fetchedAt.slice(0, 10)}
                </p>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="cs-empty">No public sources are attached to this card.</p>
      )}
    </section>
  );
}
