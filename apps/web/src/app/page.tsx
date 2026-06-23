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
      <span>{summary.name}</span>
      <small>{summary.sourceCount} sources · Checked {checkedDate(summary.generatedAt)}</small>
    </Link>
  );
}

export default async function HomePage() {
  await connection();
  const examples = curatedExamples(await getCachedPublicProfileIndex());
  const primaryExample = examples[0] ?? null;
  const primaryExampleLabel = primaryExample ? `Open ${primaryExample.name}` : null;

  return (
    <main className="cs-home" id="main-content">
      <section className="cs-home-shell" aria-label="Cold Start">
        <header className="cs-home-hero">
          <div className="cs-brand-lockup">
            <span aria-hidden="true" />
            <strong>Cold Start</strong>
          </div>

          <div className="cs-home-copy">
            <p className="cs-home-eyebrow">Public facts. Private judgment.</p>
            <h1>Before the memo, check the receipt.</h1>
            <p>
              Cold Start shows what is known, who said it, and when it was checked.
              The extension keeps the investor read private.
            </p>

            <div className="cs-home-actions" aria-label="Primary actions">
              {primaryExample && primaryExampleLabel ? (
                <Link className="cs-home-primary" href={`/c/${primaryExample.slug}`}>{primaryExampleLabel}</Link>
              ) : null}
              <a className="cs-home-secondary" href="mailto:samay@semitechie.vc?subject=Cold%20Start%20access">Request access</a>
            </div>
          </div>
        </header>

        {examples.length > 0 ? (
          <section className="cs-home-examples" aria-label="Example receipts">
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
