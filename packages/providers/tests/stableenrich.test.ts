import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildStableenrichRequests,
  fetchStableenrichPeopleEmailSources,
  fetchStableenrichSources,
  missingStableenrichConfig,
  runStableenrichProbe,
} from "../src/index";

describe("missingStableenrichConfig", () => {
  it("does not require AgentCash API keys or endpoint env when using Stableenrich defaults", () => {
    expect(missingStableenrichConfig({})).toEqual([]);
  });
});

describe("buildStableenrichRequests", () => {
  it("builds the live Stableenrich endpoint probes", () => {
    const requests = buildStableenrichRequests({}, "cartesia.ai");

    expect(requests.map((request) => request.name)).toEqual([
      "exa_funding_history",
      "exa_company_profile",
      "exa_management_team",
      "exa_recent_signals",
      "exa_competition",
      "exa_independent_analysis",
      "exa_find_similar",
      "firecrawl_homepage",
      "firecrawl_about",
      "firecrawl_team",
      "org_enrichment",
      "apollo_people_search",
    ]);
    expect(requests.map((request) => request.url)).toEqual([
      "https://stableenrich.dev/api/exa/search",
      "https://stableenrich.dev/api/exa/search",
      "https://stableenrich.dev/api/exa/search",
      "https://stableenrich.dev/api/exa/search",
      "https://stableenrich.dev/api/exa/search",
      "https://stableenrich.dev/api/exa/search",
      "https://stableenrich.dev/api/exa/find-similar",
      "https://stableenrich.dev/api/firecrawl/scrape",
      "https://stableenrich.dev/api/firecrawl/scrape",
      "https://stableenrich.dev/api/firecrawl/scrape",
      "https://stableenrich.dev/api/apollo/org-enrich",
      "https://stableenrich.dev/api/apollo/people-search",
    ]);
    expect(requests[0]?.body).toMatchObject({
      query: expect.stringContaining("funding"),
      numResults: 8,
    });
    expect(requests[1]?.body).toMatchObject({
      query: expect.stringContaining("what does"),
      numResults: 5,
    });
    expect(requests[2]?.body).toMatchObject({
      query: expect.stringContaining("founders CEO leadership"),
      numResults: 5,
    });
    expect(requests[3]?.body).toMatchObject({
      query: expect.stringContaining("recent launch"),
      numResults: 5,
    });
    expect(requests[4]?.body).toMatchObject({
      query: expect.stringContaining("competitors alternatives"),
      numResults: 5,
    });
    expect(requests[7]?.body).toEqual({ url: "https://cartesia.ai" });
    expect(requests[8]?.body).toEqual({ url: "https://cartesia.ai/about" });
    expect(requests[9]?.body).toEqual({ url: "https://cartesia.ai/team" });
    expect(requests[11]?.body).toMatchObject({
      q_organization_domains: ["cartesia.ai"],
      person_seniorities: expect.arrayContaining(["founder", "c_suite", "vp"]),
      person_titles: expect.arrayContaining(["CTO", "CFO", "VP Engineering"]),
      per_page: 25,
    });
  });

  it("uses research-plan search queries when present", () => {
    const requests = buildStableenrichRequests({}, "harvey.ai", {
      searchQueries: {
        funding: "harvey latest round valuation Sequoia",
        companyProfile: "harvey legal AI workflow buyer",
        managementTeam: "harvey founders executives email",
        recentSignals: "harvey recent customer launch",
        comparables: "harvey legal AI competitors",
        independentAnalysis: "harvey Sacra ARR analysis",
      },
    });

    expect(requests[0]?.body).toMatchObject({ query: "harvey latest round valuation Sequoia" });
    expect(requests[1]?.body).toMatchObject({ query: "harvey legal AI workflow buyer" });
    expect(requests[2]?.body).toMatchObject({ query: "harvey founders executives email" });
    expect(requests[3]?.body).toMatchObject({ query: "harvey recent customer launch" });
    expect(requests[4]?.body).toMatchObject({ query: "harvey legal AI competitors" });
    expect(requests[5]?.body).toMatchObject({ query: "harvey Sacra ARR analysis" });
  });
});

