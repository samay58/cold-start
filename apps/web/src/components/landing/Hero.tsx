import Link from "next/link";
import React from "react";
import { recordedBuild } from "./recorded-build-data";
import { RecordedBuild } from "./RecordedBuild";

export type HeroProps = {
  profileCount: number;
};

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
      <RecordedBuild build={recordedBuild} />
    </section>
  );
}
