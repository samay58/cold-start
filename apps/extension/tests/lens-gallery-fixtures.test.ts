import { coldStartCardSchema, synthesisEvidenceSignals } from "@cold-start/core";
import { describe, expect, it } from "vitest";
import {
  LENS_GALLERY_PHASE_IDS,
  deepinfraRunningCard,
  dossierCard,
  failedCard,
  readFullCard,
  readSparseCard,
  runningEvents,
  withheldAdvisoryCard,
  withheldCard
} from "./e2e/lens-gallery-fixtures";

// Guards the exact fixture contract task 3.1 promised later Phase 2 tasks: schema drift in any
// card fixture (a bad edit, a stale copy of a schema field) fails loudly here instead of showing
// up as a silently-wrong screenshot in the gallery.
describe("lens gallery card fixtures", () => {
  it.each([
    ["read-full", readFullCard],
    ["read-sparse", readSparseCard],
    ["withheld", withheldCard],
    ["withheld-advisory", withheldAdvisoryCard],
    ["failed", failedCard],
    ["running-events companion card", deepinfraRunningCard],
    ["dossier", dossierCard]
  ] as const)("%s parses against coldStartCardSchema", (_name, loadCard) => {
    const result = coldStartCardSchema.safeParse(loadCard());
    if (!result.success) {
      throw new Error(`Schema validation failed: ${JSON.stringify(result.error.issues, null, 2)}`);
    }
  });

  it("covers every named gallery phase with a loader", () => {
    expect(LENS_GALLERY_PHASE_IDS).toEqual([
      "read-full",
      "read-sparse",
      "withheld",
      "withheld-advisory",
      "running-events",
      "failed",
      "dossier"
    ]);
  });

  it("read-sparse has 1 bull, 0 bear claims, and 1 open question", () => {
    const card = readSparseCard();
    expect(card.synthesis?.bullCase).toHaveLength(1);
    expect(card.synthesis?.bearCase).toHaveLength(0);
    expect(card.synthesis?.openQuestions).toHaveLength(1);
  });

  it("withheld carries only a citation-floor reason and no synthesis", () => {
    const card = withheldCard();
    expect(card.synthesis).toBeUndefined();
    expect(card.synthesisWithheld?.reasons).toEqual(["citation-floor"]);
    expect(card.synthesisWithheld?.citationCount).toBeLessThan(8);
  });

  // The composition itself is the fixture's job: a later task's posture line reads this same
  // signal (synthesisEvidenceSignals) to decide when to show a single-source-class advisory.
  // This card has synthesis (a successful run clears any withheld record) and every
  // non-enrichment citation is sourceType "news", so nonEnrichmentSourceTypes is exactly
  // ["news"] (length 1): the composition a gate would flag as single-source-class.
  it("withheld-advisory has synthesis, no withheld record, and a news-only evidence composition", () => {
    const card = withheldAdvisoryCard();
    expect(card.synthesis).toBeDefined();
    expect(card.synthesisWithheld).toBeUndefined();

    const signals = synthesisEvidenceSignals(card);
    expect(signals.nonEnrichmentSourceTypes).toEqual(["news"]);
    expect(signals.nonEnrichmentSourceTypes.length).toBeLessThan(2);
  });

  it("failed carries neither synthesis nor a withheld record", () => {
    const card = failedCard();
    expect(card.synthesis).toBeUndefined();
    expect(card.synthesisWithheld).toBeUndefined();
  });

  // Task 4.2's dossier content-hierarchy fixture: one rich person (a read long enough to
  // exercise the 3-line clamp, an observed email) and one inferred-email person, mirroring the
  // read-full baseten fixture's people shapes, plus 4 filler execs so the "+2 more" overflow
  // control also has something real to expand in the same gallery phase.
  it("dossier has a rich read-and-observed-email founder, an inferred-email founder, and a 2-person overflow", () => {
    const card = dossierCard();
    const founders = card.team.founders.value ?? [];
    const mara = founders.find((person) => person.name === "Mara Voss");
    const idris = founders.find((person) => person.name === "Idris Kanu");

    expect(mara?.read?.text.length ?? 0).toBeGreaterThan(200);
    expect(mara?.emailStatus).toBe("observed");
    expect(idris?.read).toBeNull();
    expect(idris?.emailStatus).toBe("inferred");
    expect(idris?.emailBasis).toBeTruthy();

    const totalPeople = founders.length + (card.team.keyExecs.value ?? []).length;
    expect(totalPeople).toBe(6);
  });
});

