"use client";

import { formatMediumDate } from "@cold-start/ui";
import { motion, useInView, useReducedMotion } from "framer-motion";
import React, { useEffect, useRef, useState } from "react";
import { callNumberFor, filedDateStamp } from "../../lib/card-face/model";
import type { RecordedBuild as RecordedBuildData } from "./recorded-build-data";

// The hero's recorded build: a real profile (frozen production data, Task 16) assembling itself
// on grounded springs. Stage machine and bindings mirror the canonical mockup's `renderVals()`
// (docs/design/mockups/landing-page/Cold Start Landing.dc.html, lines 672-702): stage runs 0..6,
// starting 600ms after the card scrolls into view, then advancing one stage every 850ms until it
// holds at 6 (filed). Four clippings and five sections (summary, money, people, signals, sources)
// reveal one stage apart; the seal inks up as those reveal; the FILED stamp settles only at the
// final stage.
const STAGE_COUNT = 6;
const INITIAL_DELAY_MS = 600;
const STAGE_INTERVAL_MS = 850;

// DESIGN.md's motion doctrine: "stiff, well-damped springs tuned just under critical damping"
// (zeta roughly 0.85-1.0). stiffness 420 / damping 34 sits at zeta ~0.83, a fast settle with a
// breath of follow-through, no cartoon bounce.
const SETTLE_SPRING = { type: "spring", stiffness: 420, damping: 34 } as const;

// The plan-mandated numeric form of --color-seal (#6E5C9E = rgb(110 92 158)): Framer Motion
// animates background-color through discrete rgb channels, so the token has to be restated
// numerically here to animate its alpha as the seal inks up.
const SEAL_RGB = "110 92 158";

// Slide-in offsets and per-clipping rotation, in the same order as recordedBuild.clippings.
const CLIPPING_ROTATIONS_DEG = [1.4, -1.8, -1, 1.8] as const;
const CLIPPING_HIDDEN_X = -28;

const NARROW_VIEWPORT_QUERY = "(max-width: 700px)";

// Below 700px the component renders the finished card statically with no clippings, matching the
// mockup's mobile frame and Task 17's original placeholder. Defaults to `false` (matching SSR, no
// `window`) and only flips after mount, trading a possible one-frame flash on a genuinely narrow
// device for a markup that never disagrees with what the server sent.
function useIsNarrowViewport(): boolean {
  const [isNarrow, setIsNarrow] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return undefined;
    }
    const query = window.matchMedia(NARROW_VIEWPORT_QUERY);
    const update = () => setIsNarrow(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return isNarrow;
}

// The receipt event line must never read "Filed" before the FILED stamp itself lands (stage 6).
// The canonical mockup pairs one event string per stage (7 entries: docs/design/mockups/landing-
// page/Cold Start Landing.dc.html, lines 675-682), so its own `events[Math.min(stage, 6)]` always
// lands "Filed" exactly on the stamp. The frozen recordedBuild export only carries 4 events
// (Task 16's real trace produced fewer distinct lines than the mockup's placeholder array), so
// that same formula overruns the array early and reads "Filed" three stages ahead of the stamp.
// Stages 0..(events.length - 2) walk the array normally; every stage after that holds on the
// second-to-last entry; only stage 6 reveals the last one.
export function eventLineFor(build: RecordedBuildData, stage: number): string {
  const events = build.events;
  if (events.length === 0) {
    return "";
  }
  if (stage >= STAGE_COUNT) {
    return events[events.length - 1] ?? "";
  }
  return events[Math.max(0, Math.min(stage, events.length - 2))] ?? "";
}

