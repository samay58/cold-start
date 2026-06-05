import { describe, expect, it, vi } from "vitest";

import {
  buildWebsetsPeopleContactRequest,
  fetchWebsetsPeopleEmailSources,
  missingWebsetsConfig
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

    const result = await fetchWebsetsPeopleEmailSources({
      env: { EXA_WEBSETS_API_KEY: "exa-key" },
      domain: "sycamore.so",
      peopleHints: [
        { name: "Sri Viswanath", role: "Founder & CEO" },
        { name: "Amrit Baveja", role: "Founding Team" },
        { name: "Quinten Farmer", role: "Founder & CEO" }
      ],
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

  it("polls boundedly until the Webset item enrichment is available", async () => {
    const fetchJson = vi.fn(async (request: { method: string }) => {
      if (request.method === "POST") {
        return { id: "ws_1", object: "webset" };
      }

      if (fetchJson.mock.calls.filter(([call]) => call.method === "GET").length === 1) {
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

    const result = await fetchWebsetsPeopleEmailSources({
      env: { EXA_WEBSETS_API_KEY: "exa-key" },
      domain: "sycamore.so",
      peopleHints: [{ name: "Amrit Baveja", role: "Founding Team" }],
      fetchJson,
      pollAttempts: 2,
      pollIntervalMs: 0
    });

    expect(fetchJson.mock.calls.filter(([request]) => request.method === "GET")).toHaveLength(2);
    expect(result.trace).toMatchObject({ acceptedEmailCount: 1, itemCount: 1 });
    expect(result.facts[0]?.value).toEqual([
      expect.objectContaining({ name: "Amrit Baveja", email: "amrit@sycamore.so" })
    ]);
  });
});
