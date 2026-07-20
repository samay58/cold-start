import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { faviconUrl, type Clipping, type ClippingSourceClass } from "./clipping-model";
import { commitSpring } from "../shared/motion-primitives";

const MAX_CLIPPINGS = 6;
const MAX_THUMBNAILS = 2;
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

function ClippingRow({
  clipping,
  index,
  prefersReducedMotion,
  thumbEligible
}: {
  clipping: Clipping;
  index: number;
  prefersReducedMotion: boolean;
  thumbEligible: boolean;
}) {
  const [thumbFailed, setThumbFailed] = useState(false);
  const [faviconFailed, setFaviconFailed] = useState(false);
  const showThumb = thumbEligible && !thumbFailed && Boolean(clipping.imageUrl);
  const favicon = showThumb ? null : faviconUrl(clipping.url);
  const showFavicon = Boolean(favicon) && !faviconFailed;

  return (
    <motion.li
      className="cs-clipping"
      data-source-class={clipping.sourceClass}
      initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
      animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={prefersReducedMotion ? { duration: 0.14, ease: "easeOut" } : { ...commitSpring, delay: index * 0.05 }}
    >
      <a href={clipping.url} rel="noreferrer" target="_blank" title={clipping.title || clipping.domain}>
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
        ) : null}
        <span className="cs-clipping-dot" data-source-class={clipping.sourceClass} aria-hidden="true" />
        <span className="cs-clipping-domain">{clipping.domain}</span>
        {KIND_LABEL[clipping.sourceClass] ? <span className="cs-clipping-kind">{KIND_LABEL[clipping.sourceClass]}</span> : null}
      </a>
    </motion.li>
  );
}

// Source receipts as the card's first content: they fill the forming space before any fact
// exists, and each arrives on its own source event, never on a clock.
export function Clippings({
  clippings,
  prefersReducedMotion
}: {
  clippings: Clipping[];
  prefersReducedMotion: boolean;
}) {
  const displayed = clippings.slice(0, MAX_CLIPPINGS);
  const awaiting = displayed.length === 0;

  const thumbUrls = new Set<string>();
  for (const clipping of displayed) {
    if (clipping.imageUrl && THUMBNAIL_ELIGIBLE_SOURCE_CLASSES.has(clipping.sourceClass) && thumbUrls.size < MAX_THUMBNAILS) {
      thumbUrls.add(clipping.url);
    }
  }

  return (
    <section aria-label="Sources found" className="cs-clippings" data-state={awaiting ? "awaiting" : "settled"}>
      {awaiting ? (
        <span aria-hidden="true" className="cs-clippings-rule" />
      ) : (
        <ul className="cs-clippings-list">
          <AnimatePresence initial={false}>
            {displayed.map((clipping, index) => (
              <ClippingRow
                clipping={clipping}
                index={index}
                key={clipping.url}
                prefersReducedMotion={prefersReducedMotion}
                thumbEligible={thumbUrls.has(clipping.url)}
              />
            ))}
          </AnimatePresence>
        </ul>
      )}
    </section>
  );
}
