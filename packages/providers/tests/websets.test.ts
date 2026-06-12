import { describe, expect, it, vi } from "vitest";

import {
  buildWebsetsPeopleContactRequest,
  createPeopleEmailWebset,
  estimateWebsetsCostUsd,
  missingWebsetsConfig,
  pollPeopleEmailWebset
} from "../src/websets";

describe("websets people email enrichment", () => {
  it("requires an Exa Websets API key", () => {
    expect(missingWebsetsConfig({})).toEqual(["EXA_WEBSETS_API_KEY"]);
    expect(missingWebsetsConfig({ EXA_WEBSETS_API_KEY: "exa-key" })).toEqual([]);
  });

  it("builds one bounded people webset with email-only enrichment", () => {
    const request = buildWebsetsPeopleContactRequest({
      env: { EXA_WEBSETS_API_KEY: "exa-key", EXA_WEBSETS_BASE_URL: "https://api.exa.ai" },
      domain: "sycamore.so",
      peopleHints: [
        { name: "Sri Viswanath", role: "Founder & CEO" },
        { name: "Amrit Baveja", role: "Founding Team" },
        { name: "Pranava Singhal", role: "Founding Member" },
        { name: "Ignored Fourth", role: "Advisor" }
      ],
      externalId: "cold-start-contact-sycamore"
    });

    expect(request.url).toBe("https://api.exa.ai/websets/v0/websets");
    expect(request.headers).toMatchObject({ "x-api-key": "exa-key" });
    expect(request.body).toMatchObject({
      externalId: "cold-start-contact-sycamore",
      search: {
        count: 3,
        entity: { type: "person" },
        criteria: [
          { description: "Person is one of Sri Viswanath, Amrit Baveja, or Pranava Singhal." },
          { description: "Person is currently affiliated with sycamore.so or Sycamore." }
        ]
      },
      enrichments: [
        {
          description: "Current professional email for this person at sycamore.so. Return the best current email even when it is personal or on another domain. Return null only when the email clearly belongs to a previous employer, school, investor, or unrelated company.",
          format: "email"
        }
      ]
    });
    expect(JSON.stringify(request.body)).not.toContain("Ignored Fourth");
  });

  it("accepts current emails and rejects stale employer emails", async () => {
    const fetchJson = vi.fn(async (request: { method: string; url: string }) => {
      if (request.method === "POST") {
        return { id: "ws_1", object: "webset", dashboardUrl: "https://websets.exa.ai/ws_1" };
      }

      expect(request.url).toBe("https://api.exa.ai/websets/v0/websets/ws_1/items?limit=10");
      return {
        data: [
          {
            id: "item_1",
            properties: {
              type: "person",
              url: "https://linkedin.com/in/amrit-baveja-693046147",
              person: {
                name: "Amrit Baveja",
                position: "Founding Team",
                company: { name: "Sycamore Labs" }
              }
            },
            enrichments: [
              {
                status: "completed",
                format: "email",
                result: ["amrit@sycamore.so"],
                references: [
                  {
                    title: "Amrit Baveja LinkedIn",
                    url: "https://linkedin.com/in/amrit-baveja-693046147",
                    snippet: "Founding Team at Sycamore Labs"
                  }
                ]
              }
            ]
          },
          {
            id: "item_2",
            properties: {
              type: "person",
              url: "https://linkedin.com/in/tolan-founder",
              person: {
                name: "Quinten Farmer",
                position: "Founder & CEO at Sycamore Labs",
                company: { name: "Sycamore Labs" }
              }
            },
            enrichments: [
              {
                status: "completed",
                format: "email",
                result: ["quintendf@gmail.com"],
                references: [{ title: "Quinten Farmer", url: "https://linkedin.com/in/tolan-founder" }]
              }
            ]
          },
          {
            id: "item_3",
            properties: {
              type: "person",
              url: "https://linkedin.com/in/sri-viswanath",
              person: {
                name: "Sri Viswanath",
                position: "Partner",
                company: { name: "Coatue" }
              }
            },
            enrichments: [
              {
                status: "completed",
                format: "email",
                result: ["sviswanath@coatue.com"],
                references: [{ title: "Sri Viswanath", url: "https://linkedin.com/in/sri-viswanath" }]
              }
            ]
          }
        ],
        hasMore: false,
        nextCursor: null
      };
    });

    const peopleHints = [
      { name: "Sri Viswanath", role: "Founder & CEO" },
      { name: "Amrit Baveja", role: "Founding Team" },
      { name: "Quinten Farmer", role: "Founder & CEO" }
    ];
    const created = await createPeopleEmailWebset({
      env: { EXA_WEBSETS_API_KEY: "exa-key" },
      domain: "sycamore.so",
      peopleHints,
      externalId: "cold-start-contact-sycamore",
      fetchJson
    });
    if (created.skipped) {
      throw new Error("expected webset creation");
    }
    const result = await pollPeopleEmailWebset({
      env: { EXA_WEBSETS_API_KEY: "exa-key" },
      domain: "sycamore.so",
      peopleHints,
      websetId: created.websetId,
      dashboardUrl: created.dashboardUrl,
      fetchJson
    });

    expect(result.skipped).toBe(false);
    expect(result.failures).toEqual([]);
    expect(result.trace).toMatchObject({
      sourceCount: 2,
      factCount: 2,
      itemCount: 3,
      acceptedEmailCount: 2,
      rejectedEmailCount: 1
    });
    expect(result.facts).toEqual([
      expect.objectContaining({
        path: "team.keyExecs",
        provider: "websets",
        endpoint: "exa_websets_people_email",
        value: [
          expect.objectContaining({
            name: "Amrit Baveja",
            role: "Founding Team",
            email: "amrit@sycamore.so",
            sourceUrl: "https://linkedin.com/in/amrit-baveja-693046147"
          })
        ]
      }),
      expect.objectContaining({
        path: "team.founders",
        provider: "websets",
        endpoint: "exa_websets_people_email",
        value: [
          expect.objectContaining({
            name: "Quinten Farmer",
            role: "Founder & CEO",
            email: "quintendf@gmail.com",
            sourceUrl: "https://linkedin.com/in/tolan-founder"
          })
        ]
      })
    ]);
    expect(result.emailDiscovery).toEqual([
      {
        name: "Sri Viswanath",
        role: "Founder & CEO",
        discoverySource: "people_hint",
        emailFound: null,
        emailSource: null
      },
      {
        name: "Amrit Baveja",
        role: "Founding Team",
        discoverySource: "people_hint",
        emailFound: "amrit@sycamore.so",
        emailSource: "websets"
      },
      {
        name: "Quinten Farmer",
        role: "Founder & CEO",
        discoverySource: "people_hint",
        emailFound: "quintendf@gmail.com",
        emailSource: "websets"
      }
    ]);
  });

  it("a later poll picks up items that were not ready earlier", async () => {
    let listCalls = 0;
    const fetchJson = vi.fn(async (request: { method: string }) => {
      if (request.method === "POST") {
        return { id: "ws_1", object: "webset" };
      }
      listCalls += 1;
      if (listCalls === 1) {
        return { data: [], hasMore: false, nextCursor: null };
      }
      return {
        data: [
          {
            id: "item_1",
            properties: {
              type: "person",
              url: "https://linkedin.com/in/amrit-baveja-693046147",
              person: { name: "Amrit Baveja", position: "Founding Team" }
            },
            enrichments: [{ status: "completed", format: "email", result: "amrit@sycamore.so" }]
          }
        ],
        hasMore: false,
        nextCursor: null
      };
    });

    const pollInput = {
      env: { EXA_WEBSETS_API_KEY: "exa-key" },
      domain: "sycamore.so",
      peopleHints: [{ name: "Amrit Baveja", role: "Founding Team" }],
      websetId: "ws_1",
      fetchJson
    };
    const first = await pollPeopleEmailWebset(pollInput);
    expect(first.trace).toMatchObject({ itemCount: 0, acceptedEmailCount: 0, requestCount: 1 });

    const second = await pollPeopleEmailWebset(pollInput);
    expect(second.trace).toMatchObject({ acceptedEmailCount: 1, itemCount: 1 });
    expect(second.facts[0]?.value).toEqual([
      expect.objectContaining({ name: "Amrit Baveja", email: "amrit@sycamore.so" })
    ]);
  });
});

