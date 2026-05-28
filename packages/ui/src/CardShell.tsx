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

type EvidenceState = "verified" | "reported" | "company" | "conflict" | "unknown";

function evidenceStateForFact(fact: ResolvedFact<unknown> | undefined): EvidenceState {
  if (!fact || fact.value === null) {
    return "unknown";
  }

  if (fact.status === "mixed") {
    return "conflict";
  }

  if (fact.status === "inferred" || fact.confidence === "low") {
    return "company";
  }

  if (fact.confidence === "medium") {
    return "reported";
  }

  return "verified";
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
            {description?.serves ? <ExtensionRow label="Who buys" value={description.serves} /> : null}
            {description?.mechanism ? <ExtensionRow label="Product" value={description.mechanism} /> : null}
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
        <ExtensionDetail count={countLabel(card.signals.length, "signal")} title="Traction">
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

function SectionLabel({ state = "verified", text }: { state?: EvidenceState; text: string }) {
  return (
    <div className="cs-section-label" data-state={state}>
      <span className="cs-evidence-dot" aria-hidden="true" />
      <h2 className="cs-section-label-text">{text}</h2>
    </div>
  );
}

function KeyValue({
  children,
  citationIds = [],
  label,
  mono = false,
  state = "verified",
  value
}: {
  children?: ReactNode;
  citationIds?: string[];
  label: string;
  mono?: boolean;
  state?: EvidenceState;
  value?: ReactNode;
}) {
  return (
    <div className="cs-key-value" data-state={state}>
      <span className="cs-evidence-dot" aria-hidden="true" />
      <span className="cs-key-label">{label}</span>
      <strong className={mono ? "cs-key-number" : undefined}>{children ?? value}</strong>
      {citationIds.map((id) => (
        <CitationMarker id={id} key={id} />
      ))}
    </div>
  );
}

function ClaimRow({
  children,
  citationIds = [],
  state = "verified"
}: {
  children: ReactNode;
  citationIds?: string[] | undefined;
  state?: EvidenceState | undefined;
}) {
  return (
    <li className="cs-claim-row" data-state={state}>
      <span className="cs-evidence-dot" aria-hidden="true" />
      <p>
        {children}
        {citationIds.map((id) => (
          <CitationMarker id={id} key={id} />
        ))}
      </p>
    </li>
  );
}

function SourceSignature({ mix }: { mix: ReturnType<typeof citationMix> }) {
  const rows = [
    { className: "independent", count: mix.independent, label: "independent" },
    { className: "reporting", count: mix.reporting, label: "reported" },
    { className: "company", count: mix.company, label: "company" }
  ].filter((row) => row.count > 0);

  if (rows.length === 0) {
    return null;
  }

  return (
    <div className="cs-source-signature" aria-label="Source mix">
      <span className="cs-source-signature-label">Source mix</span>
      {rows.map((row) => (
        <span className="cs-source-signature-item" data-class={row.className} key={row.className}>
          <span aria-hidden="true" />
          {row.count} {row.label}
        </span>
      ))}
    </div>
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
  const mix = citationMix(card);
  const filedDate = formatMediumDate(card.generatedAt);
  const hasRounds = rounds.length > 0;
  const hasSignals = card.signals.length > 0;
  const hasComparables = card.comparables.length > 0;
  const totalRaised = card.funding.totalRaisedUsd.value;
  const lastRound = card.funding.lastRound.value;
  const headcount = card.team.headcount.value;
  const hq = card.identity.hq.value;
  const founders = card.team.founders.value ?? [];
  const nextQuestion = hasSynthesis(card) && card.synthesis?.openQuestions[0]
    ? card.synthesis.openQuestions[0]
    : hasRounds
      ? "Which proof point shows buyer pull beyond financing?"
      : "What outside source confirms financing and buyer adoption?";

  return (
    <article className="cs-card" data-surface={surface}>
      <div className="cs-card-topbar">
        <div className="cs-card-brand" aria-label="Cold Start">
          <span className="cs-brand-aperture" aria-hidden="true" />
          <span className="cs-card-brand-name">Cold Start</span>
          {mix.total > 0 ? <span className="cs-card-brand-id">{String(mix.total).padStart(2, "0")} sources</span> : null}
        </div>
        <div className="cs-card-topbar-meta">
          <span>Filed {filedDate}</span>
          <span>{formatStatusLabel(card.identity.status)}</span>
        </div>
      </div>

      <header className="cs-card-header">
        <h1 className="cs-title" aria-label={title}>{title}</h1>
        {subtitle ? <p className="cs-subtitle">{subtitle}</p> : null}
        <div className="cs-meta-line" aria-label="Card metadata">
          {(() => {
            const hqText = hq ? hq.city : card.domain;
            const founded = card.identity.foundedYear.value ? `Founded ${card.identity.foundedYear.value}` : null;
            const parts = [hqText, founded, mix.total > 0 ? `${mix.total} cited sources` : null].filter((p): p is string => Boolean(p));
            return parts.map((part, index) => (
              <span key={`${part}-${index}`}>{part}</span>
            ));
          })()}
        </div>
        <SourceSignature mix={mix} />
      </header>

      <section className="cs-key-values" aria-label="Key facts">
        <KeyValue citationIds={card.funding.totalRaisedUsd.citationIds} label="Raised" mono state={evidenceStateForFact(card.funding.totalRaisedUsd)}>
          {formatMetricCurrency(totalRaised)}
        </KeyValue>
        <KeyValue citationIds={card.funding.lastRound.citationIds} label="Last round" mono state={evidenceStateForFact(card.funding.lastRound)}>
          {lastRound ? `${lastRound.name} · ${formatMetricCurrency(lastRound.amountUsd)}` : "not found"}
        </KeyValue>
        <KeyValue citationIds={card.team.headcount.citationIds} label="Headcount" mono state={evidenceStateForFact(card.team.headcount)}>
          {headcount ? `${headcount.value} · ${formatShortDate(headcount.asOf)}` : "not found"}
        </KeyValue>
        <KeyValue citationIds={card.identity.hq.citationIds} label="HQ" state={evidenceStateForFact(card.identity.hq)}>
          {hq ? `${hq.city}, ${hq.country}` : "not found"}
        </KeyValue>
        <KeyValue citationIds={card.identity.foundedYear.citationIds} label="Founded" mono state={evidenceStateForFact(card.identity.foundedYear)}>
          {card.identity.foundedYear.value ?? "not found"}
        </KeyValue>
        <KeyValue citationIds={card.team.founders.citationIds} label="Founders" state={evidenceStateForFact(card.team.founders)}>
          {founders.length > 0 ? founders.map((person) => person.name).join(", ") : "not found"}
        </KeyValue>
      </section>

      <div className="cs-ledger-layout">
        <main className="cs-ledger-main">
          {description && (description.concept || description.serves || description.mechanism) ? (
            <section className="cs-section" aria-labelledby="proof-heading">
              <SectionLabel text="Proof" state={evidenceStateForFact(card.identity.description)} />
              <h2 id="proof-heading" className="cs-sr-only">Proof.</h2>
              <ul className="cs-claim-list">
                {description.concept ? <ClaimRow citationIds={card.identity.description?.citationIds} state={evidenceStateForFact(card.identity.description)}>Product: {description.concept}</ClaimRow> : null}
                {description.serves ? <ClaimRow citationIds={card.identity.description?.citationIds} state={evidenceStateForFact(card.identity.description)}>Who pays: {description.serves}</ClaimRow> : null}
                {description.mechanism ? <ClaimRow citationIds={card.identity.description?.citationIds} state={evidenceStateForFact(card.identity.description)}>Technology: {description.mechanism}</ClaimRow> : null}
              </ul>
            </section>
          ) : null}

          <section className="cs-section" aria-labelledby="money-heading">
            <SectionLabel text="Money" state={evidenceStateForFact(card.funding.totalRaisedUsd)} />
            <h2 id="money-heading" className="cs-sr-only">Money.</h2>
            {hasRounds ? (
              <ol className="cs-evidence-table">
                {rounds.map((round) => {
                  const klass = classifyRound(round);
                  return (
                    <li
                      className="cs-round"
                      data-class={klass}
                      key={`${round.name}-${round.announcedAt ?? "undated"}-${round.amountUsd ?? "undisclosed"}`}
                    >
                      <span className="cs-evidence-dot" aria-hidden="true" />
                      <p className="cs-round-name">{round.name}</p>
                      <p className="cs-round-leads">{round.leadInvestors.length > 0 ? round.leadInvestors.join(", ") : "Lead not found"}</p>
                      <p className="cs-round-amount">{formatCompactCurrency(round.amountUsd)}</p>
                      <p className="cs-round-date">{formatShortDate(round.announcedAt)}</p>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="cs-empty">No public funding found.</p>
            )}
          </section>

          <section className="cs-section" aria-labelledby="people-heading">
            <SectionLabel text="People" state={evidenceStateForFact(card.team.founders)} />
            <h2 id="people-heading" className="cs-sr-only">People.</h2>
            <div className="cs-fact-grid">
              <FactRow label="Domain" fact={staticFact(card.domain)} mono />
              {card.identity.websiteUrl ? <FactRow label="Website" fact={card.identity.websiteUrl} mono /> : null}
              {card.identity.linkedinUrl ? <FactRow label="LinkedIn" fact={card.identity.linkedinUrl} mono /> : null}
              <FactRow label="Founders" fact={card.team.founders} />
              <FactRow label="Key execs" fact={card.team.keyExecs} />
              <FactRow label="Investors" fact={card.funding.investors} />
            </div>
          </section>

          {hasSignals ? (
            <section className="cs-section" aria-labelledby="signals-heading">
              <SectionLabel text="Signals" state="reported" />
              <h2 id="signals-heading" className="cs-sr-only">Signals.</h2>
              <ul className="cs-claim-list">
                {card.signals.map((signal) => {
                  const href = safeExternalHref(signal.url);
                  return (
                    <ClaimRow citationIds={signal.citationIds} key={`${signal.url}-${signal.title}`} state="reported">
                      <span className="cs-claim-date">{formatShortDate(signal.date)}</span>{" "}
                      {href ? (
                        <a href={href} target="_blank" rel="noreferrer">{signal.title}</a>
                      ) : (
                        <span>{signal.title}</span>
                      )}
                      <span className="cs-claim-meta"> {signal.source} · {signal.category}</span>
                    </ClaimRow>
                  );
                })}
              </ul>
            </section>
          ) : null}

          {hasComparables ? (
            <section className="cs-section" aria-labelledby="comps-heading">
              <SectionLabel text="Comps" state="reported" />
              <h2 id="comps-heading" className="cs-sr-only">Comps.</h2>
              <ul className="cs-claim-list">
                {card.comparables.map((comparable) => (
                  <ClaimRow citationIds={comparable.citationIds} key={`${comparable.domain}-${comparable.name}`} state="reported">
                    <strong>{comparable.name}</strong>: {comparable.basis ?? comparable.oneLiner}
                    <span className="cs-claim-meta"> {comparable.domain}</span>
                  </ClaimRow>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="cs-section cs-next-question" aria-labelledby="next-question-heading">
            <SectionLabel text="Next question" state="unknown" />
            <p id="next-question-heading">{nextQuestion}</p>
          </section>
        </main>

        <aside className="cs-source-rail" aria-label="Source ledger">
          <SourceDrawer citations={card.citations} marker="Sources" />
        </aside>
      </div>

      <footer className="cs-card-footer">
        <p className="cs-footer-copy">
          Public card. Sourced facts only. The investor lens lives behind the extension.
        </p>
        <div className="cs-footer-meta">
          <span>{mix.total} cited</span>
          <span>{card.cacheStatus} cache</span>
          <span>{filedDate}</span>
        </div>
      </footer>
    </article>
  );
}
