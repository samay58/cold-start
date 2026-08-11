import { AnimatePresence, motion } from "framer-motion";
import { safePublicImageUrl, safeWebUrl } from "@cold-start/core";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  clippingHasUsefulTitle,
  faviconUrl,
  type Clipping,
  type ClippingSourceClass
} from "./clipping-model";
import { commitSpring, snapSpring } from "../shared/motion-primitives";
import { useAlphaEvent } from "../shared/alpha-event-context";

const MAX_FILED_CLIPPINGS = 6;
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

const CAROUSEL_PRIORITY: Record<ClippingSourceClass, number> = {
  customer_proof: 0,
  funding: 0,
  news: 0,
  database: 1,
  registry: 1,
  company_site: 2,
  docs: 2,
  jobs: 2,
  other: 2,
  people: 2
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
  focused,
  index,
  ordinal,
  position,
  prefersReducedMotion,
  thumbEligible,
  variant
}: {
  clipping: Clipping;
  companyDomain: string;
  focused: boolean;
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
  const sourceUrl = safeWebUrl(clipping.url);
  const imageUrl = safePublicImageUrl(clipping.imageUrl);
  const showThumb = thumbEligible && !thumbFailed && Boolean(imageUrl);
  const favicon = showThumb || !sourceUrl ? null : faviconUrl(sourceUrl);
  const showFavicon = Boolean(favicon) && !faviconFailed;
  const active = variant === "carousel" && focused;
  const lead = variant === "carousel" && position === 0;
  const carouselMotion = prefersReducedMotion
    ? { opacity: lead ? 1 : position === 1 ? 0.52 : 0.3 }
    : {
        opacity: lead ? 1 : position === 1 ? 0.52 : 0.3,
        scale: lead ? 1 : position === 1 ? 0.982 : 0.965,
        x: 0,
        y: 0
      };
  const content = (
    <>
      {showThumb && imageUrl ? (
        <img
          alt=""
          className="cs-clipping-thumb"
          loading="lazy"
          onError={() => setThumbFailed(true)}
          referrerPolicy="no-referrer"
          src={imageUrl}
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
      ) : null}
      <span className="cs-clipping-copy">
        <span className="cs-clipping-meta">
          <span className="cs-clipping-dot" data-source-class={clipping.sourceClass} aria-hidden="true" />
          <span className="cs-clipping-domain">{clipping.domain}</span>
          {KIND_LABEL[clipping.sourceClass] ? <span className="cs-clipping-kind">{KIND_LABEL[clipping.sourceClass]}</span> : null}
        </span>
        {clipping.note ? <span className="cs-clipping-note">{clipping.note}</span> : null}
      </span>
    </>
  );

  return (
    <motion.li
      className="cs-clipping"
      data-active={active ? "true" : "false"}
      data-position={position}
      data-source-class={clipping.sourceClass}
      // One vertical axis for the whole desk: new evidence lands into focus from above and
      // settles on the snap spring (a breath of follow-through, no bounce), the waiting queue
      // rises quietly from below, and a retiring clipping fades down as if filed. The focused
      // slot's opacity trails the others by a beat so the outgoing clipping yields before the
      // incoming one becomes readable.
      initial={prefersReducedMotion
        ? { opacity: 0 }
        : variant === "carousel"
          ? position === 0
            ? { opacity: 0, scale: 0.985, y: -16 }
            : { opacity: 0, y: 12 }
          : { opacity: 0, y: 6 }}
      animate={variant === "carousel" ? carouselMotion : { opacity: 1, y: 0 }}
      exit={prefersReducedMotion
        ? { opacity: 0 }
        : variant === "carousel"
          ? { opacity: 0, scale: 0.99, y: 10, transition: { duration: 0.2, ease: "easeIn" } }
          : { opacity: 0 }}
      layout={variant === "carousel" && !prefersReducedMotion ? "position" : false}
      transition={prefersReducedMotion
        ? { duration: 0.14, ease: "easeOut" }
        : variant === "carousel"
          ? { ...snapSpring, opacity: { duration: 0.26, ease: "easeOut", delay: lead ? 0.06 : 0 } }
          : { ...commitSpring, delay: index * 0.05 }}
    >
      {sourceUrl ? (
        <a
          className="cs-clipping-link"
          data-lead={showThumb ? "thumb" : showFavicon ? "favicon" : "none"}
          href={sourceUrl}
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
          {content}
        </a>
      ) : (
        <div
          className="cs-clipping-link"
          data-lead={showThumb ? "thumb" : "none"}
          title={clipping.title || clipping.domain}
        >
          {content}
        </div>
      )}
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
  const [queueIndex, setQueueIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const previousUrls = useRef<string[]>([]);
  const available = useMemo(
    () => variant === "carousel"
      ? clippings
          .map((clipping, index) => ({ clipping, index }))
          .sort((left, right) =>
            Number(clippingHasUsefulTitle(right.clipping)) - Number(clippingHasUsefulTitle(left.clipping))
              || CAROUSEL_PRIORITY[left.clipping.sourceClass] - CAROUSEL_PRIORITY[right.clipping.sourceClass]
              || left.index - right.index
          )
          .map(({ clipping }) => clipping)
      : clippings.slice(0, MAX_FILED_CLIPPINGS),
    [clippings, variant]
  );
  const focusable = useMemo(
    () => available.filter((clipping) => clippingHasUsefulTitle(clipping)),
    [available]
  );
  const activeClipping = variant === "carousel" && focusable.length > 0
    ? focusable[activeIndex % focusable.length] ?? null
    : null;
  const queueLength = Math.max(0, available.length - (activeClipping ? 1 : 0));
  const clippingSignature = JSON.stringify(available.map((clipping) => ({
    url: clipping.url,
    useful: clippingHasUsefulTitle(clipping)
  })));
  const displayed = useMemo(() => {
    if (variant !== "carousel") {
      return available.slice(0, MAX_FILED_CLIPPINGS);
    }
    const queued = available.filter((clipping) => clipping.url !== activeClipping?.url);
    const fadedCount = Math.min(activeClipping ? 2 : MAX_CAROUSEL_CLIPPINGS, queued.length);
    const faded = Array.from(
      { length: fadedCount },
      (_, offset) => queued[(queueIndex + offset) % queued.length]
    ).filter((clipping): clipping is Clipping => Boolean(clipping));
    return activeClipping ? [activeClipping, ...faded] : faded;
  }, [activeClipping, available, queueIndex, variant]);
  const awaiting = displayed.length === 0;

  useEffect(() => {
    const entries = JSON.parse(clippingSignature) as Array<{ url: string; useful: boolean }>;
    const urls = entries.map((entry) => entry.url);
    const seen = new Set(previousUrls.current);
    const firstNewIndex = urls.findIndex((url) => !seen.has(url));
    if (firstNewIndex >= 0) {
      const newEntry = entries[firstNewIndex];
      if (newEntry?.useful) {
        setActiveIndex(entries.filter((entry) => entry.useful).findIndex((entry) => entry.url === newEntry.url));
      }
      setQueueIndex(Math.max(0, firstNewIndex - 1));
    } else if (urls.length === 0) {
      setActiveIndex(0);
      setQueueIndex(0);
    }
    previousUrls.current = urls;
  }, [clippingSignature, variant]);

  useEffect(() => {
    if (variant !== "carousel" || paused || prefersReducedMotion || available.length <= 1) {
      return;
    }
    const interval = window.setInterval(() => {
      setActiveIndex((current) => focusable.length > 0 ? (current + 1) % focusable.length : 0);
      setQueueIndex((current) => queueLength > 0 ? (current + 1) % queueLength : 0);
    }, CAROUSEL_DWELL_MS);
    return () => window.clearInterval(interval);
  }, [available.length, focusable.length, paused, prefersReducedMotion, queueLength, variant]);

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
                  focused={clipping.url === activeClipping?.url}
                  index={index}
                  key={clipping.url}
                  ordinal={Math.max(1, available.findIndex((candidate) => candidate.url === clipping.url) + 1)}
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
