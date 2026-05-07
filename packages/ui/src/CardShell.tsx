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
type SourceClass = "independent" | "reporting" | "company";

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

function classifyRound(round: FundingRound): SourceClass {
  if (!round.amountUsd && !round.leadInvestors.length) {
    return "company";
  }
  if (!round.amountUsd || round.leadInvestors.length === 0) {
    return "reporting";
  }
  return "independent";
}

function citationMix(card: ColdStartCard | PublicCard): { independent: number; reporting: number; company: number; total: number } {
  const counts = { independent: 0, reporting: 0, company: 0, total: 0 };
  for (const citation of card.citations) {
    counts.total += 1;
    const tier = (citation.sourceQuality ?? sourceQualityForSource(citation)).tier;
    if (tier === "independent_technical" || tier === "independent_analysis") {
      counts.independent += 1;
    } else if (tier === "independent_report") {
      counts.reporting += 1;
    } else if (tier === "primary_company" || tier === "press_release") {
      counts.company += 1;
    }
  }
  return counts;
}

function plateInitial(name: string) {
  const first = name.trim().charAt(0).toUpperCase();
  return first || "·";
}

function dropCapAndRest(text: string): { initial: string; rest: string } {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return { initial: "", rest: "" };
  }
  return { initial: trimmed.charAt(0), rest: trimmed.slice(1) };
}

function formatMetricCurrency(value: number | null | undefined): string {
  return typeof value === "number" ? formatCompactCurrency(value) : "—";
}

function formatStatusLabel(value: ColdStartCard["identity"]["status"]) {
  return value.replaceAll("_", " ");
}

