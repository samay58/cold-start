import { describe, expect, it } from "vitest";
import { eventLineFor } from "../src/components/landing/RecordedBuild";
import { recordedBuild } from "../src/components/landing/recorded-build-data";

// Fix round: the naive `events[Math.min(stage, events.length - 1)]` mapping read "Filed" three
// stages before the FILED stamp itself appeared, because the frozen recordedBuild export carries
// only 4 events across 7 stages (0..6). eventLineFor is the pure function extracted to pin the
// corrected mapping across its full domain, the way AccessForm.tsx's accessFormFailureMessage is
// tested in access-form.test.ts: stages 0 and 1 walk the array normally, stages 2 through 5 all
// hold on the second-to-last entry ("Cut 35 facts..."), and only stage 6 reveals "Filed" -
// synchronized with the FILED stamp, which also only appears at stage 6.
describe("eventLineFor", () => {
  it("walks the array normally for the leading stages", () => {
    expect(eventLineFor(recordedBuild, 0)).toBe("Reading mintlify.com");
    expect(eventLineFor(recordedBuild, 1)).toBe("Opened 55 documents, kept 49");
  });

  it("holds on the second-to-last event for every stage before the stamp lands", () => {
    expect(eventLineFor(recordedBuild, 2)).toBe("Cut 35 facts, each pinned to a document");
    expect(eventLineFor(recordedBuild, 3)).toBe("Cut 35 facts, each pinned to a document");
    expect(eventLineFor(recordedBuild, 4)).toBe("Cut 35 facts, each pinned to a document");
    expect(eventLineFor(recordedBuild, 5)).toBe("Cut 35 facts, each pinned to a document");
  });

  it("reveals \"Filed\" only at stage 6, synchronized with the FILED stamp", () => {
    expect(eventLineFor(recordedBuild, 6)).toBe("Filed");
  });

  it("never reads past the array's bounds for an out-of-range stage", () => {
    expect(eventLineFor(recordedBuild, 99)).toBe("Filed");
    expect(eventLineFor({ ...recordedBuild, events: [] }, 0)).toBe("");
  });
});
