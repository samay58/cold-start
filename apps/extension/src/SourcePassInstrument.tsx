import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import type { MotionStyle } from "framer-motion";
import { useEffect } from "react";
import { clamp, instrumentSpring, motionTokens, reducedSpring, stageDelay } from "./motion-primitives";
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
          className="cs-motion-text cs-motion-text-fade"
          key={value}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -3 }}
          transition={{ duration: motionTokens.stateMs, ease: motionTokens.easeOut }}
        >
          {value}
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
  const progress = useSpring(rawProgress, prefersReducedMotion ? reducedSpring : instrumentSpring);
  const progressScale = useTransform(progress, (value) => Math.max(0.08, Math.min(0.985, value)));
  const railTension = useTransform(progress, [0, 0.45, 1], [0.28, 0.78, 0.48]);
  const instrumentStyle = {
    "--cs-source-pass-progress": progressScale,
    "--cs-source-pass-scale": progressScale,
    "--cs-source-pass-tension": railTension
  } as unknown as MotionStyle;

  useEffect(() => {
    rawProgress.set(safeProgressPercent / 100);
  }, [safeProgressPercent, rawProgress]);

  return (
    <div className="cs-live-card cs-live-card-refined cs-source-pass-instrument" aria-live="polite">
      <div className="cs-live-field">
        <div className="cs-live-field-head cs-source-pass-head">
          <span>Source pass</span>
          <MotionStateText value={`${activeStage?.marker ?? "01"} / ${String(stages.length).padStart(2, "0")}`} />
        </div>

        <div className="cs-source-pass-now">
          <span className="cs-source-pass-current-marker">{activeStage?.marker ?? "01"}</span>
          <div>
            <h2>
              <MotionStateText value={activeStage?.label ?? "Building"} />
            </h2>
            <p>{stageNote}</p>
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
                duration: prefersReducedMotion ? 0 : motionTokens.stateMs,
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
