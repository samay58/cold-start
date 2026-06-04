import { AnimatePresence, motion } from "framer-motion";
import type { ExtensionResearchRunEvent } from "./extension-config";
import { clamp, motionTokens, snapSpring } from "./motion-primitives";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

export type SourcePassStage = {
  label: string;
  marker: string;
  note: string;
};

type SourcePassInstrumentProps = {
  activeIndex: number;
  events?: ExtensionResearchRunEvent[];
  progressPercent: number;
  stageNote: string;
  stages: SourcePassStage[];
};

type PlanStatus = "pending" | "running" | "done" | "attention" | "failed";

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

function eventStageIndex(event: ExtensionResearchRunEvent) {
  const stageByType: Record<string, number> = {
    "generation.queued": 0,
    "generation.started": 0,
    "plan.ready": 0,
    "source.found": 1,
    "source.enrichment": 1,
    "card.partial": 2,
    "card.saved": 3,
    "card.enriched": 3,
    "generation.complete": 3
  };

  return stageByType[event.type] ?? null;
}

function eventStatus(event: ExtensionResearchRunEvent): PlanStatus {
  const normalized = `${event.type} ${event.message}`.toLowerCase();
  if (normalized.includes("failed") || normalized.includes("error")) {
    return "failed";
  }
  if (normalized.includes("blocked") || normalized.includes("insufficient") || normalized.includes("not found")) {
    return "attention";
  }
  return "done";
}

function statusForStage(index: number, activeIndex: number, events: ExtensionResearchRunEvent[]): PlanStatus {
  if (events.some((event) => eventStageIndex(event) === index && eventStatus(event) === "failed")) {
    return "failed";
  }
  if (events.some((event) => eventStageIndex(event) === index && eventStatus(event) === "attention")) {
    return "attention";
  }
  if (index < activeIndex) {
    return "done";
  }
  if (index === activeIndex) {
    return "running";
  }
  return "pending";
}

function buildPlan(
  stages: SourcePassStage[],
  activeIndex: number,
  events: ExtensionResearchRunEvent[],
  stageNote: string
) {
  const orderedEvents = [...events]
    .filter((event) => eventStageIndex(event) !== null)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));

  return stages.map((stage, stageIndex) => {
    const stageEvents = orderedEvents.filter((event) => eventStageIndex(event) === stageIndex);
    const substeps =
      stageEvents.length > 0
        ? stageEvents.map((event) => ({
            key: event.id,
            message: event.message,
            status: eventStatus(event)
          }))
        : stageIndex === activeIndex
          ? [{ key: `stage-${stage.marker}`, message: stageNote || stage.note, status: "running" as const }]
          : [];

    return {
      ...stage,
      status: statusForStage(stageIndex, activeIndex, orderedEvents),
      substeps
    };
  });
}

function StatusMark({ status }: { status: PlanStatus }) {
  const prefersReducedMotion = usePrefersReducedMotion();
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
            ) : status === "running" ? (
              <>
                <circle cx="9" cy="9" r="5.2" />
                <path d="M9 5.8v3.4l2.5 1.4" />
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

export function SourcePassInstrument({
  activeIndex,
  events = [],
  progressPercent,
  stageNote,
  stages
}: SourcePassInstrumentProps) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const safeProgressPercent = clamp(progressPercent, [0, 100]);
  const safeActiveIndex = stages.length > 0 ? Math.min(Math.max(Math.trunc(activeIndex), 0), stages.length - 1) : 0;
  const activeStage = stages[safeActiveIndex] ?? stages[stages.length - 1];
  const plan = buildPlan(stages, safeActiveIndex, events, stageNote);
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

  return (
    <div className="cs-live-card cs-live-card-refined cs-build" aria-live="polite">
      <div className="cs-build-head">
        <span>Building card</span>
        <span className="cs-build-step">
          {activeStage?.marker ?? "01"} / {String(stages.length).padStart(2, "0")}
        </span>
      </div>

      {/* Indeterminate loading bar. Motion-enabled runs sweep; reduced-motion
          runs hold a visible seal mark so the state still reads as working. */}
      <div
        className="cs-build-bar"
        role="progressbar"
        aria-label="Build progress"
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={Math.round(safeProgressPercent)}
      >
        <span className="cs-build-bar-sweep" aria-hidden="true" />
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

      <p className="cs-build-meta">
        {activeStage?.label ?? "Building"}; step {safeActiveIndex + 1} of {stages.length}
      </p>
      <p className="sr-only">{activeStage?.label}. {stageNote}</p>
    </div>
  );
}
