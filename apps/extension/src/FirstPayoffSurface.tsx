import type { FirstPayoff } from "@cold-start/core";

function sourceLabel(count: number) {
  return `${count} ${count === 1 ? "source" : "sources"}`;
}

function evidenceMarkClass(quality: FirstPayoff["evidenceSoFar"][number]["quality"]) {
  if (quality === "independent" || quality === "source_of_record") {
    return "independent";
  }
  return quality === "company" ? "company" : "reported";
}

function sourceClassLabel(sourceClass: FirstPayoff["evidenceSoFar"][number]["sourceClass"]) {
  return sourceClass.replace(/_/g, " ");
}

function primaryClaim(firstPayoff: FirstPayoff) {
  return firstPayoff.whoItSeemsFor ?? firstPayoff.whatItDoes ?? firstPayoff.proofHeadline ?? null;
}

function claimLabel(claimKind: NonNullable<ReturnType<typeof primaryClaim>>["claimKind"]) {
  if (claimKind === "who_it_serves") {
    return "Who it's for";
  }
  if (claimKind === "what_it_does") {
    return "What it does";
  }
  return "Latest proof";
}

export function FirstPayoffSurface({ firstPayoff }: { firstPayoff: FirstPayoff }) {
  const claim = firstPayoff.status === "substantive_first_read" ? primaryClaim(firstPayoff) : null;
  const hiddenSources = Math.max(0, firstPayoff.evidenceSoFar.length - 4);
  const ledgerCount = sourceLabel(firstPayoff.evidenceSoFar.length);
  const isFirstRead = Boolean(claim);

  return (
    <section
      aria-label={isFirstRead ? "First read" : "Evidence receipt"}
      className="cs-first-read"
      data-status={firstPayoff.status}
    >
      <span className="cs-first-read-seal" aria-hidden="true" />
      <header className="cs-first-read-head">
        <span className="cs-first-read-title">{isFirstRead ? "First Read" : "Evidence arriving"}</span>
        <span className="cs-first-read-flag">{firstPayoff.status === "withheld" ? "Read withheld" : "Still filing"}</span>
      </header>
      {claim ? (
        <p className="cs-first-read-read" data-kind={claim.claimKind}>
          <span className="cs-first-read-read-label">{claimLabel(claim.claimKind)}</span>
          {claim.text}
        </p>
      ) : (
        <p className="cs-first-read-read" data-kind="receipt">
          <span className="cs-first-read-read-label">Evidence Receipt</span>
          {firstPayoff.entityConfidence === "needs_check"
            ? "Checking that the sources match this company."
            : "Reached source evidence before the full profile is ready."}
        </p>
      )}
      {firstPayoff.evidenceSoFar.length > 0 ? (
        <div className="cs-first-read-ledger" aria-label="Sources filed so far">
          <div className="cs-first-read-ledger-head">
            <span>Filed so far</span>
            <span>{ledgerCount}</span>
          </div>
          <ul>
            {firstPayoff.evidenceSoFar.slice(0, 4).map((item) => (
              <li key={item.sourceId}>
                <i className="cs-first-read-mark-dot" data-class={evidenceMarkClass(item.quality)} aria-hidden="true" />
                <a href={item.url} rel="noreferrer" target="_blank">{item.domain}</a>
                <span className="cs-first-read-mark">{sourceClassLabel(item.sourceClass)}</span>
              </li>
            ))}
            {hiddenSources > 0 ? (
              <li className="cs-first-read-ledger-more">{`+${hiddenSources} more filed`}</li>
            ) : null}
          </ul>
        </div>
      ) : (
        <p className="cs-first-read-ledger-empty">Filing the first sources.</p>
      )}
      <p className="cs-first-read-gap">
        <span className="cs-first-read-gap-label">Still checking</span>
        {firstPayoff.stillChecking.text}
      </p>
    </section>
  );
}
