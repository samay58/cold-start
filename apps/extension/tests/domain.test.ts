import { describe, expect, it } from "vitest";
import { activeTabDomain } from "../src/domain";

describe("activeTabDomain", () => {
  it("normalizes a tab URL hostname", () => {
    expect(activeTabDomain("https://www.Linear.app/customers")).toBe("linear.app");
  });

  it("does not strip non-leading www labels", () => {
    expect(activeTabDomain("https://docs.www.example.com/path")).toBe("docs.www.example.com");
  });

  it.each([undefined, "", "chrome://extensions", "about:blank", "mailto:hello@example.com"])(
    "returns null for unsupported tab URL %s",
    (url) => {
      expect(activeTabDomain(url)).toBeNull();
    }
  );
});
