"use client";

import { safePublicImageUrl } from "@cold-start/core";
import { motion, useInView, useReducedMotion } from "framer-motion";
import Link from "next/link";
import React, { useMemo, useRef, useState } from "react";
import type { ExhibitPair } from "./record-exhibit-data";
import { recordExhibit } from "./record-exhibit-data";

// The printout and the card (docs/superpowers/plans/2026-08-11-landing-exhibit-and-video-
// bookend.md, "Visual direction, decided 2026-08-12"): PitchBook's record renders as a cold
// continuous-feed printout, Cold Start's excerpt as a miniature filed catalogue card lapping
// onto the printout's sprocket strip. Geometry, offsets, and shadows live in landing.css,
// ported from docs/product/design/2026-08-12-record-exhibit-direction/d1.html.
//
// Same spring family as the hero's recorded build (DESIGN.md motion doctrine: stiff, well
// damped). Tally strokes draw once when a pair scrolls into view, one every ~60ms; everything
// else is still. This reads as print.
const STROKE_SPRING = { type: "spring", stiffness: 420, damping: 34 } as const;
const STROKE_STAGGER_S = 0.06;

// Hand-mark geometry: slightly uneven heights and angles so the strokes read as pen marks,
// never as straight margin bars. Rotation rides framer's transform (composed with the draw),
// so it cannot live in CSS.
const STROKE_VARIANTS = [
  { rotate: 9, height: 19 },
  { rotate: 7, height: 18 },
  { rotate: 10, height: 20 }
] as const;

// One hand tally stroke in the card's own left margin, beside a line their record has no
// field for. Decorative (aria-hidden); the marks carry no text of their own.
function TallyStroke({ order, drawn, isStatic }: { order: number; drawn: boolean; isStatic: boolean }) {
  const variant = STROKE_VARIANTS[order % STROKE_VARIANTS.length]!;
  return (
    <motion.span
      animate={{ scaleY: drawn ? 1 : 0, opacity: drawn ? 1 : 0 }}
      aria-hidden="true"
      className="cs-exhibit-tick"
      initial={isStatic ? false : { scaleY: 0, opacity: 0 }}
      style={{ height: variant.height, originY: 0, rotate: variant.rotate }}
      transition={{ ...STROKE_SPRING, delay: order * STROKE_STAGGER_S }}
    />
  );
}

// Frozen candidate URLs vetted through safePublicImageUrl, advancing on load error, with an
// initial-letter fallback: the extension CompanyLogo pattern minus its session cache.
function ExhibitLogo({ label, urls }: { label: string; urls: string[] }) {
  const candidates = useMemo(
    () => urls.map((url) => safePublicImageUrl(url)).filter((url): url is string => url !== null),
    [urls]
  );
  const [candidateIndex, setCandidateIndex] = useState(0);
  const src = candidates[candidateIndex] ?? null;
  return (
    <span aria-hidden="true" className="cs-exhibit-logo">
      {src ? (
        // Tiny frozen favicons: the Vercel image optimizer would add remote-host config and
        // per-image cost for nothing (same call as the invite card page).
        // eslint-disable-next-line @next/next/no-img-element
        <img alt="" decoding="async" loading="lazy" onError={() => setCandidateIndex((index) => index + 1)} src={src} />
      ) : (
        <span className="cs-exhibit-logo-fallback">{label.trim().charAt(0).toUpperCase() || "·"}</span>
      )}
    </span>
  );
}

function EvidenceMark({ state }: { state: string }) {
  return <span aria-hidden="true" className="cs-face-mark" data-state={state} />;
}

