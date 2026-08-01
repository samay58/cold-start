import React from "react";
import type { ReactNode } from "react";
import type { ResearchSection } from "@cold-start/core";
import { safeExternalHref } from "@cold-start/ui";
import { buildCitationIndex, callNumber, isThinFile, statSlots, vettedCounts, type PublicCardData } from "../../lib/card-face/model";
import { Stamp } from "./Stamp";
import { StatStrip } from "./StatStrip";

export type CardFaceProps = {
  card: PublicCardData;
  sections: ResearchSection[];
  texture?: ReactNode;
};

// The Stamp's FILED date reads like the rest of the receipt register (callNumber's
// "CS·VOXLATHE·26" uses the same middle-dot separator): "2026·05·15", not the "Mon YYYY"
// shorthand @cold-start/ui's formatShortDate produces for prose. UTC, matching every other
// date derived from generatedAt on this face.
function filedDateStamp(generatedAt: string): string {
  const parsed = new Date(generatedAt);
  if (Number.isNaN(parsed.getTime())) {
    return generatedAt;
  }
  const year = parsed.getUTCFullYear();
  const month = String(parsed.getUTCMonth() + 1).padStart(2, "0");
  const day = String(parsed.getUTCDate()).padStart(2, "0");
  return `${year}·${month}·${day}`;
}

// "retrieved {ISO minute} UTC" in the meta strip: truncate to minute precision, no seconds.
function isoMinute(generatedAt: string): string {
  const parsed = new Date(generatedAt);
  if (Number.isNaN(parsed.getTime())) {
    return generatedAt;
  }
  return parsed.toISOString().slice(0, 16);
}

function MetaStrip({ card, sourcesRead }: { card: PublicCardData; sourcesRead: number }) {
  return (
    <div className="cs-face-meta">
      <span className="cs-face-meta-left">
        <span className="cs-face-meta-brand">COLD START</span> / catalog / c/{card.slug}
      </span>
      <span className="cs-face-meta-right">
        retrieved {isoMinute(card.generatedAt)} UTC · {sourcesRead} source{sourcesRead === 1 ? "" : "s"} read
      </span>
    </div>
  );
}

function CardHeader({ card }: { card: PublicCardData }) {
  const title = card.identity.name.value ?? card.domain;
  const oneLiner = card.identity.oneLiner.value;
  const websiteHref = safeExternalHref(card.identity.websiteUrl?.value ?? `https://${card.domain}`);
  const hqCity = card.identity.hq.value?.city ?? null;
  const foundedYear = card.identity.foundedYear.value ?? null;
  const thin = isThinFile(card);

  return (
    <header className="cs-face-header">
      <div className="cs-face-header-main">
        <h1 className="cs-face-name">{title}</h1>
        {oneLiner ? <p className="cs-face-oneliner">{oneLiner}</p> : null}
        <p className="cs-face-receipt-meta">
          {websiteHref ? (
            <a className="cs-face-domain-link" href={websiteHref} rel="noreferrer noopener" target="_blank">
              {card.domain}
            </a>
          ) : (
            <span className="cs-face-domain-link">{card.domain}</span>
          )}
          {hqCity ? <span> · {hqCity}</span> : null}
          {foundedYear ? <span> · founded {foundedYear}</span> : null}
        </p>
      </div>
      <div className="cs-face-header-callno">
        <span className="cs-face-callno-label">CALL NO.</span>
        <span className="cs-face-callno-value">{callNumber(card)}</span>
        {thin ? (
          <Stamp kind="thin" sourceCount={vettedCounts(card).total} />
        ) : (
          <Stamp date={filedDateStamp(card.generatedAt)} kind="filed" />
        )}
      </div>
    </header>
  );
}

// The card object: ghost stack behind, the parchment face on top with its seal bar, WebGL
// texture, and CSS wear overlays, then the two-column reading grid inside the face. Tasks 6-9
// fill the marked slots without touching this shell.
export function CardFace({ card, sections: _sections, texture }: CardFaceProps) {
  const citationIndex = buildCitationIndex(card);
  const sourcesRead = citationIndex.ordered.length;

  return (
    <div className="cs-face-plate">
      <div className="cs-face-reading">
        <MetaStrip card={card} sourcesRead={sourcesRead} />
        <div className="cs-face-object">
          <div aria-hidden="true" className="cs-face-ghost cs-face-ghost-back" />
          <div aria-hidden="true" className="cs-face-ghost cs-face-ghost-front" />
          <div className="cs-face-card">
            <div aria-hidden="true" className="cs-face-seal-bar" />
            {texture}
            <div aria-hidden="true" className="cs-face-wear cs-face-wear-stains" />
            <div aria-hidden="true" className="cs-face-wear cs-face-wear-fiber" />
            <div className="cs-face-desktop">
              <div className="cs-face-main">
                <CardHeader card={card} />
                <StatStrip index={citationIndex} slots={statSlots(card)} />
                {/* section rows: Task 7 */}
              </div>
              <div className="cs-face-rail">{/* sources rail: Task 8 */}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
