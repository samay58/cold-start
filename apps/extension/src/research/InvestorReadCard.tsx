import {
  synthesisAdvisoriesFromSignals,
  synthesisEvidenceSignals,
  type ColdStartCard,
  type SynthesisAdvisory
} from "@cold-start/core";
import { useState, type ReactNode } from "react";
import type { InvestorReadDisplay, LensTensionClaim } from "./investor-lens";
import { advisoryCopy, isSynthesisAdvisory } from "./synthesis-advisory-copy";
import type { TooltipPropsFor } from "../shared/SharedTooltip";
import { usePrefersReducedMotion } from "../shared/usePrefersReducedMotion";

const LENS_FOOTER_SOURCE_COUNT = 4;

// Five-role type scale, DESIGN.md "Investor Lens Memo" (verbatim table, memo typography track
// of docs/product/gold-standard-references.md): Lede 16px/1.45 At Umami 640 is the only
// display-face content text; Section label ("The case", "Timing", "Next question") is 11px At
// Umami 620 in the seal color, sentence case; Claim rows (bull/bear/timing/question bodies) are
// 13px IBM Plex Sans 450 at 1.55 line-height; Meta (posture line, "changes the read if" note) is
// 11.5px IBM Plex Sans 480; Receipt (citation marks, source domains, the filed stamp) is 10px At
// Textual tabular with at least 0.32px tracking. Section label and Meta sit 0.5px apart on
// purpose: Carbon's heading-01/body-01 pairing (both roles equal in size elsewhere in Carbon,
// split by weight and color alone) is the citation for reading that boundary through face and
// color rather than the gap. Every rule in the card maps to one of these five rows; nothing
// else earns its own size.

// A frozen SynthesisWithheld record and live synthesis are mutually exclusive at rest:
// generate-card.ts strips synthesisWithheld the instant a run produces verified synthesis. This
// only guards stale or hand-built data from blending frozen and live evidence signals on one
// surface -- in the ordinary case synthesisWithheld is absent here and the live branch runs.
function evidencePostureLines(card: ColdStartCard): string[] {
  const { nonEnrichmentSourceTypes } = synthesisEvidenceSignals(card);
  const advisories: readonly SynthesisAdvisory[] = card.synthesisWithheld
    ? card.synthesisWithheld.advisories.filter(isSynthesisAdvisory)
    : synthesisAdvisoriesFromSignals(synthesisEvidenceSignals(card));

  return advisories.map((advisory) => advisoryCopy(advisory, nonEnrichmentSourceTypes));
}

