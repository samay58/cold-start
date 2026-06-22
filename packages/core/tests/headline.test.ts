import { describe, expect, it } from "vitest";
import { newsworthyTitlePattern, titleMentionsCompany } from "../src/index";

describe("newsworthyTitlePattern", () => {
  it("matches funding, launch, and M&A headlines", () => {
    const matching = [
      "Exa raises $7M seed",
      "Runloop raising a Series A",
      "Acme announces Series B funding",
      "Foo launches its developer platform",
      "Bar unveils new API",
      "Baz acquired by MegaCorp",
      "Qux completes acquisition of Widget",
      "Startup valued at $1B",
      "Company backed by Sequoia",
      "Startup is going public next quarter",
      "Firm files for an IPO",
      "Team closes $50M round"
    ];
    for (const title of matching) {
      expect(newsworthyTitlePattern.test(title)).toBe(true);
    }
  });

  it("does not match homepage taglines or generic page titles", () => {
    const nonMatching = [
      "Exa - Search infrastructure for AI",
      "About Runloop",
      "Acme Documentation",
      "Pricing | Foo",
      "The home for developer tools"
    ];
    for (const title of nonMatching) {
      expect(newsworthyTitlePattern.test(title)).toBe(false);
    }
  });

  it("stays narrow: tempting adjacent terms are deliberately excluded", () => {
    // These read as company news but are not funding, launch, or M&A. Adding any of them would
    // widen the slip's unverified surface, which the review ruled out. This test fails the moment
    // someone broadens the pattern to cover them.
    const excluded = [
      "Exa is hiring engineers",
      "Runloop expands to Europe",
      "Acme names a new CTO",
      "Foo publishes its annual report",
      "Bar reaches a growth milestone",
      "Baz appoints a board member"
    ];
    for (const title of excluded) {
      expect(newsworthyTitlePattern.test(title)).toBe(false);
    }
  });
});

describe("titleMentionsCompany", () => {
  it("matches on the company name", () => {
    expect(titleMentionsCompany("Exa raises $7M seed", { name: "Exa", domain: "exa.ai" })).toBe(true);
  });

  it("matches on the domain root when the name is absent, ignoring www and case", () => {
    expect(titleMentionsCompany("EXA launches an API", { name: null, domain: "www.exa.ai" })).toBe(true);
  });

  it("rejects a headline that names a different company", () => {
    expect(titleMentionsCompany("Acme raises $50M Series C", { name: "Exa", domain: "exa.ai" })).toBe(false);
  });

  it("ignores names and roots shorter than three characters", () => {
    // A two-letter root must not match arbitrary substrings: "available" contains "ai", but a
    // two-character company token is too weak to attribute a headline.
    expect(titleMentionsCompany("now available to everyone", { name: "AI", domain: "ai.co" })).toBe(false);
  });
});
