import React from "react";
import type { ReactNode } from "react";
import type { ResearchSection } from "@cold-start/core";
import { safeExternalHref } from "@cold-start/ui";
import { buildCitationIndex, callNumber, isThinFile, statSlots, vettedCounts, type PublicCardData } from "../../lib/card-face/model";
import { ChoreographyProvider } from "./choreography";
import { SectionRows } from "./SectionRows";
import { SourcesRail } from "./SourcesRail";
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

function VettedChip({ card }: { card: PublicCardData }) {
  const counts = vettedCounts(card);
  if (counts.total === 0) {
    return null;
  }

  return (
    <span className="cs-face-vetted-chip">
      VETTED · {counts.verified} OF {counts.total}
    </span>
  );
}

function CardFooter({ card }: { card: PublicCardData }) {
  return (
    <div className="cs-face-footer">
      <span className="cs-face-footer-receipt">
        {callNumber(card)} · filed {filedDateStamp(card.generatedAt)} · sourced facts only
      </span>
      <VettedChip card={card} />
    </div>
  );
}

// The card object: ghost stack behind, the parchment face on top with its seal bar, WebGL
// texture, and CSS wear overlays, then the two-column reading grid inside the face, and the
// footer's call number / filed line / VETTED stamp below both columns. ChoreographyProvider
// (Task 8) wraps only the two-column grid: it is the only part of the face carrying citation
// marks and the sources rail those marks pair with.
export function CardFace({ card, sections, texture }: CardFaceProps) {
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
              <ChoreographyProvider>
                <div className="cs-face-main">
                  <CardHeader card={card} />
                  <StatStrip index={citationIndex} slots={statSlots(card)} />
                  <SectionRows card={card} index={citationIndex} sections={sections} />
                </div>
                <div className="cs-face-rail">
                  <SourcesRail index={citationIndex} />
                </div>
              </ChoreographyProvider>
            </div>
            <CardFooter card={card} />
          </div>
        </div>
      </div>
    </div>
  );
}