// The measured-height expansion pattern already used for research-layer card bodies
// (.cs-active-enrichment-body-frame in research-trail.css: grid-template-rows 0fr -> 1fr,
// transform/opacity, no JS height measurement), applied here so the three retiring lens
// tooltips (holds/breaks moreClaims, timing moreFields, next-question moreQuestions) become
// inline disclosure instead. Reduced motion collapses the transition to instant, never a freeze
// or missing content: the DOM always carries the overflow content, only the visual reveal
// changes.
function LensDisclosure({
  children,
  count,
  prefersReducedMotion,
  row
}: {
  children: ReactNode;
  count: number;
  prefersReducedMotion: boolean | null;
  row: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const bodyId = `cs-investor-read-more-${row}`;

  return (
    <div className="cs-investor-read-disclosure" data-row={row}>
      <button
        aria-controls={bodyId}
        aria-expanded={expanded}
        className="cs-investor-read-more"
        onClick={() => setExpanded((value) => !value)}
        type="button"
      >
        {expanded ? "Show less" : `+${count} more`}
      </button>
      <div
        className="cs-investor-read-disclosure-frame"
        data-expanded={expanded ? "true" : "false"}
        data-reduced-motion={prefersReducedMotion ? "true" : "false"}
        id={bodyId}
      >
        <div className="cs-investor-read-disclosure-body">{children}</div>
      </div>
    </div>
  );
}

// Opposition treatment: holds claims lead with a filled ink square, breaks claims lead with the
// conflict-class slashed square (oxide --color-conflict). Marks only, no washes; data-side
// (already on the row) and data-mark are what CSS and tests key off, not color alone.
function ClaimMark({ side }: { side: "holds" | "breaks" }) {
  return (
    <span
      aria-hidden="true"
      className="cs-lens-mark"
      data-mark={side === "holds" ? "filled" : "slashed"}
      data-side={side}
    />
  );
}

function LensTensionSide({
  claim,
  emptyCopy,
  label,
  prefersReducedMotion,
  side
}: {
  claim: LensTensionClaim | null;
  emptyCopy: string;
  label: string;
  prefersReducedMotion: boolean | null;
  side: "holds" | "breaks";
}) {
  return (
    <section className="cs-lens-tension-side" data-side={side}>
      <p className="cs-investor-read-claim">
        <ClaimMark side={side} />
        <em>{label}.</em> {claim ? claim.text : <span className="cs-lens-none">{emptyCopy}</span>}
      </p>
      {claim && claim.moreClaims.length > 0 ? (
        <LensDisclosure count={claim.moreClaims.length} prefersReducedMotion={prefersReducedMotion} row={side}>
          {claim.moreClaims.map((entry) => (
            <p key={entry.text}>{entry.text}</p>
          ))}
        </LensDisclosure>
      ) : null}
    </section>
  );
}

export function InvestorReadCard({
  card,
  read,
  tooltipProps
}: {
  card: ColdStartCard;
  read: InvestorReadDisplay;
  tooltipProps: TooltipPropsFor;
}) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const visibleSources = read.sources.slice(0, LENS_FOOTER_SOURCE_COUNT);
  const hiddenSources = read.sources.slice(LENS_FOOTER_SOURCE_COUNT);
  const postureLines = evidencePostureLines(card);
  const showPosture = postureLines.length > 0 || !read.independentlyBacked;

  return (
    <article className="cs-investor-read" aria-label="Investor read">
      <header className="cs-investor-read-head">
        <span>Investor read</span>
      </header>
      <p className="cs-investor-read-lede" data-role="lede">
        {read.lede.text}
      </p>
      <div className="cs-lens-tension" aria-label="The case">
        <h4 className="cs-investor-read-label">The case</h4>
        {!read.holds && !read.breaks ? (
          <p className="cs-lens-case-empty cs-lens-none">No bull or break claim survived verification.</p>
        ) : (
          <>
            <LensTensionSide
              claim={read.holds}
              emptyCopy="No supporting claim survived verification."
              label="If true"
              prefersReducedMotion={prefersReducedMotion}
              side="holds"
            />
            <LensTensionSide
              claim={read.breaks}
              emptyCopy="No breaking claim survived verification."
              label="It breaks if"
              prefersReducedMotion={prefersReducedMotion}
              side="breaks"
            />
          </>
        )}
      </div>
      <section className="cs-lens-timing" data-supported={read.timing ? "true" : "false"} aria-label="Timing">
        <h4 className="cs-investor-read-label">Timing</h4>
        {read.timing ? (
          <>
            <p className="cs-investor-read-claim">
              <em>{read.timing.field}.</em> {read.timing.text}
            </p>
            {read.timing.moreFields.length > 0 ? (
              <LensDisclosure count={read.timing.moreFields.length} prefersReducedMotion={prefersReducedMotion} row="timing">
                {read.timing.moreFields.map((entry) => (
                  <p key={entry.field}>
                    <em>{entry.field}.</em> {entry.text}
                  </p>
                ))}
              </LensDisclosure>
            ) : null}
          </>
        ) : (
          <p className="cs-lens-none">Not supported by current sources.</p>
        )}
      </section>
      <section className="cs-lens-question" aria-label="Next question">
        <h4 className="cs-investor-read-label">Next question</h4>
        {read.nextQuestion ? (
          <>
            <p className="cs-investor-read-claim">
              {read.nextQuestion.question}
              {read.nextQuestion.categoryLabel ? (
                <span className="cs-lens-question-category">{read.nextQuestion.categoryLabel}</span>
              ) : null}
            </p>
            {read.nextQuestion.changesReadIf ? (
              <p className="cs-investor-read-meta">
                <em>Changes the read if</em> {read.nextQuestion.changesReadIf}
              </p>
            ) : null}
            {read.nextQuestion.moreQuestions.length > 0 ? (
              <LensDisclosure count={read.nextQuestion.moreQuestions.length} prefersReducedMotion={prefersReducedMotion} row="question">
                {read.nextQuestion.moreQuestions.map((entry) => (
                  <div key={entry.question}>
                    <p>
                      {entry.categoryLabel ? <span className="cs-lens-question-category">{entry.categoryLabel}</span> : null}
                      {entry.question}
                    </p>
                    {entry.changesReadIf ? (
                      <p className="cs-investor-read-meta">
                        <em>Changes the read if</em> {entry.changesReadIf}
                      </p>
                    ) : null}
                  </div>
                ))}
              </LensDisclosure>
            ) : null}
          </>
        ) : (
          <p className="cs-lens-none">No ranked question survived verification.</p>
        )}
      </section>
      <footer className="cs-lens-footer" aria-label="Cited sources">
        <div className="cs-lens-footer-sources">
          {visibleSources.map((source) => (
            <a
              className="cs-lens-source"
              data-class={source.sourceClass}
              href={source.href}
              key={source.id}
              rel="noreferrer"
              target="_blank"
              title={`${source.qualityLabel}: ${source.title}`}
            >
              <i aria-hidden="true" />
              {source.domain}
            </a>
          ))}
          {hiddenSources.length > 0 ? (
            <button
              className="cs-lens-source cs-lens-source-more"
              type="button"
              {...tooltipProps({
                body: hiddenSources.map((source) => `${source.domain}: ${source.title}`).join("\n"),
                id: "lens-sources-more",
                placement: "above",
                title: "Also cited"
              })}
            >
              {`+${hiddenSources.length}`}
            </button>
          ) : null}
        </div>
        <small className="cs-lens-footer-filed">{read.receiptLine}</small>
      </footer>
      {showPosture ? (
        <div aria-label="Evidence posture" className="cs-investor-read-posture">
          {!read.independentlyBacked ? (
            <p className="cs-investor-read-meta cs-lens-footer-caveat">No independent source in this read.</p>
          ) : null}
          {postureLines.map((line) => (
            <p className="cs-investor-read-meta" key={line}>{line}</p>
          ))}
        </div>
      ) : null}
    </article>
  );
}
