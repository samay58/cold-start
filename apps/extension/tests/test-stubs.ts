import { COLD_START_API_CONTRACT_HEADER, COLD_START_API_CONTRACT_VERSION, type ColdStartCard } from "@cold-start/core";

// Environment-agnostic test helpers: no React/DOM import, so files that run without the jsdom
// pragma (background.test.ts, card-cache.test.ts) can use these without pulling react-dom/client
// into a non-DOM test run. jsdom-based suites get the same builders re-exported from
// sidepanel-harness.tsx, which is the canonical import for anything React-rendering.

export function jsonResponse(body: unknown, init?: ResponseInit) {
  const response = new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    ...init
  });
  response.headers.set(COLD_START_API_CONTRACT_HEADER, COLD_START_API_CONTRACT_VERSION);
  return response;
}

function companyNameFromDomain(domain: string) {
  const root = domain.replace(/^www\./i, "").split(".")[0] ?? domain;
  return root
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ") || domain;
}

export function cardForDomain(domain: string): ColdStartCard {
  return {
    slug: domain.split(".")[0] ?? domain,
    domain,
    generatedAt: "2026-05-07T12:00:00.000Z",
    generationCostUsd: 0,
    cacheStatus: "hit",
    identity: {
      name: { value: companyNameFromDomain(domain), status: "verified", confidence: "high", citationIds: ["c1"] },
      websiteUrl: { value: `https://${domain}/`, status: "verified", confidence: "high", citationIds: ["c1"] },
      logoUrl: null,
      oneLiner: { value: "Cached company card", status: "verified", confidence: "high", citationIds: ["c1"] },
      hq: { value: { city: "San Francisco", country: "United States" }, status: "verified", confidence: "medium", citationIds: ["c1"] },
      foundedYear: { value: 2023, status: "verified", confidence: "medium", citationIds: ["c1"] },
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
      headcount: { value: { value: 64, asOf: "2026-05-14" }, status: "inferred", confidence: "low", citationIds: ["c1"] }
    },
    signals: [],
    comparables: [{ name: "Example Peer", domain: "peer.example", oneLiner: "Adjacent company." }],
    citations: [
      {
        id: "c1",
        url: `https://${domain}/`,
        title: domain,
        fetchedAt: "2026-05-07T12:00:00.000Z",
        sourceType: "company_site",
        snippet: "Cached company card"
      },
      {
        id: "c2",
        url: `https://news.example/${domain}/launch`,
        title: `${domain} launch coverage`,
        fetchedAt: "2026-05-07T12:00:00.000Z",
        sourceType: "news",
        snippet: "Independent coverage of the company."
      },
      {
        id: "c3",
        url: `https://registry.example/${domain}`,
        title: `${domain} registry profile`,
        fetchedAt: "2026-05-07T12:00:00.000Z",
        sourceType: "other",
        snippet: "Registry profile for the company."
      }
    ]
  };
}

export async function flushMicrotasks() {
  for (let index = 0; index < 10; index += 1) {
    await Promise.resolve();
  }
}
