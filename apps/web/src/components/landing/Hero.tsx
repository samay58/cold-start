import { formatMediumDate } from "@cold-start/ui";
import Link from "next/link";
import React from "react";
import { recordedBuild } from "./recorded-build-data";

export type HeroProps = {
  profileCount: number;
};

// Mirrors packages callNumber()'s "CS·{DOMAIN LABEL}·{YY}" convention (apps/web/src/lib/card-face/
// model.ts) without importing it: that helper takes a full PublicCardData, and recordedBuild is a
// frozen plain-data module deliberately kept import-free (see recorded-build-data.ts's own header
// comment), so the same formula is restated here against recordedBuild's own domain/filedDate.
function callNumberFor(domain: string, filedDate: string): string {
  const label = (domain.split(".")[0] || domain).toUpperCase();
  const year = new Date(filedDate).getUTCFullYear();
  const yy = String(year % 100).padStart(2, "0");
  return `CS·${label}·${yy}`;
}

// Mirrors CardFace.tsx's local filedDateStamp: the receipt-register "2026·05·15" form.
function filedDateStamp(filedDate: string): string {
  const parsed = new Date(filedDate);
  if (Number.isNaN(parsed.getTime())) {
    return filedDate;
  }
  const year = parsed.getUTCFullYear();
  const month = String(parsed.getUTCMonth() + 1).padStart(2, "0");
  const day = String(parsed.getUTCDate()).padStart(2, "0");
  return `${year}·${month}·${day}`;
}

// The four source clippings docked to the left of the card, per the canonical mockup's desktop
// hero frame (docs/design/mockups/landing-page/Cold Start Landing.dc.html, lines 73-88): staggered
// vertically, each rotated a few degrees, peeking out of the gap between the hero copy and the
// card. The mockup drives these through a build animation (clippings fly in from -28px, one per
// stage); Task 18 owns that motion. This renders only its resting, fully-settled end state: every
// clipping visible, no offset, matching the mockup's own state once its animation reaches stage 4.
// Decorative and aria-hidden: the same headlines already read accessibly inside the card's own
// Signals section below.
function HeroClippings() {
  return (
    <>
      {recordedBuild.clippings.map((clipping, index) => (
        <div
          aria-hidden="true"
          className={`cs-landing-hero-clipping cs-landing-hero-clipping-${index + 1}`}
          key={clipping.headline}
        >
          <span className="cs-landing-hero-clipping-meta">
            {clipping.source} · {formatMediumDate(clipping.date)}
          </span>
          <span className="cs-landing-hero-clipping-headline">{clipping.headline}</span>
        </div>
      ))}
    </>
  );
}

// The hero's right column: recordedBuild rendered as its own finished card, statically (Task
// 17). Task 18 wires the sequential build animation (clippings floating in, sections fading up
// stage by stage, the seal inking, an elapsed timer) against this same frozen data; this task
// only renders the end state the animation will resolve to, clippings included (fix round 1 -
// desktop only, see landing.css; mobile still drops them per the brief).
function RecordedBuildCard() {
  const callNo = callNumberFor(recordedBuild.domain, recordedBuild.filedDate);
  const filedStamp = filedDateStamp(recordedBuild.filedDate);
  const finalEvent = recordedBuild.events[recordedBuild.events.length - 1] ?? "Filed";

  return (
    <div className="cs-landing-hero-card-column">
      <div className="cs-landing-hero-card-caption">
        <span>recorded build · {recordedBuild.domain}</span>
      </div>

      <div className="cs-landing-hero-card-object">
        <div aria-hidden="true" className="cs-landing-hero-card-ghost cs-landing-hero-card-ghost-back" />
        <div aria-hidden="true" className="cs-landing-hero-card-ghost cs-landing-hero-card-ghost-front" />
        <HeroClippings />
        <div className="cs-landing-hero-card">
          <div aria-hidden="true" className="cs-landing-hero-card-bar" />
          <div className="cs-landing-hero-card-top">
            <span className="cs-landing-hero-card-callno">{callNo}</span>
            <span className="cs-landing-hero-card-sourcecount">
              {recordedBuild.sections.sources.length} sources
            </span>
          </div>

          <div className="cs-landing-hero-card-body">
            <div className="cs-landing-hero-card-head">
              <div>
                <div className="cs-landing-hero-card-name">{recordedBuild.companyName}</div>
                <div className="cs-landing-hero-card-meta">
                  {recordedBuild.domain} · filed {filedStamp}
                </div>
              </div>
              <div className="cs-landing-hero-card-badges">
                <span className="cs-landing-hero-card-filed">FILED {filedStamp}</span>
                <span aria-hidden="true" className="cs-landing-hero-card-seal">
                  <span>CS</span>
                </span>
              </div>
            </div>

            <p className="cs-landing-hero-card-oneliner">{recordedBuild.oneLiner}</p>

            <div aria-hidden="true" className="cs-landing-hero-card-rule" />

            <div className="cs-landing-hero-card-section">
              <div className="cs-landing-hero-card-section-label">Money</div>
              {recordedBuild.sections.money.map((line) => (
                <p className="cs-landing-hero-card-bullet" key={line}>
                  <span aria-hidden="true" className="cs-landing-hero-card-mark" />
                  {line}
                </p>
              ))}
            </div>

            <div className="cs-landing-hero-card-section">
              <div className="cs-landing-hero-card-section-label">People</div>
              <p className="cs-landing-hero-card-bullet">
                <span aria-hidden="true" className="cs-landing-hero-card-mark" />
                {recordedBuild.sections.people.join(", ")}
              </p>
            </div>

            <div className="cs-landing-hero-card-section">
              <div className="cs-landing-hero-card-section-label">Signals</div>
              {recordedBuild.sections.signals.map((line) => (
                <p className="cs-landing-hero-card-bullet" key={line}>
                  <span aria-hidden="true" className="cs-landing-hero-card-mark" />
                  {line}
                </p>
              ))}
            </div>

            <div className="cs-landing-hero-card-section">
              <div className="cs-landing-hero-card-section-label">Sources</div>
              <p className="cs-landing-hero-card-sources">{recordedBuild.sections.sources.join(" · ")}</p>
            </div>
          </div>
        </div>
      </div>

      <p className="cs-landing-hero-card-status">{finalEvent}</p>
    </div>
  );
}

export function Hero({ profileCount }: HeroProps) {
  return (
    <section aria-label="Cold Start" className="cs-landing-hero">
      <div className="cs-landing-hero-copy">
        <h1>Deeply understand the companies you care about</h1>
        <p className="cs-landing-hero-subhead">Get up to speed like a serious investor would.</p>
        <div className="cs-landing-hero-actions">
          <Link className="cs-landing-seal-pill" href="/catalog">
            <span className="cs-landing-seal-pill-label">Browse the catalog</span>
            <span className="cs-landing-seal-pill-count">{profileCount} profiles filed</span>
          </Link>
        </div>
      </div>
      <RecordedBuildCard />
    </section>
  );
}
