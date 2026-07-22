import { afterEach, describe, expect, it } from "vitest";

import { analysisSourceRefreshModeFromProcess } from "../src/inngest/worker-env";

describe("analysisSourceRefreshModeFromProcess", () => {
  const original = process.env.ANALYSIS_SOURCE_REFRESH;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.ANALYSIS_SOURCE_REFRESH;
    } else {
      process.env.ANALYSIS_SOURCE_REFRESH = original;
    }
  });

  it("defaults to full when unset", () => {
    delete process.env.ANALYSIS_SOURCE_REFRESH;
    expect(analysisSourceRefreshModeFromProcess()).toBe("full");
  });

  it("defaults to full on an unrecognized value rather than throwing", () => {
    process.env.ANALYSIS_SOURCE_REFRESH = "yolo";
    expect(analysisSourceRefreshModeFromProcess()).toBe("full");
  });

  it("accepts targeted", () => {
    process.env.ANALYSIS_SOURCE_REFRESH = "targeted";
    expect(analysisSourceRefreshModeFromProcess()).toBe("targeted");
  });

  it("accepts skip-fresh", () => {
    process.env.ANALYSIS_SOURCE_REFRESH = "skip-fresh";
    expect(analysisSourceRefreshModeFromProcess()).toBe("skip-fresh");
  });

  it("accepts full explicitly", () => {
    process.env.ANALYSIS_SOURCE_REFRESH = "full";
    expect(analysisSourceRefreshModeFromProcess()).toBe("full");
  });
});
