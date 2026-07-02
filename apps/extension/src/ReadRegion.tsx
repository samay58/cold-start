import type { FirstPayoff } from "@cold-start/core";
import { motion, useReducedMotion, type Transition } from "framer-motion";
import { useEffect, useRef } from "react";
import { markPerformance } from "./sidepanel-network";

type Evidence = FirstPayoff["evidenceSoFar"][number];

const sourceClassLabel: Record<Evidence["sourceClass"], string> = {
  company_site: "Company site",
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

function markClass(quality: Evidence["quality"]) {
  return quality === "independent" ? "independent" : quality === "company" ? "company" : "reported";
}

function qualityRank(quality: Evidence["quality"]) {
  return quality === "independent" ? 3 : quality === "reported" ? 2 : 1;
}

function primaryClaim(firstPayoff: FirstPayoff) {
  return firstPayoff.proofHeadline ?? firstPayoff.whoItSeemsFor ?? firstPayoff.whatItDoes ?? null;
}

function claimKicker(claimKind: NonNullable<ReturnType<typeof primaryClaim>>["claimKind"]) {
  if (claimKind === "who_it_serves") {
    return "Who it's for";
  }
  if (claimKind === "what_it_does") {
    return "What it does";
  }
  return "Latest proof";
}

// One quiet line per source domain: best-quality class wins, so a docs page and a homepage on the
// same domain read as one entry rather than two.
function quietSources(evidence: Evidence[]) {
  const byDomain = new Map<string, { domain: string; url: string; label: string; quality: Evidence["quality"] }>();
  for (const item of evidence) {
    const existing = byDomain.get(item.domain);
    if (!existing) {
      byDomain.set(item.domain, { domain: item.domain, url: item.url, label: sourceClassLabel[item.sourceClass], quality: item.quality });
      continue;
    }
    if (qualityRank(item.quality) > qualityRank(existing.quality)) {
      existing.quality = item.quality;
      existing.url = item.url;
      existing.label = sourceClassLabel[item.sourceClass];
    }
  }
  return [...byDomain.values()];
}

function sentenceList(items: string[]) {
  if (items.length === 0) {
    return "";
  }
  if (items.length === 1) {
    return items[0] ?? "";
  }
  if (items.length === 2) {
    return `${items[0]} and ${items[1]}`;
  }
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function capitalizeFirst(value: string) {
  return value ? `${value.slice(0, 1).toUpperCase()}${value.slice(1)}` : value;
}

function lowerFirst(value: string) {
  return value ? `${value.slice(0, 1).toLowerCase()}${value.slice(1)}` : value;
}

function cleanNeedText(text: string) {
  const trimmed = text.replace(/[.。]+$/u, "").trim();
  return trimmed ? lowerFirst(trimmed) : "stronger proof";
}

function filedClassesLine(evidence: Evidence[]) {
  const classes = [...new Set(evidence.map((item) => sourceClassLabel[item.sourceClass]))].map(lowerFirst);
  return classes.length > 0 ? `${capitalizeFirst(sentenceList(classes))} filed.` : null;
}

function SourceRows({ evidence }: { evidence: Evidence[] }) {
  const sources = quietSources(evidence);
  const visibleSources = sources.slice(0, 3);
  const hiddenSources = Math.max(0, sources.length - visibleSources.length);

  if (visibleSources.length === 0) {
    return null;
  }

  return (
    <ul aria-label="Sources" className="cs-early-read-sources">
      {visibleSources.map((item) => (
        <li key={item.domain}>
          <i aria-hidden="true" className="cs-early-read-dot" data-class={markClass(item.quality)} />
          <a href={item.url} rel="noreferrer" target="_blank">{item.domain}</a>
          <span className="cs-early-read-class">{item.label}</span>
        </li>
      ))}
      {hiddenSources > 0 ? <li className="cs-early-read-more">{`+${hiddenSources}`}</li> : null}
    </ul>
  );
}

type ReadRegionProps = {
  context: "building" | "profile";
  firstPayoff: FirstPayoff;
};

// The inline early read: the same lilac-seamed slip, always open. It upgrades in place from
// receipt (what evidence arrived, what is still missing) to a cited read, and never claims more
// than the FirstPayoff artifact carries. The profile surface renders it only when substantive;
// the building surface shows the receipt and withheld states too, so the wait is never blank.
export function ReadRegion({ context, firstPayoff }: ReadRegionProps) {
  const prefersReducedMotion = useReducedMotion();
  const substantive = firstPayoff.status === "substantive_first_read";
  const claim = substantive ? primaryClaim(firstPayoff) : null;
  const entityNeedsCheck = firstPayoff.entityConfidence === "needs_check";
  const firstReadMarkedVisible = useRef(false);

  useEffect(() => {
    if (!substantive || !claim || firstReadMarkedVisible.current) {
      return;
    }
    firstReadMarkedVisible.current = true;
    markPerformance("cold-start-first-read-visible");
  }, [claim, substantive]);

  if (context === "profile" && !claim) {
    return null;
  }

  // Entrance slides the slip in from under the section above; exit is shorter and calmer, so it
  // reads as filed away rather than dismissed. Reduced motion keeps the state change as a fade.
  const initial = prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -12 };
  const animate = prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 };
  const exitTransition: Transition = prefersReducedMotion ? { duration: 0.12 } : { duration: 0.26, ease: [0.4, 0, 0.2, 1] };
  const exit = prefersReducedMotion ? { opacity: 0, transition: exitTransition } : { opacity: 0, y: -6, transition: exitTransition };
  const transition: Transition = prefersReducedMotion
    ? { duration: 0.16, ease: [0.16, 1, 0.3, 1] }
    : { type: "spring", stiffness: 460, damping: 34, mass: 0.62 };

  const needLine = `Need ${cleanNeedText(firstPayoff.stillChecking.text)}.`;
  const filedLine = filedClassesLine(firstPayoff.evidenceSoFar);

  return (
    <motion.section
      aria-label="Early read"
      animate={animate}
      className="cs-read-region"
      data-context={context}
      data-status={firstPayoff.status}
      exit={exit}
      initial={initial}
      transition={transition}
    >
      <div className="cs-read-region-head">
        <span className="cs-early-read-tab-label">Early read</span>
      </div>
      <div className="cs-read-region-body">
        {claim ? (
          <>
            <p className="cs-early-read-claim">
              <span className="cs-early-read-kicker">{claimKicker(claim.claimKind)}</span>
              {claim.text}
            </p>
            <SourceRows evidence={firstPayoff.evidenceSoFar} />
          </>
        ) : entityNeedsCheck ? (
          <p className="cs-early-read-claim">
            <span className="cs-early-read-kicker">Checking the match</span>
            Confirming these sources describe this company before filing a read.
          </p>
        ) : (
          <>
            <p className="cs-early-read-claim">
              <span className="cs-early-read-kicker">Evidence so far</span>
              {filedLine ?? "No accepted evidence yet."}
              <span className="cs-read-region-need">{needLine}</span>
            </p>
            <SourceRows evidence={firstPayoff.evidenceSoFar} />
          </>
        )}
      </div>
    </motion.section>
  );
}
