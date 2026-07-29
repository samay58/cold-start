import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { faviconUrl, type Clipping, type ClippingSourceClass } from "./clipping-model";
import { commitSpring, snapSpring } from "../shared/motion-primitives";
import { useAlphaEvent } from "../shared/alpha-event-context";

const MAX_CLIPPINGS = 6;
const MAX_CAROUSEL_CLIPPINGS = 3;
const MAX_THUMBNAILS = 2;
const CAROUSEL_DWELL_MS = 3400;
// Per spec: thumbnails are reserved for the classes where a page image reads as evidence
// (a funding or customer story, a news photo); a company site or docs favicon is enough.
const THUMBNAIL_ELIGIBLE_SOURCE_CLASSES = new Set<ClippingSourceClass>(["news", "funding", "customer_proof"]);

const KIND_LABEL: Record<ClippingSourceClass, string> = {
  company_site: "Company site",
  customer_proof: "Customer",
  database: "Database",
  docs: "Docs",
  funding: "Funding",
  jobs: "Jobs",
  news: "News",
  // "other" renders no kind label: the domain plus the classification dot carry it.
  other: "",
  people: "People",
  registry: "Filing"
};

function analyticsSourceClass(sourceClass: ClippingSourceClass) {
  if (sourceClass === "company_site" || sourceClass === "docs" || sourceClass === "jobs") {
    return "company" as const;
  }
  if (sourceClass === "news" || sourceClass === "funding" || sourceClass === "customer_proof") {
    return "reporting" as const;
  }
  return "independent" as const;
}

function ClippingRow({
  clipping,
  companyDomain,
  index,
  ordinal,
  position,
  prefersReducedMotion,
  thumbEligible,
  variant
}: {
  clipping: Clipping;
  companyDomain: string;
  index: number;
  ordinal: number;
  position: number;
  prefersReducedMotion: boolean;
  thumbEligible: boolean;
  variant: "carousel" | "filed";
}) {
  const emitAlphaEvent = useAlphaEvent();
  const [thumbFailed, setThumbFailed] = useState(false);
  const [faviconFailed, setFaviconFailed] = useState(false);
  const showThumb = thumbEligible && !thumbFailed && Boolean(clipping.imageUrl);
  const favicon = showThumb ? null : faviconUrl(clipping.url);
  const showFavicon = Boolean(favicon) && !faviconFailed;
  const active = variant === "carousel" && position === 0;
  const carouselMotion = prefersReducedMotion
    ? { opacity: active ? 1 : position === 1 ? 0.5 : 0.3 }
    : {
        opacity: active ? 1 : position === 1 ? 0.48 : 0.27,
        scale: active ? 1 : position === 1 ? 0.982 : 0.965,
        x: 0,
        y: 0
      };

  return (
    <motion.li
      className="cs-clipping"
      data-active={active ? "true" : "false"}
      data-position={position}
      data-source-class={clipping.sourceClass}
      initial={prefersReducedMotion
        ? { opacity: 0 }
        : variant === "carousel"
          ? { opacity: 0, scale: 0.95, x: position === 0 ? -42 : 0, y: position === 0 ? 8 : 18 }
          : { opacity: 0, y: 6 }}
      animate={variant === "carousel" ? carouselMotion : { opacity: 1, y: 0 }}
      exit={prefersReducedMotion
        ? { opacity: 0 }
        : variant === "carousel"
          ? { opacity: 0, scale: 0.96, x: 34, y: -6 }
          : { opacity: 0 }}
      layout={variant === "carousel" && !prefersReducedMotion ? "position" : false}
      transition={prefersReducedMotion
        ? { duration: 0.14, ease: "easeOut" }
        : variant === "carousel"
          ? { ...snapSpring, opacity: { duration: 0.26, ease: "easeOut" } }
          : { ...commitSpring, delay: index * 0.05 }}
    >
      <a
        className="cs-clipping-link"
        href={clipping.url}
        onClick={() => {
          emitAlphaEvent("source.opened", {
            domain: companyDomain,
            sourceClass: analyticsSourceClass(clipping.sourceClass),
            ordinal
          });
        }}
        rel="noreferrer"
        target="_blank"
        title={clipping.title || clipping.domain}
      >
        {showThumb && clipping.imageUrl ? (
          <img
            alt=""
            className="cs-clipping-thumb"
            loading="lazy"
            onError={() => setThumbFailed(true)}
            referrerPolicy="no-referrer"
            src={clipping.imageUrl}
          />
        ) : showFavicon && favicon ? (
          <img
            alt=""
            className="cs-clipping-favicon"
            height={16}
            onError={() => setFaviconFailed(true)}
            src={favicon}
            width={16}
          />
        ) : variant === "carousel" ? (
          <span aria-hidden="true" className="cs-clipping-source-mark">
            <span className="cs-clipping-dot" data-source-class={clipping.sourceClass} />
          </span>
        ) : null}
        <span className="cs-clipping-copy">
          <span className="cs-clipping-meta">
            <span className="cs-clipping-dot" data-source-class={clipping.sourceClass} aria-hidden="true" />
            <span className="cs-clipping-domain">{clipping.domain}</span>
            {KIND_LABEL[clipping.sourceClass] ? <span className="cs-clipping-kind">{KIND_LABEL[clipping.sourceClass]}</span> : null}
          </span>
          <span className="cs-clipping-note">{clipping.note}</span>
        </span>
        {active ? <span aria-hidden="true" className="cs-clipping-sweep" /> : null}
      </a>
    </motion.li>
  );
}

