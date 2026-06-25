import type { FirstPayoff } from "@cold-start/core";
import { motion, useReducedMotion, type Transition } from "framer-motion";
import { useRef, useState } from "react";
import type { FocusEvent as ReactFocusEvent } from "react";

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

// A filed slip that peeks out from under the progress card. Collapsed it is one lilac-seamed tab;
// hover, focus, or tap slides the cited read open. Tap pins it open for touch; hover and keyboard
// focus open it transiently.
export function FirstPayoffSurface({ firstPayoff }: { firstPayoff: FirstPayoff }) {
  const prefersReducedMotion = useReducedMotion();
  const [open, setOpen] = useState(false);
  const pinned = useRef(false);
  const claim = firstPayoff.status === "substantive_first_read" ? primaryClaim(firstPayoff) : null;
  if (!claim) {
    return null;
  }

  const sources = quietSources(firstPayoff.evidenceSoFar);
  const visibleSources = sources.slice(0, 3);
  const hiddenSources = Math.max(0, sources.length - visibleSources.length);

  function expand() {
    setOpen(true);
  }
  function collapse() {
    if (!pinned.current) {
      setOpen(false);
    }
  }
  function toggle() {
    pinned.current = !pinned.current;
    setOpen(pinned.current);
  }
  function handleBlur(event: ReactFocusEvent<HTMLElement>) {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
      return;
    }
    pinned.current = false;
    setOpen(false);
  }

  // Entrance slides the slip down from under the card above; exit is shorter and calmer, so it reads
  // as filed away rather than dismissed. Reduced motion keeps the state change as a plain fade.
  const initial = prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -12 };
  const animate = prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 };
  const exitTransition: Transition = prefersReducedMotion ? { duration: 0.12 } : { duration: 0.26, ease: [0.4, 0, 0.2, 1] };
  const exit = prefersReducedMotion ? { opacity: 0, transition: exitTransition } : { opacity: 0, y: -6, transition: exitTransition };
  const transition: Transition = prefersReducedMotion
    ? { duration: 0.16, ease: [0.16, 1, 0.3, 1] }
    : { type: "spring", stiffness: 460, damping: 34, mass: 0.62 };

  return (
    <motion.section
      aria-label="Early read"
      animate={animate}
      className="cs-early-read"
      data-open={open ? "true" : "false"}
      exit={exit}
      initial={initial}
      onBlur={handleBlur}
      onFocus={expand}
      onPointerEnter={expand}
      onPointerLeave={collapse}
      transition={transition}
    >
      <button aria-expanded={open} className="cs-early-read-tab" onClick={toggle} type="button">
        <span className="cs-early-read-tab-label">Early read</span>
        <span aria-hidden="true" className="cs-early-read-chevron" />
      </button>
      <div className="cs-early-read-reveal">
        <div className="cs-early-read-body">
          <p className="cs-early-read-claim">
            <span className="cs-early-read-kicker">{claimKicker(claim.claimKind)}</span>
            {claim.text}
          </p>
          {visibleSources.length > 0 ? (
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
          ) : null}
        </div>
      </div>
    </motion.section>
  );
}
