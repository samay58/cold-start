import type { ColdStartCard } from "@cold-start/core";
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

function compactMoney(value: number | null) {
  if (value === null) {
    return null;
  }

  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: value >= 1_000_000 ? 0 : 1,
    notation: "compact",
    style: "currency"
  }).format(value);
}

function companyInitial(name: string) {
  return name.trim().charAt(0).toUpperCase() || "C";
}

function companyMeta(summary: PublicCardSummary) {
  return [
    compactMoney(summary.totalRaisedUsd),
    summary.lastRoundName,
    summary.headcount ? `~${summary.headcount} people` : null
  ].filter((item): item is string => Boolean(item));
}

function sectionPreviews(card: PublicCard): SectionPreview[] {
  const description = card.identity.description?.value;
  const descriptionSources = card.identity.description?.citationIds.length ?? 0;
  const fundingSources = new Set([
    ...card.funding.totalRaisedUsd.citationIds,
    ...card.funding.lastRound.citationIds,
    ...card.funding.investors.citationIds,
    ...(card.funding.rounds?.citationIds ?? [])
  ]).size;
  const comparableSources = new Set(card.comparables.flatMap((comparable) => comparable.citationIds ?? [])).size;

  const sections: SectionPreview[] = [
    {
      id: "buyer",
      title: "Buyer & Use Case",
      detail: description?.serves ? "buyer evidence" : "needs buyer proof",
      body: description?.serves ?? description?.concept ?? card.identity.oneLiner.value ?? "Buyer context has not cleared the source gate.",
      sourceCount: descriptionSources || card.identity.oneLiner.citationIds.length,
      state: description?.serves || description?.concept || card.identity.oneLiner.value ? "available" : "empty"
    },
    {
      id: "traction",
      title: "Traction",
      detail: card.signals.length > 0 ? countLabel(card.signals.length, "signal") : "no traction yet",
      body: card.signals[0]?.title ?? "No recent cited traction signal is saved yet.",
      sourceCount: new Set(card.signals.flatMap((signal) => signal.citationIds)).size,
      state: card.signals.length > 0 ? "available" : "empty"
    },
    {
      id: "financing",
      title: "Financing",
      detail: compactMoney(card.funding.totalRaisedUsd.value) ?? card.funding.lastRound.value?.name ?? "no disclosed round",
      body: card.funding.lastRound.value?.name
        ? `${card.funding.lastRound.value.name}${compactMoney(card.funding.lastRound.value.amountUsd) ? `, ${compactMoney(card.funding.lastRound.value.amountUsd)}` : ""}`
        : card.funding.investors.value?.length
          ? `Named investors include ${card.funding.investors.value.slice(0, 4).map((investor) => investor.name).join(", ")}.`
          : "No cited financing detail is saved yet.",
      sourceCount: fundingSources,
      state: fundingSources > 0 ? "available" : "empty"
    },
    {
      id: "competition",
      title: "Competitive Position",
      detail: card.comparables.length > 0 ? countLabel(card.comparables.length, "company", "companies") : "no comparables yet",
      body: card.comparables.length > 0
        ? card.comparables.slice(0, 3).map((company) => company.name).join(", ")
        : "No comparable set has cleared the source gate.",
      sourceCount: comparableSources,
      state: card.comparables.length > 0 ? "available" : "empty"
    },
    {
      id: "product",
      title: "Product & Technology",
      detail: description?.mechanism ? "mechanism saved" : "mechanism missing",
      body: description?.mechanism ?? description?.shortDescription ?? card.identity.oneLiner.value ?? "Product mechanism is not saved yet.",
      sourceCount: descriptionSources || card.identity.oneLiner.citationIds.length,
      state: description?.mechanism || description?.shortDescription || card.identity.oneLiner.value ? "available" : "empty"
    }
  ];

  return sections.map((section): SectionPreview => ({
    ...section,
    state: card.cacheStatus === "stale" && section.state === "available" ? "stale" : section.state
  }));
}

function CompanyRow({ selected, summary }: { selected: boolean; summary: PublicCardSummary }) {
  const meta = companyMeta(summary);

  return (
    <Link aria-current={selected ? "page" : undefined} className="cs-company-row" data-selected={selected ? "true" : "false"} href={`/?company=${summary.slug}`}>
      <span className="cs-company-row-mark" aria-hidden="true">{companyInitial(summary.name)}</span>
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
  const sections = sectionPreviews(card);
  const activeSection = sections.find((section) => section.state !== "empty") ?? sections[0]!;
  const meta = companyMeta(summary);

  return (
    <section className="cs-index-preview" aria-label={`${summary.name} preview`}>
      <div className="cs-index-preview-main">
        <div className="cs-index-company-lockup">
          <span aria-hidden="true">{companyInitial(summary.name)}</span>
          <div>
            <p>{summary.domain}</p>
            <h1>{summary.name}</h1>
          </div>
        </div>

        <p className="cs-index-one-liner">
          {card.identity.description?.value?.shortDescription ?? card.identity.oneLiner.value ?? "Sourced company profile."}
        </p>

        <div className="cs-index-facts" aria-label="Profile facts">
          <span>{countLabel(summary.sourceCount, "source")}</span>
          {meta.map((item) => <span key={item}>{item}</span>)}
          {card.cacheStatus === "stale" ? <span>stale</span> : null}
        </div>

        <div className="cs-index-actions">
          <Link className="cs-index-primary" href={`/c/${summary.slug}`}>Open full card</Link>
        </div>
      </div>

      <div className="cs-index-stack" aria-label="Research sections">
        <div className="cs-index-stack-head">
          <span>Research</span>
          <span>{sections.filter((section) => section.state !== "empty").length} / {sections.length}</span>
        </div>
        <div className="cs-index-stack-list">
          {sections.map((section) => (
            <SectionCard active={section.id === activeSection.id} key={section.id} section={section} />
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
          <span>CS</span>
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
        <aside className="cs-index-list" aria-label="Companies">
          <div className="cs-brand-lockup">
            <span>CS</span>
            <strong>Cold Start</strong>
          </div>
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