// Source receipts fill the forming space before any fact exists. New evidence only arrives
// from source events; the carousel timer changes reading focus, not research progress.
export function Clippings({
  clippings,
  companyDomain = clippings[0]?.domain ?? "unknown.invalid",
  prefersReducedMotion,
  variant = "filed"
}: {
  clippings: Clipping[];
  companyDomain?: string;
  prefersReducedMotion: boolean;
  variant?: "carousel" | "filed";
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const capped = useMemo(() => clippings.slice(0, MAX_CLIPPINGS), [clippings]);
  const clippingSignature = capped.map((clipping) => clipping.url).join("|");
  const displayed = useMemo(() => {
    if (variant !== "carousel" || capped.length <= 1) {
      return capped.slice(0, variant === "carousel" ? MAX_CAROUSEL_CLIPPINGS : MAX_CLIPPINGS);
    }
    return Array.from(
      { length: Math.min(MAX_CAROUSEL_CLIPPINGS, capped.length) },
      (_, offset) => capped[(activeIndex + offset) % capped.length]
    ).filter((clipping): clipping is Clipping => Boolean(clipping));
  }, [activeIndex, capped, variant]);
  const awaiting = displayed.length === 0;

  useEffect(() => {
    setActiveIndex(0);
  }, [clippingSignature, variant]);

  useEffect(() => {
    if (variant !== "carousel" || paused || capped.length <= 1) {
      return;
    }
    const interval = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % capped.length);
    }, CAROUSEL_DWELL_MS);
    return () => window.clearInterval(interval);
  }, [capped.length, paused, variant]);

  const thumbUrls = new Set<string>();
  for (const clipping of displayed) {
    if (clipping.imageUrl && THUMBNAIL_ELIGIBLE_SOURCE_CLASSES.has(clipping.sourceClass) && thumbUrls.size < MAX_THUMBNAILS) {
      thumbUrls.add(clipping.url);
    }
  }

  return (
    <section
      aria-label={variant === "carousel" ? "Clippings" : "Sources found"}
      className="cs-clippings"
      data-state={awaiting ? "awaiting" : "settled"}
      data-variant={variant}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setPaused(false);
        }
      }}
      onFocusCapture={() => setPaused(true)}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
    >
      {awaiting ? (
        <span aria-hidden="true" className="cs-clippings-rule" />
      ) : (
        <>
          {variant === "carousel" ? (
            <div className="cs-clippings-head">
              <span>Clippings</span>
              <span>{clippings.length} found</span>
            </div>
          ) : null}
          <motion.ul className="cs-clippings-list" layout={variant === "carousel" && !prefersReducedMotion}>
            <AnimatePresence initial={false} mode={variant === "carousel" ? "popLayout" : "sync"}>
              {displayed.map((clipping, index) => (
                <ClippingRow
                  clipping={clipping}
                  companyDomain={companyDomain}
                  index={index}
                  key={clipping.url}
                  ordinal={Math.max(1, capped.findIndex((candidate) => candidate.url === clipping.url) + 1)}
                  position={index}
                  prefersReducedMotion={prefersReducedMotion}
                  thumbEligible={thumbUrls.has(clipping.url)}
                  variant={variant}
                />
              ))}
            </AnimatePresence>
          </motion.ul>
        </>
      )}
    </section>
  );
}
