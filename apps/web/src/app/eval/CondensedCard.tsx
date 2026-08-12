import type { CondensedView } from "./types";

export function CondensedCard({ view, position }: { view: CondensedView; position: number }) {
  return (
    <article className="eval-condensed">
      <div className="eval-condensed-top">
        <span className="eval-position">{position}</span>
        <div>
          <h2 className="eval-condensed-name">{view.name}</h2>
          <span className="eval-condensed-call">{view.callNumber}</span>
        </div>
      </div>
      {view.stats.length > 0 ? (
        <dl className="eval-condensed-stats">
          {view.stats.map((stat) => (
            <div key={stat.label}>
              <dt>{stat.label}</dt>
              <dd>{stat.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {view.thesis ? <p className="eval-condensed-thesis">{view.thesis}</p> : null}
      {view.bullLead ? (
        <p className="eval-condensed-case">
          <span className="eval-case-label">Bull</span> {view.bullLead}
        </p>
      ) : null}
      {view.bearLead ? (
        <p className="eval-condensed-case">
          <span className="eval-case-label">Bear</span> {view.bearLead}
        </p>
      ) : null}
      {view.comps.length > 0 ? (
        <ul className="eval-condensed-comps">
          {view.comps.map((comp) => (
            <li key={comp}>{comp}</li>
          ))}
        </ul>
      ) : null}
      {view.nextQuestion ? <p className="eval-condensed-next">{view.nextQuestion}</p> : null}
      <p className="eval-condensed-sources">{view.sourceLine}</p>
    </article>
  );
}
