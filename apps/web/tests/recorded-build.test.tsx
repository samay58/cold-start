import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RecordedBuild } from "../src/components/landing/RecordedBuild";
import { recordedBuild } from "../src/components/landing/recorded-build-data";

// This harness renders through react-dom/server (no jsdom, no window, no effects). That is
// exactly enough to pin the pre-animation render: before `useInView`'s effect ever runs (effects
// never run under renderToStaticMarkup), the component sits at its literal stage-0 initial state.
// The reduced-motion end state is covered separately in recorded-build-reduced-motion.test.tsx,
// which needs a module-level mock of framer-motion's useReducedMotion and so cannot share a file
// with an unmocked case (vi.mock hoists to the top of its file). The narrow-viewport (<700px)
// branch depends on window.matchMedia inside a useEffect and has no equivalent in this harness;
// it is exercised instead by the Playwright gallery capture at a mobile viewport width
// (tests/e2e/web-gallery.spec.ts), a real browser where the effect actually fires.
describe("RecordedBuild", () => {
  it("renders the frozen build data verbatim at the pre-animation stage", () => {
    const html = renderToStaticMarkup(<RecordedBuild build={recordedBuild} />);

    expect(html).toContain("Mintlify");
    expect(html).toContain("mintlify.com");
    expect(html).toContain(recordedBuild.oneLiner);
    expect(html).toContain("Customers - Mintlify");
    expect(html).toContain("Raised $67M across disclosed rounds.");
    expect(html).toContain("Han Wang, Hahnbee Lee, Nicholas Khami");
    expect(html).toContain("9 sources");
    expect(html).toContain("CS·MINTLIFY·26");
    expect(html).toContain("FILED 2026·05·15");
    expect(html).not.toContain("cs-landing-hero-card-bar");
  });

  it("starts every clipping and section hidden, the seal dry, and the stamp down", () => {
    const html = renderToStaticMarkup(<RecordedBuild build={recordedBuild} />);

    // Stage 0 bindings per the task brief: clippings off-screen and transparent, section opacity
    // at the 0.12 floor, the seal fill at Math.min(0, 4) * 0.05 = 0, no scale bump, FILED at
    // opacity 0. The event line reads the first real event and the elapsed counter starts at 0.
    expect(html).toContain(
      'class="cs-landing-hero-clipping cs-landing-hero-clipping-1" style="opacity:0;transform:translateX(-28px) rotate(1.4deg)"'
    );
    expect(html).toContain('class="cs-landing-hero-card-filed" style="opacity:0;transform:scale(0.85) rotate(-6deg)"');
    expect(html).toContain('class="cs-landing-hero-card-seal" style="background-color:rgb(110 92 158 / 0);transform:rotate(-4deg)"');
    expect(html).toContain('class="cs-landing-hero-card-oneliner" style="opacity:0.12"');
    expect(html).toContain('<span>Reading mintlify.com</span><span class="cs-landing-hero-card-elapsed">0.0s</span>');
  });

  it("offers a replay affordance when the stage machine is live", () => {
    const html = renderToStaticMarkup(<RecordedBuild build={recordedBuild} />);

    expect(html).toContain('class="cs-landing-hero-card-replay"');
    expect(html).toContain(">replay<");
  });
});
