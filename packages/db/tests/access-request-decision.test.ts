import { describe, expect, it } from "vitest";

import { accessRequestDecision } from "../src/repositories/access-requests";

describe("accessRequestDecision", () => {
  it("rate limits by ip once the recent count reaches 3", () => {
    expect(accessRequestDecision({ recentFromIp: 3, recentFromEmail: 0 })).toBe("rate_limited_ip");
  });

  it("rate limits by email once the recent count reaches 1", () => {
    expect(accessRequestDecision({ recentFromIp: 0, recentFromEmail: 1 })).toBe("rate_limited_email");
  });

  it("allows creation when both counts are zero", () => {
    expect(accessRequestDecision({ recentFromIp: 0, recentFromEmail: 0 })).toBe("created");
  });

  it("checks the ip limit before the email limit", () => {
    expect(accessRequestDecision({ recentFromIp: 3, recentFromEmail: 1 })).toBe("rate_limited_ip");
  });
});