describe("runStableenrichProbe", () => {
  afterEach(() => {
    delete process.env.STABLEENRICH_AGENTCASH_CONCURRENCY;
  });

  it("runs AgentCash-backed probes with bounded parallelism", async () => {
    let activeCalls = 0;
    let maxActiveCalls = 0;

    await runStableenrichProbe({
      env: stableenrichEnv(),
      domain: "cartesia.ai",
      agentcashFetch: async () => {
        activeCalls += 1;
        maxActiveCalls = Math.max(maxActiveCalls, activeCalls);
        await new Promise((resolve) => setTimeout(resolve, 1));
        activeCalls -= 1;
        return { text: "ok" };
      },
    });

    expect(maxActiveCalls).toBe(3);
  });

  it("honors the AgentCash concurrency override", async () => {
    process.env.STABLEENRICH_AGENTCASH_CONCURRENCY = "1";
    let activeCalls = 0;
    let maxActiveCalls = 0;

    await runStableenrichProbe({
      env: stableenrichEnv(),
      domain: "cartesia.ai",
      agentcashFetch: async () => {
        activeCalls += 1;
        maxActiveCalls = Math.max(maxActiveCalls, activeCalls);
        await new Promise((resolve) => setTimeout(resolve, 1));
        activeCalls -= 1;
        return { text: "ok" };
      },
    });

    expect(maxActiveCalls).toBe(1);
  });

  it("keeps endpoint identity when an injected AgentCash fetch fails", async () => {
    const results = await runStableenrichProbe({
      env: stableenrichEnv(),
      domain: "cartesia.ai",
      agentcashFetch: async () => {
        throw new Error("payment failed");
      },
    });

    const firstResult = results[0];
    expect(firstResult?.status).toBe("rejected");
    if (firstResult?.status !== "rejected") {
      throw new Error("Expected the first probe to reject");
    }
    expect(firstResult.reason).toMatchObject({
      name: "exa_funding_history",
      endpointUrl: "https://stable.example/exa/search",
      error: "payment failed",
    });
  });
});

