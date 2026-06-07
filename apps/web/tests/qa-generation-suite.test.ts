import { describe, expect, it } from "vitest";

import { latestQaRunsQuery } from "../../../scripts/qa-generation-suite";

describe("QA generation suite query", () => {
  it("scores profile generation runs instead of section jobs", () => {
    const query = latestQaRunsQuery(["cartesia.ai", "linear.app"], { jobKind: true, traceJson: true });

    expect(query.text).toContain("job_kind = mode::text");
    expect(query.text).toContain("job_kind in ('basics', 'analysis')");
    expect(query.text).toContain("trace_json");
    expect(query.values).toEqual([["cartesia.ai", "linear.app"]]);
  });

  it("keeps legacy generation run schema compatibility", () => {
    const query = latestQaRunsQuery(["cartesia.ai"], { jobKind: false, traceJson: false });

    expect(query.text).toContain("mode as job_kind");
    expect(query.text).toContain("null::jsonb as trace_json");
    expect(query.text).not.toContain("job_kind = mode::text");
    expect(query.text).not.toContain("job_kind in ('basics', 'analysis')");
  });
});
