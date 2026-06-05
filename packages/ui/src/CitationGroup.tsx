import { sourceDomId } from "./sourceDomId";

function uniqueCitationIds(ids: string[]) {
  return Array.from(new Set(ids.filter((id) => id.trim().length > 0)));
}

export function CitationGroup({
  citationIds,
  maxVisible = 1
}: {
  citationIds: string[];
  maxVisible?: number;
}) {
  const ids = uniqueCitationIds(citationIds);
  const visible = ids.slice(0, Math.max(1, maxVisible));
  const hiddenCount = Math.max(0, ids.length - visible.length);
  const firstHidden = ids[visible.length] ?? ids[0]!;

  if (ids.length === 0) {
    return null;
  }

  return (
    <span className="cs-citation-group" aria-label={`${ids.length} ${ids.length === 1 ? "source" : "sources"}`}>
      {visible.map((id) => (
        <a className="cs-citation" href={`#${sourceDomId(id)}`} aria-label={`Source ${id}`} key={id}>
          [{id}]
        </a>
      ))}
      {hiddenCount > 0 ? (
        <a className="cs-citation cs-citation-more" href={`#${sourceDomId(firstHidden)}`} aria-label={`${hiddenCount} more ${hiddenCount === 1 ? "source" : "sources"}`}>
          +{hiddenCount}
        </a>
      ) : null}
    </span>
  );
}
