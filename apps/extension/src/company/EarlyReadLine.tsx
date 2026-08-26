import { safeWebUrl, type FirstPayoffClaim, type FirstPayoffEvidence } from "@cold-start/core";
import { motion } from "framer-motion";

import { motionTokens } from "../shared/motion-primitives";

type EarlyReadLineProps = {
  claim: FirstPayoffClaim;
  evidence: FirstPayoffEvidence;
  onSourceOpen: () => void;
  prefersReducedMotion: boolean;
};

export function EarlyReadLine({
  claim,
  evidence,
  onSourceOpen,
  prefersReducedMotion
}: EarlyReadLineProps) {
  const sourceUrl = safeWebUrl(evidence.url);
  const displayText = claim.text.replace(/\.\s*$/u, "");

  if (!sourceUrl) {
    return null;
  }

  return (
    <motion.section
      animate={{ opacity: 1, y: 0 }}
      aria-label="Early read"
      className="cs-early-read-line"
      initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
      transition={{
        duration: prefersReducedMotion ? 0.12 : 0.22,
        ease: motionTokens.ease
      }}
    >
      <div className="cs-early-read-line-head">
        <strong>Early read</strong>
        <a
          aria-label={`Open early-read source: ${evidence.domain}`}
          className="cs-early-read-line-source"
          href={sourceUrl}
          onClick={onSourceOpen}
          rel="noreferrer"
          target="_blank"
        >
          <span aria-hidden="true" className="cs-early-read-line-mark" data-quality={evidence.quality} />
          <span>{evidence.domain}</span>
          <span aria-hidden="true">↗</span>
        </a>
      </div>
      <p>{displayText}</p>
    </motion.section>
  );
}