function countLabel(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function CardShell({ card, surface }: CardShellProps) {
  const synthesis = surface === "extension" && hasSynthesis(card) ? card.synthesis : undefined;
  const title = card.identity.name.value ?? card.domain;
  const description = card.identity.description?.value ?? null;
  const subtitle = description?.shortDescription ?? card.identity.oneLiner.value ?? "";
  const { initial, rest } = dropCapAndRest(subtitle);
  const rounds = recentFundingRounds(card);
  const roundCitationIds = fundingRoundCitationIds(card);
  const mix = citationMix(card);
  const initialLetter = plateInitial(title);
  const filedDate = formatMediumDate(card.generatedAt);
  const isExtension = surface === "extension";
  const hasRounds = rounds.length > 0;
  const hasSignals = card.signals.length > 0;
  const hasComparables = card.comparables.length > 0;
  const capitalMarker = isExtension && synthesis ? "v" : "iv";

  return (
    <article className="cs-card" data-surface={surface}>
      <div className="cs-card-topbar">
        <div className="cs-card-brand" aria-label="Cold Start">
          <span className="cs-plate" aria-hidden="true">{initialLetter}</span>
          <span className="cs-card-brand-name">COLD START</span>
          {mix.total > 0 ? <span className="cs-card-brand-id">N° {String(mix.total).padStart(isExtension ? 2 : 4, "0")}</span> : null}
        </div>
        <div className="cs-card-topbar-meta">
          {isExtension ? (
            <span>extension</span>
          ) : (
            <>
              <span>coldstart.semitechie.vc / c / {card.slug}</span>
              <span>filed {filedDate}</span>
            </>
          )}
        </div>
      </div>

      <header className="cs-card-header">
        <div className="cs-hero">
          <div className="cs-hero-meta">
            <div className="cs-hero-plate" aria-hidden="true">
              {initialLetter}
              <span className="cs-hero-plate-tag">{mix.total > 0 ? mix.total : "·"}</span>
            </div>
            <span className="cs-hero-kicker">
              {mix.total > 0 ? `Sourced · ${mix.total} citations` : "Sourced"}
            </span>
          </div>

          <h1 className="cs-title" aria-label={title}>
            <span>{title}</span>
            <span aria-hidden="true">.</span>
          </h1>

          {subtitle ? (
            <div className="cs-description" aria-label={subtitle}>
              {initial ? <span className="cs-drop-cap" aria-hidden="true">{initial}</span> : null}
              <p className="cs-subtitle">
                <span className="sr-only">{initial}</span>
                {rest}
              </p>
            </div>
          ) : null}

          <p className="cs-meta-line" aria-label="Card metadata">
            {(() => {
              const hq = card.identity.hq.value;
              const hqText = hq ? hq.city : card.domain;
              const founded = card.identity.foundedYear.value ? `Founded ${card.identity.foundedYear.value}` : null;
              const parts = [hqText, founded, formatStatusLabel(card.identity.status), mix.total > 0 ? "Verified" : null].filter((p): p is string => Boolean(p));
              return parts.map((part, index, arr) => (
                <span key={`${part}-${index}`} className={index === arr.length - 1 ? "cs-meta-verified" : undefined}>
                  {part}
                </span>
              ));
            })()}
          </p>

          {!isExtension && description ? (
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
        </div>
      </header>

      <section className="cs-stats" aria-label="Headline figures">
        <div className="cs-stat">
          <p className="cs-stat-label">i · raised</p>
          <p className="cs-stat-value">{formatMetricCurrency(card.funding.totalRaisedUsd.value)}</p>
          {rounds.length > 0 ? (
            <p className="cs-stat-meta">
              across {countLabel(rounds.length, "round")}
              {mix.total > 0 ? `, ${mix.total} sources` : ""}
            </p>
          ) : null}
        </div>
        <div className="cs-stat">
          <p className="cs-stat-label">ii · last round</p>
          <p className="cs-stat-value">{formatMetricCurrency(card.funding.lastRound.value?.amountUsd ?? null)}</p>
          {card.funding.lastRound.value ? (
            <p className="cs-stat-meta">
              {card.funding.lastRound.value.name}
              {card.funding.lastRound.value.announcedAt ? `, ${formatShortDate(card.funding.lastRound.value.announcedAt)}` : ""}
            </p>
          ) : null}
        </div>
        <div className="cs-stat">
          <p className="cs-stat-label">iii · team</p>
          <p className="cs-stat-value">{card.team.headcount.value ? `~${card.team.headcount.value.value}` : "—"}</p>
          {card.team.headcount.value ? (
            <p className="cs-stat-meta">as of {card.team.headcount.value.asOf}</p>
          ) : mix.independent > 0 ? (
            <p className="cs-stat-meta">{countLabel(mix.independent, "indep. source")}</p>
          ) : null}
        </div>
      </section>

      {synthesis ? <SynthesisSection synthesis={synthesis} marker="iv · investor lens · gated" /> : null}

      {hasRounds ? (
        <section className="cs-section" aria-labelledby="capital-heading">
          <div className="cs-section-kicker">
            <span>{capitalMarker} · capitalisation</span>
            <span className="cs-section-kicker-aside">
              {countLabel(rounds.length, "round")}
              {roundCitationIds.length > 0 ? ` · ${countLabel(roundCitationIds.length, "source")}` : ""}
            </span>
          </div>
          <h2 id="capital-heading">Capitalisation.</h2>
          <div className="cs-rounds-legend" aria-hidden="true">
            <span><i style={{ background: "var(--color-class-independent)" }} />independent</span>
            <span><i style={{ background: "var(--color-class-reporting)" }} />reporting</span>
            <span><i style={{ background: "var(--color-class-company)" }} />company</span>
          </div>
          <div className="cs-rounds" aria-label="Recent funding rounds">
            <ol className="cs-round-list">
              {rounds.map((round) => {
                const klass = classifyRound(round);
                return (
                  <li
                    className="cs-round"
                    data-class={klass}
                    key={`${round.name}-${round.announcedAt ?? "undated"}-${round.amountUsd ?? "undisclosed"}`}
                  >
                    <span className="cs-round-dot" aria-hidden="true" />
                    <p className="cs-round-date">{formatShortDate(round.announcedAt)}</p>
                    <div>
                      <p className="cs-round-name">{round.name}</p>
                      {round.leadInvestors.length > 0 ? (
                        <p className="cs-round-leads">
                          {round.leadInvestors[0]} leading
                          {round.leadInvestors.length > 1 ? `, ${round.leadInvestors.slice(1).join(", ")} following.` : "."}
                        </p>
                      ) : null}
                    </div>
                    <div>
                      <p className="cs-round-amount">{formatCompactCurrency(round.amountUsd)}</p>
                      {round.announcedAt ? (
                        <p className="cs-round-post">{formatShortDate(round.announcedAt)}</p>
                      ) : (
                        <p className="cs-round-post">date undisclosed</p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>
      ) : null}

      {!isExtension && hasSignals ? (
        <section className="cs-section" aria-labelledby="signals-heading">
          <div className="cs-section-kicker">
            <span>v · signals · last 90 days</span>
            <span className="cs-section-kicker-aside">
              {countLabel(card.signals.length, "event")}
            </span>
          </div>
          <h2 id="signals-heading">In motion.</h2>
          <ul className="cs-list">
            {card.signals.map((signal) => {
              const href = safeExternalHref(signal.url);
              return (
                <li className="cs-signal" key={`${signal.url}-${signal.title}`}>
                  <span className="cs-signal-date">{formatShortDate(signal.date)}</span>
                  <div>
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
                      {signal.source} · {signal.category}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {!isExtension && hasComparables ? (
        <section className="cs-section" aria-labelledby="comparables-heading">
          <div className="cs-section-kicker">
            <span>vi · nearest neighbours</span>
          </div>
          <h2 id="comparables-heading">Comparables.</h2>
          <ul className="cs-list">
            {card.comparables.map((comparable) => (
              <li className="cs-comparable" key={`${comparable.domain}-${comparable.name}`}>
                <div>
                  <p className="cs-comparable-title">{comparable.name}</p>
                  <p className="cs-comparable-copy">{comparable.oneLiner ?? comparable.domain}</p>
                </div>
                <span className="cs-comparable-domain">{comparable.domain}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {!isExtension ? (
        <>
          <section className="cs-section" aria-labelledby="identity-heading">
            <div className="cs-section-kicker">
              <span>vii · identity</span>
            </div>
            <h2 id="identity-heading">The basics.</h2>
            <FactRow label="Domain" fact={staticFact(card.domain)} mono />
            <FactRow label="HQ" fact={card.identity.hq} />
            <FactRow label="Founded" fact={card.identity.foundedYear} mono />
            <FactRow label="Founders" fact={card.team.founders} />
            <FactRow label="Key execs" fact={card.team.keyExecs} />
            <FactRow label="Investors" fact={card.funding.investors} />
          </section>

          <SourceDrawer citations={card.citations} marker="viii · sources" />
        </>
      ) : null}

      <footer className="cs-card-footer">
        <div className="cs-footer-mark">
          <span className="cs-plate" aria-hidden="true">{initialLetter}</span>
          <p className="cs-footer-copy">
            {isExtension ? "Sources stay attached to the plate. The investor lens stays cited." : "The investor lens lives behind the Cold Start extension. The public card stays on sourced facts."}
          </p>
        </div>
        <div className="cs-footer-meta">
          <span className="cs-footer-sources">Sources · {mix.total} →</span>
          <span className="cs-footer-cache">{card.cacheStatus} cache · {filedDate}</span>
        </div>
      </footer>
    </article>
  );
}
