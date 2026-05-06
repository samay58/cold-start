import type { ColdStartCard, ResolvedFact } from "@cold-start/core";
import { CitationMarker } from "./CitationMarker";
import { FactRow } from "./FactRow";
import { safeExternalHref } from "./safeExternalHref";
import { SourceDrawer } from "./SourceDrawer";
import { SynthesisSection } from "./SynthesisSection";

type PublicCard = Omit<ColdStartCard, "synthesis">;
type CardShellProps = {
  card: ColdStartCard | PublicCard;
  surface: "web" | "extension";
};

function staticFact<T>(value: T): ResolvedFact<T> {
  return {
    value,
    status: "verified",
    confidence: "high",
    citationIds: []
  };
}

function hasSynthesis(card: ColdStartCard | PublicCard): card is ColdStartCard {
  return "synthesis" in card && card.synthesis !== undefined;
}

export function CardShell({ card, surface }: CardShellProps) {
  const synthesis = surface === "extension" && hasSynthesis(card) ? card.synthesis : undefined;
  const title = card.identity.name.value ?? card.domain;
  const subtitle = card.identity.oneLiner.value ?? "No cited one-liner found.";

  return (
    <article className="cs-card" data-surface={surface}>
      <header className="cs-card-header">
        <h1 className="cs-title">{title}</h1>
        <p className="cs-subtitle">{subtitle}</p>
        <ul className="cs-meta" aria-label="Card metadata">
          <li>{card.domain}</li>
          <li>{card.identity.status}</li>
          <li>{card.cacheStatus} cache</li>
          <li>generated {card.generatedAt.slice(0, 10)}</li>
        </ul>
      </header>

      <section className="cs-section" aria-labelledby="identity-heading">
        <h2 id="identity-heading">Identity</h2>
        <FactRow label="Domain" fact={staticFact(card.domain)} mono />
        <FactRow label="HQ" fact={card.identity.hq} />
        <FactRow label="Founded" fact={card.identity.foundedYear} mono />
      </section>

      <section className="cs-section" aria-labelledby="funding-heading">
        <h2 id="funding-heading">Funding</h2>
        <FactRow label="Total raised" fact={card.funding.totalRaisedUsd} mono />
        <FactRow label="Last round" fact={card.funding.lastRound} />
        <FactRow label="Investors" fact={card.funding.investors} />
      </section>

      <section className="cs-section" aria-labelledby="team-heading">
        <h2 id="team-heading">Team</h2>
        <FactRow label="Founders" fact={card.team.founders} />
        <FactRow label="Key execs" fact={card.team.keyExecs} />
        <FactRow label="Headcount" fact={card.team.headcount} mono />
      </section>

      <section className="cs-section" aria-labelledby="signals-heading">
        <h2 id="signals-heading">Signals</h2>
        {card.signals.length > 0 ? (
          <ul className="cs-list">
            {card.signals.map((signal) => {
              const href = safeExternalHref(signal.url);

              return (
                <li className="cs-signal" key={`${signal.url}-${signal.title}`}>
                  <p className="cs-signal-title">
                    {href ? (
                      <a href={href} target="_blank" rel="noreferrer">
                        {signal.title}
                      </a>
                    ) : (
                      <span>{signal.title}</span>
                    )}
                    {signal.citationIds.map((id) => (
                      <CitationMarker id={id} key={id} />
                    ))}
                  </p>
                  <p className="cs-signal-meta">
                    {signal.source} · {signal.category} · {signal.date}
                  </p>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="cs-empty">No cited public signals found.</p>
        )}
      </section>

      <section className="cs-section" aria-labelledby="comparables-heading">
        <h2 id="comparables-heading">Comparables</h2>
        {card.comparables.length > 0 ? (
          <ul className="cs-list">
            {card.comparables.map((comparable) => (
              <li className="cs-comparable" key={`${comparable.domain}-${comparable.name}`}>
                <p className="cs-comparable-title">{comparable.name}</p>
                <p className="cs-comparable-copy">
                  {comparable.domain} · {comparable.oneLiner}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="cs-empty">No comparable companies found in public sources.</p>
        )}
      </section>

      {synthesis ? <SynthesisSection synthesis={synthesis} /> : null}
      <SourceDrawer citations={card.citations} />
    </article>
  );
}
