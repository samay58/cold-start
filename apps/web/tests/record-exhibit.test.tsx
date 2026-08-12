import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RecordExhibit } from "../src/components/landing/RecordExhibit";
import { exhibitTickCount, recordExhibit } from "../src/components/landing/record-exhibit-data";

// Same harness as recorded-build.test.tsx: react-dom/server, no jsdom, no effects. That pins
// the pre-animation render (useInView's effect never runs), so every tally stroke sits at its
// hidden initial state here. The reduced-motion settled state lives in its own file because
// vi.mock hoists (record-exhibit-reduced-motion.test.tsx). Mobile stacking and the desk
// geometry are CSS-only (landing.css) and are exercised by the Playwright gallery capture.

function escapeText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/>/g, "&gt;").replace(/'/g, "&#x27;");
}

function escapeAttr(url: string): string {
  return url.replace(/&/g, "&amp;");
}

describe("RecordExhibit", () => {
  const html = renderToStaticMarkup(<RecordExhibit />);

  it("renders the printout with its printed source header and all six one-liners verbatim", () => {
    expect(html).toContain(recordExhibit.printoutTitle);
    expect(html).toContain(`accessed ${recordExhibit.accessDate}`);
    for (const entry of recordExhibit.stack) {
      expect(html).toContain(escapeText(entry.text));
    }
  });

  it("renders the three question pairs with their records and frozen card excerpts", () => {
    for (const pair of recordExhibit.pairs) {
      expect(html).toContain(escapeText(pair.question));
      if (pair.record.description) {
        expect(html).toContain(escapeText(pair.record.description));
      }
      for (const field of pair.record.fields ?? []) {
        expect(html).toContain(escapeText(field.value));
      }
      for (const column of pair.record.columns ?? []) {
        expect(html).toContain(escapeText(column.name));
      }
      for (const line of pair.excerpt.lines) {
        expect(html).toContain(escapeText(line.text));
      }
      for (const comp of pair.excerpt.comps ?? []) {
        expect(html).toContain(escapeText(comp.name));
        expect(html).toContain(escapeText(comp.basis));
        for (const host of comp.sourceHosts) {
          expect(html).toContain(escapeText(host));
        }
      }
    }
  });

  it("identifies both sides of every pair: source-tagged record head, card identity row, logos", () => {
    // One record head naming the company plus a PitchBook tag per pair, one card identity
    // row per pair, and a vetted logo on each side (binding decision, 2026-08-12).
    expect((html.match(/cs-exhibit-record-head/g) ?? []).length).toBe(recordExhibit.pairs.length);
    expect((html.match(/cs-exhibit-record-src/g) ?? []).length).toBe(recordExhibit.pairs.length);
    expect((html.match(/&gt;PitchBook&lt;|>PitchBook</g) ?? []).length).toBeGreaterThanOrEqual(recordExhibit.pairs.length);
    expect((html.match(/cs-exhibit-co-row/g) ?? []).length).toBe(recordExhibit.pairs.length);
    expect((html.match(/class="cs-exhibit-logo"/g) ?? []).length).toBe(recordExhibit.pairs.length * 2);
    for (const pair of recordExhibit.pairs) {
      expect(html).toContain(escapeAttr(pair.logoUrls[0]!));
    }
  });

  it("stamps each mini card as a filed catalogue object", () => {
    const filedDate = recordExhibit.accessDate.replaceAll("-", "·");
    for (const pair of recordExhibit.pairs) {
      expect(html).toContain(`CS · ${pair.slug.toUpperCase()} · ${recordExhibit.accessDate.slice(2, 4)}`);
    }
    expect((html.match(/cs-exhibit-filed/g) ?? []).length).toBe(recordExhibit.pairs.length);
    expect((html.match(new RegExp(filedDate.replaceAll("·", "\\u00b7"), "g")) ?? []).length).toBe(
      recordExhibit.pairs.length
    );
  });

  it("links each pair to its live card", () => {
    for (const pair of recordExhibit.pairs) {
      expect(html).toContain(`href="/c/${pair.slug}"`);
    }
  });

  it("draws one decorative hand tally stroke per line their record has no field for", () => {
    const strokes = html.match(/<span[^>]*class="cs-exhibit-tick"[^>]*>/g) ?? [];
    expect(strokes.length).toBe(exhibitTickCount(recordExhibit));
    expect(exhibitTickCount(recordExhibit)).toBe(9);
    for (const stroke of strokes) {
      expect(stroke).toContain('aria-hidden="true"');
      // Pre-animation initial state: collapsed and transparent, waiting for the in-view
      // draw. The slant rides the same transform so the stroke never renders as a bar.
      expect(stroke).toContain("scaleY(0)");
      expect(stroke).toContain("rotate(");
    }
  });

  it("renders the kicker, the disagreement slip with its source link, and no tally line", () => {
    expect(html).toContain(escapeText(recordExhibit.kicker));
    const noteSlip = recordExhibit.pairs[0]?.noteSlip;
    expect(noteSlip).toBeTruthy();
    expect(html).toContain(escapeText(noteSlip!.text));
    expect(html).toContain(escapeText(noteSlip!.linkText));
    expect(html).toContain(`href="${noteSlip!.linkHref}"`);
    // The tally beat was cut 2026-08-12: the section ends on the third pair.
    expect(html).not.toContain("cs-exhibit-tally");
    expect(html).not.toContain("Nine lines");
    expect(html).not.toContain("Both values stand");
  });

  it("carries no synthesis onto the landing page", () => {
    // The exhibit is public card content only. None of the gated Investor Lens vocabulary
    // may appear in its markup.
    for (const gated of ["Why care", "What must be true", "What could break", "bull case", "bear case"]) {
      expect(html).not.toContain(gated);
    }
  });
});
