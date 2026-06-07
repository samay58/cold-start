import { describe, expect, it } from "vitest";

import { latestOptimizerRunsQuery } from "../../../scripts/optimize-generation";

describe("generation optimizer query", () => {
  it("optimizes from profile generation runs instead of section jobs", () => {
    const query = latestOptimizerRunsQuery(["cartesia.ai", "linear.app"]);

    expect(query.text).toContain("job_kind = mode::text");
    expect(query.text).toContain("job_kind in ('basics', 'analysis')");
    expect(query.values).toEqual([["cartesia.ai", "linear.app"]]);
  });
});
