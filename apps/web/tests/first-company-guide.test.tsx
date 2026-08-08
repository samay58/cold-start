import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FIRST_COMPANY_STEPS, FirstCompanyGuide, nextFirstCompanyStep } from "../src/app/alpha/FirstCompanyGuide";

describe("FirstCompanyGuide", () => {
  it("keeps the first-company journey short, ordered, and grounded in the real action", () => {
    expect(FIRST_COMPANY_STEPS.map((step) => step.label)).toEqual([
      "Open a company site",
      "Open Cold Start",
      "Begin research"
    ]);
    expect(nextFirstCompanyStep(0)).toBe(1);
    expect(nextFirstCompanyStep(2)).toBe(0);
  });

  it("renders the real starting action, toolbar recovery tip, and invitation allowance", () => {
    const html = renderToStaticMarkup(<FirstCompanyGuide lensRemaining={6} profileRemaining={12} />);

    expect(html).toContain("Follow the browser.");
    expect(html).toContain("Begin research");
    expect(html).toContain("Cannot see Cold Start?");
    expect(html).toContain("12 fresh profiles and 6 Lens runs");
    expect(html).toContain("Open Linear");
    expect(html).toContain('aria-current="step"');
  });
});
