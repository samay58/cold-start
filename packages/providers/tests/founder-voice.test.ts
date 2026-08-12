import { describe, expect, it } from "vitest";
import { fetchBlueskyLane } from "../src/founder-voice/bluesky";
import { fetchGithubLane } from "../src/founder-voice/github";
import { fetchHnLane } from "../src/founder-voice/hn";
import type { FounderVoiceTargets } from "../src/founder-voice/types";

const TARGETS: FounderVoiceTargets = {
  companyName: "Acme",
  domain: "acme.com",
  founders: [{ name: "Jane Founder", xUrl: null, githubUrl: null }],
};

function stubJson(payload: unknown, status = 200): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;
}

function stubJsonByUrl(matchers: Array<{ test: (url: string) => boolean; payload: unknown; status?: number }>): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    const matcher = matchers.find((candidate) => candidate.test(url));
    if (!matcher) {
      throw new Error(`no stub matched url: ${url}`);
    }
    return new Response(JSON.stringify(matcher.payload), {
      status: matcher.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

describe("fetchHnLane", () => {
  it("marks Show HN and company-domain stories as company voice", async () => {
    const fetchFn = stubJson({
      hits: [
        {
          title: "Show HN: Acme fast voice API",
          url: "https://acme.com/launch",
          author: "acmefounder",
          points: 120,
          created_at: "2026-07-01T00:00:00Z",
          story_text: null,
          objectID: "1",
        },
        {
          title: "Acme raises $20M",
          url: "https://techcrunch.com/acme",
          author: "reporter",
          points: 45,
          created_at: "2026-06-01T00:00:00Z",
          story_text: null,
          objectID: "2",
        },
      ],
    });

    const result = await fetchHnLane({ targets: TARGETS, timeoutMs: 5000, fetchFn });

    expect(result.lane).toBe("hn_search");
    expect(result.items[0]?.authorship).toBe("company");
    expect(result.items[1]?.authorship).toBe("third_party");
    expect(result.estimatedCostUsd).toBe(0);
    expect(result.failure).toBeUndefined();
  });

  it("dedupes hits that appear in both the domain and Show HN searches", async () => {
    const fetchFn = stubJson({
      hits: [
        {
          title: "Show HN: Acme fast voice API",
          url: "https://acme.com/launch",
          author: "acmefounder",
          points: 120,
          created_at: "2026-07-01T00:00:00Z",
          story_text: "We built Acme to make voice fast.",
          objectID: "1",
        },
      ],
    });

    const result = await fetchHnLane({ targets: TARGETS, timeoutMs: 5000, fetchFn });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      url: "https://acme.com/launch",
      title: "Show HN: Acme fast voice API",
      text: "We built Acme to make voice fast.",
      publishedAt: "2026-07-01T00:00:00Z",
    });
  });

  it("falls back to the HN item URL and title when story_text is absent", async () => {
    const fetchFn = stubJson({
      hits: [
        {
          title: "Acme launches",
          url: null,
          author: "acmefounder",
          points: 10,
          created_at: "2026-05-01T00:00:00Z",
          story_text: null,
          objectID: "42",
        },
      ],
    });

    const result = await fetchHnLane({ targets: TARGETS, timeoutMs: 5000, fetchFn });

    expect(result.items[0]).toMatchObject({
      url: "https://news.ycombinator.com/item?id=42",
      text: "Acme launches",
    });
  });

  it("returns an empty, non-failed result when there are no hits", async () => {
    const fetchFn = stubJson({ hits: [] });

    const result = await fetchHnLane({ targets: TARGETS, timeoutMs: 5000, fetchFn });

    expect(result.items).toEqual([]);
    expect(result.failure).toBeUndefined();
  });

  it("resolves to a failure result instead of throwing when the fetch rejects", async () => {
    const fetchFn = async () => {
      throw new Error("network down");
    };

    const result = await fetchHnLane({ targets: TARGETS, timeoutMs: 5000, fetchFn: fetchFn as typeof fetch });

    expect(result.items).toEqual([]);
    expect(result.failure).toContain("network down");
  });

  it("resolves to a failure result on a non-ok HTTP response", async () => {
    const fetchFn = stubJson({ error: "rate limited" }, 429);

    const result = await fetchHnLane({ targets: TARGETS, timeoutMs: 5000, fetchFn });

    expect(result.items).toEqual([]);
    expect(result.failure).toBeTruthy();
  });
});

