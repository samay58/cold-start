import { describe, expect, it } from "vitest";
import { sourceTypeHintForHost } from "../src/index";

describe("sourceTypeHintForHost", () => {
  it("classifies developer platform hosts as github", () => {
    expect(sourceTypeHintForHost("github.com")).toBe("github");
    expect(sourceTypeHintForHost("docs.github.com")).toBe("github");
    expect(sourceTypeHintForHost("huggingface.co")).toBe("github");
  });

  it("classifies public-record hosts as filing", () => {
    expect(sourceTypeHintForHost("sec.gov")).toBe("filing");
    expect(sourceTypeHintForHost("federalregister.gov")).toBe("filing");
  });

  it("classifies professional/funding-database hosts (LinkedIn, Crunchbase, PitchBook) as other", () => {
    expect(sourceTypeHintForHost("linkedin.com")).toBe("other");
    expect(sourceTypeHintForHost("crunchbase.com")).toBe("other");
    expect(sourceTypeHintForHost("pitchbook.com")).toBe("other");
  });

  it("returns null for an unclassified host, leaving the caller's default in place", () => {
    expect(sourceTypeHintForHost("techcrunch.com")).toBeNull();
    expect(sourceTypeHintForHost("some-random-blog.example")).toBeNull();
  });
});
