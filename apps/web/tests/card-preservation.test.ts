import { buildSkeletonCard } from "@cold-start/pipeline";
import { describe, expect, it } from "vitest";
import { hasUsablePublicProfile } from "@cold-start/core";
import { prepareCardForStorage, preserveExistingBasics, underfilledBasicsErrorMessage } from "../src/inngest/card-storage";

describe("preserveExistingBasics", () => {
  it("drops existing synthesis when a basics refresh rewrites public facts", () => {
    const existing = {
      ...buildSkeletonCard("cognition.ai"),
      synthesis: {
        whyItMatters: { text: "Cited thesis [c1].", citationIds: ["c1"] },
        bullCase: [{ text: "Bull case [c1].", citationIds: ["c1"] }],
        bearCase: [{ text: "Bear case [c1].", citationIds: ["c1"] }],
        openQuestions: [{ question: "What must be checked next?", category: "buyer_budget" }],
      },
    };
    const next = buildSkeletonCard("cognition.ai");

    expect(preserveExistingBasics(existing, next).synthesis).toBeUndefined();
  });

  it("uses fresh synthesis when an analysis run produces one", () => {
    const existing = {
      ...buildSkeletonCard("cognition.ai"),
      synthesis: {
        whyItMatters: { text: "Old cited thesis [c1].", citationIds: ["c1"] },
        bullCase: [],
        bearCase: [],
        openQuestions: [{ question: "Old question?", category: "buyer_budget" }],
      },
    };
    const next = {
      ...buildSkeletonCard("cognition.ai"),
      synthesis: {
        whyItMatters: { text: "Fresh cited thesis [c2].", citationIds: ["c2"] },
        bullCase: [{ text: "Fresh bull case [c2].", citationIds: ["c2"] }],
        bearCase: [],
        openQuestions: [{ question: "Fresh question?", category: "buyer_budget" }],
      },
    };

    expect(preserveExistingBasics(existing, next).synthesis).toEqual(next.synthesis);
  });

  it("carries the stored expanded description across a basics refresh", () => {
    const expandedDescription = {
      paragraphs: [
        "Cognition sells an autonomous coding agent engineering teams run on real tickets.",
        "How it charges is not publicly disclosed.",
        "It competes with in-editor assistants by owning whole tasks rather than completions."
      ],
      citationIds: ["c1"]
    };
    const existing = { ...buildSkeletonCard("cognition.ai"), expandedDescription };
    const next = buildSkeletonCard("cognition.ai");

    expect(preserveExistingBasics(existing, next).expandedDescription).toEqual(expandedDescription);
  });

  it("preserves a filed read and enriched person fields for a stale background write", () => {
    const existing = buildSkeletonCard("cognition.ai");
    existing.identity.name = {
      value: "Cognition",
      status: "verified",
      confidence: "high",
      citationIds: ["c1"]
    };
    existing.team.headcount = {
      value: { value: 150, asOf: "2026-07-24" },
      status: "verified",
      confidence: "high",
      citationIds: ["c1"]
    };
    existing.synthesis = {
      whyItMatters: { text: "Current cited thesis [c1].", citationIds: ["c1"] },
      bullCase: [],
      bearCase: [],
      openQuestions: [{ question: "What must be checked next?", category: "buyer_budget" }]
    };
    existing.team.founders.value = [{
      name: "Scott Wu",
      role: "CEO",
      sourceUrl: "https://cognition.ai",
      email: "scott@cognition.ai",
      emailStatus: "observed",
      read: { text: "Technical founder with public operating evidence.", citationIds: ["c1"] }
    }];
    existing.team.founders.citationIds = ["c1"];
    existing.comparables = [{
      name: "Current comparable",
      domain: "current.example",
      oneLiner: "The current stored comparison.",
      citationIds: ["c1"]
    }];
    // Six distinct announcements, not six restatements of one: the merge clusters signals by
    // event, so a fixture of near-identical titles would collapse and stop testing the cap.
    const storedSignalTitles = [
      "Cognition ships an autonomous refactor mode",
      "Cognition hires a head of platform security",
      "Cognition opens a London engineering office",
      "Cognition publishes SWE-bench verified results",
      "Cognition partners with a payroll vendor on agents",
      "Cognition retires its early waitlist program"
    ];
    existing.signals = storedSignalTitles.map((title, index) => ({
      title,
      date: `2026-07-${String(23 - index).padStart(2, "0")}`,
      url: `https://current.example/signals/${index + 1}`,
      source: "Current source",
      type: "news" as const,
      citationIds: ["c1"]
    }));

    const stale = buildSkeletonCard("cognition.ai");
    stale.identity.name = {
      value: "Stale Cognition name",
      status: "inferred",
      confidence: "low",
      citationIds: ["c2"]
    };
    stale.team.headcount = {
      value: { value: 80, asOf: "2026-06-01" },
      status: "inferred",
      confidence: "low",
      citationIds: ["c2"]
    };
    stale.team.founders.value = [{
      name: "Scott Wu",
      role: "CEO",
      sourceUrl: "https://cognition.ai"
    }];
    stale.comparables = [{
      name: "Stale comparable",
      domain: "stale.example",
      oneLiner: "A stale background comparison.",
      citationIds: ["c2"]
    }];
    stale.signals = [{
      title: "Cognition names a new chief revenue officer",
      date: "2026-07-24",
      url: "https://incoming.example/newest",
      source: "Incoming source",
      type: "news",
      citationIds: ["c2"]
    }];

    const merged = prepareCardForStorage("analysis", existing, stale, {
      preferExisting: true
    });

    expect(merged.synthesis).toEqual(existing.synthesis);
    expect(merged.identity.name).toEqual(existing.identity.name);
    expect(merged.team.headcount).toEqual(existing.team.headcount);
    expect(merged.team.founders.value?.[0]).toMatchObject({
      email: "scott@cognition.ai",
      emailStatus: "observed",
      read: existing.team.founders.value?.[0]?.read
    });
    expect(merged.comparables.map((comparable) => comparable.domain)).toEqual([
      "current.example",
      "stale.example"
    ]);
    expect(merged.signals).toHaveLength(6);
    expect(merged.signals[0]?.url).toBe("https://incoming.example/newest");
    expect(merged.signals.some((signal) => signal.url.endsWith("/6"))).toBe(false);
  });

  it("collapses two outlets covering one announcement into a single corroborated signal", () => {
    const existing = buildSkeletonCard("cognition.ai");
    existing.signals = [{
      title: "Cognition raises $175M Series C",
      date: "2026-07-20",
      url: "https://firstoutlet.example/cognition-series-c",
      source: "First outlet",
      type: "funding",
      citationIds: ["c1"]
    }];

    const next = buildSkeletonCard("cognition.ai");
    next.signals = [{
      title: "Cognition raises $175M Series C round",
      date: "2026-07-20",
      url: "https://secondoutlet.example/cognition-raises",
      source: "Second outlet",
      type: "funding",
      citationIds: ["c2"]
    }];

    const merged = preserveExistingBasics(existing, next);

    expect(merged.signals).toHaveLength(1);
    expect(merged.signals[0]?.citationIds).toEqual(expect.arrayContaining(["c1", "c2"]));
  });

  it("rejects underfilled basics instead of storing a terminal partial card", () => {
    const generated = buildSkeletonCard("thinkwithmark.com");
    generated.identity.name = {
      value: "Think with Mark",
      status: "verified",
      confidence: "medium",
      citationIds: ["c1"],
    };
    generated.identity.websiteUrl = {
      value: "https://thinkwithmark.com",
      status: "verified",
      confidence: "medium",
      citationIds: ["c1"],
    };
    generated.identity.hq = {
      value: { city: "New York", country: "United States" },
      status: "verified",
      confidence: "medium",
      citationIds: ["c1"],
    };
    generated.identity.foundedYear = {
      value: 2024,
      status: "verified",
      confidence: "medium",
      citationIds: ["c1"],
    };
    generated.team.headcount = {
      value: { value: 4, asOf: "2026-05-15" },
      status: "verified",
      confidence: "medium",
      citationIds: ["c1"],
    };
    generated.citations = [
      {
        id: "c1",
        url: "https://thinkwithmark.com",
        title: "Think with Mark",
        fetchedAt: "2026-05-15T00:00:00.000Z",
        sourceType: "company_site",
      },
    ];

    expect(hasUsablePublicProfile(generated)).toBe(false);
    expect(underfilledBasicsErrorMessage(generated)).toBe(
      "generated basics underfilled public profile (4/4 structured facts, 3/2 visible facts, 1 citations; missing summary)"
    );
    expect(() => prepareCardForStorage("basics", null, generated)).toThrow(
      "generated basics underfilled public profile (4/4 structured facts, 3/2 visible facts, 1 citations; missing summary)"
    );
  });

  it("stores a usable basics profile as a hit", () => {
    const generated = buildSkeletonCard("linear.app");
    generated.identity.name = {
      value: "Linear",
      status: "verified",
      confidence: "high",
      citationIds: ["c1"],
    };
    generated.identity.websiteUrl = {
      value: "https://linear.app",
      status: "verified",
      confidence: "high",
      citationIds: ["c1"],
    };
    generated.identity.oneLiner = {
      value: "Linear builds issue tracking and product planning software for engineering teams.",
      status: "verified",
      confidence: "high",
      citationIds: ["c1"],
    };
    generated.identity.hq = {
      value: { city: "San Francisco", country: "United States" },
      status: "verified",
      confidence: "high",
      citationIds: ["c1"],
    };
    generated.identity.foundedYear = {
      value: 2019,
      status: "verified",
      confidence: "high",
      citationIds: ["c1"],
    };
    generated.funding.totalRaisedUsd = {
      value: 134200000,
      status: "verified",
      confidence: "high",
      citationIds: ["c1"],
    };
    generated.team.headcount = {
      value: { value: 131, asOf: "2026-05-15" },
      status: "verified",
      confidence: "medium",
      citationIds: ["c1"],
    };
    generated.comparables = [
      {
        name: "Jira",
        domain: "atlassian.com",
        oneLiner: "Issue tracking and project management software.",
        citationIds: ["c1"],
      },
    ];
    generated.citations = [
      {
        id: "c1",
        url: "https://linear.app",
        title: "Linear",
        fetchedAt: "2026-05-15T00:00:00.000Z",
        sourceType: "company_site",
      },
    ];

    expect(hasUsablePublicProfile(generated)).toBe(true);
    expect(prepareCardForStorage("basics", null, generated)).toMatchObject({
      cacheStatus: "hit",
      domain: "linear.app",
    });
  });

  // A re-file store (isRefileProfileStore) excludes the run-start card from the merge base by
  // passing null through mergeBaseCardForStore before calling prepareCardForStorage. This proves
  // the primitive that exclusion relies on: with a real existing card, prior-edition state
  // (description, comparables, signals, citations, person emails/reads) survives a merge as
  // usual; with existing=null, none of it does, and the fresh card stands alone.
  it("drops every prior-edition field when the merge base is excluded, matching re-file semantics", () => {
    const staleExisting = buildSkeletonCard("cognition.ai");
    staleExisting.expandedDescription = {
      paragraphs: ["Stale prior-edition description that a normal refresh would carry forward."],
      citationIds: ["c1"],
    };
    staleExisting.team.founders.value = [{
      name: "Scott Wu",
      role: "CEO",
      sourceUrl: "https://cognition.ai",
      email: "scott@cognition.ai",
      emailStatus: "observed",
      read: { text: "Stale prior-edition founder read.", citationIds: ["c1"] },
    }];
    staleExisting.team.founders.citationIds = ["c1"];
    staleExisting.comparables = [{
      name: "Stale comparable",
      domain: "stale.example",
      oneLiner: "A stale prior-edition comparison.",
      citationIds: ["c1"],
    }];
    staleExisting.signals = [{
      title: "Cognition ships a prior-edition feature",
      date: "2026-06-01",
      url: "https://stale.example/old-signal",
      source: "Stale source",
      type: "news",
      citationIds: ["c1"],
    }];
    staleExisting.citations = [{
      id: "c1",
      url: "https://stale.example",
      title: "Stale source",
      fetchedAt: "2026-06-01T00:00:00.000Z",
      sourceType: "news",
    }];

    const fresh = buildSkeletonCard("linear.app");
    fresh.identity.name = { value: "Linear", status: "verified", confidence: "high", citationIds: ["f1"] };
    fresh.identity.websiteUrl = { value: "https://linear.app", status: "verified", confidence: "high", citationIds: ["f1"] };
    fresh.identity.oneLiner = {
      value: "Linear builds issue tracking and product planning software for engineering teams.",
      status: "verified",
      confidence: "high",
      citationIds: ["f1"],
    };
    fresh.identity.hq = { value: { city: "San Francisco", country: "United States" }, status: "verified", confidence: "high", citationIds: ["f1"] };
    fresh.identity.foundedYear = { value: 2019, status: "verified", confidence: "high", citationIds: ["f1"] };
    fresh.team.headcount = { value: { value: 131, asOf: "2026-05-15" }, status: "verified", confidence: "medium", citationIds: ["f1"] };
    fresh.citations = [{
      id: "f1",
      url: "https://linear.app",
      title: "Linear",
      fetchedAt: "2026-08-10T00:00:00.000Z",
      sourceType: "company_site",
    }];

    // Contrast: a normal (non-re-file) basics store merges against the real existing card, so
    // stale prior-edition state survives.
    const merged = prepareCardForStorage("basics", staleExisting, fresh);
    expect(merged.expandedDescription).toEqual(staleExisting.expandedDescription);
    expect(merged.comparables).toEqual(staleExisting.comparables);
    expect(merged.team.founders.value?.[0]?.email).toBe("scott@cognition.ai");

    // A re-file passes null (mergeBaseCardForStore's excluded branch): none of it survives.
    const refiled = prepareCardForStorage("basics", null, fresh);
    expect(refiled.expandedDescription).toBeUndefined();
    expect(refiled.comparables).toEqual([]);
    expect(refiled.signals).toEqual([]);
    expect(refiled.citations).toEqual(fresh.citations);
    expect(refiled.team.founders.value ?? []).toHaveLength(0);
    expect(refiled.identity.name).toEqual(fresh.identity.name);
  });

});
