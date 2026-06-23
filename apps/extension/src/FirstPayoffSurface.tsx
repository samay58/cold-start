import type { FirstPayoff } from "@cold-start/core";
import { motion, useReducedMotion } from "framer-motion";

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
  const prefersReducedMotion = useReducedMotion();
  const claim = firstPayoff.status === "substantive_first_read" ? primaryClaim(firstPayoff) : null;
  if (!claim) {
    return null;
  }

  const evidence = displayEvidence(firstPayoff.evidenceSoFar);
  const visibleEvidence = evidence.slice(0, 3);
  const hiddenSources = Math.max(0, evidence.length - visibleEvidence.length);
  const ledgerCount = sourceLabel(firstPayoff.evidenceSoFar.length);
  const entrance = prefersReducedMotion
    ? { opacity: 1 }
    : { opacity: 0, scale: 0.985, y: -8 };
  const animateIn = prefersReducedMotion
    ? { opacity: 1 }
    : { opacity: 1, scale: 1, y: 0 };
  const transition = prefersReducedMotion
    ? { duration: 0.12, ease: "easeOut" }
    : { type: "spring" as const, stiffness: 520, damping: 38, mass: 0.54 };

  return (
    <motion.section
      aria-label="First read"
      animate={animateIn}
      className="cs-first-read"
      data-status={firstPayoff.status}
      exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.99, y: -4 }}
      initial={entrance}
      layout
      transition={transition}
    >
      <motion.span
        animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, scaleX: 1 }}
        aria-hidden="true"
        className="cs-first-read-seal"
        initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, scaleX: 0.18 }}
        transition={prefersReducedMotion ? { duration: 0.12 } : { delay: 0.08, duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      />
      <header className="cs-first-read-head">
        <span className="cs-first-read-title">First read</span>
        <span className="cs-first-read-flag">Early</span>
      </header>
      <p className="cs-first-read-read" data-kind={claim.claimKind}>
        <span className="cs-first-read-read-label">{claimLabel(claim.claimKind)}</span>
        {claim.text}
      </p>
      {firstPayoff.evidenceSoFar.length > 0 ? (
        <div className="cs-first-read-ledger" aria-label="Sources filed so far">
          <div className="cs-first-read-ledger-head">
            <span>Sources</span>
            <span>{ledgerCount}</span>
          </div>
          <ul>
            {visibleEvidence.map((item, index) => (
              <motion.li
                animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, x: 0 }}
                initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, x: -5 }}
                key={item.sourceId}
                transition={prefersReducedMotion ? { duration: 0.12 } : { delay: 0.08 + index * 0.035, duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              >
                <i className="cs-first-read-mark-dot" data-class={evidenceMarkClass(item.quality)} aria-hidden="true" />
                <a href={item.url} rel="noreferrer" target="_blank">{item.domain}</a>
                <span className="cs-first-read-mark">{[...item.classes].join(" / ")}</span>
              </motion.li>
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
        <span className="cs-first-read-gap-label">Needs</span>
        {firstPayoff.stillChecking.text}
      </p>
    </motion.section>
  );
}
