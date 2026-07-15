import { createRequire } from "node:module";
import type { ColdStartCard } from "@cold-start/core";
import type { Page, Route } from "@playwright/test";
// Real production card pulled read-only on 2026-06-12: 10 raw signals where 8 cover the same
// March 2026 $125M raise. The regression fixture for signal corroboration clustering.
export function granolaCard(): ColdStartCard {
  return structuredClone(require("./fixtures/granola-card.json")) as ColdStartCard;
}

export const QA_API_ORIGIN = "https://cold-start-samay58s-projects.vercel.app";
export const QA_TOKEN = "qa-extension-token";
const require = createRequire(import.meta.url);
const contract = require("@cold-start/core/api-contract.json") as { apiHeader: string; version: string };
const COLD_START_API_CONTRACT_HEADER = contract.apiHeader;
const COLD_START_API_CONTRACT_VERSION = contract.version;

type ChromeStorageArea = "local" | "session";

type ChromeStorageSeed = {
  activeDomain?: string;
  apiOrigin?: string;
  apiToken?: string;
};

export function browserbaseCard(overrides: Partial<ColdStartCard> = {}): ColdStartCard {
  return {
    slug: "browserbase",
    domain: "browserbase.com",
    generatedAt: "2026-05-12T12:00:00.000Z",
    generationCostUsd: 0,
    cacheStatus: "hit",
    identity: {
      name: { value: "Browserbase", status: "verified", confidence: "high", citationIds: ["c1"] },
      logoUrl: null,
      oneLiner: {
        value: "Browser infrastructure for AI agents.",
        status: "verified",
        confidence: "high",
        citationIds: ["c1"]
      },
      description: {
        value: {
          shortDescription: "Browser infrastructure for AI agents.",
          concept: "A hosted browser runtime that lets AI agents navigate, observe, and act on the web.",
          serves: "AI application developers and automation teams building browser-native workflows.",
          mechanism: "It packages managed browser sessions, proxies, observability, and automation APIs behind one developer platform."
        },
        status: "verified",
        confidence: "medium",
        citationIds: ["c1", "c2", "c3"]
      },
      hq: { value: { city: "San Francisco", country: "CA" }, status: "verified", confidence: "medium", citationIds: ["c2"] },
      foundedYear: { value: 2024, status: "verified", confidence: "medium", citationIds: ["c2"] },
      status: "private"
    },
    funding: {
      totalRaisedUsd: { value: 40000000, status: "verified", confidence: "medium", citationIds: ["c2"] },
      lastRound: {
        value: { name: "Series A", amountUsd: 40000000, announcedAt: "2025-04-01", leadInvestors: ["Notable"] },
        status: "verified",
        confidence: "medium",
        citationIds: ["c2"]
      },
      investors: { value: [{ name: "Notable", domain: null }], status: "verified", confidence: "medium", citationIds: ["c2"] }
    },
    team: {
      founders: { value: [], status: "unknown", confidence: "low", citationIds: [] },
      keyExecs: { value: [], status: "unknown", confidence: "low", citationIds: [] },
      headcount: { value: null, status: "unknown", confidence: "low", citationIds: [] }
    },
    signals: [
      {
        title: "Browserbase launches managed browser sessions",
        url: "https://browserbase.com/blog/launch",
        date: "2026-05-01",
        source: "Browserbase",
        category: "launch",
        citationIds: ["c1"]
      }
    ],
    comparables: [{ name: "Anchor Browser", domain: "anchorbrowser.io", oneLiner: "Browser automation platform" }],
    citations: [
      {
        id: "c1",
        url: "https://browserbase.com/",
        title: "Browserbase",
        fetchedAt: "2026-05-12T12:00:00.000Z",
        sourceType: "company_site"
      },
      {
        id: "c2",
        url: "https://techcrunch.com/browserbase-series-a",
        title: "Browserbase raises Series A",
        fetchedAt: "2026-05-12T12:00:00.000Z",
        sourceType: "news"
      },
      {
        id: "c3",
        url: "https://github.com/browserbase",
        title: "Browserbase GitHub",
        fetchedAt: "2026-05-12T12:00:00.000Z",
        sourceType: "github"
      }
    ],
    ...overrides
  };
}