// Their record fragment: cold printout paper with sprocket strips (CSS pseudo-elements),
// a head naming the company and the source, then their fields verbatim.
function RecordFragment({ pair }: { pair: ExhibitPair }) {
  const { record } = pair;
  return (
    <div className="cs-exhibit-record-paper">
      <div className="cs-exhibit-record-inner">
        <div className="cs-exhibit-record-head">
          <ExhibitLogo label={pair.company} urls={pair.logoUrls} />
          <span>{pair.company}</span>
          <span className="cs-exhibit-record-src">PitchBook</span>
        </div>
        {record.description ? <p className="cs-exhibit-record-desc">{record.description}</p> : null}
        {record.fields ? (
          <dl className="cs-exhibit-record-fields">
            {record.fields.map((field) => (
              <div className="cs-exhibit-record-field" key={field.label}>
                <dt>{field.label}</dt>
                <dd data-dash={field.value === "—" ? "true" : undefined}>{field.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        {record.columns
          ? record.columns.map((column) => (
              <React.Fragment key={column.name}>
                <div className="cs-exhibit-record-colhead">{column.name}</div>
                {column.fields.map((field) => (
                  <div className="cs-exhibit-record-field" key={`${column.name}-${field.label}`}>
                    <span className="cs-exhibit-record-field-label">{field.label}</span>
                    <span className="cs-exhibit-record-field-value">{field.value}</span>
                  </div>
                ))}
              </React.Fragment>
            ))
          : null}
      </div>
    </div>
  );
}

// Our excerpt: a true miniature of the filed catalogue card. Call number and FILED date
// derive from the fixture's access date; strokes sit inside the card's own left margin.
function MiniCard({
  pair,
  drawn,
  isStatic,
  linkLabel,
  accessDate
}: {
  pair: ExhibitPair;
  drawn: boolean;
  isStatic: boolean;
  linkLabel: string;
  accessDate: string;
}) {
  let strokeOrder = -1;
  const callNumber = `CS · ${pair.slug.toUpperCase()} · ${accessDate.slice(2, 4)}`;
  const filedDate = accessDate.replaceAll("-", "·");

  return (
    <div className="cs-exhibit-mini-card">
      <div className="cs-exhibit-mini-head">
        <span className="cs-exhibit-call">{callNumber}</span>
        <span className="cs-exhibit-filed">
          FILED
          <small>{filedDate}</small>
        </span>
      </div>
      <div className="cs-exhibit-co-row">
        <ExhibitLogo label={pair.company} urls={pair.logoUrls} />
        <span className="cs-exhibit-co-name">{pair.company}</span>
      </div>
      <div className="cs-exhibit-lines">
        {pair.excerpt.lines.map((line) => {
          if (line.tick) {
            strokeOrder += 1;
          }
          const order = strokeOrder;
          return (
            <div className="cs-exhibit-line" key={line.text.slice(0, 40)}>
              {line.tick ? <TallyStroke drawn={drawn} isStatic={isStatic} order={order} /> : null}
              <EvidenceMark state={line.state} />
              {line.text}
            </div>
          );
        })}
        {(pair.excerpt.comps ?? []).map((comp) => {
          if (comp.tick) {
            strokeOrder += 1;
          }
          const order = strokeOrder;
          return (
            <div className="cs-exhibit-line" key={comp.name}>
              {comp.tick ? <TallyStroke drawn={drawn} isStatic={isStatic} order={order} /> : null}
              <EvidenceMark state={comp.state} />
              <span className="cs-exhibit-comp-name">{comp.name}</span>
              <span className="cs-exhibit-comp-domain">{comp.domain}</span>
              <div className="cs-exhibit-comp-basis">{comp.basis}</div>
              <div className="cs-exhibit-comp-hosts">{comp.sourceHosts.join(" · ")}</div>
            </div>
          );
        })}
      </div>
      <Link className="cs-exhibit-link" href={`/c/${pair.slug}`}>
        {linkLabel}
      </Link>
    </div>
  );
}

function PairBlock({
  pair,
  index,
  linkLabel,
  recordCaption,
  accessDate
}: {
  pair: ExhibitPair;
  index: number;
  linkLabel: string;
  recordCaption: string;
  accessDate: string;
}) {
  const prefersReducedMotion = useReducedMotion();
  const isStatic = Boolean(prefersReducedMotion);
  const deskRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(deskRef, { once: true, margin: "-80px" });
  const drawn = isStatic || isInView;

  return (
    <div className={`cs-exhibit-pair cs-exhibit-pair-${index + 1}`}>
      <h3 className="cs-exhibit-question">{pair.question}</h3>
      <div className="cs-exhibit-desk" ref={deskRef}>
        <div className="cs-exhibit-record-obj">
          <RecordFragment pair={pair} />
          {pair.noteSlip ? <div className="cs-exhibit-note-slip">{pair.noteSlip}</div> : null}
          <p className="cs-exhibit-record-caption">{recordCaption}</p>
        </div>
        <div className="cs-exhibit-card-obj">
          <MiniCard accessDate={accessDate} drawn={drawn} isStatic={isStatic} linkLabel={linkLabel} pair={pair} />
        </div>
      </div>
    </div>
  );
}

export function RecordExhibit() {
  const data = recordExhibit;

  return (
    <div className="cs-exhibit">
      <p className="cs-exhibit-kicker">{data.kicker}</p>

      <div className="cs-exhibit-printout">
        <span aria-hidden="true" className="cs-exhibit-perf" data-edge="top" />
        <span aria-hidden="true" className="cs-exhibit-perf" data-edge="bottom" />
        <div className="cs-exhibit-printout-body">
          <div className="cs-exhibit-printout-head">
            <span>{data.printoutTitle}</span>
            <span>accessed {data.accessDate}</span>
          </div>
          {data.stack.map((entry) => (
            <div className="cs-exhibit-printout-row" key={entry.company}>
              <span className="cs-exhibit-printout-co">{entry.company}</span>
              <span className="cs-exhibit-printout-text">{entry.text}</span>
            </div>
          ))}
        </div>
      </div>

      {data.pairs.map((pair, index) => (
        <PairBlock
          accessDate={data.accessDate}
          index={index}
          key={pair.slug}
          linkLabel={data.linkLabel}
          pair={pair}
          recordCaption={data.recordCaption}
        />
      ))}
    </div>
  );
}
