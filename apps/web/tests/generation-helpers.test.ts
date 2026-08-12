import { describe, expect, it } from "vitest";

import { isRefileProfileStore } from "../src/inngest/generation-helpers";

describe("isRefileProfileStore", () => {
  it("is true only for an explicit re-file of the basics profile job", () => {
    expect(isRefileProfileStore({ jobKind: "basics", forceRefresh: true })).toBe(true);
    expect(isRefileProfileStore({ jobKind: "basics", forceRefresh: false })).toBe(false);
    // A lens retry uses forceRefresh on analysis; it must NOT cut an edition (spec: analysis
    // deepens the same filing).
    expect(isRefileProfileStore({ jobKind: "analysis", forceRefresh: true })).toBe(false);
    expect(isRefileProfileStore({ jobKind: "section:customer_proof", forceRefresh: true })).toBe(false);
  });
});
