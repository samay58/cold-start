import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildDirectExaContactRequests,
  buildDirectExaFirstReadRequests,
  buildDirectExaFundamentalsRequests,
  DIRECT_EXA_SEARCH_COST_USD,
  fetchDirectExaContactSources,
  fetchDirectExaFirstReadSources,
  fetchDirectExaFundamentalsSources,
  missingDirectExaConfig,
  normalizeNamedPeopleEmailHints,
} from "../src/index";

describe("missingDirectExaConfig", () => {
  it("requires only DIRECT_EXA_API_KEY for the direct Exa basics lane", () => {
    expect(missingDirectExaConfig({})).toEqual(["DIRECT_EXA_API_KEY"]);
    expect(missingDirectExaConfig({ DIRECT_EXA_API_KEY: "exa-key" })).toEqual([]);
  });
});

describe("buildDirectExaFundamentalsRequests", () => {
  it("builds fast company, people, funding, and news searches for basics generation", () => {
    const requests = buildDirectExaFundamentalsRequests({ DIRECT_EXA_API_KEY: "exa-key" }, "cartesia.ai");

    expect(requests.map((request) => request.name)).toEqual([
      "exa_direct_company",
      "exa_direct_people",
      "exa_direct_funding",
      "exa_direct_news",
    ]);
    expect(requests.every((request) => request.url === "https://api.exa.ai/search")).toBe(true);
    expect(requests.every((request) => request.headers.Authorization === "Bearer exa-key")).toBe(true);
    expect(requests[0]?.body).toMatchObject({
      type: "instant",
      category: "company",
      query: expect.stringContaining("cartesia.ai"),
      numResults: 5,
    });
    expect(requests[1]?.body).toMatchObject({
      type: "instant",
      category: "people",
      query: expect.stringContaining("founders CEO management team"),
      numResults: 6,
    });
    expect(requests[2]?.body).toMatchObject({
      type: "fast",
      category: "news",
      query: expect.stringContaining("funding rounds investors total raised"),
      numResults: 8,
    });
    expect(requests[3]?.body).toMatchObject({
      type: "fast",
      category: "news",
      query: expect.stringContaining("recent launch hiring customers"),
      numResults: 6,
    });
  });
});

describe("buildDirectExaFirstReadRequests", () => {
  it("builds a bounded, highlights-only instant+fast pair for the first-read lane", () => {
    const requests = buildDirectExaFirstReadRequests({ DIRECT_EXA_API_KEY: "exa-key" }, "cartesia.ai");

    expect(requests.map((request) => request.name)).toEqual(["exa_direct_company", "exa_direct_news"]);
    expect(requests[0]?.body).toMatchObject({ type: "instant", category: "company", numResults: 3 });
    expect(requests[1]?.body).toMatchObject({ type: "fast", category: "news", numResults: 3 });
    // First read uses highlights, not full text, to stay cheap and fast.
    expect(requests.every((request) => (request.body.contents as { text?: boolean }).text === undefined)).toBe(true);
    expect(requests.every((request) => "highlights" in (request.body.contents as Record<string, unknown>))).toBe(true);
  });
});

describe("fetchDirectExaFirstReadSources", () => {
  it("skips cleanly when DIRECT_EXA_API_KEY is missing", async () => {
    const result = await fetchDirectExaFirstReadSources({
      env: {},
      domain: "cartesia.ai",
      fetchJson: async () => {
        throw new Error("should not fetch without a key");
      },
    });

    expect(result).toEqual({ sources: [], failures: [], skipped: true, requestCount: 0, estimatedCostUsd: 0 });
  });

  it("tracks first-read spend separately and isolates a failing request from the run", async () => {
    const result = await fetchDirectExaFirstReadSources({
      env: { DIRECT_EXA_API_KEY: "exa-key" },
      domain: "cartesia.ai",
      fetchJson: async (request) => {
        if (request.name === "exa_direct_news") {
          throw new Error("Direct Exa request failed with 502");
        }
        return {
          results: [
            { url: "https://www.cartesia.ai/about", title: "About Cartesia", highlights: ["what it does"] },
          ],
        };
      },
    });

    // The lane never throws: a failing request becomes a recorded failure, not a rejection.
    expect(result.skipped).toBe(false);
    expect(result.requestCount).toBe(1);
    expect(result.estimatedCostUsd).toBeCloseTo(DIRECT_EXA_SEARCH_COST_USD, 6);
    expect(result.failures).toHaveLength(1);
    expect(result.sources[0]).toMatchObject({ url: "https://www.cartesia.ai/about", sourceType: "company_site" });
  });
});

