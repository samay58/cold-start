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
});
