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
    existing.signals = Array.from({ length: 6 }, (_, index) => ({
      title: `Stored signal ${index + 1}`,
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
      title: "Newest incoming signal",
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

});
