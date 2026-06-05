import { RESEARCH_SECTION_DEFINITIONS_BY_ID, type ColdStartCard, type ResearchSection } from "@cold-start/core";
import type { PublicCardSummary } from "@cold-start/db";
import { unstable_cache } from "next/cache";
import Link from "next/link";
import { connection } from "next/server";
import React from "react";
import { getPublicProfileIndex } from "../lib/cards";

type HomePageProps = {
  searchParams?: Promise<{ company?: string | string[]; q?: string | string[]; sort?: string | string[] }>;
};

type PublicCard = Omit<ColdStartCard, "synthesis">;

type SectionPreview = {
  id: string;
  title: string;
  detail: string;
  body: string;
  sourceCount: number;
  state: "available" | "empty" | "stale";
};

type IndexSort = "recent" | "sources" | "funding" | "name";

export const revalidate = 30;

const visibleCompanyLimit = 72;
const getCachedPublicProfileIndex = unstable_cache(
  async () => getPublicProfileIndex(),
  ["public-profile-index"],
  { revalidate: 30 }
);

function selectedCompanyParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function textParam(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

function sortParam(value: string | string[] | undefined): IndexSort {
  const sort = textParam(value);
  return sort === "sources" || sort === "funding" || sort === "name" ? sort : "recent";
}

function selectedSummary(summaries: PublicCardSummary[], slug: string | undefined) {
  return summaries.find((summary) => summary.slug === slug) ?? summaries[0] ?? null;
}

function countLabel(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function compactMoney(value: number | string | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    if (trimmed.startsWith("$")) {
      return trimmed.replace(/^\$+/, "$");
    }

    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      return trimmed;
    }

    value = parsed;
  }

  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: value >= 1_000_000 ? 0 : 1,
    notation: "compact",
    style: "currency"
  }).format(value);
}

function formatGeneratedDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    year: "numeric"
  }).format(parsed).replace(",", "");
}

function companyMeta(summary: PublicCardSummary) {
  return [
    compactMoney(summary.totalRaisedUsd),
    summary.lastRoundName,
    summary.headcount ? `~${summary.headcount} people` : null
  ].filter((item): item is string => Boolean(item));
}

function matchesQuery(summary: PublicCardSummary, query: string) {
  if (!query) {
    return true;
  }

  const haystack = [
    summary.name,
    summary.domain,
    summary.slug,
    summary.lastRoundName,
    summary.card.identity.description?.value?.shortDescription,
    summary.card.identity.oneLiner.value
  ].filter(Boolean).join(" ").toLowerCase();
  return haystack.includes(query.toLowerCase());
}

function sortSummaries(summaries: PublicCardSummary[], sort: IndexSort) {
  const copy = [...summaries];

  if (sort === "name") {
    return copy.sort((left, right) => left.name.localeCompare(right.name));
  }

  if (sort === "sources") {
    return copy.sort((left, right) => right.sourceCount - left.sourceCount || left.name.localeCompare(right.name));
  }

  if (sort === "funding") {
    return copy.sort((left, right) => (right.totalRaisedUsd ?? -1) - (left.totalRaisedUsd ?? -1) || left.name.localeCompare(right.name));
  }

  return copy.sort((left, right) => right.generatedAt.localeCompare(left.generatedAt));
}

function companyHref(slug: string, query: { q: string; sort: IndexSort }) {
  const params = new URLSearchParams({ company: slug });
  if (query.q) {
    params.set("q", query.q);
  }
  if (query.sort !== "recent") {
    params.set("sort", query.sort);
  }
  return `/?${params.toString()}`;
}

function sectionPreview(section: ResearchSection, card: PublicCard): SectionPreview {
  const definition = RESEARCH_SECTION_DEFINITIONS_BY_ID[section.sectionId];
  const content = section.content;
  const item = content?.items[0] ?? null;
  const state = section.status === "available" || section.status === "stale"
    ? card.cacheStatus === "stale" ? "stale" : section.status
    : "empty";

  return {
    id: section.sectionId,
    title: definition.title,
    detail: state === "empty"
      ? definition.emptyState
      : item?.label ?? content?.confidence ?? "saved",
    body: content?.summary ?? item?.text ?? definition.emptyState,
    sourceCount: new Set(section.citationIds).size,
    state
  };
}

function CompanyRow({ query, selected, summary }: { query: { q: string; sort: IndexSort }; selected: boolean; summary: PublicCardSummary }) {
  const meta = companyMeta(summary);

  return (
    <Link aria-current={selected ? "page" : undefined} className="cs-company-row" data-selected={selected ? "true" : "false"} href={companyHref(summary.slug, query)}>
      <span className="cs-company-row-main">
        <strong>{summary.name}</strong>
        <small>{summary.domain}</small>
      </span>
      <span className="cs-company-row-meta">
        <span>{countLabel(summary.sourceCount, "source")}</span>
        {meta[0] ? <small>{meta[0]}</small> : null}
      </span>
    </Link>
  );
}

function SectionCard({ active = false, section }: { active?: boolean; section: SectionPreview }) {
  return (
    <article className="cs-index-section-card" data-active={active ? "true" : "false"} data-state={section.state}>
      <span className="cs-index-section-dot" aria-hidden="true" />
      <div className="cs-index-section-head">
        <div>
          <h2>{section.title}</h2>
          <p>{section.detail}</p>
        </div>
        <span>{section.sourceCount > 0 ? countLabel(section.sourceCount, "source") : section.state}</span>
      </div>
      {active ? <p className="cs-index-section-body">{section.body}</p> : null}
    </article>
  );
}

