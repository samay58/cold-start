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