describe("fetchDirectExaFundamentalsSources", () => {
  it("skips cleanly when DIRECT_EXA_API_KEY is missing", async () => {
    const result = await fetchDirectExaFundamentalsSources({
      env: {},
      domain: "cartesia.ai",
      fetchJson: async () => {
        throw new Error("should not fetch without a key");
      },
    });

    expect(result).toEqual({ sources: [], failures: [], skipped: true, requestCount: 0, estimatedCostUsd: 0 });
  });

  it("counts successful requests and estimates direct Exa spend", async () => {
    const result = await fetchDirectExaFundamentalsSources({
      env: { DIRECT_EXA_API_KEY: "exa-key" },
      domain: "cartesia.ai",
      fetchJson: async (request) => {
        if (request.name === "exa_direct_news") {
          throw new Error("Direct Exa request failed with 502");
        }
        return { results: [] };
      },
    });

    expect(result.requestCount).toBe(3);
    expect(result.estimatedCostUsd).toBeCloseTo(3 * DIRECT_EXA_SEARCH_COST_USD, 6);
    expect(result.failures).toHaveLength(1);
  });

  it("maps Exa results into URL-backed sources with basics retrieval intents", async () => {
    const result = await fetchDirectExaFundamentalsSources({
      env: { DIRECT_EXA_API_KEY: "exa-key" },
      domain: "cartesia.ai",
      fetchJson: async ({ body }) => ({
        results: [
          {
            url: body.category === "company" ? "https://www.cartesia.ai/about" : `https://example.com/${body.category}`,
            title: `${body.category} result`,
            text: "Cartesia raised funding and lists its management team.",
            publishedDate: "2026-05-07",
            highlights: ["management team", "funding"],
          },
        ],
      }),
    });

    expect(result.skipped).toBe(false);
    expect(result.failures).toEqual([]);
    expect(result.sources.map((source) => source.intent)).toEqual([
      "company_profile",
      "management_team",
      "funding",
      "recent_signals",
    ]);
    expect(result.sources[0]).toMatchObject({
      url: "https://www.cartesia.ai/about",
      sourceType: "company_site",
      rawText: expect.stringContaining("management team"),
    });
  });
});

describe("directExaJson retry behavior", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("retries transient 5xx and recovers with a successful response", async () => {
    const fetchSpy = vi.fn();
    fetchSpy.mockResolvedValueOnce(new Response("server gone", { status: 503 }));
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ results: [] }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchSpy);

    const result = await fetchDirectExaFundamentalsSources({
      env: { DIRECT_EXA_API_KEY: "exa-key" },
      domain: "cartesia.ai",
    });

    expect(result.skipped).toBe(false);
    // 4 probes succeed (after retrying any 503s). We assert that at least one request retried.
    expect(fetchSpy.mock.calls.length).toBeGreaterThan(4);
  });

  it("does not retry 4xx auth/payment errors", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response("unauthorized", { status: 401 }));
    vi.stubGlobal("fetch", fetchSpy);

    const result = await fetchDirectExaFundamentalsSources({
      env: { DIRECT_EXA_API_KEY: "exa-key" },
      domain: "cartesia.ai",
    });

    expect(result.failures.length).toBe(4);
    // Exactly 4 calls (one per probe), no retries on 4xx.
    expect(fetchSpy.mock.calls.length).toBe(4);
  });
});

