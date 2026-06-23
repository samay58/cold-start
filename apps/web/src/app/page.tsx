import type { PublicCardSummary } from "@cold-start/db";
import { unstable_cache } from "next/cache";
import Link from "next/link";
import { connection } from "next/server";
import React from "react";
import { getPublicProfileIndex } from "../lib/cards";

export const revalidate = 30;

const getCachedPublicProfileIndex = unstable_cache(
  async () => getPublicProfileIndex(),
  ["public-profile-index"],
  { revalidate: 30 }
);

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

function PublicProfileRow({ summary }: { summary: PublicCardSummary }) {
  return (
    <Link className="cs-home-profile" href={`/c/${summary.slug}`}>
      <span>{summary.name}</span>
      <small>{summary.domain}</small>
      <small>{summary.sourceCount} sources · Checked {checkedDate(summary.generatedAt)}</small>
    </Link>
  );
}

export default async function HomePage() {
  await connection();
  const profiles = await getCachedPublicProfileIndex();
  const latestProfile = profiles[0] ?? null;

  return (
    <main className="cs-home" id="main-content">
      <section className="cs-home-shell" aria-label="Cold Start">
        <header className="cs-home-hero">
          <div className="cs-brand-lockup">
            <span aria-hidden="true" />
            <strong>Cold Start</strong>
          </div>

          <div className="cs-home-copy">
            <p className="cs-home-eyebrow">Generated from the Chrome extension.</p>
            <h1>Sourced company profiles</h1>
            <p>
              Public pages show facts and sources. Investor synthesis stays private.
            </p>

            <div className="cs-home-actions" aria-label="Primary actions">
              {latestProfile ? (
                <Link className="cs-home-primary" href={`/c/${latestProfile.slug}`}>Open latest profile</Link>
              ) : null}
              <a className="cs-home-secondary" href="mailto:samay@semitechie.vc?subject=Cold%20Start%20access">Request access</a>
            </div>
          </div>
        </header>

        {profiles.length > 0 ? (
          <section className="cs-home-profiles" aria-label="Generated profiles">
            <div className="cs-home-profile-list">
              {profiles.map((summary) => (
                <PublicProfileRow key={summary.slug} summary={summary} />
              ))}
            </div>
          </section>
        ) : null}
      </section>
    </main>
  );
}