export function browserbaseCardWithSynthesis(): ColdStartCard {
  return browserbaseCard({
    synthesis: {
      whyItMatters: {
        text: "Browserbase turns browser automation into agent infrastructure [c1].",
        citationIds: ["c1", "c2"]
      },
      bullCase: [{ text: "Developers need reliable browser sessions for AI workflows [c3].", citationIds: ["c3"] }],
      bearCase: [],
      openQuestions: [{ question: "Can Browserbase defend against cloud providers bundling browser runtimes?", category: "durability" }]
    }
  });
}

export function researchPanelPolishCard({ multiRound = false }: { multiRound?: boolean } = {}): ColdStartCard {
  const base = browserbaseCard();
  const rounds = multiRound
    ? [
        { name: "Series A", amountUsd: 40_000_000, announcedAt: "2025-04-01", leadInvestors: ["CRV"] },
        { name: "Seed", amountUsd: 6_250_000, announcedAt: "2021-02-18", leadInvestors: ["Susa Ventures"] }
      ]
    : [{ name: "Seed", amountUsd: 6_250_000, announcedAt: "2021-02-18", leadInvestors: ["CRV"] }];
  const totalRaisedUsd = multiRound ? 46_250_000 : 6_250_000;

  return browserbaseCard({
    identity: {
      ...base.identity,
      description: base.identity.description
        ? { ...base.identity.description, citationIds: ["c1", "c2", "c3", "c4"] }
        : undefined
    },
    funding: {
      totalRaisedUsd: { value: totalRaisedUsd, status: "verified", confidence: "high", citationIds: ["c1", "c2"] },
      lastRound: { value: rounds[0] ?? null, status: "verified", confidence: "high", citationIds: ["c2"] },
      rounds: { value: rounds, status: "verified", confidence: "high", citationIds: ["c1", "c2"] },
      investors: {
        value: ["CRV", "Greenoaks Capital", "Susa Ventures", "BoxGroup"].map((name) => ({ name, domain: null })),
        status: "verified",
        confidence: "high",
        citationIds: ["c1", "c2"]
      }
    },
    synthesis: {
      whyItMatters: {
        text: "Browserbase turns browser automation into agent infrastructure [c1].",
        citationIds: ["c1", "c2"]
      },
      bullCase: [],
      bearCase: [],
      openQuestions: [{ question: "Can Browserbase defend against cloud providers bundling browser runtimes?", category: "durability" }]
    },
    citations: [
      ...base.citations,
      {
        id: "c4",
        url: "https://venturebeat.com/ai/browserbase-agent-browsers",
        title: "Browserbase expands its agent browser platform",
        fetchedAt: "2026-05-12T12:00:00.000Z",
        sourceType: "news"
      }
    ]
  });
}

// Card with a populated management team so the People rows render. A mix of
// people with and without email exercises both border variants (default amber
// and the has-email seal tint), which is where dark borders were hardest to see.
export function browserbaseCardWithPeople(): ColdStartCard {
  return browserbaseCard({
    team: {
      founders: {
        value: [
          { name: "Paul Klein", role: "Co-founder & CEO", sourceUrl: "https://browserbase.com/team", email: "paul@browserbase.com" },
          { name: "Nat Miletic", role: "Co-founder & CTO", sourceUrl: "https://browserbase.com/team", email: "nat@browserbase.com" }
        ],
        status: "verified",
        confidence: "high",
        citationIds: ["c1"]
      },
      keyExecs: {
        value: [
          { name: "Danielle Cordova", role: "Head of Engineering", sourceUrl: "https://browserbase.com/team", email: null },
          { name: "Marcus Webb", role: "Head of Go-to-Market", sourceUrl: "https://browserbase.com/team", email: null }
        ],
        status: "verified",
        confidence: "medium",
        citationIds: ["c1"]
      },
      headcount: { value: { value: 24, asOf: "2026-05-01" }, status: "verified", confidence: "medium", citationIds: ["c2"] }
    },
    synthesis: {
      whyItMatters: {
        text: "Browserbase turns browser automation into agent infrastructure [c1].",
        citationIds: ["c1", "c2"]
      },
      bullCase: [{ text: "Developers need reliable browser sessions for AI workflows [c3].", citationIds: ["c3"] }],
      bearCase: [],
      openQuestions: [{ question: "Can Browserbase defend against cloud providers bundling browser runtimes?", category: "durability" }]
    }
  });
}

