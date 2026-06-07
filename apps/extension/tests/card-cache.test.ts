import { COLD_START_API_CONTRACT_VERSION, type ColdStartCard } from "@cold-start/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readCachedCard, writeCachedCard } from "../src/card-cache";
import type { Settings } from "../src/extension-config";

const settings: Settings = {
  apiOrigin: "http://localhost:3000",
  apiToken: "token-123"
};

function cacheKey(domain: string) {
  return `coldStartCard:${encodeURIComponent(settings.apiOrigin)}:${encodeURIComponent(domain)}`;
}

function cardForDomain(domain: string): ColdStartCard {
  const name = domain.split(".")[0] ?? domain;
  return {
    slug: name,
    domain,
    generatedAt: "2026-05-18T12:00:00.000Z",
    generationCostUsd: 0,
    cacheStatus: "hit",
    identity: {
      name: { value: name, status: "verified", confidence: "high", citationIds: ["c1"] },
      websiteUrl: { value: `https://${domain}/`, status: "verified", confidence: "high", citationIds: ["c1"] },
      logoUrl: null,
      oneLiner: { value: `${name} builds software for engineering teams.`, status: "verified", confidence: "high", citationIds: ["c1"] },
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
      headcount: { value: { value: 131, asOf: "2026-05-18" }, status: "inferred", confidence: "medium", citationIds: ["c1"] }
    },
    signals: [],
    comparables: [{ name: "Jira", domain: "atlassian.com", oneLiner: "Issue tracking and project management software." }],
    citations: [
      {
        id: "c1",
        url: `https://${domain}/`,
        title: name,
        fetchedAt: "2026-05-18T12:00:00.000Z",
        sourceType: "company_site"
      }
    ]
  };
}

function installSessionStorage(items: Record<string, unknown>) {
  vi.stubGlobal("chrome", {
    storage: {
      session: {
        get: (keys: string | string[] | null, callback: (stored: Record<string, unknown>) => void) => {
          if (keys === null) {
            callback({ ...items });
            return;
          }

          const keyList = Array.isArray(keys) ? keys : [keys];
          callback(Object.fromEntries(keyList.map((key) => [key, items[key]])));
        },
        set: (nextItems: Record<string, unknown>, callback?: () => void) => {
          Object.assign(items, nextItems);
          callback?.();
        },
        remove: (keys: string | string[], callback?: () => void) => {
          for (const key of Array.isArray(keys) ? keys : [keys]) {
            delete items[key];
          }
          callback?.();
        }
      }
    }
  });
}

describe("card cache", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not read a cached card stored under a different domain", async () => {
    const items: Record<string, unknown> = {
      [cacheKey("linear.app")]: {
        apiOrigin: settings.apiOrigin,
        card: cardForDomain("cartesia.ai"),
        contractVersion: COLD_START_API_CONTRACT_VERSION,
        domain: "linear.app",
        storedAt: Date.now()
      }
    };
    installSessionStorage(items);

    await expect(readCachedCard("linear.app", settings)).resolves.toBeNull();
    expect(items[cacheKey("linear.app")]).toBeUndefined();
  });

  it("removes the target cache entry instead of writing a mismatched card", async () => {
    const key = cacheKey("linear.app");
    const items: Record<string, unknown> = {
      [key]: {
        apiOrigin: settings.apiOrigin,
        card: cardForDomain("linear.app"),
        contractVersion: COLD_START_API_CONTRACT_VERSION,
        domain: "linear.app",
        storedAt: Date.now()
      }
    };
    installSessionStorage(items);

    await writeCachedCard("linear.app", settings, cardForDomain("cartesia.ai"));

    expect(items[key]).toBeUndefined();
  });
});
