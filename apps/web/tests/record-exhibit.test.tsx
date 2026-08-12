import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RecordExhibit } from "../src/components/landing/RecordExhibit";
import { exhibitTickCount, recordExhibit } from "../src/components/landing/record-exhibit-data";

// Same harness as recorded-build.test.tsx: react-dom/server, no jsdom, no effects. That pins
// the pre-animation render (useInView's effect never runs), so every tick sits at its hidden
// initial state here. The reduced-motion settled state lives in its own file because vi.mock
// hoists (record-exhibit-reduced-motion.test.tsx). Mobile stacking is CSS-only (<700px media
// query in landing.css) and is exercised by the Playwright gallery capture at a mobile width.
describe("RecordExhibit", () => {
  const html = renderToStaticMarkup(<RecordExhibit />);

  it("renders all six PitchBook one-liners verbatim with the attribution caption", () => {
    for (const entry of recordExhibit.stack) {
      expect(html).toContain(entry.text);
    }
    expect(html).toContain(recordExhibit.stackCaption);
  });

  it("renders the three question pairs with their records and frozen card excerpts", () => {
    for (const pair of recordExhibit.pairs) {
      expect(html).toContain(pair.question);
      for (const field of pair.record.fields ?? []) {
        expect(html).toContain(field.value);
      }
      for (const column of pair.record.columns ?? []) {
        expect(html).toContain(column.name);
      }
      for (const line of pair.excerpt.lines) {
        expect(html).toContain(line.text.replace(/&/g, "&amp;").replace(/>/g, "&gt;"));
      }
      for (const comp of pair.excerpt.comps ?? []) {
        expect(html).toContain(comp.name);
        expect(html).toContain(comp.basis);
        for (const host of comp.sourceHosts) {
          expect(html).toContain(host);
        }
      }
    }
  });

  it("links each pair to its live card", () => {
    for (const pair of recordExhibit.pairs) {
      expect(html).toContain(`href="/c/${pair.slug}"`);
    }
  });

  it("draws exactly one tick per line the left side has no field for, hidden before scroll", () => {
    const tickCount = (html.match(/cs-exhibit-tick/g) ?? []).length;
    expect(tickCount).toBe(exhibitTickCount(recordExhibit));
    expect(exhibitTickCount(recordExhibit)).toBe(9);
    // Pre-animation initial state: scaleY(0), transparent, waiting for the in-view draw.
    expect(html).toContain('class="cs-exhibit-tick" style="opacity:0;transform:scaleY(0)"');
  });

  it("keeps ticks decorative and carries the count in the tally line as real text", () => {
    // Every gutter (tick or empty) is aria-hidden; the tally is a plain paragraph.
    const gutters = (html.match(/cs-exhibit-gutter/g) ?? []).length;
    const hiddenGutters = (html.match(/aria-hidden="true" class="cs-exhibit-gutter"/g) ?? []).length;
    expect(gutters).toBeGreaterThan(0);
    expect(hiddenGutters).toBe(gutters);
    expect(html).toContain(recordExhibit.tally);
  });

  it("renders the employee margin note and the kicker placeholder", () => {
    expect(html).toContain(recordExhibit.kicker);
    const employeeNote = recordExhibit.pairs[0]?.record.fields?.find((field) => field.note)?.note;
    expect(employeeNote).toBeTruthy();
    expect(html).toContain(employeeNote!);
  });

  it("carries no synthesis onto the landing page", () => {
    // The exhibit is public card content only. None of the gated Investor Lens vocabulary
    // may appear in its markup.
    for (const gated of ["Why care", "What must be true", "What could break", "bull case", "bear case"]) {
      expect(html).not.toContain(gated);
    }
  });
});
