import { describe, expect, it } from "vitest";
import { fetchGithubContacts, isGithubContactsResult } from "../src/github-contacts";

type Handler = (url: string) => { status: number; body: unknown } | null;

function mockFetcher(handler: Handler) {
  const calls: string[] = [];
  const fetcher = async (url: string) => {
    calls.push(url);
    const hit = handler(url);
    const status = hit?.status ?? 404;
    const body = hit?.body ?? {};
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body)
    };
  };
  return { fetcher, calls };
}

const acmeHandler: Handler = (url) => {
  if (url.includes("/users/acme") && !url.includes("/repos")) {
    return { status: 200, body: { login: "acme", type: "Organization", blog: "https://acme.ai", name: "Acme AI", email: null } };
  }
  if (url.includes("/orgs/acme/repos") || url.includes("/users/acme/repos")) {
    return { status: 200, body: [{ name: "core", fork: false, stargazers_count: 100, homepage: "https://acme.ai" }] };
  }
  if (url.includes("/repos/acme/core/commits")) {
    return {
      status: 200,
      body: [
        { html_url: "https://github.com/acme/core/commit/1", commit: { author: { email: "noah.tye@acme.ai", name: "Noah Tye" } } },
        { html_url: "https://github.com/acme/core/commit/2", commit: { author: { email: "support@acme.ai", name: null } } },
        { html_url: "https://github.com/acme/core/commit/3", commit: { author: { email: "x@users.noreply.github.com", name: "Ghost" } } },
        { html_url: "https://github.com/acme/core/commit/4", commit: { author: { email: "friend@gmail.com", name: "Friend" } } }
      ]
    };
  }
  return null;
};

describe("fetchGithubContacts", () => {
  it("harvests only real @company-domain human emails and derives the pattern", async () => {
    const { fetcher } = mockFetcher(acmeHandler);
    const result = await fetchGithubContacts({ domain: "acme.ai", companyName: "Acme AI", fetcher });

    expect(isGithubContactsResult(result)).toBe(true);
    if (!isGithubContactsResult(result)) return;

    expect(result.org).toBe("acme");
    const emails = result.observed.map((o) => o.email);
    expect(emails).toContain("noah.tye@acme.ai");
    expect(emails).not.toContain("support@acme.ai"); // role alias
    expect(emails).not.toContain("x@users.noreply.github.com"); // noreply
    expect(emails).not.toContain("friend@gmail.com"); // off-domain personal
    expect(result.observed[0]?.sourceUrl).toBe("https://github.com/acme/core/commit/1");
    expect(result.pattern).toBe("first.last");
    expect(result.sources[0]?.sourceType).toBe("github");
    expect(result.trace.estimatedCostUsd).toBe(0);
  });

  it("returns a failure (never throws) when no org resolves", async () => {
    const { fetcher } = mockFetcher(() => ({ status: 404, body: {} }));
    const result = await fetchGithubContacts({ domain: "nowhere.example", companyName: "Nowhere", fetcher });
    expect(isGithubContactsResult(result)).toBe(false);
    if (isGithubContactsResult(result)) return;
    expect(result.found).toBe(false);
    expect(result.trace.estimatedCostUsd).toBe(0);
  });

  it("tries the curated canonical login before generic guesses", async () => {
    const { fetcher, calls } = mockFetcher((url) => {
      if (url.includes("/users/snowflakedb") && !url.includes("/repos")) {
        return {
          status: 200,
          body: { login: "snowflakedb", type: "Organization", blog: "https://snowflake.com", name: "Snowflake", email: null }
        };
      }
      if (url.includes("/orgs/snowflakedb/repos")) {
        return { status: 200, body: [] };
      }
      return null;
    });

    const result = await fetchGithubContacts({ domain: "snowflake.com", companyName: "Snowflake", fetcher });

    expect(isGithubContactsResult(result)).toBe(true);
    if (!isGithubContactsResult(result)) return;
    expect(result.org).toBe("snowflakedb");
    expect(calls[0]).toContain("/users/snowflakedb");
  });

  it("requires a website match in search results instead of accepting a plausible name", async () => {
    const { fetcher } = mockFetcher((url) => {
      if (url.includes("/search/users")) {
        return { status: 200, body: { items: [{ login: "acme-lookalike" }, { login: "acme-canonical" }] } };
      }
      if (url.includes("/users/acme-lookalike")) {
        return {
          status: 200,
          body: { login: "acme-lookalike", type: "Organization", blog: "https://wrong.example", name: "Acme Labs", email: null }
        };
      }
      if (url.includes("/users/acme-canonical")) {
        return {
          status: 200,
          body: { login: "acme-canonical", type: "Organization", blog: "https://acme.example", name: "Different profile label", email: null }
        };
      }
      if (url.includes("/orgs/acme-canonical/repos")) {
        return { status: 200, body: [] };
      }
      return null;
    });

    const result = await fetchGithubContacts({ domain: "acme.example", companyName: "Acme Labs", fetcher });

    expect(isGithubContactsResult(result)).toBe(true);
    if (!isGithubContactsResult(result)) return;
    expect(result.org).toBe("acme-canonical");
  });
});
