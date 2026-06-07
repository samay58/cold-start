import { COLD_START_API_CONTRACT_HEADER, COLD_START_API_CONTRACT_VERSION, type ColdStartCard, type ResearchSection } from "@cold-start/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { startSectionGenerationAndPoll } from "../src/sidepanel-network";
import type { Settings } from "../src/extension-config";

const settings: Settings = {
  apiOrigin: "http://localhost:3000",
  apiToken: "token-123"
};

function jsonResponse(body: unknown, init?: ResponseInit) {
  const response = new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    ...init
  });
  response.headers.set(COLD_START_API_CONTRACT_HEADER, COLD_START_API_CONTRACT_VERSION);
  return response;
}

function cardForDomain(domain: string): ColdStartCard {
  return {
    slug: domain.split(".")[0] ?? domain,
    domain,
    generatedAt: "2026-06-07T12:00:00.000Z",
    generationCostUsd: 0,
    cacheStatus: "hit",
    identity: {
      name: { value: "Linear", status: "verified", confidence: "high", citationIds: ["c1"] },
      websiteUrl: { value: `https://${domain}/`, status: "verified", confidence: "high", citationIds: ["c1"] },
      logoUrl: null,
      oneLiner: { value: "Linear builds issue tracking software.", status: "verified", confidence: "high", citationIds: ["c1"] },
      hq: { value: { city: "San Francisco", country: "United States" }, status: "verified", confidence: "medium", citationIds: ["c1"] },
      foundedYear: { value: 2019, status: "verified", confidence: "medium", citationIds: ["c1"] },
      status: "private"
    },
    funding: {
      totalRaisedUsd: { value: null, status: "unknown", confidence: "low", citationIds: [] },
      lastRound: { value: null, status: "unknown", confidence: "low", citationIds: [] },
      investors: { value: null, status: "unknown", confidence: "low", citationIds: [] }
    },
    team: {
      founders: { value: [], status: "unknown", confidence: "low", citationIds: [] },
      keyExecs: { value: [], status: "unknown", confidence: "low", citationIds: [] },
      headcount: { value: { value: 131, asOf: "2026-06-07" }, status: "inferred", confidence: "medium", citationIds: ["c1"] }
    },
    signals: [],
    comparables: [{ name: "Jira", domain: "atlassian.com", oneLiner: "Issue tracking and project management software." }],
    citations: [
      {
        id: "c1",
        url: `https://${domain}/`,
        title: "Linear",
        fetchedAt: "2026-06-07T12:00:00.000Z",
        sourceType: "company_site"
      }
    ]
  };
}

function storedCustomerProofSection(domain: string): ResearchSection {
  return {
    slug: domain.split(".")[0] ?? domain,
    domain,
    sectionId: "customer_proof",
    visibility: "public",
    status: "available",
    content: {
      status: "available",
      summary: "Stored customer proof survives a section poll.",
      items: [{
        label: "Customer proof",
        text: "Linear has stored customer proof from a prior run [c1].",
        citationIds: ["c1"]
      }],
      questions: [],
      confidence: "medium"
    },
    citationIds: ["c1"],
    sourceIds: ["c1"],
    runId: "run-customer-proof",
    error: null,
    generatedAt: "2026-06-07T12:00:00.000Z",
    staleAt: null
  };
}

describe("section generation polling", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("preserves known section rows when bootstrap omits sections during polling", async () => {
    vi.stubGlobal("chrome", { runtime: { id: "extension-test-id" } });
    const domain = "linear.app";
    const card = cardForDomain(domain);
    const knownSection = storedCustomerProofSection(domain);
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith("/api/generate") && init?.method === "POST") {
        return jsonResponse({ slug: "linear", status: "queued", mode: "analysis" });
      }

      if (String(url).includes("/api/extension/bootstrap")) {
        return jsonResponse({
          domain,
          slug: "linear",
          card,
          runs: {
            basics: { slug: "linear", domain, mode: "basics", status: "idle" },
            analysis: { slug: "linear", domain, mode: "analysis", status: "idle" }
          }
        });
      }

      if (String(url).includes("/api/generate?")) {
        return jsonResponse({
          slug: "linear",
          domain,
          status: "failed",
          mode: "analysis",
          error: "Market section failed."
        });
      }

      throw new Error(`unexpected request: ${String(url)}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await startSectionGenerationAndPoll(
      domain,
      settings,
      new AbortController().signal,
      "market",
      card,
      [knownSection],
      vi.fn()
    );

    expect(result.sections.find((section) => section.sectionId === "customer_proof")).toMatchObject({
      status: "available",
      content: { summary: "Stored customer proof survives a section poll." }
    });
    expect(result.sections.find((section) => section.sectionId === "market")).toMatchObject({
      status: "failed",
      error: "Market section failed."
    });
  });
});