describe("fetchStableenrichSources", () => {
  it("maps fulfilled probes into provider sources", async () => {
    const result = await fetchStableenrichSources({
      env: stableenrichEnv(),
      domain: "cartesia.ai",
      agentcashFetch: async ({ url }) => ({
        endpointUrl: url,
        text: "source payload",
      }),
    });

    expect(result.failures).toEqual([]);
    expect(result.sources.map((source) => source.sourceType)).toEqual([
      "news",
      "news",
      "news",
      "news",
      "news",
      "news",
      "news",
      "company_site",
      "company_site",
      "company_site",
      "enrichment",
      "enrichment",
    ]);
    expect(result.sources[0]).toMatchObject({
      url: "agentcash:exa_funding_history",
      title: "exa_funding_history",
      rawText: expect.stringContaining("source payload"),
    });
  });

  it("expands Exa search results into URL-backed source records with retrieval intent", async () => {
    const result = await fetchStableenrichSources({
      env: stableenrichEnv(),
      domain: "perplexity.ai",
      agentcashFetch: async ({ url }) => {
        if (url === "https://stable.example/exa/search") {
          return {
            results: [
              {
                url: "https://www.perplexity.ai/hub/blog/series-b",
                title: "Perplexity Series B",
                text: "Perplexity raised a $63 million Series B led by IVP.",
                publishedDate: "2024-04-23",
              },
            ],
          };
        }

        return { text: "ok" };
      },
    });

    expect(result.sources).toContainEqual(
      expect.objectContaining({
        url: "https://www.perplexity.ai/hub/blog/series-b",
        title: "Perplexity Series B",
        sourceType: "news",
        intent: "funding",
        rawText: expect.stringContaining("Series B"),
      }),
    );
  });

  it("returns endpoint failures instead of silently dropping rejected probes", async () => {
    const result = await fetchStableenrichSources({
      env: stableenrichEnv(),
      domain: "cartesia.ai",
      agentcashFetch: async ({ url }) => {
        if (url === "https://stable.example/firecrawl") {
          throw new Error("upstream failed");
        }

        return { text: "ok" };
      },
    });

    expect(result.sources).toHaveLength(9);
    expect(result.failures).toEqual([
      {
        name: "firecrawl_homepage",
        endpointUrl: "https://stable.example/firecrawl",
        error: "upstream failed",
      },
      {
        name: "firecrawl_about",
        endpointUrl: "https://stable.example/firecrawl",
        error: "upstream failed",
      },
      {
        name: "firecrawl_team",
        endpointUrl: "https://stable.example/firecrawl",
        error: "upstream failed",
      },
    ]);
    expect(result.endpoints).toContainEqual(
      expect.objectContaining({
        name: "firecrawl_homepage",
        status: "failed",
        sourceCount: 0,
        factCount: 0,
      }),
    );
  });

  it("extracts table-stakes Apollo org enrichment fields as structured facts", async () => {
    const result = await fetchStableenrichSources({
      env: stableenrichEnv(),
      domain: "cartesia.ai",
      agentcashFetch: async ({ url }) => {
        if (url === "https://stable.example/org") {
          return {
            status: "success",
            organization: {
              name: "Cartesia",
              domain: "cartesia.ai",
              website_url: "https://cartesia.ai",
              linkedin_url: "https://www.linkedin.com/company/cartesia-ai",
              logo_url: "https://cartesia.ai/logo.png",
              city: "San Francisco",
              country: "United States",
              founded_year: 2023,
              estimated_num_employees: 64,
              total_funding: 91000000,
              latest_funding_stage: "Series B",
              latest_funding_round_date: "2024-04-23",
              short_description: "Real-time voice AI infrastructure.",
            },
          };
        }

        return { text: "ok" };
      },
    });

    expect(result.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "identity.websiteUrl", value: "https://cartesia.ai" }),
        expect.objectContaining({ path: "identity.linkedinUrl", value: "https://www.linkedin.com/company/cartesia-ai" }),
        expect.objectContaining({ path: "team.headcount", value: expect.objectContaining({ value: 64 }) }),
        expect.objectContaining({ path: "funding.totalRaisedUsd", value: 91000000 }),
      ]),
    );
    expect(result.endpoints).toContainEqual(
      expect.objectContaining({
        name: "org_enrichment",
        status: "ok",
        factCount: expect.any(Number),
      }),
    );
  });

  it("extracts cited recent signal facts from recent-signal search results", async () => {
    const result = await fetchStableenrichSources({
      env: stableenrichEnv(),
      domain: "cognition.ai",
      agentcashFetch: async ({ url, body }) => {
        if (url === "https://stable.example/exa/search" && String(body.query).includes("recent launch")) {
          return {
            results: [
              {
                url: "https://cognition.ai/blog/devin-launch",
                title: "Cognition launches Devin",
                text: "Cognition announced Devin, an AI software engineer.",
                publishedDate: "2026-03-01",
              },
            ],
          };
        }

        return { text: "ok" };
      },
    });

    expect(result.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "signals",
          value: expect.objectContaining({
            title: "Cognition launches Devin",
            url: "https://cognition.ai/blog/devin-launch",
            date: "2026-03-01",
            category: "launch",
          }),
        }),
      ]),
    );
  });

  it("emits exa_find_similar results as comparable-intent sources for the LLM to curate", async () => {
    const result = await fetchStableenrichSources({
      env: stableenrichEnv(),
      domain: "cognition.ai",
      agentcashFetch: async ({ url }) => {
        if (url === "https://stable.example/exa/similar") {
          return {
            results: [
              {
                url: "https://devin.ai",
                title: "Devin | The AI Software Engineer",
                text: "Devin is an AI software engineer.",
              },
              {
                url: "https://app.aibase.com/tool/cognition",
                title: "Cognition",
                text: "Cognition directory listing.",
              },
            ],
          };
        }

        return { text: "ok" };
      },
    });

    expect(result.facts.filter((fact) => fact.path === "comparables")).toEqual([]);
    expect(result.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          url: "https://devin.ai",
          intent: "comparables",
          sourceType: "news",
        }),
        expect.objectContaining({
          url: "https://app.aibase.com/tool/cognition",
          intent: "comparables",
          sourceType: "news",
        }),
      ]),
    );
  });

  it("enriches management emails from Apollo people search and people enrichment", async () => {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const result = await fetchStableenrichSources({
      env: stableenrichEnv(),
      domain: "zo.computer",
      agentcashFetch: async ({ url, body }) => {
        calls.push({ url, body });
        if (url === "https://stable.example/people-search") {
          return {
            people: [
              {
                id: "apollo-raymond",
                name: "Raymond Luo",
                title: "Founder and CEO",
                linkedin_url: "https://www.linkedin.com/in/raymondluo",
              },
            ],
            pagination: { page: 1, per_page: 5, total_entries: 1, total_pages: 1 },
          };
        }

        if (url === "https://stable.example/people-enrich") {
          return {
            status: "success",
            person: {
              id: "apollo-raymond",
              name: "Raymond Luo",
              title: "Founder and CEO",
              email: "raymond@zo.computer",
              email_status: "verified",
              linkedin_url: "https://www.linkedin.com/in/raymondluo",
            },
          };
        }

        return { text: "ok" };
      },
    });

    expect(calls).toContainEqual(
      expect.objectContaining({
        url: "https://stable.example/people-enrich",
        body: expect.objectContaining({ id: "apollo-raymond", domain: "zo.computer" }),
      }),
    );
    expect(result.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "team.founders",
          value: [
            expect.objectContaining({
              name: "Raymond Luo",
              role: "Founder and CEO",
              email: "raymond@zo.computer",
            }),
          ],
        }),
      ]),
    );
  });

  it("checks generated domain-pattern emails with Hunter before emitting them", async () => {
    const result = await fetchStableenrichSources({
      env: stableenrichEnv(),
      domain: "zo.computer",
      agentcashFetch: async ({ url, body }) => {
        if (url === "https://stable.example/people-search") {
          return {
            people: [
              {
                id: "apollo-raymond",
                name: "Raymond Luo",
                title: "Founder and CEO",
                linkedin_url: "https://www.linkedin.com/in/raymondluo",
              },
            ],
            pagination: { page: 1, per_page: 5, total_entries: 1, total_pages: 1 },
          };
        }

        if (url === "https://stable.example/people-enrich") {
          return {
            status: "success",
            person: {
              id: "apollo-raymond",
              name: "Raymond Luo",
              title: "Founder and CEO",
              linkedin_url: "https://www.linkedin.com/in/raymondluo",
            },
          };
        }

        if (url === "https://stable.example/hunter") {
          return {
            status: body.email === "raymond@zo.computer" ? "valid" : "invalid",
            score: body.email === "raymond@zo.computer" ? 97 : 10,
            email: body.email,
            regexp: true,
            gibberish: false,
            disposable: false,
            webmail: false,
            mx_records: true,
            smtp_server: true,
            smtp_check: body.email === "raymond@zo.computer",
            accept_all: false,
            block: false,
            sources: [],
          };
        }

        return { text: "ok" };
      },
    });

    expect(result.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "team.founders",
          value: [
            expect.objectContaining({
              name: "Raymond Luo",
              email: "raymond@zo.computer",
            }),
          ],
        }),
      ]),
    );
    expect(result.facts).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          value: [expect.objectContaining({ email: "raymond.luo@zo.computer" })],
        }),
      ]),
    );
  });

  it("uses management search people hints when Apollo people search is empty", async () => {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const result = await fetchStableenrichSources({
      env: stableenrichEnv(),
      domain: "zo.computer",
      agentcashFetch: async ({ url, body }) => {
        calls.push({ url, body });
        if (url === "https://stable.example/exa/search" && String(body.query).includes("founders CEO leadership")) {
          return {
            results: [
              {
                url: "https://www.linkedin.com/in/0thernet",
                title: "Ben Guo - Zo Computer - LinkedIn",
              },
            ],
          };
        }

        if (url === "https://stable.example/people-search") {
          return { people: [], pagination: { page: 1, per_page: 5, total_entries: 0, total_pages: 0 } };
        }

        if (url === "https://stable.example/people-enrich") {
          return { person: null };
        }

        if (url === "https://stable.example/hunter") {
          return {
            status: body.email === "ben.guo@zo.computer" ? "accept_all" : "invalid",
            score: body.email === "ben.guo@zo.computer" ? 72 : 10,
            email: body.email,
            regexp: true,
            gibberish: false,
            disposable: false,
            webmail: false,
            mx_records: true,
            smtp_server: true,
            smtp_check: body.email === "ben.guo@zo.computer",
            accept_all: body.email === "ben.guo@zo.computer",
            block: false,
            sources: [],
          };
        }

        return { text: "ok" };
      },
    });

    expect(calls).toContainEqual(
      expect.objectContaining({
        url: "https://stable.example/people-enrich",
        body: expect.objectContaining({ linkedin_url: "https://www.linkedin.com/in/0thernet" }),
      }),
    );
    expect(result.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "team.keyExecs",
          value: [
            expect.objectContaining({
              name: "Ben Guo",
              email: "ben.guo@zo.computer",
              sourceUrl: "https://www.linkedin.com/in/0thernet",
            }),
          ],
        }),
      ]),
    );
  });

  it("uses LinkedIn-backed person pages from any company search result as email fallback hints", async () => {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const result = await fetchStableenrichSources({
      env: stableenrichEnv(),
      domain: "cognition.ai",
      agentcashFetch: async ({ url, body }) => {
        calls.push({ url, body });
        if (url === "https://stable.example/exa/search" && String(body.query).includes("what does")) {
          return {
            results: [
              {
                url: "https://linkedin.com/in/scott-wu-8b94ab96",
                title: "Scott Wu",
                text: "# Scott Wu\n\nCo-Founder And CEO at [Cognition](https://www.linkedin.com/company/cognition-ai-labs) (Current)",
              },
            ],
          };
        }

        if (url === "https://stable.example/people-search") {
          return { people: [], pagination: { page: 1, per_page: 5, total_entries: 0, total_pages: 0 } };
        }

        if (url === "https://stable.example/people-enrich") {
          return { person: null };
        }

        if (url === "https://stable.example/hunter") {
          return {
            status: body.email === "scott@cognition.ai" ? "valid" : "invalid",
            score: body.email === "scott@cognition.ai" ? 96 : 5,
            email: body.email,
            regexp: true,
            gibberish: false,
            disposable: false,
            webmail: false,
            mx_records: true,
            smtp_server: true,
            smtp_check: body.email === "scott@cognition.ai",
            accept_all: false,
            block: false,
            sources: [],
          };
        }

        return { text: "ok" };
      },
    });

    expect(calls).toContainEqual(
      expect.objectContaining({
        url: "https://stable.example/people-enrich",
        body: expect.objectContaining({ linkedin_url: "https://linkedin.com/in/scott-wu-8b94ab96" }),
      }),
    );
    expect(result.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "team.founders",
          value: [
            expect.objectContaining({
              name: "Scott Wu",
              role: "Co-Founder and CEO",
              email: "scott@cognition.ai",
              sourceUrl: "https://linkedin.com/in/scott-wu-8b94ab96",
            }),
          ],
        }),
      ]),
    );
  });

  it("still verifies management search email patterns when Apollo people search fails", async () => {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const result = await fetchStableenrichSources({
      env: stableenrichEnv(),
      domain: "zo.computer",
      agentcashFetch: async ({ url, body }) => {
        calls.push({ url, body });
        if (url === "https://stable.example/exa/search" && String(body.query).includes("founders CEO leadership")) {
          return {
            results: [
              {
                url: "https://www.linkedin.com/in/raymondluo",
                title: "Raymond Luo - Zo Computer - LinkedIn",
              },
            ],
          };
        }

        if (url === "https://stable.example/people-search") {
          throw new Error("apollo unavailable");
        }

        if (url === "https://stable.example/people-enrich") {
          return { person: null };
        }

        if (url === "https://stable.example/hunter") {
          return {
            status: body.email === "raymond@zo.computer" ? "valid" : "invalid",
            score: body.email === "raymond@zo.computer" ? 97 : 10,
            email: body.email,
            regexp: true,
            gibberish: false,
            disposable: false,
            webmail: false,
            mx_records: true,
            smtp_server: true,
            smtp_check: body.email === "raymond@zo.computer",
            accept_all: false,
            block: false,
            sources: [],
          };
        }

        return { text: "ok" };
      },
    });

    expect(calls).toContainEqual(
      expect.objectContaining({
        url: "https://stable.example/people-enrich",
        body: expect.objectContaining({ linkedin_url: "https://www.linkedin.com/in/raymondluo" }),
      }),
    );
    expect(result.failures).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "apollo_people_search" })]),
    );
    expect(result.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "team.keyExecs",
          value: [
            expect.objectContaining({
              name: "Raymond Luo",
              email: "raymond@zo.computer",
              sourceUrl: "https://www.linkedin.com/in/raymondluo",
            }),
          ],
        }),
      ]),
    );
  });

  it("does not enrich company-looking pseudo people from search results", async () => {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const result = await fetchStableenrichSources({
      env: stableenrichEnv(),
      domain: "canva.com",
      agentcashFetch: async ({ url, body }) => {
        calls.push({ url, body });
        if (url === "https://stable.example/exa/search" && String(body.query).includes("founders CEO leadership")) {
          return {
            results: [
              {
                url: "https://www.cbinsights.com/company/canva/people",
                title: "Canva CEO - Canva People | CB Insights",
                text: "# Canva CEO\n\nFounder at Canva",
              },
              {
                url: "https://rocketreach.co/canva-management",
                title: "Canva Management",
                text: "# Canva Management\n\nLeadership team at Canva",
              },
            ],
          };
        }

        if (url === "https://stable.example/people-search") {
          return { people: [], pagination: { page: 1, per_page: 5, total_entries: 0, total_pages: 0 } };
        }

        if (url === "https://stable.example/people-enrich") {
          return {
            person: {
              name: "Canva Management",
              title: "Founder",
            },
          };
        }

        if (url === "https://stable.example/hunter") {
          return {
            status: body.email === "canva@canva.com" ? "valid" : "invalid",
            score: body.email === "canva@canva.com" ? 100 : 0,
            email: body.email,
            mx_records: true,
            smtp_server: true,
            smtp_check: body.email === "canva@canva.com",
          };
        }

        return { results: [] };
      },
    });

    expect(calls.some((call) => call.url === "https://stable.example/people-enrich")).toBe(false);
    expect(calls.some((call) => call.url === "https://stable.example/hunter")).toBe(false);
    expect(JSON.stringify(result.facts)).not.toContain("Canva Management");
    expect(JSON.stringify(result.facts)).not.toContain("canva@canva.com");
  });
});

