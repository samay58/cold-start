import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// Framer Motion's own `useReducedMotion` computes its value synchronously during render (not in
// an effect: see node_modules/framer-motion/dist/es/utils/reduced-motion/use-reduced-motion.mjs),
// so a plain partial mock of the module is enough to force the reduced-motion branch under
// react-dom/server, no jsdom or window required. vi.mock hoists to the top of its file, so this
// case lives in its own file, isolated from recorded-build.test.tsx's unmocked stage-0 assertions.
vi.mock("framer-motion", async (importOriginal) => {
  const actual = await importOriginal<typeof import("framer-motion")>();
  return {
    ...actual,
    useReducedMotion: () => true
  };
});

const { RecordedBuild } = await import("../src/components/landing/RecordedBuild");
const { recordedBuild } = await import("../src/components/landing/recorded-build-data");

describe("RecordedBuild under prefers-reduced-motion", () => {
  it("renders the finished stage statically: every reveal settled, the seal maxed, the stamp down", () => {
    const html = renderToStaticMarkup(<RecordedBuild build={recordedBuild} />);

    // Stage 6 bindings per the task brief: every clipping and section fully visible, the seal
    // fill maxed at Math.min(6, 4) * 0.05 = 0.2 and scaled to 1.04, the FILED stamp at full
    // opacity, the event line holding on the last real event, and the elapsed counter at 6 * 0.7.
    expect(html).toContain(
      'class="cs-landing-hero-clipping cs-landing-hero-clipping-1" style="opacity:1;transform:rotate(1.4deg)"'
    );
    expect(html).toContain('class="cs-landing-hero-card-filed" style="opacity:1;transform:rotate(-6deg)"');
    expect(html).toContain('class="cs-landing-hero-card-seal" style="background-color:rgb(110 92 158 / 0.2);transform:scale(1.04) rotate(-4deg)"');
    expect(html).toContain('class="cs-landing-hero-card-oneliner" style="opacity:1"');
    expect(html).toContain('<span>Filed</span><span class="cs-landing-hero-card-elapsed">4.2s</span>');
  });

  it("runs no timers and offers no replay affordance", () => {
    const html = renderToStaticMarkup(<RecordedBuild build={recordedBuild} />);

    expect(html).not.toContain("cs-landing-hero-card-replay");
    expect(html).not.toContain(">replay<");
  });
});
