"use client";

import { motion, useInView, useReducedMotion } from "framer-motion";
import Link from "next/link";
import React, { useRef } from "react";
import type { ExhibitPair } from "./record-exhibit-data";
import { recordExhibit } from "./record-exhibit-data";

// A typographic exhibit, not a pair of boxes: everything sits on the page ground with
// hairline rules and whitespace doing the separating. Same spring family as the hero's
// recorded build (DESIGN.md motion doctrine: stiff, well-damped). Ticks draw once when a
// pair scrolls into view, one every ~60ms; everything else is still. This reads as print.
const TICK_SPRING = { type: "spring", stiffness: 420, damping: 34 } as const;
const TICK_STAGGER_S = 0.06;

// One lilac tick beside a line the left record has no field for: the only accent here.
// Decorative (aria-hidden); the tally line carries the count as real text.
function Tick({ order, drawn, isStatic }: { order: number; drawn: boolean; isStatic: boolean }) {
  return (
    <motion.span
      animate={{ scaleY: drawn ? 1 : 0, opacity: drawn ? 1 : 0 }}
      className="cs-exhibit-tick"
      initial={isStatic ? false : { scaleY: 0, opacity: 0 }}
      transition={{ ...TICK_SPRING, delay: order * TICK_STAGGER_S }}
    />
  );
}

function EvidenceMark({ state }: { state: string }) {
  return <span aria-hidden="true" className="cs-face-mark" data-state={state} />;
}

// Their column: the record as they publish it, verbatim values, hairline rows.
function RecordColumn({ pair, caption }: { pair: ExhibitPair; caption: string }) {
  const { record } = pair;
  return (
    <div className="cs-exhibit-side">
      <p className="cs-exhibit-side-head">{caption}</p>
      {record.description ? <p className="cs-exhibit-record-description">{record.description}</p> : null}
      {record.fields ? (
        <dl className="cs-exhibit-record-fields">
          {record.fields.map((field) => (
            <React.Fragment key={field.label}>
              <div className="cs-exhibit-record-field">
                <dt>{field.label}</dt>
                <dd>{field.value}</dd>
              </div>
              {field.note ? <div className="cs-exhibit-note">{field.note}</div> : null}
            </React.Fragment>
          ))}
        </dl>
      ) : null}
      {record.columns ? (
        <div className="cs-exhibit-record-columns">
          {record.columns.map((column) => (
            <div className="cs-exhibit-record-column" key={column.name}>
              <span className="cs-exhibit-record-column-name">{column.name}</span>
              {column.fields.map((field) => (
                <p className="cs-exhibit-record-column-field" key={field.label}>
                  <span>{field.label}</span> {field.value}
                </p>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// Our column: short lines clipped from the live card, each with its evidence mark, a tick
// beside every line their record has no field for, and the link to the full profile.
function ExcerptColumn({
  pair,
  drawn,
  isStatic,
  linkLabel
}: {
  pair: ExhibitPair;
  drawn: boolean;
  isStatic: boolean;
  linkLabel: string;
}) {
  let tickOrder = -1;

  return (
    <div className="cs-exhibit-side">
      <p className="cs-exhibit-side-head">Cold Start · c/{pair.slug}</p>

      {pair.excerpt.lines.map((line) => {
        if (line.tick) {
          tickOrder += 1;
        }
        const order = tickOrder;
        return (
          <div className="cs-exhibit-line" key={line.text.slice(0, 40)}>
            <span aria-hidden="true" className="cs-exhibit-gutter">
              {line.tick ? <Tick drawn={drawn} isStatic={isStatic} order={order} /> : null}
            </span>
            <p className="cs-exhibit-line-text">
              <EvidenceMark state={line.state} />
              {line.text}
            </p>
          </div>
        );
      })}

      {(pair.excerpt.comps ?? []).map((comp) => {
        if (comp.tick) {
          tickOrder += 1;
        }
        const order = tickOrder;
        return (
          <div className="cs-exhibit-line" key={comp.name}>
            <span aria-hidden="true" className="cs-exhibit-gutter">
              {comp.tick ? <Tick drawn={drawn} isStatic={isStatic} order={order} /> : null}
            </span>
            <p className="cs-exhibit-line-text">
              <EvidenceMark state={comp.state} />
              <span className="cs-exhibit-comp-name">{comp.name}</span> {comp.basis}
              <span className="cs-exhibit-comp-sources"> {comp.sourceHosts.join(" · ")}</span>
            </p>
          </div>
        );
      })}

      <Link className="cs-exhibit-link" href={`/c/${pair.slug}`}>
        {linkLabel}
      </Link>
    </div>
  );
}

function PairBlock({ pair, linkLabel, recordCaption }: { pair: ExhibitPair; linkLabel: string; recordCaption: string }) {
  const prefersReducedMotion = useReducedMotion();
  const isStatic = Boolean(prefersReducedMotion);
  const deskRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(deskRef, { once: true, margin: "-80px" });
  const drawn = isStatic || isInView;

  return (
    <div className="cs-exhibit-pair">
      <h3 className="cs-exhibit-question">{pair.question}</h3>
      <div className="cs-exhibit-desk" ref={deskRef}>
        <RecordColumn caption={recordCaption} pair={pair} />
        <ExcerptColumn drawn={drawn} isStatic={isStatic} linkLabel={linkLabel} pair={pair} />
      </div>
    </div>
  );
}

export function RecordExhibit() {
  const data = recordExhibit;

  return (
    <div className="cs-exhibit">
      <p className="cs-exhibit-kicker">{data.kicker}</p>

      <div className="cs-exhibit-stack">
        {data.stack.map((entry) => (
          <div className="cs-exhibit-stack-row" key={entry.company}>
            <span className="cs-exhibit-stack-company">{entry.company}</span>
            <span className="cs-exhibit-stack-text">{entry.text}</span>
          </div>
        ))}
        <p className="cs-exhibit-stack-caption">{data.stackCaption}</p>
      </div>

      {data.pairs.map((pair) => (
        <PairBlock key={pair.slug} linkLabel={data.linkLabel} pair={pair} recordCaption={data.recordCaption} />
      ))}

      <p className="cs-exhibit-tally">{data.tally}</p>
    </div>
  );
}
