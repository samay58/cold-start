export function CitationMarker({ id }: { id: string }) {
  return (
    <a className="cs-citation" href={`#source-${id}`} aria-label={`Source ${id}`}>
      [{id}]
    </a>
  );
}