describe("fetchGithubLane", () => {
  const founderTargets: FounderVoiceTargets = {
    companyName: "Acme",
    domain: "acme.com",
    founders: [{ name: "Jane Founder", xUrl: null, githubUrl: "https://github.com/octofounder" }],
  };

  it("reads repo descriptions and push activity for founders with a githubUrl, sending the token header", async () => {
    let sawAuthHeader = false;

    const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const headers = new Headers(init?.headers);
      if (headers.get("Authorization") === "Bearer gh-token") {
        sawAuthHeader = true;
      }
      expect(headers.get("X-GitHub-Api-Version")).toBe("2022-11-28");

      if (url.includes("/repos")) {
        return new Response(
          JSON.stringify([
            { name: "acme-core", description: "The core Acme voice engine.", html_url: "https://github.com/octofounder/acme-core" },
            { name: "empty-repo", description: null, html_url: "https://github.com/octofounder/empty-repo" },
          ]),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      if (url.includes("/events/public")) {
        return new Response(
          JSON.stringify([
            {
              type: "PushEvent",
              created_at: "2026-07-10T00:00:00Z",
              repo: { name: "octofounder/acme-core" },
              payload: { commits: [{ sha: "abc123", message: "Ship faster voice decoding" }] },
            },
            {
              type: "WatchEvent",
              created_at: "2026-07-09T00:00:00Z",
              repo: { name: "octofounder/acme-core" },
              payload: {},
            },
          ]),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      throw new Error(`unexpected url: ${url}`);
    }) as typeof fetch;

    const result = await fetchGithubLane({ targets: founderTargets, githubToken: "gh-token", timeoutMs: 5000, fetchFn });

    expect(result.lane).toBe("github_author_activity");
    expect(sawAuthHeader).toBe(true);
    expect(result.failure).toBeUndefined();
    expect(result.items.every((item) => item.authorship === "founder")).toBe(true);
    expect(result.items.every((item) => item.authorName === "Jane Founder")).toBe(true);
    expect(result.items).toContainEqual(
      expect.objectContaining({ title: "acme-core", text: "The core Acme voice engine." }),
    );
    expect(result.items).toContainEqual(
      expect.objectContaining({ text: "Ship faster voice decoding" }),
    );
    // WatchEvent carries no founder voice text, so it contributes no item.
    expect(result.items).toHaveLength(2);
  });

  it("skips founders with no githubUrl and omits the Authorization header when no token is given", async () => {
    let sawAuthHeader = false;
    const fetchFn = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      if (headers.get("Authorization")) {
        sawAuthHeader = true;
      }
      return new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;

    const result = await fetchGithubLane({
      targets: { companyName: "Acme", domain: "acme.com", founders: [{ name: "No Github", xUrl: null, githubUrl: null }] },
      timeoutMs: 5000,
      fetchFn,
    });

    expect(result.items).toEqual([]);
    expect(result.failure).toBeUndefined();
    expect(sawAuthHeader).toBe(false);
  });

  it("resolves to a failure result instead of throwing when a request rejects", async () => {
    const fetchFn = async () => {
      throw new Error("github is down");
    };

    const result = await fetchGithubLane({ targets: founderTargets, timeoutMs: 5000, fetchFn: fetchFn as typeof fetch });

    expect(result.items).toEqual([]);
    expect(result.failure).toContain("github is down");
  });
});

describe("fetchBlueskyLane", () => {
  it("only adopts an actor whose displayName matches the founder and whose bio names the company", async () => {
    const fetchFn = stubJsonByUrl([
      {
        test: (url) => url.includes("searchActors"),
        payload: {
          actors: [
            { did: "did:plc:other", handle: "someoneelse.bsky.social", displayName: "Jane Founder", description: "Just a person, no company mention." },
            { did: "did:plc:jane", handle: "janefounder.bsky.social", displayName: "Jane Founder", description: "Building Acme, the voice API company." },
          ],
        },
      },
      {
        test: (url) => url.includes("getAuthorFeed"),
        payload: {
          feed: [
            {
              post: {
                uri: "at://did:plc:jane/app.bsky.feed.post/abc123",
                record: { text: "Excited to ship our new Acme release today.", createdAt: "2026-07-05T00:00:00Z" },
              },
            },
          ],
        },
      },
    ]);

    const result = await fetchBlueskyLane({ targets: TARGETS, timeoutMs: 5000, fetchFn });

    expect(result.lane).toBe("bluesky_author_feed");
    expect(result.failure).toBeUndefined();
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      url: "https://bsky.app/profile/janefounder.bsky.social/post/abc123",
      text: "Excited to ship our new Acme release today.",
      authorship: "founder",
      authorName: "Jane Founder",
      publishedAt: "2026-07-05T00:00:00Z",
    });
  });

  it("returns an empty, non-failed result when no actor matches", async () => {
    const fetchFn = stubJsonByUrl([
      {
        test: (url) => url.includes("searchActors"),
        payload: {
          actors: [
            { did: "did:plc:other", handle: "someoneelse.bsky.social", displayName: "Someone Else", description: "Not the founder." },
          ],
        },
      },
      {
        test: (url) => url.includes("getAuthorFeed"),
        payload: { feed: [] },
      },
    ]);

    const result = await fetchBlueskyLane({ targets: TARGETS, timeoutMs: 5000, fetchFn });

    expect(result.items).toEqual([]);
    expect(result.failure).toBeUndefined();
  });

  it("resolves to a failure result instead of throwing when a request rejects", async () => {
    const fetchFn = async () => {
      throw new Error("bluesky is down");
    };

    const result = await fetchBlueskyLane({ targets: TARGETS, timeoutMs: 5000, fetchFn: fetchFn as typeof fetch });

    expect(result.items).toEqual([]);
    expect(result.failure).toContain("bluesky is down");
  });
});
