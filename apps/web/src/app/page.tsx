import type { PublicCardSummary } from "@cold-start/db";
import { unstable_cache } from "next/cache";
import Link from "next/link";
import { connection } from "next/server";
import React from "react";
import { getPublicProfileIndex } from "../lib/cards";

const exampleSlugs = ["browserbase", "cartesia"] as const;

export const revalidate = 30;

const getCachedPublicProfileIndex = unstable_cache(
  async () => getPublicProfileIndex(),
  ["public-profile-index"],
  { revalidate: 30 }
);

function curatedExamples(summaries: PublicCardSummary[]) {
  return exampleSlugs
    .map((slug) => summaries.find((summary) => summary.slug === slug))
    .filter((summary): summary is PublicCardSummary => Boolean(summary));
}

function descriptionFor(summary: PublicCardSummary) {
  return summary.card.identity.description?.value?.shortDescription
    ?? summary.card.identity.oneLiner.value
    ?? "Sourced public company facts with citations.";
}

function checkedDate(value: string) {
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

function ExampleReceipt({ summary }: { summary: PublicCardSummary }) {
  return (
    <Link className="cs-home-example" href={`/c/${summary.slug}`}>
      <span className="cs-home-example-kicker">{summary.domain}</span>
      <strong>{summary.name}</strong>
      <span>{descriptionFor(summary)}</span>
      <small>{summary.sourceCount} cited sources · Checked {checkedDate(summary.generatedAt)}</small>
    </Link>
  );
}

export default async function HomePage() {
  await connection();
  const examples = curatedExamples(await getCachedPublicProfileIndex());
  const primaryExample = examples[0] ?? null;

  return (
    <main className="cs-home" id="main-content">
      <section className="cs-home-shell" aria-label="Cold Start">
        <header className="cs-home-hero">
          <div className="cs-brand-lockup">
            <span aria-hidden="true" />
            <strong>Cold Start</strong>
          </div>

          <div className="cs-home-copy">
            <p className="cs-home-eyebrow">Public facts. Private synthesis.</p>
            <h1>Company facts, with receipts.</h1>
            <p>
              Cold Start turns a company website into a sourced public fact receipt.
              Public cards show public facts and their evidence. The Chrome extension
              adds private investor synthesis after the evidence holds.
            </p>
          </div>

          <div className="cs-home-actions" aria-label="Primary actions">
            {primaryExample ? <Link className="cs-home-primary" href={`/c/${primaryExample.slug}`}>View example receipt</Link> : null}
            <a className="cs-home-secondary" href="mailto:samay@semitechie.vc?subject=Cold%20Start%20access">Request access</a>
          </div>
        </header>

        <section className="cs-home-rule" aria-label="Trust rule">
          <span>No recommendations.</span>
          <span>No private synthesis.</span>
          <span>Every material claim cites a source.</span>
        </section>

        <section className="cs-home-split" aria-label="Public and private surfaces">
          <article>
            <span>Public receipt</span>
            <h2>Sourced facts anyone can inspect.</h2>
            <p>Company identity, a short description, key public facts, checked date, evidence status, and a source ledger.</p>
          </article>
          <article>
            <span>Extension lens</span>
            <h2>Private judgment after the facts hold.</h2>
            <p>Why it matters, bull and bear, market timing, risks, and diligence questions stay in the authenticated Chrome extension.</p>
          </article>
        </section>

        {examples.length > 0 ? (
          <section className="cs-home-examples" aria-label="Example receipts">
            <div className="cs-home-section-head">
              <span>Examples</span>
              <h2>Receipts worth opening.</h2>
            </div>
            <div className="cs-home-example-list">
              {examples.map((summary) => (
                <ExampleReceipt key={summary.slug} summary={summary} />
              ))}
            </div>
          </section>
        ) : null}
      </section>
    </main>
  );
}
