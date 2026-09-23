import { afterEach, describe, expect, it } from "vitest";

import { analysisSourceRefreshModeFromProcess, directExaEnabled } from "../src/inngest/worker-env";

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

describe("directExaEnabled", () => {
  const original = { current: process.env.DIRECT_EXA_ENABLED, legacy: process.env.FAST_BASICS_ENABLED };

  afterEach(() => {
    for (const [key, value] of [["DIRECT_EXA_ENABLED", original.current], ["FAST_BASICS_ENABLED", original.legacy]] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("is on when neither name is set", () => {
    delete process.env.DIRECT_EXA_ENABLED;
    delete process.env.FAST_BASICS_ENABLED;
    expect(directExaEnabled()).toBe(true);
  });

  it("reads DIRECT_EXA_ENABLED first", () => {
    process.env.DIRECT_EXA_ENABLED = "false";
    process.env.FAST_BASICS_ENABLED = "true";
    expect(directExaEnabled()).toBe(false);
    process.env.DIRECT_EXA_ENABLED = "true";
    process.env.FAST_BASICS_ENABLED = "false";
    expect(directExaEnabled()).toBe(true);
  });

  it("falls back to the old FAST_BASICS_ENABLED name when the new one is unset or blank", () => {
    process.env.FAST_BASICS_ENABLED = "false";
    delete process.env.DIRECT_EXA_ENABLED;
    expect(directExaEnabled()).toBe(false);
    process.env.DIRECT_EXA_ENABLED = "";
    expect(directExaEnabled()).toBe(false);
  });
});