describe("createPeopleEmailWebset and pollPeopleEmailWebset", () => {
  const item = {
    id: "item_1",
    properties: {
      type: "person",
      url: "https://linkedin.com/in/sri",
      person: { name: "Sri Viswanath", position: "CEO", company: { name: "Sycamore" } }
    },
    enrichments: [{ status: "completed", format: "email", result: ["sri@sycamore.so"] }]
  };

  it("creates the webset and returns its id without polling", async () => {
    const fetchJson = vi.fn(async () => ({ id: "ws_9", dashboardUrl: "https://websets.exa.ai/ws_9" }));
    const created = await createPeopleEmailWebset({
      env: { EXA_WEBSETS_API_KEY: "exa-key" },
      domain: "sycamore.so",
      peopleHints: [{ name: "Sri Viswanath", role: "CEO" }],
      externalId: "cold-start-contact-sycamore",
      fetchJson
    });

    expect(created).toEqual({
      skipped: false,
      websetId: "ws_9",
      dashboardUrl: "https://websets.exa.ai/ws_9",
      endpointUrl: "https://api.exa.ai/websets/v0/websets"
    });
    expect(fetchJson).toHaveBeenCalledTimes(1);
  });

  it("skips creation without a key or named people", async () => {
    const noKey = await createPeopleEmailWebset({
      env: {},
      domain: "sycamore.so",
      peopleHints: [{ name: "Sri Viswanath" }],
      externalId: "x"
    });
    expect(noKey.skipped).toBe(true);

    const noPeople = await createPeopleEmailWebset({
      env: { EXA_WEBSETS_API_KEY: "exa-key" },
      domain: "sycamore.so",
      peopleHints: [],
      externalId: "x"
    });
    expect(noPeople.skipped).toBe(true);
  });

  it("polls once, parses items, and reports request count and estimated cost", async () => {
    const fetchJson = vi.fn(async () => ({ data: [item] }));
    const result = await pollPeopleEmailWebset({
      env: { EXA_WEBSETS_API_KEY: "exa-key" },
      domain: "sycamore.so",
      peopleHints: [{ name: "Sri Viswanath", role: "CEO" }],
      websetId: "ws_9",
      dashboardUrl: "https://websets.exa.ai/ws_9",
      fetchJson
    });

    expect(fetchJson).toHaveBeenCalledTimes(1);
    expect(result.emailDiscovery[0]).toMatchObject({ name: "Sri Viswanath", emailFound: "sri@sycamore.so", emailSource: "websets" });
    expect(result.facts).toHaveLength(1);
    expect(result.trace).toMatchObject({
      itemCount: 1,
      acceptedEmailCount: 1,
      requestCount: 1,
      websetId: "ws_9"
    });
    // 1 item x (10 result + 2 enrichment) credits at the default Starter rate
    expect(result.trace.estimatedCostUsd).toBeCloseTo(0.0735, 4);
  });

  it("degrades a poll failure to a failure-shaped result", async () => {
    const fetchJson = vi.fn(async () => {
      throw new Error("Websets request failed with 503");
    });
    const result = await pollPeopleEmailWebset({
      env: { EXA_WEBSETS_API_KEY: "exa-key" },
      domain: "sycamore.so",
      peopleHints: [{ name: "Sri Viswanath" }],
      websetId: "ws_9",
      fetchJson
    });

    expect(result.failures).toHaveLength(1);
    expect(result.trace.failureCount).toBe(1);
    expect(result.trace.requestCount).toBe(1);
  });
});

describe("estimateWebsetsCostUsd", () => {
  it("prices items at 12 credits on the default Starter rate and honors the env override", () => {
    expect(estimateWebsetsCostUsd(3)).toBeCloseTo(0.2205, 4);
    expect(estimateWebsetsCostUsd(3, { EXA_WEBSETS_CREDIT_USD: "0.00449" })).toBeCloseTo(0.1616, 4);
    expect(estimateWebsetsCostUsd(0)).toBe(0);
  });
});
