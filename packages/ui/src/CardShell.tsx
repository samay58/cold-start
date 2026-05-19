import type { ColdStartCard, ResolvedFact } from "@cold-start/core";
import { sourceQualityForSource } from "@cold-start/core";
import type { ReactNode } from "react";
import { CitationMarker } from "./CitationMarker";
import { FactRow, formatCompactCurrency, formatMediumDate, formatShortDate } from "./FactRow";
import { safeExternalHref } from "./safeExternalHref";
import { SourceDrawer } from "./SourceDrawer";

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

function formatMetricCurrency(value: number | null | undefined): string {
  return typeof value === "number" ? formatCompactCurrency(value) : "Unknown";
}

function formatStatusLabel(value: ColdStartCard["identity"]["status"]) {
  return value.replaceAll("_", " ");
}

function formatCacheStatus(value: ColdStartCard["cacheStatus"]) {
  if (value === "hit") {
    return "cached";
  }
  if (value === "partial") {
    return "partial";
  }
  return "new";
}

function countLabel(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function formatAppCurrency(value: number | null | undefined): string {
  return typeof value === "number" ? formatCompactCurrency(value) : "Not found";
}

function formatAppDate(value: string | null | undefined): string {
  return value ? formatShortDate(value) : "Not found";
}

function factStateLabel(fact: ResolvedFact<unknown> | undefined, missing = "Not found") {
  if (!fact || fact.value === null) {
    return missing;
  }

  if (fact.status === "inferred" || fact.confidence === "low") {
    return "single source";
  }

  if (fact.status === "mixed") {
    return "mixed";
  }

  return "verified";
}

function hasPeople(fact: ColdStartCard["team"]["founders"] | ColdStartCard["team"]["keyExecs"]) {
  return Array.isArray(fact.value) && fact.value.length > 0;
}

function sourceClassForCitation(citation: ColdStartCard["citations"][number]): SourceClass {
  const tier = (citation.sourceQuality ?? sourceQualityForSource(citation)).tier;
  if (tier === "independent_technical" || tier === "independent_analysis") {
    return "independent";
  }
  if (tier === "independent_report") {
    return "reporting";
  }
  return "company";
}

function sortedCitations(card: ColdStartCard | PublicCard) {
  const rank: Record<NonNullable<ColdStartCard["citations"][number]["sourceQuality"]>["tier"], number> = {
    independent_technical: 7,
    independent_analysis: 6,
    independent_report: 5,
    primary_company: 4,
    press_release: 2,
    enrichment: 1,
    unknown: 0
  };

  return [...card.citations].sort((left, right) => {
    const leftQuality = left.sourceQuality ?? sourceQualityForSource(left);
    const rightQuality = right.sourceQuality ?? sourceQualityForSource(right);
    return rank[rightQuality.tier] - rank[leftQuality.tier];
  });
}

function ExtensionMetric({
  label,
  meta,
  value
}: {
  label: string;
  meta?: string | undefined;
  value: string;
}) {
  return (
    <div className="cs-app-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      {meta ? <p>{meta}</p> : null}
    </div>
  );
}

function ExtensionRow({
  label,
  value
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="cs-app-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function ExtensionDetail({
  children,
  count,
  defaultOpen = false,
  title
}: {
  children: ReactNode;
  count?: string;
  defaultOpen?: boolean;
  title: string;
}) {
  return (
    <details className="cs-app-detail" open={defaultOpen}>
      <summary>
        <span>{title}</span>
        {count ? <span>{count}</span> : null}
      </summary>
      <div className="cs-app-detail-body">{children}</div>
    </details>
  );
}

function SourceMix({ mix }: { mix: ReturnType<typeof citationMix> }) {
  if (mix.total === 0) {
    return <span className="cs-app-source-pill">No sources</span>;
  }

  return (
    <div className="cs-app-source-mix" aria-label={`${mix.total} sources`}>
      {mix.independent > 0 ? <span data-class="independent" style={{ flexGrow: mix.independent }} /> : null}
      {mix.reporting > 0 ? <span data-class="reporting" style={{ flexGrow: mix.reporting }} /> : null}
      {mix.company > 0 ? <span data-class="company" style={{ flexGrow: mix.company }} /> : null}
      <strong>{mix.total}</strong>
    </div>
  );
}

function ExtensionProfile({ card }: { card: ColdStartCard | PublicCard }) {
  const synthesis = hasSynthesis(card) ? card.synthesis : undefined;
  const title = card.identity.name.value ?? card.domain;
  const description = card.identity.description?.value ?? null;
  const subtitle = description?.shortDescription ?? card.identity.oneLiner.value ?? "";
  const rounds = recentFundingRounds(card);
  const mix = citationMix(card);
  const citations = sortedCitations(card);
  const initialLetter = plateInitial(title);
  const hq = card.identity.hq.value;
  const headcount = card.team.headcount.value;
  const website = card.identity.websiteUrl?.value ?? `https://${card.domain}`;
  const teamVisible = hasPeople(card.team.founders) || hasPeople(card.team.keyExecs) || Boolean(headcount);
  const hasSignals = card.signals.length > 0;
  const hasComparables = card.comparables.length > 0;
  const hasCompanyRows = Boolean(
    card.identity.websiteUrl?.value ||
      card.identity.linkedinUrl?.value ||
      description?.concept ||
      description?.serves ||
      description?.mechanism ||
      hq ||
      card.identity.foundedYear.value
  );

  return (
    <article className="cs-app-card" data-surface="extension">
      <header className="cs-app-header">
        <span className="cs-app-icon" aria-hidden="true">{initialLetter}</span>
        <div>
          <div className="cs-app-kicker">
            <span>{card.domain}</span>
            <span>{formatCacheStatus(card.cacheStatus)}</span>
          </div>
          <h1 aria-label={title}>{title}</h1>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
      </header>

      <div className="cs-app-statusbar">
        <SourceMix mix={mix} />
        <span>{factStateLabel(card.identity.websiteUrl, "domain only")}</span>
        <span>{formatStatusLabel(card.identity.status)}</span>
        <span>{formatMediumDate(card.generatedAt)}</span>
      </div>

      <section className="cs-app-metrics" aria-label="Headline figures">
        <ExtensionMetric
          label="Raised"
          meta={rounds.length > 0 ? countLabel(rounds.length, "round") : undefined}
          value={formatAppCurrency(card.funding.totalRaisedUsd.value)}
        />
        <ExtensionMetric
          label="Last round"
          meta={card.funding.lastRound.value?.name}
          value={formatAppCurrency(card.funding.lastRound.value?.amountUsd)}
        />
        <ExtensionMetric
          label="Headcount"
          meta={headcount?.asOf ? `${formatShortDate(headcount.asOf)} · ${factStateLabel(card.team.headcount)}` : factStateLabel(card.team.headcount)}
          value={headcount ? `~${headcount.value}` : "Not found"}
        />
      </section>

      {synthesis ? (
        <section className="cs-app-lens" aria-label="Investor lens">
          <div className="cs-app-section-head">
            <span>Investor lens</span>
            <span>Extension</span>
          </div>
          <p className="cs-app-lens-copy">{synthesis.whyItMatters.text}</p>

          <div className="cs-app-lens-grid">
            <div>
              <h2>Supported</h2>
              {synthesis.bullCase.length > 0 ? (
                <ul>
                  {synthesis.bullCase.map((item) => (
                    <li key={item.text}>{item.text}</li>
                  ))}
                </ul>
              ) : (
                <p>No cited support survived verification.</p>
              )}
            </div>
            <div>
              <h2>Open questions</h2>
              {synthesis.openQuestions.length > 0 ? (
                <ul>
                  {synthesis.openQuestions.map((question) => (
                    <li key={question}>{question}</li>
                  ))}
                </ul>
              ) : (
                <p>No open questions surfaced.</p>
              )}
            </div>
          </div>
        </section>
      ) : null}

      {hasCompanyRows ? (
        <ExtensionDetail count="Profile" defaultOpen title="Company">
          <dl className="cs-app-rows">
            <ExtensionRow label="Website" value={website} />
            {card.identity.linkedinUrl?.value ? <ExtensionRow label="LinkedIn" value={card.identity.linkedinUrl.value} /> : null}
            {description?.concept ? <ExtensionRow label="Concept" value={description.concept} /> : null}
            {description?.serves ? <ExtensionRow label="Serves" value={description.serves} /> : null}
            {description?.mechanism ? <ExtensionRow label="How" value={description.mechanism} /> : null}
            <ExtensionRow label="HQ" value={hq ? `${hq.city}, ${hq.country}` : "Not found"} />
            <ExtensionRow label="Founded" value={card.identity.foundedYear.value ?? "Not found"} />
          </dl>
        </ExtensionDetail>
      ) : null}

      {rounds.length > 0 ? (
        <ExtensionDetail count={countLabel(rounds.length, "round")} title="Funding">
          <ol className="cs-app-round-list">
            {rounds.map((round) => (
              <li key={`${round.name}-${round.announcedAt ?? "undated"}-${round.amountUsd ?? "undisclosed"}`}>
                <span data-class={classifyRound(round)} />
                <div>
                  <strong>{round.name}</strong>
                  <p>{round.leadInvestors.length > 0 ? round.leadInvestors.join(", ") : "Lead not found"}</p>
                </div>
                <div>
                  <strong>{formatAppCurrency(round.amountUsd)}</strong>
                  <p>{formatAppDate(round.announcedAt)}</p>
                </div>
              </li>
            ))}
          </ol>
        </ExtensionDetail>
      ) : null}

      {teamVisible ? (
        <ExtensionDetail count="People" title="Management team">
          <dl className="cs-app-rows">
            {hasPeople(card.team.founders) ? (
              <ExtensionRow label="Founders" value={card.team.founders.value?.map((person) => person.name).join(", ")} />
            ) : null}
            {hasPeople(card.team.keyExecs) ? (
              <ExtensionRow label="Key execs" value={card.team.keyExecs.value?.map((person) => person.name).join(", ")} />
            ) : null}
            {headcount ? <ExtensionRow label="Headcount" value={`${headcount.value} as of ${formatShortDate(headcount.asOf)}`} /> : null}
          </dl>
        </ExtensionDetail>
      ) : null}

      {hasSignals ? (
        <ExtensionDetail count={countLabel(card.signals.length, "signal")} title="Signals">
          <ul className="cs-app-list">
            {card.signals.slice(0, 4).map((signal) => {
              const href = safeExternalHref(signal.url);
              return (
                <li key={`${signal.url}-${signal.title}`}>
                  <span>{formatShortDate(signal.date)}</span>
                  <div>
                    {href ? (
                      <a href={href} target="_blank" rel="noreferrer">{signal.title}</a>
                    ) : (
                      <strong>{signal.title}</strong>
                    )}
                    <p>{signal.source} · {signal.category}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </ExtensionDetail>
      ) : null}

      {hasComparables ? (
        <ExtensionDetail count={countLabel(card.comparables.length, "company", "companies")} title="Comparables">
          <ul className="cs-app-comparables">
            {card.comparables.slice(0, 4).map((comparable) => (
              <li key={`${comparable.domain}-${comparable.name}`}>
                <div>
                  <strong>{comparable.name}</strong>
                  <p>{comparable.basis ?? comparable.oneLiner}</p>
                </div>
                <span>{comparable.domain}</span>
              </li>
            ))}
          </ul>
        </ExtensionDetail>
      ) : null}

      {citations.length > 0 ? (
        <ExtensionDetail count={countLabel(citations.length, "source")} title="Sources">
          <ol className="cs-app-sources">
            {citations.slice(0, 6).map((citation) => {
              const href = safeExternalHref(citation.url);
              const quality = citation.sourceQuality ?? sourceQualityForSource(citation);
              return (
                <li data-class={sourceClassForCitation(citation)} key={citation.id}>
                  <span aria-hidden="true" />
                  <div>
                    {href ? (
                      <a href={href} target="_blank" rel="noreferrer">{citation.title}</a>
                    ) : (
                      <strong>{citation.title}</strong>
                    )}
                    <p>{quality.label} · {citation.sourceType.replaceAll("_", " ")}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </ExtensionDetail>
      ) : null}
    </article>
  );
}

export function CardShell({ card, surface }: CardShellProps) {
  if (surface === "extension") {
    return <ExtensionProfile card={card} />;
  }

  const title = card.identity.name.value ?? card.domain;
  const description = card.identity.description?.value ?? null;
  const subtitle = description?.shortDescription ?? card.identity.oneLiner.value ?? "";
  const rounds = recentFundingRounds(card);
  const roundCitationIds = fundingRoundCitationIds(card);
  const mix = citationMix(card);
  const initialLetter = plateInitial(title);
  const filedDate = formatMediumDate(card.generatedAt);
  const hasRounds = rounds.length > 0;
  const hasSignals = card.signals.length > 0;
  const hasComparables = card.comparables.length > 0;

  return (
    <article className="cs-card" data-surface={surface}>
      <div className="cs-card-topbar">
        <div className="cs-card-brand" aria-label="Cold Start">
          <span className="cs-plate" aria-hidden="true">{initialLetter}</span>
          <span className="cs-card-brand-name">COLD START</span>
          {mix.total > 0 ? <span className="cs-card-brand-id">N° {String(mix.total).padStart(4, "0")}</span> : null}
        </div>
        <div className="cs-card-topbar-meta">
          <span>filed {filedDate}</span>
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
              <p className="cs-subtitle">{subtitle}</p>
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
          <p className="cs-stat-value">{card.team.headcount.value ? `~${card.team.headcount.value.value}` : "Unknown"}</p>
          {card.team.headcount.value ? (
            <p className="cs-stat-meta">as of {card.team.headcount.value.asOf}</p>
          ) : mix.independent > 0 ? (
            <p className="cs-stat-meta">{countLabel(mix.independent, "indep. source")}</p>
          ) : null}
        </div>
      </section>

      {hasRounds ? (
        <section className="cs-section" aria-labelledby="capital-heading">
          <div className="cs-section-kicker">
            <span>iv · capitalisation</span>
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
                          {round.leadInvestors.join(", ")}
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

      {hasSignals ? (
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

      {hasComparables ? (
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
                  <p className="cs-comparable-copy">
                    {comparable.oneLiner ?? comparable.domain}
                    {comparable.citationIds?.map((id) => (
                      <CitationMarker id={id} key={id} />
                    ))}
                  </p>
                  {comparable.basis ? <p className="cs-signal-meta">{comparable.basis}</p> : null}
                </div>
                <span className="cs-comparable-domain">{comparable.domain}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="cs-section" aria-labelledby="identity-heading">
        <div className="cs-section-kicker">
          <span>vii · identity</span>
        </div>
        <h2 id="identity-heading">The basics.</h2>
        <FactRow label="Domain" fact={staticFact(card.domain)} mono />
        {card.identity.websiteUrl ? <FactRow label="Website" fact={card.identity.websiteUrl} mono /> : null}
        {card.identity.linkedinUrl ? <FactRow label="LinkedIn" fact={card.identity.linkedinUrl} mono /> : null}
        <FactRow label="HQ" fact={card.identity.hq} />
        <FactRow label="Founded" fact={card.identity.foundedYear} mono />
        <FactRow label="Founders" fact={card.team.founders} />
        <FactRow label="Key execs" fact={card.team.keyExecs} />
        <FactRow label="Investors" fact={card.funding.investors} />
      </section>

      <SourceDrawer citations={card.citations} marker="viii · sources" />

      <footer className="cs-card-footer">
        <div className="cs-footer-mark">
          <span className="cs-plate" aria-hidden="true">{initialLetter}</span>
          <p className="cs-footer-copy">
            The investor lens lives behind the Cold Start extension. The public card stays on sourced facts.
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
