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
  const labels: Record<FirstPayoff["evidenceSoFar"][number]["sourceClass"], string> = {
    company_site: "Company",
    customer_proof: "Customer",
    database: "Database",
    docs: "Docs",
    funding: "Funding",
    jobs: "Jobs",
    news: "News",
    other: "Source",
    people: "People",
    registry: "Registry"
  };
  return labels[sourceClass];
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

function evidenceRank(quality: FirstPayoff["evidenceSoFar"][number]["quality"]) {
  if (quality === "source_of_record" || quality === "independent") {
    return 3;
  }
  if (quality === "reported") {
    return 2;
  }
  return 1;
}

function displayEvidence(evidence: FirstPayoff["evidenceSoFar"]) {
  const grouped = new Map<string, {
    classes: Set<string>;
    domain: string;
    quality: FirstPayoff["evidenceSoFar"][number]["quality"];
    sourceId: string;
    url: string;
  }>();

  for (const item of evidence) {
    const existing = grouped.get(item.domain);
    if (!existing) {
      grouped.set(item.domain, {
        classes: new Set([sourceClassLabel(item.sourceClass)]),
        domain: item.domain,
        quality: item.quality,
        sourceId: item.sourceId,
        url: item.url
      });
      continue;
    }
    existing.classes.add(sourceClassLabel(item.sourceClass));
    if (evidenceRank(item.quality) > evidenceRank(existing.quality)) {
      existing.quality = item.quality;
      existing.sourceId = item.sourceId;
      existing.url = item.url;
    }
  }

  return [...grouped.values()];
}

export function FirstPayoffSurface({ firstPayoff }: { firstPayoff: FirstPayoff }) {
  const claim = firstPayoff.status === "substantive_first_read" ? primaryClaim(firstPayoff) : null;
  const evidence = displayEvidence(firstPayoff.evidenceSoFar);
  const visibleEvidence = evidence.slice(0, 3);
  const hiddenSources = Math.max(0, evidence.length - visibleEvidence.length);
  const ledgerCount = sourceLabel(firstPayoff.evidenceSoFar.length);
  const isFirstRead = Boolean(claim);
  const receiptCopy = firstPayoff.entityConfidence === "needs_check"
    ? "Sources are arriving. Holding the read until the entity match is clean."
    : "Sources are in. Holding the read until there is a clean cited claim.";

  return (
    <section
      aria-label={isFirstRead ? "First read" : "Evidence receipt"}
      className="cs-first-read"
      data-status={firstPayoff.status}
    >
      <span className="cs-first-read-seal" aria-hidden="true" />
      <header className="cs-first-read-head">
        <span className="cs-first-read-title">{isFirstRead ? "First Read" : "Evidence receipt"}</span>
        <span className="cs-first-read-flag">{isFirstRead ? "Early read" : firstPayoff.status === "withheld" ? "Claim withheld" : "Card filing"}</span>
      </header>
      {claim ? (
        <p className="cs-first-read-read" data-kind={claim.claimKind}>
          <span className="cs-first-read-read-label">{claimLabel(claim.claimKind)}</span>
          {claim.text}
        </p>
      ) : (
        <p className="cs-first-read-read" data-kind="receipt">
          {receiptCopy}
        </p>
      )}
      {firstPayoff.evidenceSoFar.length > 0 ? (
        <div className="cs-first-read-ledger" aria-label="Sources filed so far">
          <div className="cs-first-read-ledger-head">
            <span>Sources in hand</span>
            <span>{ledgerCount}</span>
          </div>
          <ul>
            {visibleEvidence.map((item) => (
              <li key={item.sourceId}>
                <i className="cs-first-read-mark-dot" data-class={evidenceMarkClass(item.quality)} aria-hidden="true" />
                <a href={item.url} rel="noreferrer" target="_blank">{item.domain}</a>
                <span className="cs-first-read-mark">{[...item.classes].join(" / ")}</span>
              </li>
            ))}
            {hiddenSources > 0 ? (
              <li className="cs-first-read-ledger-more">{`+${hiddenSources} more ${hiddenSources === 1 ? "domain" : "domains"}`}</li>
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
