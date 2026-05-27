import { sourceDomId } from "./sourceDomId";

export function CitationMarker({ id }: { id: string }) {
  return (
    <a className="cs-citation" href={`#${sourceDomId(id)}`} aria-label={`Source ${id}`}>
      [{id}]
    </a>
  );
}
