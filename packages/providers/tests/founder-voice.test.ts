import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchBlueskyLane } from "../src/founder-voice/bluesky";
import { fetchExaWebLane } from "../src/founder-voice/exa-web";
import { fetchGithubLane } from "../src/founder-voice/github";
import { fetchHnLane } from "../src/founder-voice/hn";
import { fetchFounderVoiceEvidence } from "../src/founder-voice/index";
import { fetchXaiXSearchLane } from "../src/founder-voice/xai-x-search";
import type { FounderVoiceLaneResult, FounderVoiceTargets } from "../src/founder-voice/types";

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

  it("skips founders with no githubUrl without making any request", async () => {
    const fetchFn = (async () => {
      throw new Error("fetchFn should not be called for a founder with no githubUrl");
    }) as typeof fetch;

    const result = await fetchGithubLane({
      targets: { companyName: "Acme", domain: "acme.com", founders: [{ name: "No Github", xUrl: null, githubUrl: null }] },
      timeoutMs: 5000,
      fetchFn,
    });

    expect(result.items).toEqual([]);
    expect(result.failure).toBeUndefined();
  });

  it("omits the Authorization header when a founder has a githubUrl but no token is given", async () => {
    let sawAuthHeader = false;
    let fetchCalls = 0;
    const fetchFn = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      fetchCalls += 1;
      const headers = new Headers(init?.headers);
      if (headers.get("Authorization")) {
        sawAuthHeader = true;
      }
      expect(headers.get("X-GitHub-Api-Version")).toBe("2022-11-28");
      return new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;

    const result = await fetchGithubLane({ targets: founderTargets, timeoutMs: 5000, fetchFn });

    // Proves the header assertions above actually ran against a real request, not a
    // vacuously-passing test where fetchFn was never invoked.
    expect(fetchCalls).toBeGreaterThan(0);
    expect(sawAuthHeader).toBe(false);
    expect(result.items).toEqual([]);
    expect(result.failure).toBeUndefined();
  });

  it("caps event-derived items at 10 per founder even when more qualifying events come back", async () => {
    const events = Array.from({ length: 15 }, (_, index) => ({
      type: "PushEvent",
      created_at: `2026-07-${String((index % 27) + 1).padStart(2, "0")}T00:00:00Z`,
      repo: { name: "octofounder/acme-core" },
      payload: { commits: [{ sha: `sha${index}`, message: `Commit number ${index}` }] },
    }));

    const fetchFn = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/repos")) {
        return new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.includes("/events/public")) {
        return new Response(JSON.stringify(events), { status: 200, headers: { "content-type": "application/json" } });
      }
      throw new Error(`unexpected url: ${url}`);
    }) as typeof fetch;

    const result = await fetchGithubLane({ targets: founderTargets, timeoutMs: 5000, fetchFn });

    expect(result.failure).toBeUndefined();
    expect(result.items).toHaveLength(10);
  });

  it("records a failure entry, never throwing, when a request returns a non-ok status", async () => {
    const fetchFn = (async () =>
      new Response(JSON.stringify({ message: "Not Found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      })) as typeof fetch;

    const result = await fetchGithubLane({ targets: founderTargets, timeoutMs: 5000, fetchFn });

    expect(result.items).toEqual([]);
    expect(result.failure).toBeTruthy();
    expect(result.failure).toContain("404");
  });

  it("resolves to a failure result instead of throwing when a request rejects", async () => {
    const fetchFn = async () => {
      throw new Error("github is down");
    };

    const result = await fetchGithubLane({ targets: founderTargets, timeoutMs: 5000, fetchFn: fetchFn as typeof fetch });

    expect(result.items).toEqual([]);
    expect(result.failure).toContain("github is down");
  });

  it("keeps a successful founder's items and records a per-founder failure when a sibling founder's account is gone", async () => {
    const fetchFn = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("deletedaccount")) {
        return new Response(JSON.stringify({ message: "Not Found" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("/repos")) {
        return new Response(
          JSON.stringify([
            { name: "acme-core", description: "The core Acme voice engine.", html_url: "https://github.com/octofounder/acme-core" },
          ]),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("/events/public")) {
        return new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json" } });
      }
      throw new Error(`unexpected url: ${url}`);
    }) as typeof fetch;

    const result = await fetchGithubLane({
      targets: {
        companyName: "Acme",
        domain: "acme.com",
        founders: [
          { name: "Deleted Founder", xUrl: null, githubUrl: "https://github.com/deletedaccount" },
          { name: "Jane Founder", xUrl: null, githubUrl: "https://github.com/octofounder" },
        ],
      },
      timeoutMs: 5000,
      fetchFn,
    });

    // The first founder's failure must not discard the second founder's already-fetched items,
    // and the second founder must still be attempted even though the first one failed.
    expect(result.items).toEqual([expect.objectContaining({ authorName: "Jane Founder", title: "acme-core" })]);
    expect(result.failure).toBeTruthy();
    expect(result.failure).toContain("Deleted Founder");
    expect(result.failure).toContain("404");
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

  it("records a failure entry, never throwing, when the actor search returns a non-ok status", async () => {
    const fetchFn = (async () =>
      new Response(JSON.stringify({ error: "server error" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      })) as typeof fetch;

    const result = await fetchBlueskyLane({ targets: TARGETS, timeoutMs: 5000, fetchFn });

    expect(result.items).toEqual([]);
    expect(result.failure).toBeTruthy();
    expect(result.failure).toContain("500");
  });

  it("keeps a successful founder's items and records a per-founder failure when a sibling founder's fetch fails", async () => {
    const fetchFn = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("searchActors") && url.includes(encodeURIComponent("Down Founder"))) {
        throw new Error("bluesky search down");
      }
      if (url.includes("searchActors") && url.includes(encodeURIComponent("Up Founder"))) {
        return new Response(
          JSON.stringify({
            actors: [
              { did: "did:plc:up", handle: "upfounder.bsky.social", displayName: "Up Founder", description: "Building Acme." },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("getAuthorFeed")) {
        return new Response(
          JSON.stringify({
            feed: [
              {
                post: {
                  uri: "at://did:plc:up/app.bsky.feed.post/xyz789",
                  record: { text: "Shipping Acme updates today.", createdAt: "2026-07-06T00:00:00Z" },
                },
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      throw new Error(`unexpected url: ${url}`);
    }) as typeof fetch;

    const result = await fetchBlueskyLane({
      targets: {
        companyName: "Acme",
        domain: "acme.com",
        founders: [
          { name: "Down Founder", xUrl: null, githubUrl: null },
          { name: "Up Founder", xUrl: null, githubUrl: null },
        ],
      },
      timeoutMs: 5000,
      fetchFn,
    });

    // The first founder's failure must not discard the second founder's already-fetched items,
    // and the second founder must still be attempted even though the first one failed.
    expect(result.items).toEqual([
      expect.objectContaining({
        authorName: "Up Founder",
        url: "https://bsky.app/profile/upfounder.bsky.social/post/xyz789",
      }),
    ]);
    expect(result.failure).toBeTruthy();
    expect(result.failure).toContain("Down Founder");
    expect(result.failure).toContain("bluesky search down");
  });
});

// Wire shape verified live against https://api.x.ai/v1/responses on 2026-08-12 (see
// xai-x-search.ts's header comment for the full probe record). The tool only works on
// the Responses API, not /v1/chat/completions, and the model ignores allowed_x_handles
// unless the handle is also spelled out in the prompt text, so these fixtures mirror the
// real {output: [...]} shape rather than a chat-completions choices[].message.content shape.
describe("fetchXaiXSearchLane", () => {
  const xaiTargets: FounderVoiceTargets = {
    companyName: "Acme",
    domain: "acme.com",
    founders: [{ name: "Jane Founder", xUrl: "https://x.com/acmefounder", githubUrl: null }],
  };

  function stubXaiResponse(text: string, status = 200): typeof fetch {
    return (async () =>
      new Response(
        JSON.stringify({
          output: [
            { type: "custom_tool_call", name: "x_keyword_search" },
            { type: "message", role: "assistant", content: [{ type: "output_text", text }] },
          ],
        }),
        { status, headers: { "content-type": "application/json" } },
      )) as typeof fetch;
  }

  it("restricts the tool block to derivable handles and parses the JSON post array", async () => {
    let sawRequest: { url: string; body: Record<string, unknown> } | null = null;

    const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
      sawRequest = { url: String(input), body: JSON.parse(String(init?.body)) as Record<string, unknown> };
      return new Response(
        JSON.stringify({
          output: [
            {
              type: "message",
              role: "assistant",
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify([
                    { handle: "acmefounder", date: "2026-07-01", url: "https://x.com/acmefounder/status/1", text: "Shipping Acme today." },
                    { handle: "acmefounder", date: "2026-06-01", url: "https://x.com/acmefounder/status/2", text: "Acme raised a round." },
                  ]),
                },
              ],
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;

    const result = await fetchXaiXSearchLane({ targets: xaiTargets, xaiApiKey: "xai-key", timeoutMs: 30_000, fetchFn });

    expect(sawRequest).not.toBeNull();
    const body = sawRequest!.body as { tools: Array<{ type: string; allowed_x_handles: string[] }> };
    expect(body.tools[0]?.type).toBe("x_search");
    expect(body.tools[0]?.allowed_x_handles).toEqual(["acmefounder"]);

    expect(result.lane).toBe("xai_x_search");
    expect(result.failure).toBeUndefined();
    expect(result.items).toHaveLength(2);
    expect(result.items.every((item) => item.authorship === "founder")).toBe(true);
    expect(result.estimatedCostUsd).toBe(0.05);
  });

  it("is a silent empty, not a failure, without a key or any handle", async () => {
    const result = await fetchXaiXSearchLane({
      targets: { companyName: "Acme", domain: "acme.com", founders: [{ name: "No X", xUrl: null, githubUrl: null }] },
      timeoutMs: 30_000,
    });

    expect(result.items).toEqual([]);
    expect(result.failure).toBeUndefined();
    expect(result.estimatedCostUsd).toBe(0);
  });

  it("is a silent empty, not a failure, when there are handles but no API key", async () => {
    const fetchFn = (async () => {
      throw new Error("fetchFn should not be called without an API key");
    }) as typeof fetch;

    const result = await fetchXaiXSearchLane({ targets: xaiTargets, timeoutMs: 30_000, fetchFn });

    expect(result.items).toEqual([]);
    expect(result.failure).toBeUndefined();
  });

  it("recovers the JSON array from a chatty completion, slicing first [ to last ]", async () => {
    const fetchFn = stubXaiResponse(
      'Here are the posts:\n[{"handle":"acmefounder","date":"2026-07-01","url":"https://x.com/acmefounder/status/1","text":"Shipping Acme."}]\nHope that helps.',
    );

    const result = await fetchXaiXSearchLane({ targets: xaiTargets, xaiApiKey: "xai-key", timeoutMs: 30_000, fetchFn });

    expect(result.failure).toBeUndefined();
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.text).toBe("Shipping Acme.");
  });

  it("records a failure instead of throwing when the content has no JSON array", async () => {
    const fetchFn = stubXaiResponse("no data available");

    const result = await fetchXaiXSearchLane({ targets: xaiTargets, xaiApiKey: "xai-key", timeoutMs: 30_000, fetchFn });

    expect(result.items).toEqual([]);
    expect(result.failure).toBeTruthy();
    expect(result.estimatedCostUsd).toBe(0);
  });

  it("records a failure instead of throwing on a non-ok response", async () => {
    const fetchFn = (async () => new Response("bad request", { status: 400 })) as typeof fetch;

    const result = await fetchXaiXSearchLane({ targets: xaiTargets, xaiApiKey: "xai-key", timeoutMs: 30_000, fetchFn });

    expect(result.items).toEqual([]);
    expect(result.failure).toContain("400");
  });

  it("caps allowed_x_handles at 20 and attributes items back to the matching founder", async () => {
    const manyFounders = Array.from({ length: 25 }, (_, index) => ({
      name: `Founder ${index}`,
      xUrl: `https://x.com/founder${index}`,
      githubUrl: null,
    }));

    let sawHandles: string[] = [];
    const fetchFn = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { tools: Array<{ allowed_x_handles: string[] }> };
      sawHandles = body.tools[0]?.allowed_x_handles ?? [];
      return new Response(
        JSON.stringify({
          output: [
            {
              type: "message",
              role: "assistant",
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify([{ handle: "founder3", date: "2026-07-01", url: "https://x.com/founder3/status/1", text: "Shipping." }]),
                },
              ],
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;

    const result = await fetchXaiXSearchLane({
      targets: { companyName: "Acme", domain: "acme.com", founders: manyFounders },
      xaiApiKey: "xai-key",
      timeoutMs: 30_000,
      fetchFn,
    });

    expect(sawHandles).toHaveLength(20);
    expect(result.items[0]?.authorName).toBe("Founder 3");
  });
});

describe("fetchExaWebLane", () => {
  const exaTargets: FounderVoiceTargets = {
    companyName: "Acme",
    domain: "acme.com",
    founders: [{ name: "Jane Founder", xUrl: null, githubUrl: null }],
  };

  it("builds a company query and a founder-plus-company query, classifying authorship by hostname", async () => {
    const seenQueries: string[] = [];
    const fetchFn = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { query: string };
      seenQueries.push(body.query);
      const isCompanyQuery = body.query.includes("founder interview");
      return new Response(
        JSON.stringify({
          results: [
            {
              url: isCompanyQuery ? "https://acme.com/blog/founder-story" : "https://techcrunch.com/acme-profile",
              title: isCompanyQuery ? "Acme founder story" : "Acme profile",
              text: isCompanyQuery ? "The Acme founder talks about building the company." : "A profile of the Acme founder.",
              publishedDate: "2026-05-01",
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;

    const result = await fetchExaWebLane({ targets: exaTargets, directExaEnv: { DIRECT_EXA_API_KEY: "exa-key" }, timeoutMs: 18_000, fetchFn });

    expect(seenQueries).toHaveLength(2);
    expect(seenQueries.some((query) => query.includes("founder interview"))).toBe(true);
    expect(seenQueries.some((query) => query.includes("Jane Founder") && query.includes("Acme"))).toBe(true);

    expect(result.lane).toBe("exa_founder_web");
    expect(result.failure).toBeUndefined();
    expect(result.items).toHaveLength(2);
    expect(result.items.find((item) => item.url.includes("acme.com"))?.authorship).toBe("company");
    expect(result.items.find((item) => item.url.includes("techcrunch"))?.authorship).toBe("third_party");
    expect(result.estimatedCostUsd).toBeCloseTo(2 * 0.007, 6);
  });

  it("is a silent empty, not a failure, when DIRECT_EXA_API_KEY is missing", async () => {
    const fetchFn = (async () => {
      throw new Error("should not fetch without a key");
    }) as typeof fetch;

    const result = await fetchExaWebLane({ targets: exaTargets, directExaEnv: {}, timeoutMs: 18_000, fetchFn });

    expect(result.items).toEqual([]);
    expect(result.failure).toBeUndefined();
    expect(result.estimatedCostUsd).toBe(0);
  });

  it("skips the founder-plus-company query when there are no founders", async () => {
    const seenQueries: string[] = [];
    const fetchFn = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { query: string };
      seenQueries.push(body.query);
      return new Response(JSON.stringify({ results: [] }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;

    const result = await fetchExaWebLane({
      targets: { companyName: "Acme", domain: "acme.com", founders: [] },
      directExaEnv: { DIRECT_EXA_API_KEY: "exa-key" },
      timeoutMs: 18_000,
      fetchFn,
    });

    expect(seenQueries).toHaveLength(1);
    expect(result.estimatedCostUsd).toBeCloseTo(0.007, 6);
    // Both queries returned zero hits: the shared runner maps that to a placeholder
    // ProviderSource (url "direct-exa:<probe-name>"), which must never surface as an item.
    expect(result.items).toEqual([]);
    expect(result.failure).toBeUndefined();
  });

  it("drops the zero-hit placeholder source instead of fabricating a non-dereferenceable item", async () => {
    const fetchFn = (async () =>
      new Response(JSON.stringify({ results: [] }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;

    const result = await fetchExaWebLane({ targets: exaTargets, directExaEnv: { DIRECT_EXA_API_KEY: "exa-key" }, timeoutMs: 18_000, fetchFn });

    // Both the company query and the founder-plus-company query return zero hits here
    // (unlike the "no founders" test above, which only ever sends one request).
    expect(result.items).toEqual([]);
    expect(result.failure).toBeUndefined();
    expect(result.estimatedCostUsd).toBeCloseTo(2 * 0.007, 6);
  });

  it("keeps items from the successful request and records a failure when the other request fails, never throwing", async () => {
    const fetchFn = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { query: string };
      if (body.query.includes("founder interview")) {
        return new Response("bad request", { status: 400 });
      }
      return new Response(
        JSON.stringify({ results: [{ url: "https://techcrunch.com/acme-profile", title: "Acme profile", text: "profile text" }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;

    const result = await fetchExaWebLane({ targets: exaTargets, directExaEnv: { DIRECT_EXA_API_KEY: "exa-key" }, timeoutMs: 18_000, fetchFn });

    expect(result.items).toHaveLength(1);
    expect(result.failure).toBeTruthy();
  });
});

describe("fetchFounderVoiceEvidence", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const orchestratorTargets: FounderVoiceTargets = {
    companyName: "Acme",
    domain: "acme.com",
    founders: [{ name: "Jane Founder", xUrl: null, githubUrl: null }],
  };

  function laneWithItems(lane: FounderVoiceLaneResult["lane"], count: number, estimatedCostUsd = 0): FounderVoiceLaneResult {
    return {
      lane,
      items: Array.from({ length: count }, (_, index) => ({
        lane,
        url: `https://example.com/${lane}/${index}`,
        title: `${lane} item ${index}`,
        text: `${lane} text ${index}`,
        authorship: "founder" as const,
      })),
      estimatedCostUsd,
    };
  }

  it("runs every lane, tolerates one lane rejecting, concatenates items, and sums cost", async () => {
    const result = await fetchFounderVoiceEvidence({
      targets: orchestratorTargets,
      env: { xaiApiKey: "xai-key", githubToken: "gh-token", directExa: { DIRECT_EXA_API_KEY: "exa-key" } },
      lanes: {
        hn: async () => laneWithItems("hn_search", 2),
        github: async () => laneWithItems("github_author_activity", 3),
        bluesky: async () => laneWithItems("bluesky_author_feed", 1),
        xai: async () => {
          throw new Error("xai timed out");
        },
        exaWeb: async () => laneWithItems("exa_founder_web", 2, 0.014),
      },
    });

    expect(result.laneResults).toHaveLength(5);
    const xaiResult = result.laneResults.find((lane) => lane.lane === "xai_x_search");
    expect(xaiResult?.failure).toContain("xai timed out");
    expect(xaiResult?.items).toEqual([]);

    expect(result.items).toHaveLength(2 + 3 + 1 + 0 + 2);
    expect(result.estimatedCostUsd).toBeCloseTo(0.014, 6);
  });

  it("caps items at 40 total, dropping overflow from the largest lane first", async () => {
    const result = await fetchFounderVoiceEvidence({
      targets: orchestratorTargets,
      env: { directExa: {} },
      lanes: {
        hn: async () => laneWithItems("hn_search", 5),
        github: async () => laneWithItems("github_author_activity", 30),
        bluesky: async () => laneWithItems("bluesky_author_feed", 5),
        xai: async () => laneWithItems("xai_x_search", 5),
        exaWeb: async () => laneWithItems("exa_founder_web", 5),
      },
    });

    expect(result.items).toHaveLength(40);
    // github contributed the most items (30 of 50), so the 10-item overflow trims from it first.
    expect(result.items.filter((item) => item.lane === "github_author_activity")).toHaveLength(20);
  });

  it("uses each lane's timeoutMs from providerBudgetRegistry.founderVoice by default", async () => {
    const seenTimeouts: number[] = [];
    const result = await fetchFounderVoiceEvidence({
      targets: orchestratorTargets,
      env: { directExa: {} },
      lanes: {
        hn: async ({ timeoutMs }) => {
          seenTimeouts.push(timeoutMs);
          return laneWithItems("hn_search", 0);
        },
        github: async ({ timeoutMs }) => {
          seenTimeouts.push(timeoutMs);
          return laneWithItems("github_author_activity", 0);
        },
        bluesky: async ({ timeoutMs }) => {
          seenTimeouts.push(timeoutMs);
          return laneWithItems("bluesky_author_feed", 0);
        },
        xai: async ({ timeoutMs }) => {
          seenTimeouts.push(timeoutMs);
          return laneWithItems("xai_x_search", 0);
        },
        exaWeb: async ({ timeoutMs }) => {
          seenTimeouts.push(timeoutMs);
          return laneWithItems("exa_founder_web", 0);
        },
      },
    });

    expect(seenTimeouts).toEqual([10_000, 15_000, 10_000, 30_000, 18_000]);
    expect(result.items).toEqual([]);
    expect(result.estimatedCostUsd).toBe(0);
  });

  it("invokes the real default lane functions when no lanes override is given", async () => {
    // No lanes override: fetchFounderVoiceEvidence must fall back to defaultLaneFns
    // rather than that wiring being dead code every other test bypasses. With no
    // xaiApiKey and no DIRECT_EXA_API_KEY, the xai and exaWeb lanes silently no-op
    // without any network call; github has no founder githubUrl here, so it also makes
    // no call. Only the real hn and bluesky lane functions hit the (stubbed) network,
    // which is enough to prove the default map is actually wired up and callable.
    let hnCalled = false;
    let blueskyCalled = false;
    const fetchFn = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("hn.algolia.com")) {
        hnCalled = true;
        return new Response(JSON.stringify({ hits: [] }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.includes("bsky.app")) {
        blueskyCalled = true;
        return new Response(JSON.stringify({ actors: [], feed: [] }), { status: 200, headers: { "content-type": "application/json" } });
      }
      throw new Error(`unexpected url in default-lane-wiring test: ${url}`);
    }) as typeof fetch;
    vi.stubGlobal("fetch", fetchFn);

    const result = await fetchFounderVoiceEvidence({ targets: orchestratorTargets, env: { directExa: {} } });

    expect(hnCalled).toBe(true);
    expect(blueskyCalled).toBe(true);
    expect(result.laneResults).toHaveLength(5);
    expect(result.laneResults.map((lane) => lane.lane)).toEqual([
      "hn_search",
      "github_author_activity",
      "bluesky_author_feed",
      "xai_x_search",
      "exa_founder_web",
    ]);
    // Every lane resolved cleanly (no thrown/unexpected-url failures leaked through).
    expect(result.laneResults.every((lane) => lane.failure === undefined)).toBe(true);
  });
});
