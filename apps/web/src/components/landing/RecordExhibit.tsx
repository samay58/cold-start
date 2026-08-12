"use client";

import { motion, useInView, useReducedMotion } from "framer-motion";
import Link from "next/link";
import React, { useRef } from "react";
import type { ExhibitPair } from "./record-exhibit-data";
import { recordExhibit } from "./record-exhibit-data";

// Same spring family as the hero's recorded build (DESIGN.md motion doctrine: stiff,
// well-damped, no cartoon bounce). Ticks draw once when a pair scrolls into view, one
// tick every ~60ms; everything else on the exhibit is still. This block reads as print.
const TICK_SPRING = { type: "spring", stiffness: 420, damping: 34 } as const;
const TICK_STAGGER_S = 0.06;

// One lilac tick in the card's left gutter: the only accent in the exhibit. Decorative
// (aria-hidden); the tally line below the pairs carries the count as real text.
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

// The left paper: their record, flat printout material, values full-contrast and verbatim.
function RecordPanel({ pair, caption }: { pair: ExhibitPair; caption: string }) {
  const { record } = pair;
  return (
    <div className="cs-exhibit-record">
      {record.description ? <p className="cs-exhibit-record-description">{record.description}</p> : null}
      {record.fields ? (
        <dl className="cs-exhibit-record-fields">
          {record.fields.map((field) => (
            <div className="cs-exhibit-record-field" key={field.label}>
              <dt>{field.label}</dt>
              <dd>{field.value}</dd>
              {field.note ? <p className="cs-exhibit-note">{field.note}</p> : null}
            </div>
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
      <p className="cs-exhibit-receipt">{caption}</p>
    </div>
  );
}

// The right paper: our card excerpt on the same parchment and classes /c/{slug} renders
// with, from frozen fixture data. The first line is the card's own summary line; the rest
// are evidence rows. Fades out mid-content; the link below opens the live card.
function ExcerptPanel({ pair, drawn, isStatic }: { pair: ExhibitPair; drawn: boolean; isStatic: boolean }) {
  let tickOrder = -1;

  return (
    <div className="cs-exhibit-card">
      <div className="cs-exhibit-card-head">
        <span className="cs-exhibit-card-name">{pair.company}</span>
        <span className="cs-exhibit-card-meta">c/{pair.slug}</span>
      </div>

      {pair.excerpt.lines.map((line, index) => {
        if (line.tick) {
          tickOrder += 1;
        }
        const order = tickOrder;
        return (
          <div className="cs-exhibit-line" key={line.text.slice(0, 40)}>
            <span aria-hidden="true" className="cs-exhibit-gutter">
              {line.tick ? <Tick drawn={drawn} isStatic={isStatic} order={order} /> : null}
            </span>
            {index === 0 ? (
              <p className="cs-exhibit-oneliner">{line.text}</p>
            ) : (
              <p className="cs-face-bullet">
                <EvidenceMark state={line.state} />
                {line.text}
              </p>
            )}
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
            <p className="cs-face-comp">
              <EvidenceMark state={comp.state} />
              <span className="cs-face-comp-name">{comp.name}</span>
              <span className="cs-face-comp-domain"> · {comp.domain}</span>
              {" · "}
              {comp.basis}
              <span className="cs-exhibit-comp-sources"> {comp.sourceHosts.join(" · ")}</span>
            </p>
          </div>
        );
      })}

      <div aria-hidden="true" className="cs-exhibit-card-fade" />
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
        <RecordPanel caption={recordCaption} pair={pair} />
        <ExcerptPanel drawn={drawn} isStatic={isStatic} pair={pair} />
      </div>
      <Link className="cs-exhibit-card-link" href={`/c/${pair.slug}`}>
        {linkLabel}
      </Link>
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
        <p className="cs-exhibit-receipt cs-exhibit-stack-caption">{data.stackCaption}</p>
      </div>

      {data.pairs.map((pair) => (
        <PairBlock key={pair.slug} linkLabel={data.linkLabel} pair={pair} recordCaption={data.recordCaption} />
      ))}

      <p className="cs-exhibit-tally">{data.tally}</p>
    </div>
  );
}
