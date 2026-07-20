import { COLD_START_API_CONTRACT_VERSION, type ColdStartCard } from "@cold-start/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearCachedCards, readCachedCard, writeCachedCard } from "../src/shared/card-cache";
import type { Settings } from "../src/shared/extension-config";

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

function cardWithSynthesis(domain: string): ColdStartCard {
  const card = cardForDomain(domain);
  return {
    ...card,
    team: {
      ...card.team,
      founders: {
        value: [{
          name: "Founder One",
          role: "Co-founder",
          sourceUrl: `https://${domain}/team`,
          email: "founder@example.com"
        }],
        status: "verified",
        confidence: "high",
        citationIds: ["c1"]
      }
    },
    synthesis: {
      whyItMatters: { text: "Linear has a cited wedge [c1].", citationIds: ["c1"] },
      bullCase: [{ text: "The product has cited demand [c1].", citationIds: ["c1"] }],
      bearCase: [],
      openQuestions: [{ question: "Who owns budget?", category: "buyer_budget" }]
    }
  };
}

function installStorage(input: {
  local?: Record<string, unknown>;
  session?: Record<string, unknown>;
}) {
  const localItems = input.local ?? {};
  const sessionItems = input.session ?? {};

  function storageArea(items: Record<string, unknown>) {
    return {
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
    };
  }

  vi.stubGlobal("chrome", {
    storage: {
      local: storageArea(localItems),
      session: storageArea(sessionItems)
    }
  });

  return { localItems, sessionItems };
}

describe("card cache", () => {
  afterEach(() => {
    vi.useRealTimers();
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
    installStorage({ session: items });

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
    installStorage({ session: items });

    await writeCachedCard("linear.app", settings, cardForDomain("cartesia.ai"));

    expect(items[key]).toBeUndefined();
  });

  it("falls back to a durable local card when the session cache is empty", async () => {
    const key = cacheKey("linear.app");
    const { localItems } = installStorage({
      local: {
        [key]: {
          apiOrigin: settings.apiOrigin,
          card: cardForDomain("linear.app"),
          contractVersion: COLD_START_API_CONTRACT_VERSION,
          domain: "linear.app",
          storedAt: Date.now()
        }
      }
    });

    await expect(readCachedCard("linear.app", settings)).resolves.toMatchObject({
      card: { domain: "linear.app" }
    });
    expect(localItems[key]).toBeDefined();
  });

  it("strips synthesis from durable storage while keeping the session cache fast", async () => {
    const key = cacheKey("linear.app");
    const { localItems, sessionItems } = installStorage({});

    await writeCachedCard("linear.app", settings, cardWithSynthesis("linear.app"));

    expect((sessionItems[key] as { card?: ColdStartCard } | undefined)?.card?.synthesis).toBeDefined();
    expect((localItems[key] as { card?: ColdStartCard } | undefined)?.card?.synthesis).toBeUndefined();
    expect((localItems[key] as { card?: ColdStartCard } | undefined)?.card?.team.founders.value?.[0]).not.toHaveProperty("email");
  });

  it("removes stale durable cards instead of rendering them", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-07T12:00:00.000Z"));
    const key = cacheKey("linear.app");
    const { localItems } = installStorage({
      local: {
        [key]: {
          apiOrigin: settings.apiOrigin,
          card: cardForDomain("linear.app"),
          contractVersion: COLD_START_API_CONTRACT_VERSION,
          domain: "linear.app",
          storedAt: Date.parse("2026-06-06T11:00:00.000Z")
        }
      }
    });

    await expect(readCachedCard("linear.app", settings)).resolves.toBeNull();
    expect(localItems[key]).toBeUndefined();
  });

  it("removes impossible future durable cards instead of extending the ttl", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-07T12:00:00.000Z"));
    const key = cacheKey("linear.app");
    const { localItems } = installStorage({
      local: {
        [key]: {
          apiOrigin: settings.apiOrigin,
          card: cardForDomain("linear.app"),
          contractVersion: COLD_START_API_CONTRACT_VERSION,
          domain: "linear.app",
          storedAt: Date.parse("2026-06-07T12:06:00.000Z")
        }
      }
    });

    await expect(readCachedCard("linear.app", settings)).resolves.toBeNull();
    expect(localItems[key]).toBeUndefined();
  });

  it("clears cached cards from both session and durable storage", async () => {
    const key = cacheKey("linear.app");
    const { localItems, sessionItems } = installStorage({
      local: { [key]: { domain: "linear.app" } },
      session: { [key]: { domain: "linear.app" } }
    });

    await clearCachedCards();

    expect(localItems[key]).toBeUndefined();
    expect(sessionItems[key]).toBeUndefined();
  });
});
