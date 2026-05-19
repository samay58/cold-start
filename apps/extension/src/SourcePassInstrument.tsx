import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import type { MotionStyle } from "framer-motion";
import { useEffect } from "react";
import { clamp, instrumentSpring, motionTokens, stageDelay } from "./motion-primitives";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

export type SourcePassStage = {
  label: string;
  marker: string;
  note: string;
};

type SourcePassInstrumentProps = {
  activeIndex: number;
  progressPercent: number;
  stageNote: string;
  stages: SourcePassStage[];
};

export function MotionStateText({
  className,
  value
}: {
  className?: string;
  value: string;
}) {
  const prefersReducedMotion = usePrefersReducedMotion();

  if (prefersReducedMotion) {
    return <span className={className}>{value}</span>;
  }

  return (
    <span className={className}>
      <span className="sr-only">{value}</span>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          aria-hidden="true"
          className="cs-motion-text"
          key={value}
          initial="hidden"
          animate="visible"
          exit="exit"
          variants={{
            hidden: {},
            visible: {
              transition: {
                staggerChildren: 0.014
              }
            },
            exit: {
              transition: {
                staggerChildren: 0.008,
                staggerDirection: -1
              }
            }
          }}
        >
          {value.split("").map((letter, index) => (
            <motion.span
              className="cs-motion-text-char"
              key={`${value}-${letter}-${index}`}
              variants={{
                hidden: { opacity: 0, y: 7, rotateX: 42, filter: "blur(2px)" },
                visible: {
                  opacity: 1,
                  y: 0,
                  rotateX: 0,
                  filter: "blur(0px)",
                  transition: {
                    type: "spring",
                    stiffness: 420,
                    damping: 36,
                    mass: 0.34
                  }
                },
                exit: {
                  opacity: 0,
                  y: -6,
                  rotateX: -34,
                  filter: "blur(2px)",
                  transition: {
                    duration: 0.12,
                    ease: motionTokens.easeOut
                  }
                }
              }}
            >
              {letter === " " ? "\u00A0" : letter}
            </motion.span>
          ))}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

export function SourcePassInstrument({
  activeIndex,
  progressPercent,
  stageNote,
  stages
}: SourcePassInstrumentProps) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const safeProgressPercent = clamp(progressPercent, [0, 100]);
  const safeActiveIndex = stages.length > 0 ? Math.min(Math.max(Math.trunc(activeIndex), 0), stages.length - 1) : 0;
  const activeStage = stages[safeActiveIndex] ?? stages[stages.length - 1];
  const rawProgress = useMotionValue(safeProgressPercent / 100);
  const progress = useSpring(rawProgress, prefersReducedMotion ? { stiffness: 1000, damping: 100, mass: 0.1 } : instrumentSpring);
  const progressScale = useTransform(progress, (value) => Math.max(0.08, Math.min(0.985, value)));
  const progressLeft = useTransform(progress, (value) => `${Math.max(8, Math.min(97, value * 100))}%`);
  const railTension = useTransform(progress, [0, 0.45, 1], [0.28, 0.78, 0.48]);
  const scanShift = useTransform(progress, (value) => `${-118 + value * 72}px`);
  const instrumentStyle = {
    "--cs-source-pass-scale": progressScale,
    "--cs-source-pass-left": progressLeft,
    "--cs-source-pass-tension": railTension,
    "--cs-source-pass-scan-start": scanShift
  } as unknown as MotionStyle;

  useEffect(() => {
    rawProgress.set(safeProgressPercent / 100);
  }, [safeProgressPercent, rawProgress]);

  return (
    <div className="cs-live-card cs-live-card-refined cs-source-pass-instrument" aria-live="polite">
      <div className="cs-live-field">
        <div className="cs-live-field-head cs-source-pass-head">
          <span>Source pass</span>
          <MotionStateText value={`${activeStage?.marker ?? "01"} / 04`} />
        </div>

        <div className="cs-source-pass-now">
          <span className="cs-source-pass-current-marker">{activeStage?.marker ?? "01"}</span>
          <div>
            <h2>
              <MotionStateText value={activeStage?.label ?? "Building"} />
            </h2>
            <p>
              <MotionStateText value={stageNote} />
            </p>
          </div>
        </div>

        <motion.div
          aria-label={`${activeStage?.label ?? "Building"} progress`}
          className="cs-source-pass-rail cs-live-progress-track"
          role="progressbar"
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={Math.round(safeProgressPercent)}
          style={instrumentStyle}
        >
          <span className="cs-source-pass-fill cs-live-progress-fill" />
          <motion.span className="cs-source-pass-cursor cs-live-progress-cursor" layout />
          <span className="cs-source-pass-scan cs-live-progress-scan" />
        </motion.div>

        <ol className="cs-run-steps cs-source-pass-steps" aria-label="Source pass stages">
          {stages.map((stage, index) => (
            <motion.li
              aria-current={index === safeActiveIndex ? "step" : undefined}
              animate={{
                opacity: index === safeActiveIndex ? 1 : index < safeActiveIndex ? 0.86 : 0.58,
                x: index === safeActiveIndex && !prefersReducedMotion ? 2 : 0,
                scale: index === safeActiveIndex && !prefersReducedMotion ? 1.012 : 1
              }}
              data-active={index === safeActiveIndex}
              data-complete={index < safeActiveIndex}
              data-stage-index={index}
              key={stage.marker}
              layout
              transition={{
                duration: prefersReducedMotion ? 0 : 0.22,
                ease: motionTokens.easeOut,
                delay: prefersReducedMotion ? 0 : stageDelay(index, safeActiveIndex)
              }}
            >
              <span className="cs-run-step-index">{stage.marker}</span>
              <span>
                {stage.label}
                {index === safeActiveIndex ? <small>{stageNote}</small> : null}
              </span>
              <motion.i aria-hidden="true" layout />
            </motion.li>
          ))}
        </ol>
        <p className="sr-only">{activeStage?.label}. {stageNote}</p>
      </div>
    </div>
  );
}
