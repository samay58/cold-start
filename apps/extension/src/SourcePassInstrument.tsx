import { AnimatePresence, motion } from "framer-motion";
import type { ExtensionResearchRunEvent } from "./extension-config";
import { motionTokens, snapSpring } from "./motion-primitives";
import {
  buildResearchProgressPlan,
  type ResearchProgressStage,
  type ResearchProgressStatus
} from "./research-progress";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

export type SourcePassStage = ResearchProgressStage;

type SourcePassInstrumentProps = {
  activeIndex: number;
  complete?: boolean;
  events?: ExtensionResearchRunEvent[];
  stageNote: string;
  stages: SourcePassStage[];
  variant?: "full" | "compact";
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

function StatusMark({ status }: { status: ResearchProgressStatus }) {
  const prefersReducedMotion = usePrefersReducedMotion();
  if (status === "running") {
    return (
      <span className="cs-plan-status" data-status={status}>
        <DrizzleLoader />
      </span>
    );
  }

  return (
    <span className="cs-plan-status" data-status={status}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          aria-hidden="true"
          key={status}
          initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.82, rotate: -8 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.82, rotate: 8 }}
          transition={{ duration: prefersReducedMotion ? 0 : motionTokens.stateMs, ease: motionTokens.easeOut }}
        >
          <svg viewBox="0 0 18 18" width="18" height="18" focusable="false">
            {status === "done" ? (
              <path d="M4.2 9.1 7.4 12.2 13.8 5.7" />
            ) : status === "failed" ? (
              <>
                <path d="M5.3 5.3 12.7 12.7" />
                <path d="M12.7 5.3 5.3 12.7" />
              </>
            ) : status === "attention" ? (
              <>
                <path d="M9 4.2v5.6" />
                <path d="M9 13.6h.01" />
              </>
            ) : (
              <circle cx="9" cy="9" r="5.2" />
            )}
          </svg>
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

function DrizzleLoader() {
  return (
    <span className="cs-drizzle-loader" aria-hidden="true">
      <span />
      <span />
      <span />
      <span />
    </span>
  );
}

export function SourcePassInstrument({
  activeIndex,
  complete = false,
  events = [],
  stageNote,
  stages,
  variant = "full"
}: SourcePassInstrumentProps) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const safeActiveIndex = stages.length > 0 ? Math.min(Math.max(Math.trunc(activeIndex), 0), stages.length - 1) : 0;
  const activeStage = stages[safeActiveIndex] ?? stages[stages.length - 1];
  const plan = buildResearchProgressPlan({
    activeIndex: safeActiveIndex,
    complete,
    events,
    stageNote,
    stages
  });
  const stageVariants = prefersReducedMotion
    ? undefined
    : {
        hidden: { opacity: 0, y: -4 },
        visible: { opacity: 1, y: 0, transition: snapSpring }
      };
  const substepListVariants = prefersReducedMotion
    ? undefined
    : {
        hidden: { opacity: 0 },
        visible: {
          opacity: 1,
          transition: { staggerChildren: 0.05, ease: motionTokens.easeOut }
        }
      };
  const substepVariants = prefersReducedMotion
    ? undefined
    : {
        hidden: { opacity: 0, x: -8 },
        visible: { opacity: 1, x: 0, transition: { ...snapSpring, stiffness: 500, damping: 30 } }
      };
  const stageMotionProps = stageVariants
    ? { animate: "visible" as const, initial: "hidden" as const, variants: stageVariants }
    : {};
  const substepListMotionProps = substepListVariants
    ? { animate: "visible" as const, initial: "hidden" as const, variants: substepListVariants }
    : {};
  const substepMotionProps = substepVariants
    ? { variants: substepVariants }
    : {};
  const rootClassName =
    variant === "compact"
      ? "cs-build cs-build-compact"
      : "cs-live-card cs-live-card-refined cs-build";

  return (
    <div className={rootClassName} aria-live="polite" data-variant={variant}>
      <div className="cs-build-head">
        <span>Research progress</span>
        <span className="cs-build-step">
          {activeStage?.marker ?? "01"} / {String(stages.length).padStart(2, "0")}
        </span>
      </div>

      <ol className="cs-build-tree">
        {plan.map((stage, index) => (
          <motion.li
            className="cs-build-stage"
            data-active={index === safeActiveIndex ? "true" : "false"}
            data-status={stage.status}
            key={stage.marker}
            {...stageMotionProps}
          >
            <div className="cs-build-stage-row">
              <span className="cs-build-stage-marker">{stage.marker}</span>
              <StatusMark status={stage.status} />
              <div className="cs-build-stage-copy">
                <strong>{stage.label}</strong>
                <span>{stage.note}</span>
              </div>
            </div>
            {stage.substeps.length > 0 ? (
              <motion.ol
                className="cs-build-substeps"
                {...substepListMotionProps}
              >
                {stage.substeps.map((substep) => (
                  <motion.li data-status={substep.status} key={substep.key} {...substepMotionProps}>
                    <StatusMark status={substep.status} />
                    <span>{substep.message}</span>
                  </motion.li>
                ))}
              </motion.ol>
            ) : null}
          </motion.li>
        ))}
      </ol>

      {variant === "full" ? (
        <p className="cs-build-meta">
          Step {safeActiveIndex + 1} of {stages.length}
        </p>
      ) : null}
      <p className="sr-only">{activeStage?.label}. {stageNote}</p>
    </div>
  );
}