export function RecordedBuild({ build }: { build: RecordedBuildData }) {
  const prefersReducedMotion = useReducedMotion();
  const isNarrowViewport = useIsNarrowViewport();
  // Reduced motion and the narrow-viewport rule get the same treatment: render the finished card
  // at rest, no timers, no replay. Step 2 of the brief only names reduced motion explicitly, but
  // Step 3's "render the finished card statically" for mobile is the same end state for a
  // different reason (screen space, not accessibility), so one flag drives both.
  const isStatic = Boolean(prefersReducedMotion) || isNarrowViewport;

  const objectRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(objectRef, { once: true });

  const [stage, setStage] = useState(0);
  const [replayToken, setReplayToken] = useState(0);

  useEffect(() => {
    if (isStatic || !isInView) {
      return undefined;
    }

    setStage(0);
    const timers = Array.from({ length: STAGE_COUNT }, (_, index) => {
      const nextStage = index + 1;
      const delay = INITIAL_DELAY_MS + index * STAGE_INTERVAL_MS;
      return setTimeout(() => setStage(nextStage), delay);
    });

    return () => {
      timers.forEach(clearTimeout);
    };
    // replayToken is a write-only trigger: bumping it re-enters this effect and reschedules the
    // sequence from stage 0. It doesn't need to appear inside the effect body, only in this array.
  }, [isInView, isStatic, replayToken]);

  const displayStage = isStatic ? STAGE_COUNT : stage;
  const filed = displayStage >= STAGE_COUNT;
  const sealAlpha = Math.min(displayStage, 4) * 0.05;
  const sealScale = filed ? 1.04 : 1;
  const eventLine = eventLineFor(build, displayStage);
  const elapsed = `${(displayStage * 0.7).toFixed(1)}s`;

  const callNo = callNumberFor(build.domain, build.filedDate);
  const filedStamp = filedDateStamp(build.filedDate);

  function handleReplay() {
    setStage(0);
    setReplayToken((token) => token + 1);
  }

  function clippingVisible(index: number): boolean {
    return displayStage > index;
  }

  function sectionVisible(index: number): boolean {
    return displayStage > index;
  }

  return (
    <div className="cs-landing-hero-card-column">
      <div className="cs-landing-hero-card-caption">
        <span>recorded build · {build.domain}</span>
        {isStatic ? null : (
          <button className="cs-landing-hero-card-replay" onClick={handleReplay} type="button">
            replay
          </button>
        )}
      </div>

      <div className="cs-landing-hero-card-object" ref={objectRef}>
        <div aria-hidden="true" className="cs-landing-hero-card-ghost cs-landing-hero-card-ghost-back" />
        <div aria-hidden="true" className="cs-landing-hero-card-ghost cs-landing-hero-card-ghost-front" />

        {build.clippings.map((clipping, index) => {
          const rotate = CLIPPING_ROTATIONS_DEG[index] ?? 0;
          const visible = clippingVisible(index);
          return (
            <motion.div
              animate={{ x: visible ? 0 : CLIPPING_HIDDEN_X, opacity: visible ? 1 : 0, rotate }}
              aria-hidden="true"
              className={`cs-landing-hero-clipping cs-landing-hero-clipping-${index + 1}`}
              initial={isStatic ? false : { x: CLIPPING_HIDDEN_X, opacity: 0, rotate }}
              key={clipping.headline}
              transition={SETTLE_SPRING}
            >
              <span className="cs-landing-hero-clipping-meta">
                {clipping.source} · {formatMediumDate(clipping.date)}
              </span>
              <span className="cs-landing-hero-clipping-headline">{clipping.headline}</span>
            </motion.div>
          );
        })}

        <div className="cs-landing-hero-card">
          <div aria-hidden="true" className="cs-landing-hero-card-bar" />
          <div className="cs-landing-hero-card-top">
            <span className="cs-landing-hero-card-callno">{callNo}</span>
            <span className="cs-landing-hero-card-sourcecount">{build.sections.sources.length} sources</span>
          </div>

          <div className="cs-landing-hero-card-body">
            <div className="cs-landing-hero-card-head">
              <div>
                <div className="cs-landing-hero-card-name">{build.companyName}</div>
                <div className="cs-landing-hero-card-meta">
                  {build.domain} · filed {filedStamp}
                </div>
              </div>
              <div className="cs-landing-hero-card-badges">
                <motion.span
                  animate={{ opacity: filed ? 1 : 0, scale: filed ? 1 : 0.85, rotate: -6 }}
                  className="cs-landing-hero-card-filed"
                  initial={isStatic ? false : { opacity: 0, scale: 0.85, rotate: -6 }}
                  transition={SETTLE_SPRING}
                >
                  FILED {filedStamp}
                </motion.span>
                <motion.span
                  animate={{ backgroundColor: `rgb(${SEAL_RGB} / ${sealAlpha})`, scale: sealScale, rotate: -4 }}
                  aria-hidden="true"
                  className="cs-landing-hero-card-seal"
                  initial={isStatic ? false : { backgroundColor: `rgb(${SEAL_RGB} / 0)`, scale: 1, rotate: -4 }}
                  transition={SETTLE_SPRING}
                >
                  <span>CS</span>
                </motion.span>
              </div>
            </div>

            <motion.p
              animate={{ opacity: sectionVisible(0) ? 1 : 0.12 }}
              className="cs-landing-hero-card-oneliner"
              initial={isStatic ? false : { opacity: 0.12 }}
              transition={SETTLE_SPRING}
            >
              {build.oneLiner}
            </motion.p>

            <div aria-hidden="true" className="cs-landing-hero-card-rule" />

            <motion.div
              animate={{ opacity: sectionVisible(1) ? 1 : 0.12 }}
              className="cs-landing-hero-card-section"
              initial={isStatic ? false : { opacity: 0.12 }}
              transition={SETTLE_SPRING}
            >
              <div className="cs-landing-hero-card-section-label">Money</div>
              {build.sections.money.map((line) => (
                <p className="cs-landing-hero-card-bullet" key={line}>
                  <span aria-hidden="true" className="cs-landing-hero-card-mark" />
                  {line}
                </p>
              ))}
            </motion.div>

            <motion.div
              animate={{ opacity: sectionVisible(2) ? 1 : 0.12 }}
              className="cs-landing-hero-card-section"
              initial={isStatic ? false : { opacity: 0.12 }}
              transition={SETTLE_SPRING}
            >
              <div className="cs-landing-hero-card-section-label">People</div>
              <p className="cs-landing-hero-card-bullet">
                <span aria-hidden="true" className="cs-landing-hero-card-mark" />
                {build.sections.people.join(", ")}
              </p>
            </motion.div>

            <motion.div
              animate={{ opacity: sectionVisible(3) ? 1 : 0.12 }}
              className="cs-landing-hero-card-section"
              initial={isStatic ? false : { opacity: 0.12 }}
              transition={SETTLE_SPRING}
            >
              <div className="cs-landing-hero-card-section-label">Signals</div>
              {build.sections.signals.map((line) => (
                <p className="cs-landing-hero-card-bullet" key={line}>
                  <span aria-hidden="true" className="cs-landing-hero-card-mark" />
                  {line}
                </p>
              ))}
            </motion.div>

            <motion.div
              animate={{ opacity: sectionVisible(4) ? 1 : 0.12 }}
              className="cs-landing-hero-card-section"
              initial={isStatic ? false : { opacity: 0.12 }}
              transition={SETTLE_SPRING}
            >
              <div className="cs-landing-hero-card-section-label">Sources</div>
              <p className="cs-landing-hero-card-sources">{build.sections.sources.join(" · ")}</p>
            </motion.div>
          </div>
        </div>
      </div>

      <div className="cs-landing-hero-card-status">
        <span>{eventLine}</span>
        <span className="cs-landing-hero-card-elapsed">{elapsed}</span>
      </div>
    </div>
  );
}
