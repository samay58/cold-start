import { describe, expect, it } from "vitest";

import robots from "../src/app/robots";

describe("robots", () => {
  it("disallows the personalized invite lane alongside the extension API", () => {
    const result = robots();
    const rules = Array.isArray(result.rules) ? result.rules[0] : result.rules;

    expect(rules?.disallow).toContain("/i/");
    expect(rules?.disallow).toContain("/api/extension/");
  });
});
