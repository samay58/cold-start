import { describe, expect, it } from "vitest";
import { sourceQualityForSource, sourceQualityRank } from "../src/index";

describe("sourceQualityForSource", () => {
  it("ranks independent technical writing above company press releases", () => {
    const independent = {
      url: "https://example.substack.com/p/twelvelabs-technical-deep-dive",
      title: "TwelveLabs technical deep dive",
      sourceType: "news" as const,
    };
    const press = {
      url: "https://www.businesswire.com/news/home/example",
      title: "TwelveLabs Announces Funding",
      sourceType: "news" as const,
    };

    expect(sourceQualityForSource(independent)).toMatchObject({
      tier: "independent_technical",
      label: "Independent technical",
    });
    expect(sourceQualityForSource(press)).toMatchObject({
      tier: "press_release",
      label: "Company PR",
    });
    expect(sourceQualityRank(independent)).toBeGreaterThan(sourceQualityRank(press));
  });

  it("treats company pages as primary but incentive-shaped", () => {
    expect(
      sourceQualityForSource({
        url: "https://twelvelabs.io",
        title: "TwelveLabs",
        sourceType: "company_site",
      }),
    ).toMatchObject({
      tier: "primary_company",
      incentive: "Company positioning.",
    });
  });

  it("treats target-domain pages fetched as news as company-authored", () => {
    expect(
      sourceQualityForSource(
        {
          url: "https://www.notablehealth.com/customers/inova-health",
          title: "Inova Health taps Notable to utilize intelligent AI agents",
          sourceType: "news",
        },
        { targetDomain: "notablehealth.com" },
      ),
    ).toMatchObject({
      tier: "primary_company",
      label: "Company-authored",
      incentive: "Company positioning.",
    });
  });

  it("does not treat LinkedIn as independent company judgment", () => {
    expect(
      sourceQualityForSource({
        url: "https://www.linkedin.com/company/notable-health",
        title: "Notable LinkedIn",
        sourceType: "news",
      }),
    ).toMatchObject({
      tier: "enrichment",
      label: "Professional profile",
    });
  });

  it("never upgrades company-site sources to independent labels", () => {
    expect(
      sourceQualityForSource({
        url: "https://semianalysis.com/about",
        title: "SemiAnalysis company technical deep dive",
        sourceType: "company_site",
      }),
    ).toMatchObject({
      tier: "primary_company",
      label: "Company-authored",
    });
  });

  it("recognizes specialist AI and market-analysis sources without treating every Substack as technical", () => {
    const semianalysis = {
      url: "https://semianalysis.com/2026/01/01/inference-economics",
      title: "Inference economics and GPU supply",
      sourceType: "news" as const,
    };
    const strebulaev = {
      url: "https://ilyastrebulaev.substack.com/p/ranking-venture-investors",
      title: "Ranking Venture Investors",
      sourceType: "news" as const,
    };
    const genericSubstack = {
      url: "https://randomstartupnotes.substack.com/p/why-ai-will-change-everything",
      title: "Why AI will change everything",
      sourceType: "news" as const,
    };

    expect(sourceQualityForSource(semianalysis)).toMatchObject({
      tier: "independent_technical",
      label: "Independent technical",
    });
    expect(sourceQualityForSource(strebulaev)).toMatchObject({
      tier: "independent_analysis",
      label: "Independent analysis",
    });
    expect(sourceQualityForSource(genericSubstack)).toMatchObject({
      tier: "independent_report",
      label: "Independent report",
    });
  });

  it("keeps press-release wires separate from independent analysis", () => {
    expect(
      sourceQualityForSource({
        url: "https://www.prnewswire.com/news-releases/example-company-announces-series-b-302000000.html",
        title: "Example Company Announces Series B",
        sourceType: "news",
      }),
    ).toMatchObject({
      tier: "press_release",
      label: "Company PR",
    });
  });

  it("ranks VC firm writing below independent technical and analyst sources", () => {
    const technical = {
      url: "https://semianalysis.com/2026/01/01/inference-economics",
      title: "Inference economics and GPU supply",
      sourceType: "news" as const,
    };
    const analyst = {
      url: "https://sacrainsights.com/company/example",
      title: "Example company revenue analysis",
      sourceType: "news" as const,
    };
    const vc = {
      url: "https://www.generalcatalyst.com/perspectives/example-company-thesis",
      title: "Example Company thesis",
      sourceType: "news" as const,
    };

    expect(sourceQualityForSource(vc)).toMatchObject({
      tier: "independent_report",
      label: "Investor-authored",
      incentive: "Investor and portfolio incentives.",
    });
    expect(sourceQualityRank(technical)).toBeGreaterThan(sourceQualityRank(vc));
    expect(sourceQualityRank(analyst)).toBeGreaterThan(sourceQualityRank(vc));
  });

  it("treats independent benchmark and model-evaluation sources as technical evidence", () => {
    const artificialAnalysis = {
      url: "https://artificialanalysis.ai/models",
      title: "Independent model benchmark results",
      sourceType: "news" as const,
    };
    const sweBench = {
      url: "https://www.swebench.com/",
      title: "SWE-bench Verified leaderboard",
      sourceType: "news" as const,
    };

    expect(sourceQualityForSource(artificialAnalysis)).toMatchObject({
      tier: "independent_technical",
      label: "Independent technical",
    });
    expect(sourceQualityForSource(sweBench)).toMatchObject({
      tier: "independent_technical",
      label: "Independent technical",
    });
  });

  it("keeps expert transcripts and credible newsletters useful without overpromoting them", () => {
    const colossus = {
      url: "https://colossus.com/article/inside-notion/",
      title: "Inside Notion",
      sourceType: "news" as const,
    };
    const exponentialView = {
      url: "https://www.exponentialview.co/p/the-next-24-months-in-ai",
      title: "The next 24 months in AI",
      sourceType: "news" as const,
    };

    expect(sourceQualityForSource(colossus)).toMatchObject({
      tier: "independent_report",
      label: "Expert transcript",
    });
    expect(sourceQualityForSource(exponentialView)).toMatchObject({
      tier: "independent_analysis",
      label: "Independent analysis",
    });
  });

  it("accepts VC market-map research as useful but incentive-bearing", () => {
    const firstmark = {
      url: "https://firstmark.com/story/bubble-build-the-2025-mad-machine-learning-ai-data-landscape/",
      title: "Bubble and Build: The 2025 MAD Landscape",
      sourceType: "news" as const,
    };
    const madrona = {
      url: "https://www.madrona.com/intelligent-applications-40-2025/",
      title: "Introducing the 2025 Intelligent Applications 40",
      sourceType: "news" as const,
    };

    expect(sourceQualityForSource(firstmark)).toMatchObject({
      tier: "independent_report",
      label: "Investor-authored",
    });
    expect(sourceQualityForSource(madrona)).toMatchObject({
      tier: "independent_report",
      label: "Investor-authored",
    });
  });
});
