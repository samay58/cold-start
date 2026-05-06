import type { Citation } from "@cold-start/core";
import { CitationMarker } from "./CitationMarker";
import { safeExternalHref } from "./safeExternalHref";
import { sourceDomId } from "./sourceDomId";

function formatSourceType(sourceType: Citation["sourceType"]): string {
  return sourceType.replaceAll("_", " ");
}

export function SourceDrawer({ citations }: { citations: Citation[] }) {
  return (
    <section className="cs-section cs-source-drawer" aria-label="Sources">
      <h2>Sources</h2>
      {citations.length > 0 ? (
        <ol className="cs-source-list">
          {citations.map((citation) => {
            const href = safeExternalHref(citation.url);

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
                    {formatSourceType(citation.sourceType)} · fetched {citation.fetchedAt.slice(0, 10)}
                  </p>
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
