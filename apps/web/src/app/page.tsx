import { RESEARCH_SECTION_DEFINITIONS_BY_ID, type ColdStartCard, type ResearchSection } from "@cold-start/core";
import type { PublicCardSummary } from "@cold-start/db";
import Link from "next/link";
import React from "react";
import { getPublicProfileIndex } from "../lib/cards";

type HomePageProps = {
  searchParams?: Promise<{ company?: string | string[] }>;
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

export const dynamic = "force-dynamic";

function selectedCompanyParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
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

function CompanyRow({ selected, summary }: { selected: boolean; summary: PublicCardSummary }) {
  const meta = companyMeta(summary);

  return (
    <Link aria-current={selected ? "page" : undefined} className="cs-company-row" data-selected={selected ? "true" : "false"} href={`/?company=${summary.slug}`}>
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
    <main className="cs-home">
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
  const summaries = await getPublicProfileIndex();

  if (summaries.length === 0) {
    return <EmptyState />;
  }

  const params = searchParams ? await searchParams : {};
  const selected = selectedSummary(summaries, selectedCompanyParam(params.company));
  const orderedSummaries = selected ? [selected, ...summaries.filter((summary) => summary.slug !== selected.slug)] : summaries;

  return (
    <main className="cs-home">
      <section className="cs-index-shell" aria-label="Cold Start public profiles">
        <header className="cs-index-masthead">
          <div className="cs-brand-lockup">
            <span aria-hidden="true" />
            <strong>Cold Start</strong>
          </div>
          <h1>Sourced company cards for first-pass diligence.</h1>
          <p>Facts stay public. Judgment stays gated. The index below is a working shelf of profiles that cleared the source gate.</p>
          <span>{countLabel(summaries.length, "profile")}</span>
        </header>

        <aside className="cs-index-list" aria-label="Companies">
          <div className="cs-index-list-head">
            <h2>Companies</h2>
            <span>{summaries.length}</span>
          </div>
          <nav className="cs-company-list" aria-label="Select company">
            {orderedSummaries.map((summary) => (
              <CompanyRow key={summary.slug} selected={selected?.slug === summary.slug} summary={summary} />
            ))}
          </nav>
        </aside>

        {selected ? <ProfilePreview summary={selected} /> : null}
      </section>
    </main>
  );
}
