import { describe, expect, it } from "vitest";

import { howItWinsJobStatusEnvelopeSchema, howItWinsJobSummarySchema } from "../src/how-it-wins-job";

const summary = {
  id: "c47e69eb-7ec4-4fc9-94f3-53107e89fcaa",
  status: "failed",
  stage: "complete",
  reasonCode: "structured_output",
  canRetry: true,
  updatedAt: "2026-09-14T22:00:00.000Z"
} as const;

describe("How it wins job status contract", () => {
  it("accepts the additive safe response envelope", () => {
    expect(howItWinsJobStatusEnvelopeSchema.parse({ job: summary })).toEqual({ job: summary });
    expect(howItWinsJobStatusEnvelopeSchema.parse({ job: null })).toEqual({ job: null });
  });

  it("rejects private job data from the public-safe summary", () => {
    expect(howItWinsJobSummarySchema.safeParse({
      ...summary,
      evidenceHash: "private",
      attempts: [],
      recoveryPayload: { candidate: "private" }
    }).success).toBe(false);
  });
});