describe("fetchDirectExaContactSources", () => {
  it("normalizes only named people before direct Exa contact search", () => {
    expect(
      normalizeNamedPeopleEmailHints([
        { name: null, role: "CEO" },
        { name: "  Melanie Perkins  ", role: "CEO" },
        { name: "Melanie Perkins", sourceUrl: "https://linkedin.com/in/melanieperkins" },
      ]),
    ).toEqual([
      expect.objectContaining({
        name: "Melanie Perkins",
        sourceUrl: "https://linkedin.com/in/melanieperkins",
      }),
    ]);
  });

  it("builds a contact email search around known card people", () => {
    const requests = buildDirectExaContactRequests({ DIRECT_EXA_API_KEY: "exa-key" }, "canva.com", [
      { name: "Melanie Perkins", role: "Co-founder & CEO", sourceUrl: "https://linkedin.com/in/melanieperkins" },
    ]);

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      name: "exa_direct_contact_email",
      body: {
        query: expect.stringContaining('"Melanie Perkins"'),
        numResults: 10,
      },
    });
    expect(String(requests[0]?.body.query)).toContain('"@canva.com"');
  });

  it("emits cited work-email facts from direct Exa results", async () => {
    const result = await fetchDirectExaContactSources({
      env: { DIRECT_EXA_API_KEY: "exa-key" },
      domain: "canva.com",
      peopleHints: [
        { name: "Melanie Perkins", role: "Co-founder & CEO", sourceUrl: "https://linkedin.com/in/melanieperkins" },
      ],
      fetchJson: async () => ({
        results: [
          {
            url: "https://example.com/canva-contact",
            title: "Melanie Perkins contact",
            text: "Melanie Perkins is Canva's co-founder and CEO. Her work email is mperkins@canva.com.",
          },
        ],
      }),
    });

    expect(result.skipped).toBe(false);
    expect(result.failures).toEqual([]);
    expect(result.sources).toEqual([
      expect.objectContaining({
        url: "https://example.com/canva-contact",
        intent: "email_verification",
      }),
    ]);
    expect(result.facts).toEqual([
      expect.objectContaining({
        path: "team.founders",
        value: [
          expect.objectContaining({
            name: "Melanie Perkins",
            email: "mperkins@canva.com",
          }),
        ],
        provider: "direct_exa",
      }),
    ]);
  });

  it("does not emit generic mailbox emails as person contacts", async () => {
    const result = await fetchDirectExaContactSources({
      env: { DIRECT_EXA_API_KEY: "exa-key" },
      domain: "canva.com",
      peopleHints: [{ name: "Melanie Perkins", role: "Co-founder & CEO" }],
      fetchJson: async () => ({
        results: [
          {
            url: "https://example.com/canva-support",
            title: "Canva support",
            text: "Melanie Perkins founded Canva. Contact support@canva.com for help.",
          },
        ],
      }),
    });

    expect(result.facts).toEqual([]);
  });

  it("does not assign another person's matching email to nearby people", async () => {
    const result = await fetchDirectExaContactSources({
      env: { DIRECT_EXA_API_KEY: "exa-key" },
      domain: "canva.com",
      peopleHints: [
        { name: "Melanie Perkins", role: "Co-founder & CEO" },
        { name: "Cliff Obrecht", role: "Co-founder & COO" },
      ],
      fetchJson: async () => ({
        results: [
          {
            url: "https://example.com/canva-founders",
            title: "Canva founders",
            text: "Melanie Perkins and Cliff Obrecht co-founded Canva. Contact Melanie at melanie@canva.com.",
          },
        ],
      }),
    });

    expect(result.facts).toEqual([
      expect.objectContaining({
        value: [
          expect.objectContaining({
            name: "Melanie Perkins",
            email: "melanie@canva.com",
          }),
        ],
      }),
    ]);
  });
});
