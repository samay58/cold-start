import { buildSkeletonCard } from "@cold-start/pipeline";
import { describe, expect, it } from "vitest";
import { hasUsablePublicProfile } from "@cold-start/core";
import { prepareCardForStorage, preserveExistingBasics, underfilledBasicsErrorMessage } from "../src/inngest/functions";

describe("preserveExistingBasics", () => {
  it("keeps existing synthesis when a basics refresh rewrites public facts", () => {
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

    expect(preserveExistingBasics(existing, next).synthesis).toEqual(existing.synthesis);
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
