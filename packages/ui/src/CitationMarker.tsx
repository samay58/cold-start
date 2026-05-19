import { sourceDomId } from "./sourceDomId";

export function CitationMarker({ id }: { id: string }) {
  return (
    <a className="cs-citation" href={`#${sourceDomId(id)}`} aria-label={`Source ${id}`}>
      <span className="cs-citation-label">[{id}]</span>
      <svg
        aria-hidden="true"
        className="cs-citation-underline"
        fill="none"
        preserveAspectRatio="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        viewBox="0 0 60 18"
      >
        <path
          d="M1 13C6 9 10 8 13 9C16 10 11 15 15 14C20 13 27 7 31 7C35 7 30 14 34 14C39 14 47 8 51 8C55 8 56 11 59 10"
          pathLength="1"
          strokeDasharray="1 2"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <span className="cs-citation-signal" aria-hidden="true" />
    </a>
  );
}
