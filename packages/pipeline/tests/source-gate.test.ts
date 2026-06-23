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
      ]
    });
  });
});
