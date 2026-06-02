import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import type { MotionStyle } from "framer-motion";
import { useEffect } from "react";
import type { ExtensionResearchRunEvent } from "./extension-config";
import { clamp, instrumentSpring, motionTokens, reducedSpring } from "./motion-primitives";
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

type EvidenceRow = {
  key: string;
  kind: "done" | "live" | "upcoming";
  tag: string;
  message: string;
  count?: number | undefined;
};

const EVENT_TAGS: Record<string, string> = {
  plan: "Plan",
  source: "Sources",
  card: "Card",
  contacts: "Contacts",
  generation: "Done"
};

function eventTag(type: string) {
  return EVENT_TAGS[type.split(".")[0] ?? ""] ?? "Run";
}

function eventCount(metadata: Record<string, unknown> | undefined) {
  if (!metadata) {
    return undefined;
  }
  for (const key of ["acceptedCount", "sourceCount", "citationCount", "count"]) {
    const value = metadata[key];
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      return value;
    }
  }
  return undefined;
}

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

// The feed merges the real research-run events (oldest first, the latest is
// "live") with the stages still ahead, shown faint. It is never empty: before
// any event lands, the active stage carries the live row so the panel reads as
// working rather than blank.
function buildEvidenceRows(
  events: ExtensionResearchRunEvent[],
  stages: SourcePassStage[],
  activeIndex: number,
  stageNote: string
): EvidenceRow[] {
  const ordered = [...events].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  const rows: EvidenceRow[] = [];

  if (ordered.length > 0) {
    ordered.forEach((event, index) => {
      rows.push({
        key: event.id,
        kind: index === ordered.length - 1 ? "live" : "done",
        tag: eventTag(event.type),
        message: event.message,
        count: eventCount(event.metadata)
      });
    });
  } else {
    const activeStage = stages[activeIndex];
    if (activeStage) {
      rows.push({
        key: `stage-live-${activeStage.marker}`,
        kind: "live",
        tag: activeStage.label,
        message: stageNote || activeStage.note
      });
    }
  }

  for (let index = activeIndex + 1; index < stages.length; index += 1) {
    const stage = stages[index];
    if (stage) {
      rows.push({
        key: `stage-${stage.marker}`,
        kind: "upcoming",
        tag: stage.label,
        message: stage.note
      });
    }
  }

  return rows;
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
  const rawProgress = useMotionValue(safeProgressPercent / 100);
  const progress = useSpring(rawProgress, prefersReducedMotion ? reducedSpring : instrumentSpring);
  const progressScale = useTransform(progress, (value) => Math.max(0.08, Math.min(0.985, value)));
  const railTension = useTransform(progress, [0, 0.45, 1], [0.28, 0.78, 0.48]);
  const instrumentStyle = {
    "--cs-source-pass-progress": progressScale,
    "--cs-source-pass-scale": progressScale,
    "--cs-source-pass-tension": railTension
  } as unknown as MotionStyle;
  const rows = buildEvidenceRows(events, stages, safeActiveIndex, stageNote);

  useEffect(() => {
    rawProgress.set(safeProgressPercent / 100);
  }, [safeProgressPercent, rawProgress]);

  return (
    <div className="cs-live-card cs-live-card-refined cs-source-pass-instrument" aria-live="polite">
      <div className="cs-live-field">
        <div className="cs-live-field-head cs-source-pass-head">
          <span>Building card</span>
          <MotionStateText value={`${activeStage?.marker ?? "01"} / ${String(stages.length).padStart(2, "0")}`} />
        </div>

        <div className="cs-source-pass-now">
          <span className="cs-source-pass-current-marker">{activeStage?.marker ?? "01"}</span>
          <h2>
            <MotionStateText value={activeStage?.label ?? "Building"} />
          </h2>
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

        <ol className="cs-evidence-feed" aria-label="Research activity">
          <AnimatePresence initial={false}>
            {rows.map((row) => (
              <motion.li
                data-kind={row.kind}
                key={row.key}
                layout={!prefersReducedMotion}
                initial={prefersReducedMotion ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
                transition={{ duration: prefersReducedMotion ? 0 : motionTokens.stateMs, ease: motionTokens.easeOut }}
              >
                <span className="cs-evidence-dot" aria-hidden="true" />
                <span className="cs-evidence-message">{row.message}</span>
                <span className="cs-evidence-meta">
                  <small className="cs-evidence-tag">{row.tag}</small>
                  {row.count ? <span className="cs-evidence-count">{row.count}</span> : null}
                </span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ol>
        <p className="sr-only">{activeStage?.label}. {stageNote}</p>
      </div>
    </div>
  );
}
