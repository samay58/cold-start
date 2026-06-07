import { describe, expect, it } from "vitest";

import { latestProfileRunsQuery } from "../../../scripts/evo-generation-benchmark";

describe("evo generation benchmark query", () => {
  it("scores profile generation runs instead of section jobs", () => {
    const query = latestProfileRunsQuery(["modal.com", "saronic.com"]);

    expect(query.text).toContain("job_kind = mode::text");
    expect(query.text).toContain("job_kind in ('basics', 'analysis')");
    expect(query.values).toEqual([["modal.com", "saronic.com"]]);
  });
});