describe("fetchStableenrichPeopleEmailSources", () => {
  beforeEach(() => {
    process.env.SEC_EDGAR_DISABLED = "true";
  });

  afterEach(() => {
    delete process.env.SEC_EDGAR_DISABLED;
  });

  it("verifies emails from explicit card people when provider search misses the team", async () => {
    const result = await fetchStableenrichPeopleEmailSources({
      env: stableenrichEnv(),
      domain: "mintlify.com",
      sourceHints: [],
      peopleHints: [
        {
          name: "Han Wang",
          role: "Co-Founder",
          sourceUrl: "https://linkedin.com/in/handotdev",
        },
      ],
      agentcashFetch: async ({ url, body }) => {
        if (url === "https://stable.example/people-enrich") {
          return { person: null };
        }

        if (url === "https://stable.example/hunter") {
          return {
            status: body.email === "han@mintlify.com" ? "valid" : "invalid",
            score: body.email === "han@mintlify.com" ? 94 : 8,
            email: body.email,
            mx_records: true,
            smtp_server: true,
            smtp_check: body.email === "han@mintlify.com",
          };
        }

        return { text: "ok" };
      },
    });

    expect(result.endpoints.map((endpoint) => endpoint.name)).toEqual(
      expect.arrayContaining([
        "apollo_org_search",
        "apollo_people_search",
        "apollo_people_enrich",
        "minerva_enrich",
        "clado_contacts_enrich",
        "hunter_email_verifier",
        "exa_email_search",
        "exa_leader_discovery",
      ]),
    );
    expect(result.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "team.founders",
          value: [
            expect.objectContaining({
              name: "Han Wang",
              role: "Co-Founder",
              email: "han@mintlify.com",
            }),
          ],
        }),
      ]),
    );
  });

  it("checks first-initial last-name email patterns with Hunter", async () => {
    const result = await fetchStableenrichPeopleEmailSources({
      env: stableenrichEnv(),
      domain: "canva.com",
      sourceHints: [],
      peopleHints: [
        {
          name: "Melanie Perkins",
          role: "Co-founder & CEO",
          sourceUrl: "https://linkedin.com/in/melanieperkins",
        },
      ],
      agentcashFetch: async ({ url, body }) => {
        if (url === "https://stable.example/people-enrich") {
          return { person: null };
        }

        if (url === "https://stable.example/minerva") {
          return { api_request_id: "req", request_completed_at: "2026-05-19T00:00:00.000Z", results: [] };
        }

        if (url === "https://stable.example/clado") {
          return { data: [] };
        }

        if (url === "https://stable.example/hunter") {
          return {
            status: body.email === "mperkins@canva.com" ? "valid" : "invalid",
            score: body.email === "mperkins@canva.com" ? 92 : 7,
            email: body.email,
            mx_records: true,
            smtp_server: true,
            smtp_check: body.email === "mperkins@canva.com",
          };
        }

        return { text: "ok" };
      },
    });

    expect(result.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "team.founders",
          value: [
            expect.objectContaining({
              name: "Melanie Perkins",
              email: "mperkins@canva.com",
            }),
          ],
        }),
      ]),
    );
    expect(result.emailDiscovery).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Melanie Perkins",
          emailFound: "mperkins@canva.com",
          emailSource: "hunter",
        }),
      ]),
    );
  });

  it("drops mismatched people-enrich records for explicit card people", async () => {
    const result = await fetchStableenrichPeopleEmailSources({
      env: stableenrichEnv(),
      domain: "canva.com",
      sourceHints: [],
      peopleHints: [
        {
          name: "Adam Schuck",
          role: "Head of People",
          sourceUrl: "https://linkedin.com/in/adamschuck",
        },
      ],
      agentcashFetch: async ({ url, body }) => {
        if (url === "https://stable.example/people-enrich") {
          return {
            person: {
              name: "Chuck Adams",
              title: "CEO",
            },
          };
        }

        if (url === "https://stable.example/minerva") {
          return {
            results: [
              {
                is_match: true,
                full_name: "CHARLES LEWIS ADAMS",
                linkedin_title: "CEO",
                linkedin_url: "https://linkedin.com/in/adamschuck",
              },
            ],
          };
        }

        if (url === "https://stable.example/clado") {
          return { data: [] };
        }

        if (url === "https://stable.example/hunter") {
          return {
            status: body.email === "adam@canva.com" ? "valid" : "invalid",
            score: body.email === "adam@canva.com" ? 93 : 6,
            email: body.email,
            mx_records: true,
            smtp_server: true,
            smtp_check: body.email === "adam@canva.com",
          };
        }

        return { text: "ok" };
      },
    });

    expect(JSON.stringify(result.facts)).not.toContain("Chuck Adams");
    expect(JSON.stringify(result.facts)).not.toContain("CHARLES LEWIS ADAMS");
    expect(result.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "team.keyExecs",
          value: [
            expect.objectContaining({
              name: "Adam Schuck",
              email: "adam@canva.com",
            }),
          ],
        }),
      ]),
    );
  });

  it("ignores off-domain people-enrich emails and still tries Hunter", async () => {
    const result = await fetchStableenrichPeopleEmailSources({
      env: stableenrichEnv(),
      domain: "canva.com",
      sourceHints: [],
      peopleHints: [
        {
          name: "Cameron Adams",
          role: "Co-founder and CPO",
          sourceUrl: "https://linkedin.com/in/cameronadams",
        },
      ],
      agentcashFetch: async ({ url, body }) => {
        if (url === "https://stable.example/people-enrich") {
          return {
            person: {
              name: "Cameron Adams",
              title: "Principal - Healthcare",
              email: "cameron.adams@sealedair.com",
              email_status: "verified",
              linkedin_url: "http://www.linkedin.com/in/cameronadams",
            },
          };
        }

        if (url === "https://stable.example/minerva") {
          return { api_request_id: "req", request_completed_at: "2026-05-19T00:00:00.000Z", results: [] };
        }

        if (url === "https://stable.example/clado") {
          return { data: [] };
        }

        if (url === "https://stable.example/hunter") {
          return {
            status: body.email === "cameron@canva.com" ? "valid" : "invalid",
            score: body.email === "cameron@canva.com" ? 95 : 4,
            email: body.email,
            mx_records: true,
            smtp_server: true,
            smtp_check: body.email === "cameron@canva.com",
          };
        }

        return { results: [] };
      },
    });

    expect(JSON.stringify(result.facts)).not.toContain("sealedair.com");
    expect(JSON.stringify(result.facts)).not.toContain("Principal - Healthcare");
    expect(result.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "team.founders",
          value: [
            expect.objectContaining({
              name: "Cameron Adams",
              role: "Co-founder and CPO",
              email: "cameron@canva.com",
            }),
          ],
        }),
      ]),
    );
    expect(result.emailDiscovery).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Cameron Adams",
          emailFound: "cameron@canva.com",
          emailSource: "hunter",
        }),
      ]),
    );
  });

  it("does not verify role inboxes for pseudo people from source hints", async () => {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const result = await fetchStableenrichPeopleEmailSources({
      env: stableenrichEnv(),
      domain: "canva.com",
      sourceHints: [
        {
          url: "https://www.cbinsights.com/company/canva/people",
          title: "Canva CEO - Canva People | CB Insights",
          sourceType: "news",
          intent: "management_team",
          fetchedAt: "2026-05-20T00:00:00.000Z",
          rawText: JSON.stringify({
            url: "https://www.cbinsights.com/company/canva/people",
            title: "Canva CEO - Canva People | CB Insights",
            text: "# Canva CEO\n\nFounder at Canva",
          }),
        },
      ],
      peopleHints: [],
      agentcashFetch: async ({ url, body }) => {
        calls.push({ url, body });
        if (url === "https://stable.example/people-search") {
          return { people: [], pagination: { page: 1, per_page: 5, total_entries: 0, total_pages: 0 } };
        }

        if (url === "https://stable.example/exa/search") {
          return { results: [] };
        }

        if (url === "https://stable.example/people-enrich") {
          return {
            person: {
              name: "Canva Management",
              title: "Founder",
            },
          };
        }

        if (url === "https://stable.example/hunter") {
          return {
            status: body.email === "canva@canva.com" ? "valid" : "invalid",
            score: body.email === "canva@canva.com" ? 100 : 0,
            email: body.email,
            mx_records: true,
            smtp_server: true,
            smtp_check: body.email === "canva@canva.com",
          };
        }

        return { organizations: [] };
      },
    });

    expect(calls.some((call) => call.url === "https://stable.example/people-enrich")).toBe(false);
    expect(calls.some((call) => call.url === "https://stable.example/hunter")).toBe(false);
    expect(result.facts).toEqual([]);
    expect(result.emailDiscovery).toEqual([]);
  });

  it("runs email verification from merged provider source hints", async () => {
    const result = await fetchStableenrichPeopleEmailSources({
      env: stableenrichEnv(),
      domain: "cognition.ai",
      sourceHints: [
        {
          url: "https://linkedin.com/in/scott-wu-8b94ab96",
          title: "Scott Wu",
          sourceType: "news",
          fetchedAt: "2026-05-15T00:00:00.000Z",
          rawText: JSON.stringify({
            url: "https://linkedin.com/in/scott-wu-8b94ab96",
            title: "Scott Wu",
            text: "# Scott Wu\n\nCo-Founder And CEO at [Cognition](https://www.linkedin.com/company/cognition-ai-labs) (Current)",
          }),
        },
      ],
      agentcashFetch: async ({ url, body }) => {
        if (url === "https://stable.example/people-enrich") {
          return { person: null };
        }

        if (url === "https://stable.example/hunter") {
          return {
            status: body.email === "scott@cognition.ai" ? "valid" : "invalid",
            score: body.email === "scott@cognition.ai" ? 96 : 5,
            email: body.email,
            mx_records: true,
            smtp_server: true,
            smtp_check: body.email === "scott@cognition.ai",
          };
        }

        return { text: "ok" };
      },
    });

    expect(result.endpoints.map((endpoint) => endpoint.name)).toEqual(
      expect.arrayContaining([
        "apollo_org_search",
        "apollo_people_search",
        "apollo_people_enrich",
        "minerva_enrich",
        "clado_contacts_enrich",
        "hunter_email_verifier",
        "exa_email_search",
        "exa_leader_discovery",
      ]),
    );
    expect(result.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "team.founders",
          value: [
            expect.objectContaining({
              name: "Scott Wu",
              role: "Co-Founder and CEO",
              email: "scott@cognition.ai",
            }),
          ],
        }),
      ]),
    );
  });

  it("uses Minerva professional emails before falling back to guessed patterns", async () => {
    const result = await fetchStableenrichPeopleEmailSources({
      env: stableenrichEnv(),
      domain: "perplexity.ai",
      sourceHints: [],
      peopleHints: [
        {
          name: "Aravind Srinivas",
          role: "Co-Founder and CEO",
          sourceUrl: "https://linkedin.com/in/aravind-srinivas-16051987",
        },
      ],
      agentcashFetch: async ({ url }) => {
        if (url === "https://stable.example/people-enrich") {
          return { person: null };
        }

        if (url === "https://stable.example/minerva") {
          return {
            api_request_id: "req",
            request_completed_at: "2026-05-19T00:00:00.000Z",
            results: [
              {
                record_id: "aravind-srinivas",
                is_match: true,
                full_name: "Aravind Srinivas",
                linkedin_title: "Co-Founder and CEO",
                linkedin_url: "https://linkedin.com/in/aravind-srinivas-16051987",
                professional_emails: [{ email_rank: 1, email_address: "aravind@perplexity.ai" }],
              },
            ],
          };
        }

        return { text: "ok" };
      },
    });

    expect(result.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "team.founders",
          value: [
            expect.objectContaining({
              name: "Aravind Srinivas",
              email: "aravind@perplexity.ai",
            }),
          ],
        }),
      ]),
    );
    expect(result.endpoints.map((endpoint) => endpoint.name)).toContain("minerva_enrich");
  });

  it("uses Clado LinkedIn contact enrichment when Minerva does not return a work email", async () => {
    const result = await fetchStableenrichPeopleEmailSources({
      env: stableenrichEnv(),
      domain: "firecrawl.dev",
      sourceHints: [],
      peopleHints: [
        {
          name: "Caleb Peffer",
          role: "Co-Founder and CEO",
          sourceUrl: "https://linkedin.com/in/calebpeffer",
        },
      ],
      agentcashFetch: async ({ url }) => {
        if (url === "https://stable.example/people-enrich") {
          return { person: null };
        }

        if (url === "https://stable.example/minerva") {
          return { api_request_id: "req", request_completed_at: "2026-05-19T00:00:00.000Z", results: [] };
        }

        if (url === "https://stable.example/clado") {
          return {
            data: [
              {
                contacts: [{ type: "email", value: "caleb@firecrawl.dev", rating: 91 }],
                social: [{ type: "linkedin", link: "https://linkedin.com/in/calebpeffer", rating: 95 }],
              },
            ],
          };
        }

        return { text: "ok" };
      },
    });

    expect(result.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "team.founders",
          value: [
            expect.objectContaining({
              name: "Caleb Peffer",
              email: "caleb@firecrawl.dev",
            }),
          ],
        }),
      ]),
    );
    expect(result.endpoints.map((endpoint) => endpoint.name)).toContain("clado_contacts_enrich");
  });
});

function stableenrichEnv() {
  return {
    STABLEENRICH_EXA_SEARCH_URL: "https://stable.example/exa/search",
    STABLEENRICH_EXA_SIMILAR_URL: "https://stable.example/exa/similar",
    STABLEENRICH_FIRECRAWL_URL: "https://stable.example/firecrawl",
    STABLEENRICH_ORG_ENRICH_URL: "https://stable.example/org",
    STABLEENRICH_APOLLO_ORG_SEARCH_URL: "https://stable.example/org-search",
    STABLEENRICH_APOLLO_PEOPLE_SEARCH_URL: "https://stable.example/people-search",
    STABLEENRICH_APOLLO_PEOPLE_ENRICH_URL: "https://stable.example/people-enrich",
    STABLEENRICH_HUNTER_EMAIL_VERIFIER_URL: "https://stable.example/hunter",
    STABLEENRICH_CLADO_CONTACTS_ENRICH_URL: "https://stable.example/clado",
    STABLEENRICH_MINERVA_ENRICH_URL: "https://stable.example/minerva",
  };
}
