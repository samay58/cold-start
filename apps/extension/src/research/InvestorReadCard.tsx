import {
  synthesisAdvisoriesFromSignals,
  synthesisEvidenceSignals,
  type ColdStartCard,
  type SynthesisAdvisory
} from "@cold-start/core";
import { AnimatePresence, motion, type TargetAndTransition, type Transition } from "framer-motion";
import { useState, type ReactNode } from "react";
import type { InvestorReadDisplay, LensTensionClaim } from "./investor-lens";
import { advisoryCopy, isSynthesisAdvisory } from "./synthesis-advisory-copy";
import { commitSpring, motionTokens } from "../shared/motion-primitives";
import type { TooltipPropsFor } from "../shared/SharedTooltip";
import { usePrefersReducedMotion } from "../shared/usePrefersReducedMotion";

const LENS_FOOTER_SOURCE_COUNT = 4;

// Five-role type scale, DESIGN.md "Investor Lens Memo" (verbatim table, memo typography track
// of docs/product/gold-standard-references.md): Lede 16px/1.45 At Umami 640 is the only
// display-face content text; Section label ("The case", "Timing", "Next question") is 11px At
// Umami 620 in the seal color, sentence case; Claim rows (bull/bear/timing/question bodies) are
// 13px IBM Plex Sans 450 at 1.55 line-height; Meta (posture line, "changes the read if" note) is
// 11.5px IBM Plex Sans 480; Receipt (citation marks, source domains, the filed stamp) is 10px At
// Textual tabular with at least 0.32px tracking. Section label and Meta sit 0.5px apart on
// purpose: Carbon's heading-01/body-01 pairing (both roles equal in size elsewhere in Carbon,
// split by weight and color alone) is the citation for reading that boundary through face and
// color rather than the gap. Every rule in the card maps to one of these five rows; nothing
// else earns its own size.

// Staged spring entrance for a freshly filed read. Four stages -- lede, the case, timing plus
// next question, footer plus posture -- fire in sequence, each on commitSpring (stiffness 470,
// damping 31, mass 0.62, zeta ~0.91: DESIGN.md's stiff well-damped band, settle fast with a
// breath of follow-through, no cartoon bounce). 140ms between stage starts puts the last stage
// firing at 420ms; the sequence reads as visibly settled roughly 540-590ms after it starts.
// Framer-motion's own rest threshold (restDelta 0.01) against the 10px y displacement stretches
// the technical completion tail out to nearer 700ms, well past where the eye can tell the motion
// is done -- that gap is expected, not a bug, and not the number to design the perceived timing
// against. Transform (y) and opacity only, never scale.
//
// This only plays on a live trigger/running/withheld -> result handoff. AnimatePresence's own
// initial={false} in ResearchLayerPanel's LensSlot blocks the mount animation for every nested
// motion node on that panel's first render (framer-motion cascades PresenceContext.initial to
// descendants, not just the direct AnimatePresence child), so a cached card that already carries
// synthesis renders its stagger stages at rest immediately -- the arrival choreography is never
// replayed just because the profile was reloaded.
const LENS_ENTRANCE_STAGE_DELAYS = {
  lede: 0,
  case: 0.14,
  timingQuestion: 0.28,
  footer: 0.42
} as const;

// Reduced motion collapses every stage into one 150ms opacity fade fired at once (DESIGN.md:
// prefers-reduced-motion is a reduction, never a freeze, so the entrance still animates). The y
// transform drops entirely rather than shortening, matching the reduced-motion branches already
// used elsewhere in this panel.
const LENS_ENTRANCE_REDUCED_TRANSITION: Transition = { duration: 0.15, ease: motionTokens.easeOut };

function stageEntranceProps(
  delaySeconds: number,
  prefersReducedMotion: boolean | null
): { animate: TargetAndTransition; initial: TargetAndTransition; transition: Transition } {
  if (prefersReducedMotion) {
    return {
      animate: { opacity: 1 },
      initial: { opacity: 0 },
      transition: LENS_ENTRANCE_REDUCED_TRANSITION
    };
  }
  return {
    animate: { opacity: 1, y: 0 },
    initial: { opacity: 0, y: 10 },
    transition: { ...commitSpring, delay: delaySeconds }
  };
}

