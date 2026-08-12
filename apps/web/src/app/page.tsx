import Link from "next/link";
import { connection } from "next/server";
import React from "react";
import { AccessForm } from "../components/landing/AccessForm";
import { ComparisonTable } from "../components/landing/ComparisonTable";
import { ExtensionPanel } from "../components/landing/ExtensionPanel";
import { Hero } from "../components/landing/Hero";
import { LandingFooter } from "../components/landing/LandingFooter";
import { RecordExhibit } from "../components/landing/RecordExhibit";
import { recordedBuild } from "../components/landing/recorded-build-data";
import { SourcesLegend } from "../components/landing/SourcesLegend";
import { getCachedPublicProfileIndex } from "../lib/cards";

export const revalidate = 30;

function Nav({ profileCount }: { profileCount: number }) {
  return (
    <nav aria-label="Cold Start" className="cs-landing-nav">
      <div className="cs-landing-nav-brand">
        <span className="cs-landing-nav-lockup">Cold Start</span>
        <span className="cs-landing-nav-descriptor">company profiles, cited</span>
      </div>
      <div className="cs-landing-nav-links">
        <Link className="cs-landing-nav-link" href="/catalog">
          Catalog
        </Link>
        <a className="cs-landing-nav-link" href="#extension">
          Extension
        </a>
        <a className="cs-landing-nav-link" href="#access">
          Ask for access
        </a>
      </div>
      <span className="cs-landing-nav-count">{profileCount} filed</span>
    </nav>
  );
}

export default async function HomePage() {
  await connection();
  const profiles = await getCachedPublicProfileIndex();
  const latest = profiles[0] ?? null;

  return (
    <main className="cs-landing" id="main-content">
      <div className="cs-landing-shell">
        <Nav profileCount={profiles.length} />

        <Hero profileCount={profiles.length} />

        <section className="cs-landing-pitchbook" id="pitchbook">
          <div className="cs-landing-pitchbook-head">
            <h2>Cold Start can replace PitchBook</h2>
            <p>
              PitchBook is static and often thin for young companies. Cold Start builds the profile
              when you need it, shows where every claim came from, and refreshes old sections when
              you return.
            </p>
          </div>
          <RecordExhibit />
          <ComparisonTable />
          <p className="cs-landing-pitchbook-closing">
            Round ledgers, fund and LP data, and exit comps stay in PitchBook. The first ten
            minutes on a company you have not looked at yet is most of what a seat gets used for,
            and that is the part Cold Start takes.
          </p>
        </section>

        <section className="cs-landing-sources" id="sources">
          <h2>Understand the sources</h2>
          <SourcesLegend />
        </section>

        <section className="cs-landing-extension" id="extension">
          <div className="cs-landing-extension-copy">
            <span className="cs-landing-extension-eyebrow">Chrome extension</span>
            <h2>A companion for understanding a company, not just looking it up.</h2>
            <p>
              Open the extension on a company&apos;s site and it works through the five questions
              you would ask anyway: why care, what must be true, what could break, why now, what
              to learn next.
            </p>
            <div className="cs-landing-extension-cta">
              <a className="cs-landing-seal-pill" href="#access">
                <span className="cs-landing-seal-pill-label">Ask for access</span>
              </a>
              <span className="cs-landing-extension-cta-caption">invite-only alpha</span>
            </div>
          </div>
          <ExtensionPanel companyName={recordedBuild.companyName} />
        </section>

        <section className="cs-landing-access" id="access">
          <div className="cs-landing-access-copy">
            <h2>Ask for access</h2>
            <p>
              Send us your name, email and one line about why this is interesting to you. A person
              reads it and answers either way.
            </p>
          </div>
          <AccessForm />
        </section>

        <LandingFooter count={profiles.length} latestGeneratedAt={latest?.generatedAt ?? null} />
      </div>
    </main>
  );
}
