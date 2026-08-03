import { synthesisEvidenceSignals, type ColdStartCard, type SynthesisWithheld } from "@cold-start/core";
import { useState } from "react";
import { relativeTimeFromNow } from "../shared/extension-format";
import { advisoryCopy, isSynthesisAdvisory, isSynthesisGateReason, REASON_COPY } from "./synthesis-advisory-copy";

// The honest withheld receipt: what ran, what is missing in investor language, what would
// change it, and the one action that can change it. A finding, not an error: same plate
// language as the filed memo and the run-failed card, never failure styling.
export function LensWithheldCard({
  card,
  onRetry,
  unavailableReason,
  withheld
}: {
  card: ColdStartCard;
  onRetry: () => boolean;
  unavailableReason?: string | undefined;
  withheld: SynthesisWithheld;
}) {
  const [retrying, setRetrying] = useState(false);
  const { nonEnrichmentSourceTypes } = synthesisEvidenceSignals(card);
  const reasonLines = withheld.reasons
    .filter(isSynthesisGateReason)
    .map((reason) => REASON_COPY[reason]);
  const advisoryLines = withheld.advisories
    .filter(isSynthesisAdvisory)
    .map((advisory) => advisoryCopy(advisory, nonEnrichmentSourceTypes));

  return (
    <div aria-label="Lens withheld" className="cs-lens-withheld" role="status">
      <strong>{`Analysis ran ${relativeTimeFromNow(withheld.at)}`}</strong>
      {reasonLines.length > 0 ? (
        <ul className="cs-lens-withheld-reasons">
          {reasonLines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
      {advisoryLines.length > 0 ? (
        <ul className="cs-lens-withheld-advisories">
          {advisoryLines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
      <p className="cs-lens-withheld-next">
        {withheld.reasons.includes("no-claims-survived")
          ? "Check again when the public evidence changes."
          : "A stronger public record may support a useful read."}
      </p>
      {unavailableReason ? <p className="cs-lens-withheld-next">{unavailableReason}</p> : null}
      <button
        className="cs-lens-withheld-retry"
        disabled={retrying || Boolean(unavailableReason)}
        onClick={() => {
          if (onRetry()) {
            // The run-status flip replaces this card; this flag covers only the accepted
            // request's visible handoff gap.
            setRetrying(true);
          }
        }}
        type="button"
      >
        {retrying ? "Checking for updates" : unavailableReason ? "Retry unavailable" : "Check for new evidence"}
      </button>
    </div>
  );
}