// A frozen SynthesisWithheld record and live synthesis are mutually exclusive at rest:
// generate-card.ts strips synthesisWithheld the instant a run produces verified synthesis. This
// only guards stale or hand-built data from blending frozen and live evidence signals on one
// surface -- in the ordinary case synthesisWithheld is absent here and the live branch runs.
function evidencePostureLines(card: ColdStartCard): string[] {
  const { nonEnrichmentSourceTypes } = synthesisEvidenceSignals(card);
  const advisories: readonly SynthesisAdvisory[] = card.synthesisWithheld
    ? card.synthesisWithheld.advisories.filter(isSynthesisAdvisory)
    : synthesisAdvisoriesFromSignals(synthesisEvidenceSignals(card));

  return advisories.map((advisory) => advisoryCopy(advisory, nonEnrichmentSourceTypes));
}

// The measured-height expansion pattern already used for research-layer card bodies
// (.cs-active-enrichment-body-frame in research-trail.css: grid-template-rows 0fr -> 1fr,
// transform/opacity, no JS height measurement), applied here so the three retiring lens
// tooltips (holds/breaks moreClaims, timing moreFields, next-question moreQuestions) become
// inline disclosure instead. Reduced motion collapses the transition to instant, never a freeze
// or missing content: the DOM always carries the overflow content, only the visual reveal
// changes.
function LensDisclosure({
  children,
  count,
  prefersReducedMotion,
  row
}: {
  children: ReactNode;
  count: number;
  prefersReducedMotion: boolean | null;
  row: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const bodyId = `cs-investor-read-more-${row}`;

  return (
    <div className="cs-investor-read-disclosure" data-row={row}>
      <button
        aria-controls={bodyId}
        aria-expanded={expanded}
        className="cs-investor-read-more"
        onClick={() => setExpanded((value) => !value)}
        type="button"
      >
        {expanded ? "Show less" : `+${count} more`}
      </button>
      <div
        className="cs-investor-read-disclosure-frame"
        data-expanded={expanded ? "true" : "false"}
        data-reduced-motion={prefersReducedMotion ? "true" : "false"}
        id={bodyId}
      >
        <div className="cs-investor-read-disclosure-body">{children}</div>
      </div>
    </div>
  );
}

// Opposition treatment: holds claims lead with a filled ink square, breaks claims lead with the
// conflict-class slashed square (oxide --color-conflict). Marks only, no washes; data-side
// (already on the row) and data-mark are what CSS and tests key off, not color alone.
function ClaimMark({ side }: { side: "holds" | "breaks" }) {
  return (
    <span
      aria-hidden="true"
      className="cs-lens-mark"
      data-mark={side === "holds" ? "filled" : "slashed"}
      data-side={side}
    />
  );
}

function LensTensionSide({
  claim,
  emptyCopy,
  label,
  prefersReducedMotion,
  side
}: {
  claim: LensTensionClaim | null;
  emptyCopy: string;
  label: string;
  prefersReducedMotion: boolean | null;
  side: "holds" | "breaks";
}) {
  return (
    <section className="cs-lens-tension-side" data-side={side}>
      <p className="cs-investor-read-claim">
        <ClaimMark side={side} />
        <em>{label}.</em> {claim ? claim.text : <span className="cs-lens-none">{emptyCopy}</span>}
      </p>
      {claim && claim.moreClaims.length > 0 ? (
        <LensDisclosure count={claim.moreClaims.length} prefersReducedMotion={prefersReducedMotion} row={side}>
          {claim.moreClaims.map((entry) => (
            <p key={entry.text}>{entry.text}</p>
          ))}
        </LensDisclosure>
      ) : null}
    </section>
  );
}

export function InvestorReadCard({
  card,
  read,
  tooltipProps
}: {
  card: ColdStartCard;
  read: InvestorReadDisplay;
  tooltipProps: TooltipPropsFor;
}) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const visibleSources = read.sources.slice(0, LENS_FOOTER_SOURCE_COUNT);
  const hiddenSources = read.sources.slice(LENS_FOOTER_SOURCE_COUNT);
  const postureLines = evidencePostureLines(card);
  const showPosture = postureLines.length > 0 || !read.independentlyBacked;

  return (
    <article className="cs-investor-read" aria-label="Investor read">
      <header className="cs-investor-read-head">
        <span>Investor read</span>
      </header>
      <motion.p
        className="cs-investor-read-lede"
        data-role="lede"
        {...stageEntranceProps(LENS_ENTRANCE_STAGE_DELAYS.lede, prefersReducedMotion)}
      >
        {read.lede.text}
      </motion.p>
      <motion.div
        className="cs-lens-tension"
        aria-label="The case"
        {...stageEntranceProps(LENS_ENTRANCE_STAGE_DELAYS.case, prefersReducedMotion)}
      >
        <h4 className="cs-investor-read-label">The case</h4>
        {!read.holds && !read.breaks ? (
          <p className="cs-lens-case-empty cs-lens-none">No bull or break claim survived verification.</p>
        ) : (
          <>
            <LensTensionSide
              claim={read.holds}
              emptyCopy="No supporting claim survived verification."
              label="If true"
              prefersReducedMotion={prefersReducedMotion}
              side="holds"
            />
            <LensTensionSide
              claim={read.breaks}
              emptyCopy="No breaking claim survived verification."
              label="It breaks if"
              prefersReducedMotion={prefersReducedMotion}
              side="breaks"
            />
          </>
        )}
      </motion.div>
      <motion.div {...stageEntranceProps(LENS_ENTRANCE_STAGE_DELAYS.timingQuestion, prefersReducedMotion)}>
        <section className="cs-lens-timing" data-supported={read.timing ? "true" : "false"} aria-label="Timing">
          <h4 className="cs-investor-read-label">Timing</h4>
          {read.timing ? (
            <>
              <p className="cs-investor-read-claim">
                <em>{read.timing.field}.</em> {read.timing.text}
              </p>
              {read.timing.moreFields.length > 0 ? (
                <LensDisclosure count={read.timing.moreFields.length} prefersReducedMotion={prefersReducedMotion} row="timing">
                  {read.timing.moreFields.map((entry) => (
                    <p key={entry.field}>
                      <em>{entry.field}.</em> {entry.text}
                    </p>
                  ))}
                </LensDisclosure>
              ) : null}
            </>
          ) : (
            <p className="cs-lens-none">Not supported by current sources.</p>
          )}
        </section>
        <section className="cs-lens-question" aria-label="Next question">
          <h4 className="cs-investor-read-label">Next question</h4>
          {read.nextQuestion ? (
            <>
              <p className="cs-investor-read-claim">
                {read.nextQuestion.question}
                {read.nextQuestion.categoryLabel ? (
                  <span className="cs-lens-question-category">{read.nextQuestion.categoryLabel}</span>
                ) : null}
              </p>
              {read.nextQuestion.changesReadIf ? (
                <p className="cs-investor-read-meta">
                  <em>Changes the read if</em> {read.nextQuestion.changesReadIf}
                </p>
              ) : null}
              {read.nextQuestion.moreQuestions.length > 0 ? (
                <LensDisclosure count={read.nextQuestion.moreQuestions.length} prefersReducedMotion={prefersReducedMotion} row="question">
                  {read.nextQuestion.moreQuestions.map((entry) => (
                    <div key={entry.question}>
                      <p>
                        {entry.categoryLabel ? <span className="cs-lens-question-category">{entry.categoryLabel}</span> : null}
                        {entry.question}
                      </p>
                      {entry.changesReadIf ? (
                        <p className="cs-investor-read-meta">
                          <em>Changes the read if</em> {entry.changesReadIf}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </LensDisclosure>
              ) : null}
            </>
          ) : (
            <p className="cs-lens-none">No ranked question survived verification.</p>
          )}
        </section>
      </motion.div>
      <motion.div {...stageEntranceProps(LENS_ENTRANCE_STAGE_DELAYS.footer, prefersReducedMotion)}>
        <footer className="cs-lens-footer" aria-label="Cited sources">
          <div className="cs-lens-footer-sources">
            {visibleSources.map((source) => (
              <a
                className="cs-lens-source"
                data-class={source.sourceClass}
                href={source.href}
                key={source.id}
                rel="noreferrer"
                target="_blank"
                title={`${source.qualityLabel}: ${source.title}`}
              >
                <i aria-hidden="true" />
                {source.domain}
              </a>
            ))}
            {hiddenSources.length > 0 ? (
              <button
                className="cs-lens-source cs-lens-source-more"
                type="button"
                {...tooltipProps({
                  body: hiddenSources.map((source) => `${source.domain}: ${source.title}`).join("\n"),
                  id: "lens-sources-more",
                  placement: "above",
                  title: "Also cited"
                })}
              >
                {`+${hiddenSources.length}`}
              </button>
            ) : null}
          </div>
          <small className="cs-lens-footer-filed">{read.receiptLine}</small>
        </footer>
        {showPosture ? (
          <div aria-label="Evidence posture" className="cs-investor-read-posture">
            {!read.independentlyBacked ? (
              <p className="cs-investor-read-meta cs-lens-footer-caveat">No independent source in this read.</p>
            ) : null}
            {postureLines.map((line) => (
              <p className="cs-investor-read-meta" key={line}>{line}</p>
            ))}
          </div>
        ) : null}
      </motion.div>
    </article>
  );
}

export type LensSlotState = "result" | "running" | "trigger" | "withheld";

const LENS_SLOT_TRANSITION: Transition = { duration: motionTokens.stateMs, ease: motionTokens.easeOut };
const LENS_SLOT_REDUCED_TRANSITION: Transition = { duration: 0.1, ease: "easeOut" };

// The trigger/running/result/withheld swap is the single most important state change on this
// panel (it is the moment the lens either starts, is still working, or has an answer), so it
// crossfades rather than hard-cutting (DESIGN.md motion language). mode="popLayout": the parent
// .cs-lens-slot is a display: grid, so the default sync mode leaves the exiting card occupying
// its own grid row for the whole ~200ms overlap -- the slot balloons by the exiting card's
// height plus the row gap and everything below it reflows for that window (verified live: a real
// running -> result swap measured slotHeight jumping 79px -> 1169px -> 1080px while both nodes
// were mounted). popLayout applies position: absolute to the exiting node the instant its exit
// starts, so it stops sizing the grid and the entering card superimposes on it in place instead
// of stacking below it -- re-measured after this fix, the same swap holds at ~1080px throughout.
// It still overlaps rather than waiting (this codebase's convention everywhere else --
// ResearchLayerPanel's own AnimatePresence blocks, CompanyArc's phase and ReadRegion swaps -- is
// the sync default; popLayout keeps that overlap, it only changes how the exiting node is laid
// out during it). .cs-lens-slot carries position: relative (research-trail.css) so the popped
// node's injected absolute offsets resolve against the slot's own box, not an ancestor further
// up. 200ms via motionTokens.stateMs, the same token this file already uses for panel-level state
// transitions, sits inside the 180-220ms band from the plan. AnimatePresence's own initial={false}
// keeps this quiet on the panel's first mount (an already-resolved card does not replay a
// crossfade it never had); live transitions after that still animate.
export function LensSlot({
  prefersReducedMotion,
  result,
  running,
  state,
  trigger,
  withheld
}: {
  prefersReducedMotion: boolean | null;
  result: ReactNode;
  running: ReactNode;
  state: LensSlotState;
  trigger: ReactNode;
  withheld: ReactNode;
}) {
  const content = state === "running" ? running : state === "result" ? result : state === "withheld" ? withheld : trigger;
  const transition = prefersReducedMotion ? LENS_SLOT_REDUCED_TRANSITION : LENS_SLOT_TRANSITION;

  return (
    <AnimatePresence initial={false} mode="popLayout">
      <motion.div animate={{ opacity: 1 }} exit={{ opacity: 0 }} initial={{ opacity: 0 }} key={state} transition={transition}>
        {content}
      </motion.div>
    </AnimatePresence>
  );
}
