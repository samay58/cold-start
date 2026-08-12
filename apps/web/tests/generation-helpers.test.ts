import { describe, expect, it } from "vitest";

import { isRefileProfileStore, mergeBaseCardForStore } from "../src/inngest/generation-helpers";

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

describe("mergeBaseCardForStore", () => {
  const existing = { slug: "acme" } as const;

  it("drops the run-start card as a merge base on a re-file store, so the fresh card stands alone", () => {
    expect(mergeBaseCardForStore(existing, { jobKind: "basics", forceRefresh: true })).toBeNull();
  });

  it("keeps merging against the run-start card for every non-re-file store", () => {
    expect(mergeBaseCardForStore(existing, { jobKind: "basics", forceRefresh: false })).toBe(existing);
    expect(mergeBaseCardForStore(existing, { jobKind: "analysis", forceRefresh: true })).toBe(existing);
    expect(mergeBaseCardForStore(existing, { jobKind: "section:customer_proof", forceRefresh: true })).toBe(existing);
  });

  it("passes a null run-start card through unchanged either way", () => {
    expect(mergeBaseCardForStore(null, { jobKind: "basics", forceRefresh: true })).toBeNull();
    expect(mergeBaseCardForStore(null, { jobKind: "basics", forceRefresh: false })).toBeNull();
  });
});
