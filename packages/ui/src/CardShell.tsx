import type { ColdStartCard, ResolvedFact } from "@cold-start/core";
import { sourceQualityForSource } from "@cold-start/core";
import { CitationMarker } from "./CitationMarker";
import { FactRow, formatCompactCurrency, formatMediumDate, formatShortDate } from "./FactRow";
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

type FundingRound = NonNullable<ColdStartCard["funding"]["lastRound"]["value"]>;

function recentFundingRounds(card: ColdStartCard | PublicCard): FundingRound[] {
  const rounds = card.funding.rounds?.value;
  if (rounds && rounds.length > 0) {
    return rounds.slice(0, 4);
  }

  return card.funding.lastRound.value ? [card.funding.lastRound.value] : [];
}

function fundingRoundCitationIds(card: ColdStartCard | PublicCard) {
  const rounds = card.funding.rounds;
  if (rounds?.value && rounds.value.length > 0) {
    return rounds.citationIds;
  }

  return card.funding.lastRound.citationIds;
}

function cardDescription(card: ColdStartCard | PublicCard) {
  return card.identity.description?.value ?? null;
}

function provenanceCaption(card: ColdStartCard | PublicCard): string | null {
  if (card.citations.length === 0) {
    return null;
  }

  const counts = { independent: 0, primary: 0, pr: 0, enrichment: 0 };
  for (const citation of card.citations) {
    const tier = (citation.sourceQuality ?? sourceQualityForSource(citation)).tier;
    if (tier === "independent_technical" || tier === "independent_analysis" || tier === "independent_report") {
      counts.independent += 1;
    } else if (tier === "primary_company") {
      counts.primary += 1;
    } else if (tier === "press_release") {
      counts.pr += 1;
    } else if (tier === "enrichment") {
      counts.enrichment += 1;
    }
  }

  const parts: string[] = [];
  if (counts.independent > 0) parts.push(`${counts.independent} independent`);
  if (counts.primary > 0) parts.push(`${counts.primary} primary`);
  if (counts.pr > 0) parts.push(`${counts.pr} press`);
  if (counts.enrichment > 0) parts.push(`${counts.enrichment} enrichment`);

  return parts.length > 0 ? parts.join(" · ") : null;
}

export function CardShell({ card, surface }: CardShellProps) {
  const synthesis = surface === "extension" && hasSynthesis(card) ? card.synthesis : undefined;
  const title = card.identity.name.value ?? card.domain;
  const description = cardDescription(card);
  const subtitle = description?.shortDescription ?? card.identity.oneLiner.value ?? "No cited description found.";
  const rounds = recentFundingRounds(card);
  const roundCitationIds = fundingRoundCitationIds(card);
  const provenance = provenanceCaption(card);
  const metaParts = [card.domain, card.identity.status, `${card.cacheStatus} cache`, `generated ${formatMediumDate(card.generatedAt)}`];

  return (
    <article className="cs-card" data-surface={surface}>
      <header className="cs-card-header">
        <div className="cs-card-brand" aria-label="Cold Start">
          <span className="cs-card-brand-mark" aria-hidden="true">§</span>
          <span>Cold Start</span>
        </div>
        <h1 className="cs-title">{title}</h1>
        <p className="cs-subtitle">{subtitle}</p>
        {provenance ? <p className="cs-provenance">{provenance}</p> : null}
        {description ? (
          <dl className="cs-description-grid" aria-label="Company description">
            {description.concept ? (
              <div>
                <dt>Concept</dt>
                <dd>{description.concept}</dd>
              </div>
            ) : null}
            {description.serves ? (
              <div>
                <dt>Serves</dt>
                <dd>{description.serves}</dd>
              </div>
            ) : null}
            {description.mechanism ? (
              <div>
                <dt>Mechanism</dt>
                <dd>{description.mechanism}</dd>
              </div>
            ) : null}
          </dl>
        ) : null}
        <p className="cs-meta-line" aria-label="Card metadata">{metaParts.join(" · ")}</p>
      </header>

      {synthesis ? <SynthesisSection synthesis={synthesis} /> : null}

      <section className="cs-section" aria-labelledby="identity-heading">
        <h2 id="identity-heading">Identity</h2>
        <FactRow label="Domain" fact={staticFact(card.domain)} mono />
        <FactRow label="HQ" fact={card.identity.hq} />
        <FactRow label="Founded" fact={card.identity.foundedYear} mono />
      </section>

      <section className="cs-section" aria-labelledby="funding-heading">
        <h2 id="funding-heading">Funding</h2>
        <FactRow label="Total raised" fact={card.funding.totalRaisedUsd} mono format={formatCompactCurrency} />
        <div className="cs-rounds" aria-label="Recent funding rounds">
          <div className="cs-rounds-heading">
            <h3>Recent rounds</h3>
            {roundCitationIds.map((id) => (
              <CitationMarker id={id} key={id} />
            ))}
          </div>
          {rounds.length > 0 ? (
            <ol className="cs-round-list">
              {rounds.map((round) => (
                <li className="cs-round" key={`${round.name}-${round.announcedAt ?? "undated"}-${round.amountUsd ?? "undisclosed"}`}>
                  <div>
                    <p className="cs-round-name">{round.name}</p>
                    {round.leadInvestors.length > 0 ? (
                      <p className="cs-round-leads">Led by {round.leadInvestors.join(", ")}</p>
                    ) : null}
                    {roundCitationIds.length > 0 ? (
                      <p className="cs-round-evidence">
                        Evidence{" "}
                        {roundCitationIds.map((id) => (
                          <CitationMarker id={id} key={id} />
                        ))}
                      </p>
                    ) : null}
                  </div>
                  <p className="cs-round-amount">{formatCompactCurrency(round.amountUsd)}</p>
                  <p className="cs-round-date">{formatShortDate(round.announcedAt)}</p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="cs-empty">No cited funding rounds found.</p>
          )}
        </div>
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
                    {signal.source} · {signal.category} · {formatShortDate(signal.date)}
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

      <SourceDrawer citations={card.citations} />
    </article>
  );
}
