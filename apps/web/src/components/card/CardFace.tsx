import React from "react";
import type { ReactNode } from "react";
import { safeWebUrl, type ResearchSection } from "@cold-start/core";
import { buildCitationIndex, callNumber, filedDateStamp, isAgedCard, isThinFile, statSlots, vettedCounts, type PublicCardData } from "../../lib/card-face/model";
import { ChoreographyProvider } from "./choreography";
import { PocketCard } from "./PocketCard";
import { SectionRows } from "./SectionRows";
import { SourcesRail } from "./SourcesRail";
import { Stamp } from "./Stamp";
import { StatStrip } from "./StatStrip";

export type CardFaceProps = {
  card: PublicCardData;
  sections: ResearchSection[];
  texture?: ReactNode;
};

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
  const websiteHref = safeWebUrl(card.identity.websiteUrl?.value ?? `https://${card.domain}`);
  const hqCity = card.identity.hq.value?.city ?? null;
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
        {callNumber(card)} ·{" "}
        <span className="cs-filed-date" data-aged={isAgedCard(card) ? "true" : undefined}>
          filed {filedDateStamp(card.generatedAt)}
        </span>{" "}
        · sourced facts only
      </span>
      <VettedChip card={card} />
    </div>
  );
}

// The card object: ghost stack behind, the parchment face on top with its WebGL
// texture, and CSS wear overlays, then the two-column reading grid inside the face, and the
// footer's call number / filed line / VETTED stamp below both columns. ChoreographyProvider
// (Task 8) wraps only the two-column grid: it is the only part of the face carrying citation
// marks and the sources rail those marks pair with. `.cs-face-desktop` and `.cs-face-pocket`
// (Task 9) are both rendered unconditionally and sit as siblings inside the same card shell; the
// 700px media query in card.css picks one with `display: none` on the other, plus a single-ghost,
// stains-only variant of the same ghost/wear elements above for the pocket breakpoint, so there is
// no duplicate ghost stack or WebGL texture instantiated for the hidden face.
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
            <div className="cs-face-pocket">
              <PocketCard card={card} sections={sections} />
            </div>
            <CardFooter card={card} />
          </div>
        </div>
      </div>
    </div>
  );
}
