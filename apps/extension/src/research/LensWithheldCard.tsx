import { synthesisEvidenceSignals, type ColdStartCard, type SynthesisWithheld } from "@cold-start/core";
import { relativeTimeFromNow } from "../shared/extension-format";

const SOURCE_TYPE_LABELS: Record<string, string> = {
  company_site: "company site",
  news: "news",
  filing: "filing",
  github: "GitHub",
  rdap: "domain registration",
  other: "other"
};

// Plain-language mapping from the gate's reason and advisory codes (see
// packages/core/src/synthesis-evidence.ts) to what an investor reader needs to know: what is
// missing, not that something broke. Reasons are why synthesis was withheld; advisories are
// additional context carried alongside a reason. Unrecognized codes render nothing rather than
// a raw enum string.
const REASON_COPY: Record<string, string> = {
  "citation-floor": "Fewer than 8 cited sources survived.",
  "no-usable-source-type": "Only enrichment records are cited so far."
};

function advisoryCopy(advisory: string, nonEnrichmentSourceTypes: string[]): string | null {
  if (advisory === "single-source-class") {
    const [onlySourceType] = nonEnrichmentSourceTypes;
    const label = onlySourceType ? SOURCE_TYPE_LABELS[onlySourceType] ?? onlySourceType : null;
    return label ? `Only ${label} coverage is cited so far.` : "Only one source class is cited so far.";
  }

  if (advisory === "no-funding-evidence") {
    return "No funding evidence is cited yet.";
  }

  if (advisory === "no-named-team") {
    return "No named team member is cited yet.";
  }

  return null;
}

// The honest withheld receipt: what ran, what is missing in investor language, what would
// change it, and the one action that can change it. A finding, not an error: same plate
// language as the filed memo and the run-failed card, never failure styling.
export function LensWithheldCard({
  card,
  onRetry,
  withheld
}: {
  card: ColdStartCard;
  onRetry: () => void;
  withheld: SynthesisWithheld;
}) {
  const { nonEnrichmentSourceTypes } = synthesisEvidenceSignals(card);
  const reasonLines = withheld.reasons
    .map((reason) => REASON_COPY[reason])
    .filter((line): line is string => Boolean(line));
  const advisoryLines = withheld.advisories
    .map((advisory) => advisoryCopy(advisory, nonEnrichmentSourceTypes))
    .filter((line): line is string => Boolean(line));

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
      <p className="cs-lens-withheld-next">A fresh evidence pass can clear the citation floor.</p>
      <button className="cs-lens-withheld-retry" onClick={onRetry} type="button">
        Refresh evidence and retry
      </button>
    </div>
  );
}
