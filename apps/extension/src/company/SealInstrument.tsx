import { motion } from "framer-motion";
import { commitSpring, motionTokens } from "../motion-primitives";

type SealLevel = 0 | 1 | 2 | 3 | 4;

// The progress object and the celebratory beat are one object: a small wax-seal glyph that inks
// up in discrete steps (each triggered by a real stage event) and sets as the FILED stamp at the
// top level. It never grows beyond its corner of the header. Under reduced motion the step is a
// plain opacity change; the fill itself transitions on the data-level attribute, which only
// moves on a real event, so there is no wall-clock animation.
export function SealInstrument({
  level,
  prefersReducedMotion
}: {
  level: SealLevel;
  prefersReducedMotion: boolean;
}) {
  const filed = level >= 4;

  return (
    <motion.span
      aria-hidden="true"
      className="cs-seal-inst"
      data-filed={filed ? "true" : "false"}
      data-level={level}
      initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
      animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1 }}
      transition={prefersReducedMotion ? { duration: motionTokens.feedbackMs, ease: "easeOut" } : commitSpring}
    >
      <span className="cs-seal-inst-ring" />
      <span className="cs-seal-inst-fill" />
      {filed ? (
        <svg className="cs-seal-inst-mark" height="10" viewBox="0 0 10 10" width="10">
          <path d="M2 5.2 4.1 7.4 8 3" />
        </svg>
      ) : null}
    </motion.span>
  );
}