export async function installChromeShim(page: Page, seed: ChromeStorageSeed = {}) {
  await page.addInitScript((input) => {
    type Listener = (changes: Record<string, { oldValue?: unknown; newValue?: unknown }>, areaName: string) => void;

    const stores: Record<ChromeStorageArea, Record<string, unknown>> = {
      local: {
        coldStartApiOrigin: input.apiOrigin,
        coldStartApiToken: input.apiToken
      },
      session: {
        activeDomain: input.activeDomain
      }
    };
    const listeners = new Set<Listener>();

    function pick(area: ChromeStorageArea, keys: string | readonly string[] | Record<string, unknown> | null | undefined) {
      const store = stores[area];
      if (Array.isArray(keys)) {
        return Object.fromEntries(keys.map((key) => [key, store[key]]));
      }
      if (typeof keys === "string") {
        return { [keys]: store[keys] };
      }
      if (keys && typeof keys === "object" && !Array.isArray(keys)) {
        const fallback = keys as Record<string, unknown>;
        return Object.fromEntries(Object.keys(fallback).map((key) => [key, store[key] ?? fallback[key]]));
      }
      return { ...store };
    }

    function storageArea(area: ChromeStorageArea) {
      return {
        get(keys: string | readonly string[] | Record<string, unknown> | null, callback: (items: Record<string, unknown>) => void) {
          callback(pick(area, keys));
        },
        set(items: Record<string, unknown>, callback?: () => void) {
          const changes: Record<string, { oldValue?: unknown; newValue?: unknown }> = {};
          for (const [key, value] of Object.entries(items)) {
            changes[key] = { oldValue: stores[area][key], newValue: value };
            stores[area][key] = value;
          }
          for (const listener of listeners) {
            listener(changes, area);
          }
          callback?.();
        }
      };
    }

    Object.assign(window, {
      chrome: {
        runtime: { id: "extension-test-id" },
        storage: {
          local: storageArea("local"),
          session: storageArea("session"),
          onChanged: {
            addListener(listener: Listener) {
              listeners.add(listener);
            },
            removeListener(listener: Listener) {
              listeners.delete(listener);
            }
          }
        }
      },
      __coldStartSetActiveDomain(nextDomain: string) {
        const oldValue = stores.session.activeDomain;
        stores.session.activeDomain = nextDomain;
        for (const listener of listeners) {
          listener({ activeDomain: { oldValue, newValue: nextDomain } }, "session");
        }
      }
    });
  }, {
    activeDomain: seed.activeDomain ?? "browserbase.com",
    apiOrigin: seed.apiOrigin ?? QA_API_ORIGIN,
    apiToken: seed.apiToken ?? QA_TOKEN
  });
}

export async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    headers: {
      "Access-Control-Allow-Headers": "authorization, content-type, x-cold-start-client-contract, x-cold-start-extension-id",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Expose-Headers": COLD_START_API_CONTRACT_HEADER,
      [COLD_START_API_CONTRACT_HEADER]: COLD_START_API_CONTRACT_VERSION
    },
    body: JSON.stringify(body)
  });
}

export async function mockExtensionApi(page: Page, card: ColdStartCard | null) {
  await page.route("**/api/extension/bootstrap?**", async (route) => {
    const url = new URL(route.request().url());
    const domain = url.searchParams.get("domain") ?? card?.domain ?? "browserbase.com";
    const slug = domain.split(".")[0] ?? card?.slug ?? "browserbase";
    await fulfillJson(route, {
      domain,
      slug,
      card,
      runs: {
        basics: { slug, domain, mode: "basics", status: "idle" },
        analysis: { slug, domain, mode: "analysis", status: "idle" }
      }
    });
  });

  await page.route("**/api/extension/cards/**", async (route) => {
    if (!card) {
      await fulfillJson(route, { error: "card not found" }, 404);
      return;
    }

    await fulfillJson(route, card);
  });

  await page.route("**/api/generate?**", async (route) => {
    const url = new URL(route.request().url());
    await fulfillJson(route, {
      slug: url.searchParams.get("domain")?.split(".")[0] ?? "browserbase",
      domain: url.searchParams.get("domain") ?? "browserbase.com",
      status: "idle",
      mode: url.searchParams.get("mode") ?? "basics"
    });
  });

  await page.route("**/api/generate", async (route) => {
    const body = route.request().postDataJSON() as { domain?: string; mode?: "basics" | "analysis" } | null;
    await fulfillJson(route, {
      slug: body?.domain?.split(".")[0] ?? "browserbase",
      status: "queued",
      mode: body?.mode ?? "basics"
    }, 202);
  });
}
