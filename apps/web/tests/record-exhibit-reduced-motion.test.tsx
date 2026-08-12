import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// Same mock strategy as recorded-build-reduced-motion.test.tsx: framer-motion's
// useReducedMotion computes synchronously during render, so a partial module mock forces the
// reduced-motion branch under react-dom/server. vi.mock hoists, so this case has its own file.
vi.mock("framer-motion", async (importOriginal) => {
  const actual = await importOriginal<typeof import("framer-motion")>();
  return {
    ...actual,
    useReducedMotion: () => true
  };
});

const { RecordExhibit } = await import("../src/components/landing/RecordExhibit");
const { exhibitTickCount, recordExhibit } = await import("../src/components/landing/record-exhibit-data");

describe("RecordExhibit under prefers-reduced-motion", () => {
  it("shows every tick settled at full opacity with no draw pending", () => {
    const html = renderToStaticMarkup(<RecordExhibit />);

    const tickCount = (html.match(/cs-exhibit-tick/g) ?? []).length;
    expect(tickCount).toBe(exhibitTickCount(recordExhibit));
    // initial={false} + drawn: the tick renders at its settled animate values, never scaleY(0).
    expect(html).not.toContain("transform:scaleY(0)");
    expect(html).not.toContain('class="cs-exhibit-tick" style="opacity:0');
  });
});