describe("running-events.json", () => {
  const REQUIRED_KEYS = ["id", "runId", "slug", "domain", "sectionId", "type", "message", "metadata", "createdAt"] as const;

  it("is a well-shaped, chronologically ordered ExtensionResearchRunEvent stream", () => {
    const events = runningEvents();
    expect(events.length).toBeGreaterThan(0);

    for (const event of events) {
      for (const key of REQUIRED_KEYS) {
        expect(event, `event ${event.id ?? "?"} is missing "${key}"`).toHaveProperty(key);
      }
      expect(typeof event.type).toBe("string");
      expect(event.type.length).toBeGreaterThan(0);
      expect(typeof event.metadata).toBe("object");
      expect(Number.isNaN(Date.parse(event.createdAt))).toBe(false);
    }

    const timestamps = events.map((event) => Date.parse(event.createdAt));
    const sorted = [...timestamps].sort((a, b) => a - b);
    expect(timestamps).toEqual(sorted);
  });

  it("carries the real deepinfra analysis run's 6 event types", () => {
    const types = runningEvents().map((event) => event.type);
    for (const realType of [
      "generation.queued",
      "generation.started",
      "plan.ready",
      "source.found",
      "card.saved",
      "generation.complete"
    ]) {
      expect(types).toContain(realType);
    }
  });

  it("carries the synthetic Phase 4 tail, inserted between source.found and card.saved", () => {
    const events = runningEvents();
    const types = events.map((event) => event.type);
    for (const phase4Type of ["synthesis.started", "verify.started", "verify.complete"]) {
      expect(types).toContain(phase4Type);
    }

    const sourceFoundAt = events.find((event) => event.type === "source.found")?.createdAt;
    const cardSavedAt = events.find((event) => event.type === "card.saved")?.createdAt;
    expect(sourceFoundAt).toBeDefined();
    expect(cardSavedAt).toBeDefined();

    for (const phase4Type of ["synthesis.started", "verify.started", "verify.complete"]) {
      const event = events.find((candidate) => candidate.type === phase4Type);
      expect(event).toBeDefined();
      const at = Date.parse(event!.createdAt);
      expect(at).toBeGreaterThan(Date.parse(sourceFoundAt!));
      expect(at).toBeLessThan(Date.parse(cardSavedAt!));
    }
  });

  // Task 5.5 corrected these three events to match the real production payload
  // (apps/web/src/inngest/functions.ts): synthesis.started's fixed "Reading the filed evidence"
  // copy, and metadata.claimCount on verify.started/verify.complete (the field
  // AnalysisWaitInstrument's verify stamp count binds to). The original Task 3.1 fixture had
  // different prose and no metadata on any of the three.
  it("matches the real synthesis/verify event payload shape from functions.ts", () => {
    const events = runningEvents();
    const started = events.find((event) => event.type === "synthesis.started");
    const verifyStarted = events.find((event) => event.type === "verify.started");
    const verifyComplete = events.find((event) => event.type === "verify.complete");

    expect(started?.message).toBe("Reading the filed evidence");
    expect(verifyStarted?.metadata.claimCount).toBe(6);
    expect(verifyComplete?.metadata.claimCount).toBe(5);
    expect(verifyComplete?.message).toBe("5 claims survived");
  });
});