function ProfilePreview({ summary }: { summary: PublicCardSummary }) {
  const card = summary.card;
  const sections = (summary.sections ?? [])
    .filter((section) => section.visibility === "public")
    .map((section) => sectionPreview(section, card));
  const activeSection = sections.find((section) => section.state !== "empty") ?? sections[0] ?? null;
  const meta = companyMeta(summary);
  const availableCount = sections.filter((section) => section.state !== "empty").length;
  const rows = [
    ["Sources", countLabel(summary.sourceCount, "source")],
    ["Raised", meta[0] ?? "not found"],
    ["Round", summary.lastRoundName ?? "not found"],
    ["People", summary.headcount ? `~${summary.headcount}` : "not found"],
    ["Filed", formatGeneratedDate(summary.generatedAt)]
  ];

  return (
    <section className="cs-index-preview" aria-label={`${summary.name} preview`}>
      <div className="cs-index-preview-main">
        <div className="cs-index-kicker">
          <span>{summary.domain}</span>
          <span>{availableCount} / {sections.length || 0} public sections</span>
        </div>

        <h1>{summary.name}</h1>

        <p className="cs-index-one-liner">
          {card.identity.description?.value?.shortDescription ?? card.identity.oneLiner.value ?? "Sourced company profile."}
        </p>

        <div className="cs-index-facts" aria-label="Profile facts">
          {rows.map(([label, value]) => (
            <div key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>

        <div className="cs-index-actions">
          <Link className="cs-index-primary" href={`/c/${summary.slug}`}>Open full card</Link>
          <a className="cs-index-secondary" href={`https://${summary.domain}`} target="_blank" rel="noreferrer">Visit site</a>
        </div>
      </div>

      <div className="cs-index-stack" aria-label="Research sections">
        <div className="cs-index-stack-head">
          <span>Public research</span>
          <span>{availableCount} live</span>
        </div>
        <div className="cs-index-stack-list">
          {sections.map((section) => (
            <SectionCard active={section.id === activeSection?.id} key={section.id} section={section} />
          ))}
        </div>
      </div>
    </section>
  );
}

function EmptyState() {
  return (
    <main className="cs-home" id="main-content">
      <section className="cs-index-empty" aria-label="Cold Start">
        <div className="cs-brand-lockup">
          <span aria-hidden="true" />
          <strong>Cold Start</strong>
        </div>
        <h1>No sourced profiles yet.</h1>
        <p>Generate a company from the extension. Once it clears the source gate, it will show up here.</p>
      </section>
    </main>
  );
}

export default async function HomePage({ searchParams }: HomePageProps) {
  await connection();
  const summaries = await getCachedPublicProfileIndex();

  if (summaries.length === 0) {
    return <EmptyState />;
  }

  const params = searchParams ? await searchParams : {};
  const query = {
    q: textParam(params.q),
    sort: sortParam(params.sort)
  };
  const requestedCompany = selectedCompanyParam(params.company);
  const filteredSummaries = sortSummaries(summaries.filter((summary) => matchesQuery(summary, query.q)), query.sort);
  const selected = filteredSummaries.length > 0 ? selectedSummary(filteredSummaries, requestedCompany) : null;
  const orderedSummaries = selected
    ? [selected, ...filteredSummaries.filter((summary) => summary.slug !== selected.slug)]
    : filteredSummaries;
  const visibleSummaries = orderedSummaries.slice(0, visibleCompanyLimit);
  const hiddenCount = Math.max(0, orderedSummaries.length - visibleSummaries.length);

  return (
    <main className="cs-home" id="main-content">
      <section className="cs-index-shell" aria-label="Cold Start public profiles">
        <header className="cs-index-masthead">
          <div className="cs-brand-lockup">
            <span aria-hidden="true" />
            <strong>Cold Start</strong>
          </div>
          <div className="cs-index-masthead-copy">
            <h1>Sourced company cards for first-pass diligence.</h1>
            <p>Facts stay public. Judgment stays gated. Use the shelf to scan source-backed profiles, then open the full public card when something earns another minute.</p>
          </div>
          <div className="cs-index-masthead-count">
            <strong>{summaries.length}</strong>
            <span>profiles filed</span>
          </div>
        </header>

        <aside className="cs-index-list" aria-label="Companies">
          <div className="cs-index-list-head">
            <h2>Companies</h2>
            <span>{countLabel(filteredSummaries.length, "match", "matches")}</span>
          </div>
          <form className="cs-index-controls" action="/" method="get">
            <label>
              <span>Search</span>
              <input autoComplete="off" name="q" type="search" defaultValue={query.q} placeholder="browserbase, ai, funding…" />
            </label>
            <label>
              <span>Sort</span>
              <select name="sort" defaultValue={query.sort}>
                <option value="recent">Recently filed</option>
                <option value="sources">Most sources</option>
                <option value="funding">Most funding</option>
                <option value="name">Company name</option>
              </select>
            </label>
            <button type="submit">Apply</button>
          </form>
          <nav className="cs-company-list" aria-label="Select company">
            {visibleSummaries.map((summary) => (
              <CompanyRow key={summary.slug} query={query} selected={selected?.slug === summary.slug} summary={summary} />
            ))}
          </nav>
          {hiddenCount > 0 ? (
            <p className="cs-index-list-note">
              Showing {visibleSummaries.length} of {orderedSummaries.length}. Search to narrow the shelf.
            </p>
          ) : null}
        </aside>

        {selected ? (
          <ProfilePreview summary={selected} />
        ) : (
          <section className="cs-index-no-results">
            <h2>No matching profiles.</h2>
            <p>Try a company, domain, round name, or category term.</p>
          </section>
        )}
      </section>
    </main>
  );
}
