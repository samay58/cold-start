import { describe, expect, it } from "vitest";
import { filterSourcesForDomain, sourceGateTrace } from "../src/index";

describe("filterSourcesForDomain", () => {
  it("rejects same-name domain collisions before extraction", () => {
    const result = filterSourcesForDomain({
      domain: "minimax.io",
      sources: [
        {
          url: "https://minimax.io",
          title: "MiniMax",
          sourceType: "company_site",
          fetchedAt: "2026-05-12T00:00:00.000Z",
          intent: "company_profile",
          rawText: "MiniMax builds AI models."
        },
        {
          url: "https://minmax.ai",
          title: "MinMax Finance",
          sourceType: "news",
          fetchedAt: "2026-05-12T00:00:00.000Z",
          intent: "company_profile",
          rawText: "MinMax is a Bellevue finance company."
        },
        {
          url: "https://minimaxsol.com",
          title: "MiniMax Solutions",
          sourceType: "news",
          fetchedAt: "2026-05-12T00:00:00.000Z",
          intent: "company_profile",
          rawText: "MiniMax Solutions builds websites."
        }
      ]
    });

    expect(result.accepted.map((source) => source.url)).toEqual(["https://minimax.io"]);
    expect(result.rejected).toEqual([
      expect.objectContaining({ reason: "ambiguous_same_name_domain" }),
      expect.objectContaining({ reason: "ambiguous_same_name_domain" })
    ]);
  });

  it("keeps trusted independent reporting even when the host differs from the target domain", () => {
    const result = filterSourcesForDomain({
      domain: "legora.com",
      sources: [
        {
          url: "https://techcrunch.com/2026/01/01/legora-funding",
          title: "Legora raises funding",
          sourceType: "news",
          fetchedAt: "2026-05-12T00:00:00.000Z",
          intent: "funding",
          rawText: "Legora.com raised a new round."
        },
        {
          url: "https://legora.cl",
          title: "Legora Chile",
          sourceType: "news",
          fetchedAt: "2026-05-12T00:00:00.000Z",
          intent: "company_profile",
          rawText: "Legora Chile is unrelated."
        }
      ]
    });

    expect(result.accepted.map((source) => source.url)).toEqual(["https://techcrunch.com/2026/01/01/legora-funding"]);
    expect(result.rejected[0]).toMatchObject({ reason: "ambiguous_same_name_domain" });
  });

  it("keeps Notable Health coverage that uses the company name instead of the compact domain root", () => {
    const result = filterSourcesForDomain({
      domain: "notablehealth.com",
      sources: [
        {
          url: "https://techcrunch.com/2021/11/03/notable-which-makes-rpa-based-tools-to-speed-up-healthcare-admin-raises-100m-at-a-600m-valuation/",
          title: "Notable raises $100M to speed up healthcare admin",
          sourceType: "news",
          fetchedAt: "2026-06-23T00:00:00.000Z",
          intent: "funding",
          rawText: "Notable makes automation tools for healthcare administration and raised $100 million."
        }
      ]
    });

    expect(result.accepted.map((source) => source.url)).toEqual([
      "https://techcrunch.com/2021/11/03/notable-which-makes-rpa-based-tools-to-speed-up-healthcare-admin-raises-100m-at-a-600m-valuation/"
    ]);
  });

  it("keeps Sail Research coverage that spells the company name with a space", () => {
    const result = filterSourcesForDomain({
      domain: "sailresearch.com",
      sources: [
        {
          url: "https://newsletter.foundersysk.com/p/your-showcase-primer-serval-keycard",
          title: "Your showcase primer: Serval, Keycard, and Sail Research",
          sourceType: "news",
          fetchedAt: "2026-06-23T00:00:00.000Z",
          intent: "independent_analysis",
          rawText: "Sail Research builds AI tooling for enterprise workflows."
        }
      ]
    });

    expect(result.accepted.map((source) => source.url)).toEqual([
      "https://newsletter.foundersysk.com/p/your-showcase-primer-serval-keycard"
    ]);
  });

  it("still rejects unknown same-name domains even when target aliases are broader", () => {
    const result = filterSourcesForDomain({
      domain: "notablehealth.com",
      sources: [
        {
          url: "https://notablehealthcare.io/about",
          title: "Notable Healthcare",
          sourceType: "news",
          fetchedAt: "2026-06-23T00:00:00.000Z",
          intent: "company_profile",
          rawText: "Notable Healthcare is a different company with a similar name."
        }
      ]
    });

    expect(result.accepted).toEqual([]);
    expect(result.rejected[0]).toMatchObject({
      reason: "ambiguous_same_name_domain",
      source: expect.objectContaining({ url: "https://notablehealthcare.io/about" })
    });
  });

  it("does not accept a short-name alias without target-company context", () => {
    const result = filterSourcesForDomain({
      domain: "notablehealth.com",
      sources: [
        {
          url: "https://designblog.io/notable-design-studio",
          title: "Notable design studio profile",
          sourceType: "news",
          fetchedAt: "2026-06-23T00:00:00.000Z",
          intent: "company_profile",
          rawText: "Notable is a graphic design studio in Portland with no connection to hospitals or patient workflows."
        }
      ]
    });

    expect(result.accepted).toEqual([]);
    expect(result.rejected[0]).toMatchObject({
      reason: "low_relevance",
      source: expect.objectContaining({ url: "https://designblog.io/notable-design-studio" })
    });
  });

  it("rejects a generic-stem alias corroborated only by a common suffix word", () => {
    const result = filterSourcesForDomain({
      domain: "globaltech.com",
      sources: [
        {
          url: "https://news.example.com/supply-chains",
          title: "Global supply chains and the tech sector",
          sourceType: "news",
          fetchedAt: "2026-06-23T00:00:00.000Z",
          intent: "company_profile",
          rawText: "Global supply chain disruptions hit the tech sector this quarter, with no mention of any specific company."
        }
      ]
    });

    expect(result.accepted).toEqual([]);
    expect(result.rejected[0]).toMatchObject({ reason: "low_relevance" });
  });

  it("keeps specialist independent analysis hosts that look name-adjacent to the target", () => {
    const result = filterSourcesForDomain({
      domain: "sacra.com",
      sources: [
        {
          url: "https://sacrainsights.com/company/sacra",
          title: "Sacra company profile",
          sourceType: "news",
          fetchedAt: "2026-05-12T00:00:00.000Z",
          intent: "independent_analysis",
          rawText: "Sacra.com sells private-company revenue research and market data."
        },
        {
          url: "https://sacradata.io/about",
          title: "Sacra Data",
          sourceType: "news",
          fetchedAt: "2026-05-12T00:00:00.000Z",
          intent: "company_profile",
          rawText: "Sacra Data is a different company with a similar name."
        }
      ]
    });

    expect(result.accepted.map((source) => source.url)).toEqual(["https://sacrainsights.com/company/sacra"]);
    expect(result.rejected[0]).toMatchObject({ reason: "ambiguous_same_name_domain" });
  });

  it("keeps incentive-bearing VC firm analysis trusted for gating without relying on a tiny hand-picked firm list", () => {
    const result = filterSourcesForDomain({
      domain: "round.com",
      sources: [
        {
          url: "https://firstround.com/review/how-round-com-built-its-early-team",
          title: "How Round.com built its early team",
          sourceType: "news",
          fetchedAt: "2026-05-12T00:00:00.000Z",
          intent: "independent_analysis",
          rawText: "Round.com used founder-led hiring to build its first product team."
        }
      ]
    });

    expect(result.accepted.map((source) => source.url)).toEqual([
      "https://firstround.com/review/how-round-com-built-its-early-team"
    ]);
  });

  it("keeps independent benchmark sources instead of treating name overlap as a wrong company", () => {
    const result = filterSourcesForDomain({
      domain: "bench.com",
      sources: [
        {
          url: "https://www.swebench.com/",
          title: "SWE-bench Verified leaderboard",
          sourceType: "news",
          fetchedAt: "2026-05-12T00:00:00.000Z",
          intent: "independent_analysis",
          rawText: "Bench.com is not the benchmark publisher, but benchmark results can still be useful context."
        },
        {
          url: "https://benchly.io/about",
          title: "Benchly",
          sourceType: "news",
          fetchedAt: "2026-05-12T00:00:00.000Z",
          intent: "company_profile",
          rawText: "Benchly is a different company with a similar name."
        }
      ]
    });

    expect(result.accepted.map((source) => source.url)).toEqual(["https://www.swebench.com/"]);
    expect(result.rejected[0]).toMatchObject({ reason: "ambiguous_same_name_domain" });
  });

  it("keeps high-signal newsletter and transcript sources without making every similar domain trusted", () => {
    const result = filterSourcesForDomain({
      domain: "view.com",
      sources: [
        {
          url: "https://www.exponentialview.co/p/the-next-24-months-in-ai",
          title: "The next 24 months in AI",
          sourceType: "news",
          fetchedAt: "2026-05-12T00:00:00.000Z",
          intent: "independent_analysis",
          rawText: "View.com is mentioned as one example in the broader AI adoption market."
        },
        {
          url: "https://viewdata.io/about",
          title: "View Data",
          sourceType: "news",
          fetchedAt: "2026-05-12T00:00:00.000Z",
          intent: "company_profile",
          rawText: "View Data is a different company with a similar name."
        }
      ]
    });

    expect(result.accepted.map((source) => source.url)).toEqual([
      "https://www.exponentialview.co/p/the-next-24-months-in-ai"
    ]);
    expect(result.rejected[0]).toMatchObject({ reason: "ambiguous_same_name_domain" });
  });

  it("keeps expert transcript sources in the shared authority registry wired into the gate", () => {
    const result = filterSourcesForDomain({
      domain: "loss.com",
      sources: [
        {
          url: "https://colossus.com/article/inside-notion/",
          title: "Inside Notion",
          sourceType: "news",
          fetchedAt: "2026-05-12T00:00:00.000Z",
          intent: "independent_analysis",
          rawText: "Loss.com appears in the conversation as a customer example."
        }
      ]
    });

    expect(result.accepted.map((source) => source.url)).toEqual(["https://colossus.com/article/inside-notion/"]);
  });

  it("rejects trusted reporting when it is about a nearby but different company", () => {
    const result = filterSourcesForDomain({
      domain: "wabi.ai",
      sources: [
        {
          url: "https://techcrunch.com/2026/05/01/waabi-raises-1b",
          title: "Waabi raises $1B and expands into robotaxis with Uber",
          sourceType: "news",
          fetchedAt: "2026-06-04T00:00:00.000Z",
          intent: "funding",
          rawText: "Waabi is an autonomous-trucking company working with Uber."
        },
        {
          url: "https://wabi.ai",
          title: "Wabi",
          sourceType: "company_site",
          fetchedAt: "2026-06-04T00:00:00.000Z",
          intent: "company_profile",
          rawText: "Wabi.ai helps teams build AI workflows."
        }
      ]
    });

    expect(result.accepted.map((source) => source.url)).toEqual(["https://wabi.ai"]);
    expect(result.rejected[0]).toMatchObject({
      reason: "low_relevance",
      source: expect.objectContaining({ url: "https://techcrunch.com/2026/05/01/waabi-raises-1b" })
    });
  });

  it("summarizes accepted and rejected sources without raw source text", () => {
    const result = filterSourcesForDomain({
      domain: "cartesia.ai",
      sources: [
        {
          url: "https://cartesia.ai",
          title: "Cartesia",
          sourceType: "company_site",
          fetchedAt: "2026-05-12T00:00:00.000Z",
          rawText: "Cartesia source text"
        },
        {
          url: "ftp://cartesia.ai/file",
          title: "Bad protocol",
          sourceType: "news",
          fetchedAt: "2026-05-12T00:00:00.000Z",
          rawText: "Cartesia source text"
        }
      ]
    });

    expect(sourceGateTrace(result)).toEqual({
      acceptedCount: 1,
      rejectedCount: 1,
      acceptedSamples: [
        {
          url: "https://cartesia.ai",
          title: "Cartesia",
          sourceType: "company_site"
        }
      ],
      rejectedSamples: [
        {
          url: "ftp://cartesia.ai/file",
          title: "Bad protocol",
          sourceType: "news",
          reason: "unsupported_protocol"
        }
      ],
      acceptedByIntent: { none: 1 },
      rejectedByIntent: { none: 1 }
    });
  });

  it("breaks gate yield down by retrieval intent", () => {
    const result = filterSourcesForDomain({
      domain: "cartesia.ai",
      sources: [
        {
          url: "https://cartesia.ai/customers/acme",
          title: "Acme runs Cartesia in production",
          sourceType: "company_site",
          fetchedAt: "2026-05-12T00:00:00.000Z",
          intent: "customer_proof",
          rawText: "Acme deployed Cartesia voice models in production."
        },
        {
          url: "https://github.com/cartesia-ai/cartesia-python",
          title: "cartesia-ai/cartesia-python",
          sourceType: "news",
          fetchedAt: "2026-05-12T00:00:00.000Z",
          intent: "product_proof",
          rawText: "Official Cartesia python client library and API documentation."
        },
        {
          url: "https://unrelated.example/post",
          title: "Unrelated roundup",
          sourceType: "news",
          fetchedAt: "2026-05-12T00:00:00.000Z",
          intent: "customer_proof",
          rawText: "A list of tools with no mention of the target company."
        }
      ]
    });

    const trace = sourceGateTrace(result);
    expect(trace.acceptedByIntent).toEqual({ customer_proof: 1, product_proof: 1 });
    expect(trace.rejectedByIntent).toEqual({ customer_proof: 1 });
  });
});
