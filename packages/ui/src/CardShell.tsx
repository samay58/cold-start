import type { ColdStartCard, ResearchSection, ResolvedFact } from "@cold-start/core";
import { sourceQualityForSource } from "@cold-start/core";
import type { ReactNode } from "react";
import { CitationGroup } from "./CitationGroup";
import type { CitationLedger } from "./CitationLedger";
import { buildCitationLedger, sortedUniqueCitations, sourceClassForCitation } from "./CitationLedger";
import { formatCompactCurrency, formatMediumDate, formatShortDate } from "./FactRow";
import { safeExternalHref } from "./safeExternalHref";
import { SourceDrawer } from "./SourceDrawer";

type PublicCard = Omit<ColdStartCard, "synthesis">;
type CardShellProps = {
  card: ColdStartCard | PublicCard;
  sections?: ResearchSection[] | undefined;
  surface: "web" | "extension";
  texture?: ReactNode;
};

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
  for (const citation of sortedCitations(card)) {
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

function stripCitationMarkers(text: string) {
  return text
    .replace(/\s*\[(?:c|C|e|seed)?[\w.-]+(?:,\s*(?:c|C|e|seed)?[\w.-]+)*\]/g, "")
    .replace(/\s+([.,;:!?])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function formatAppCurrency(value: number | null | undefined): string {
  return typeof value === "number" ? formatCompactCurrency(value) : "Not found";
}

function formatAppDate(value: string | null | undefined): string {
  return value ? formatShortDate(value) : "Not found";
}

type EvidenceState = "verified" | "reported" | "company" | "conflict" | "unknown";

function evidenceStateFromConfidence(fact: ResolvedFact<unknown>): EvidenceState {
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

function sortedCitations(card: ColdStartCard | PublicCard) {
  return sortedUniqueCitations(card.citations);
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
                  {synthesis.openQuestions.map((entry) => (
                    <li key={entry.question}>{entry.question}</li>
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

const publicSectionTitles: Partial<Record<ResearchSection["sectionId"], string>> = {
  buyer: "Who uses it",
  customer_proof: "Public proof",
  traction: "Public signals",
  financing: "Financing",
  product: "Product"
};

function KeyValue({
  children,
  citationIds = [],
  label,
  ledger,
  mono = false,
  state = "verified",
  value
}: {
  children?: ReactNode;
  citationIds?: string[];
  label: string;
  ledger?: CitationLedger | undefined;
  mono?: boolean;
  state?: EvidenceState;
  value?: ReactNode;
}) {
  return (
    <div className="cs-key-value" data-state={state}>
      <span className="cs-evidence-dot" aria-hidden="true" />
      <span className="cs-key-label">{label}</span>
      <strong className={mono ? "cs-key-number" : undefined}>{children ?? value}</strong>
      <span className="cs-key-status">{publicEvidenceLabel(state)}</span>
      <CitationGroup citationIds={citationIds} ledger={ledger} />
    </div>
  );
}

function ClaimRow({
  children,
  citationIds = [],
  ledger,
  state = "verified"
}: {
  children: ReactNode;
  citationIds?: string[] | undefined;
  ledger?: CitationLedger | undefined;
  state?: EvidenceState | undefined;
}) {
  return (
    <li className="cs-claim-row" data-state={state}>
      <span className="cs-evidence-dot" aria-hidden="true" />
      <p>
        {children}
        <CitationGroup citationIds={citationIds} ledger={ledger} />
        <span className="cs-claim-status">{publicEvidenceLabel(state)}</span>
      </p>
    </li>
  );
}

type PublicFactRow = {
  citationIds: string[];
  label: string;
  mono?: boolean;
  state: EvidenceState;
  value: string;
};

type PublicEvidenceNote = {
  citationIds: string[];
  state: EvidenceState;
  text: string;
  title: string;
};

function publicEvidenceLabel(state: EvidenceState) {
  if (state === "verified") {
    return "Corroborated";
  }
  if (state === "reported") {
    return "Reported";
  }
  if (state === "company") {
    return "Company-authored";
  }
  if (state === "conflict") {
    return "Sources conflict";
  }
  return "Not verified";
}

function publicEvidenceStatusForFact(fact: ResolvedFact<unknown> | undefined, ledger?: CitationLedger): EvidenceState {
  if (!fact || fact.value === null) {
    return "unknown";
  }

  if (fact.status === "mixed") {
    return "conflict";
  }

  const classes = ledger
    ? fact.citationIds.flatMap((id) => {
        const entry = ledger.get(id);
        return entry ? [entry.sourceClass] : [];
      })
    : [];
  const uniqueClasses = new Set(classes);

  if (classes.length === 0) {
    return evidenceStateFromConfidence(fact);
  }

  if ((uniqueClasses.has("independent") || uniqueClasses.has("reporting")) && new Set(fact.citationIds).size > 1) {
    return "verified";
  }

  if (uniqueClasses.has("independent") || uniqueClasses.has("reporting")) {
    return "reported";
  }

  return "company";
}

function factValue<T>(fact: ResolvedFact<T>, formatter: (value: T) => string): string | null {
  return fact.value === null ? null : formatter(fact.value);
}

function formatRound(round: FundingRound) {
  return [round.name, round.amountUsd ? formatCompactCurrency(round.amountUsd) : null].filter(Boolean).join(" · ");
}

function publicFactRowsForCard(card: ColdStartCard | PublicCard, ledger: CitationLedger): PublicFactRow[] {
  const founders = card.team.founders.value ?? [];
  const rows: Array<PublicFactRow | null> = [
    factValue(card.funding.totalRaisedUsd, (value) => formatCompactCurrency(value))
      ? {
          citationIds: card.funding.totalRaisedUsd.citationIds,
          label: "Raised",
          mono: true,
          state: publicEvidenceStatusForFact(card.funding.totalRaisedUsd, ledger),
          value: factValue(card.funding.totalRaisedUsd, (value) => formatCompactCurrency(value))!
        }
      : null,
    factValue(card.funding.lastRound, formatRound)
      ? {
          citationIds: card.funding.lastRound.citationIds,
          label: "Last round",
          mono: true,
          state: publicEvidenceStatusForFact(card.funding.lastRound, ledger),
          value: factValue(card.funding.lastRound, formatRound)!
        }
      : null,
    founders.length > 0
      ? {
          citationIds: card.team.founders.citationIds,
          label: "Founders",
          state: publicEvidenceStatusForFact(card.team.founders, ledger),
          value: founders.map((person) => person.name).join(", ")
        }
      : null,
    factValue(card.identity.hq, (value) => `${value.city}, ${value.country}`)
      ? {
          citationIds: card.identity.hq.citationIds,
          label: "HQ",
          state: publicEvidenceStatusForFact(card.identity.hq, ledger),
          value: factValue(card.identity.hq, (value) => `${value.city}, ${value.country}`)!
        }
      : null,
    factValue(card.team.headcount, (value) => `${value.value} · ${formatShortDate(value.asOf)}`)
      ? {
          citationIds: card.team.headcount.citationIds,
          label: "Headcount",
          mono: true,
          state: publicEvidenceStatusForFact(card.team.headcount, ledger),
          value: factValue(card.team.headcount, (value) => `${value.value} · ${formatShortDate(value.asOf)}`)!
        }
      : null,
    factValue(card.identity.foundedYear, (value) => String(value))
      ? {
          citationIds: card.identity.foundedYear.citationIds,
          label: "Founded",
          mono: true,
          state: publicEvidenceStatusForFact(card.identity.foundedYear, ledger),
          value: factValue(card.identity.foundedYear, (value) => String(value))!
        }
      : null
  ];

  return rows.filter((row): row is PublicFactRow => Boolean(row)).slice(0, 6);
}

function publicEvidenceNotesForSections(
  sections: ResearchSection[] | undefined,
  card: ColdStartCard | PublicCard,
  ledger: CitationLedger
): PublicEvidenceNote[] {
  const notes = (sections ?? [])
    .filter((section) => section.visibility === "public")
    .filter((section) => section.status === "available" || section.status === "stale")
    .flatMap((section): PublicEvidenceNote[] => {
      const title = publicSectionTitles[section.sectionId];
      const content = section.content;
      const text = content?.summary ?? content?.items[0]?.text ?? null;
      const citationIds = content?.items[0]?.citationIds.length ? content.items[0].citationIds : section.citationIds;

      if (!title || !text || citationIds.length === 0 || section.sectionId === "competition") {
        return [];
      }

      return [{
        citationIds,
        state: citationIds.some((id) => ledger.get(id)?.sourceClass !== "company") ? "reported" : "company",
        text: stripCitationMarkers(text),
        title
      }];
    });

  if (!card.funding.totalRaisedUsd.value && !card.funding.lastRound.value) {
    notes.push({
      citationIds: [],
      state: "unknown",
      text: "Financing was not verified from the public sources checked.",
      title: "Missing public evidence"
    });
  }

  return notes.slice(0, 3);
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

export function CardShell({ card, sections, surface, texture }: CardShellProps) {
  if (surface === "extension") {
    return <ExtensionProfile card={card} />;
  }

  const title = card.identity.name.value ?? card.domain;
  const description = card.identity.description?.value ?? null;
  const subtitle = description?.shortDescription ?? card.identity.oneLiner.value ?? "";
  const mix = citationMix(card);
  const ledger = buildCitationLedger(card.citations);
  const filedDate = formatMediumDate(card.generatedAt);
  const factRows = publicFactRowsForCard(card, ledger);
  const evidenceNotes = publicEvidenceNotesForSections(sections, card, ledger);
  const callNumber = `CS · ${card.slug.toUpperCase()}`;

  return (
    <article className="cs-card" data-surface={surface}>
      {texture}
      <div className="cs-card-edge" aria-hidden="true" />
      <div className="cs-card-topbar">
        <div className="cs-card-brand" aria-label="Cold Start">
          <span className="cs-brand-aperture" aria-hidden="true" />
          <span className="cs-card-brand-name">Cold Start</span>
          <span className="cs-card-brand-index">Public fact receipt</span>
        </div>
        <div className="cs-card-callno">
          <span className="cs-card-callno-id">{callNumber}</span>
          {mix.total > 0 ? <span className="cs-card-callno-count">{mix.total} cited sources</span> : null}
        </div>
      </div>

      <header className="cs-card-header">
        <div className="cs-card-filed">
          <span className="cs-filed-stamp">Checked {filedDate}</span>
        </div>
        <h1 className="cs-title" aria-label={title}>{title}</h1>
        {subtitle ? <p className="cs-subtitle">{subtitle}</p> : null}
        <div className="cs-meta-line" aria-label="Card metadata">
          <span>{card.domain}</span>
          <span>Checked {filedDate}</span>
          {mix.total > 0 ? <span>{mix.total} cited sources</span> : null}
        </div>
        <SourceSignature mix={mix} />
      </header>

      {factRows.length > 0 ? (
        <section className="cs-key-values" aria-label="Known public facts">
          {factRows.map((row) => (
            <KeyValue
              citationIds={row.citationIds}
              key={row.label}
              label={row.label}
              ledger={ledger}
              {...(row.mono !== undefined ? { mono: row.mono } : {})}
              state={row.state}
            >
              {row.value}
            </KeyValue>
          ))}
        </section>
      ) : null}

      {evidenceNotes.length > 0 ? (
        <section className="cs-section cs-receipt-notes" aria-labelledby="evidence-notes-heading">
          <div className="cs-section-label" data-state="reported">
            <span className="cs-evidence-dot" aria-hidden="true" />
            <h2 className="cs-section-label-text" id="evidence-notes-heading">Evidence notes</h2>
          </div>
          <ul className="cs-claim-list">
            {evidenceNotes.map((note) => (
              <ClaimRow citationIds={note.citationIds} key={`${note.title}-${note.text}`} ledger={ledger} state={note.state}>
                <strong>{note.title}</strong>: {note.text}
              </ClaimRow>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="cs-source-ledger-full">
        <SourceDrawer citations={card.citations} className="cs-source-block-full" ledger={ledger} marker="Source ledger" />
      </div>

      <footer className="cs-card-footer">
        <p className="cs-footer-copy">
          Public facts only. Private synthesis lives in the extension.
        </p>
        <div className="cs-footer-meta">
          <span>{mix.total} cited</span>
          <span>{filedDate}</span>
          <a className="cs-footer-cta" href="mailto:samay@semitechie.vc?subject=Cold%20Start%20extension%20access">Open in the extension for the investor lens</a>
        </div>
      </footer>
    </article>
  );
}
