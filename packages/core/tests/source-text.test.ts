import { describe, expect, it } from "vitest";
import { citationSchema, readableSourceText, SOURCE_SNIPPET_MAX_LENGTH, sourcePublishedAt, sourceSnippet } from "../src/index";

const exaRecord = (fields: Record<string, unknown>) =>
  JSON.stringify({ id: "https://notion.com/", title: "Notion", url: "https://notion.com/", publishedDate: null, ...fields });

describe("readableSourceText", () => {
  it("returns the page text of an Exa record, not the record", () => {
    const text = readableSourceText(exaRecord({ text: "Notion is a connected workspace.", highlights: ["A highlight."] }), "Notion");

    expect(text).toBe("Notion is a connected workspace.");
  });

  it("falls back to the summary, then the highlights", () => {
    expect(readableSourceText(exaRecord({ summary: "A summary." }), "Notion")).toBe("A summary.");
    expect(readableSourceText(exaRecord({ highlights: ["First highlight.\n[...]\nSecond one.", "Third."] }), "Notion")).toBe(
      "First highlight.\nSecond one.\nThird."
    );
  });

  it("falls back to the title when a record carries no page text, never to JSON", () => {
    expect(readableSourceText(exaRecord({}), "Notion hits $10B valuation")).toBe("Notion hits $10B valuation");
    expect(readableSourceText('{"person":{"name":"Ivan Zhao","title":"CEO"}}', "Ivan Zhao")).toBe("Ivan Zhao");
    expect(readableSourceText('{"requestId":"1","results":[{"title":"Gradium"}]}', "Gradium search")).toBe("Gradium search");
    expect(readableSourceText(exaRecord({}))).toBe("");
  });

  it("treats a cut-off JSON slice as unreadable", () => {
    const slice = exaRecord({ text: "Notion is a connected workspace." }).slice(0, 60);

    expect(readableSourceText(slice, "Notion")).toBe("Notion");
  });

  it("reads stored plain text and markdown as they are, tidied, one line per line", () => {
    expect(readableSourceText("Plain page   text.\n\n  More text.", "Title")).toBe("Plain page text.\nMore text.");
    expect(readableSourceText("[home link](https://joinmoxie.com/)\n\n# Grow Your Practice\n\n![logo](https://x.io/a.png) Moxie helps.", "Moxie")).toBe(
      "home link\nGrow Your Practice\nMoxie helps."
    );
    expect(readableSourceText("", "Title only")).toBe("Title only");
  });

  it("reads real stored provider records, whole or cut off, as their title", () => {
    const records = [
      '{"requestId":"2f3fbeb69bc7c6b81d1bd35367afafc2","results":[{"id":"https://cartesia.ai/sonic","title":"Cartesia Sonic-3","url":"https://cartesia.ai/sonic","author":null,"score":0.9488493204116821}]}',
      '{"organization":{"id":"6578dc4066927303d3b5b396","name":"Cartesia","website_url":"http://www.cartesia.ai","angellist_url":null,"linkedin_url":"http://www.linkedin.com/company/cartesia-ai"',
      '{"url":"https://legora.com/","title":"Legora","content":"Product\\n\\n+\\n\\nSolutions\\n\\n[Security](https://legora.com/security)'
    ];
    for (const record of records) {
      expect(readableSourceText(record, "Stored title")).toBe("Stored title");
    }
  });

  it("treats a stored JSON array as a record with no page text, but keeps markdown that opens with a link", () => {
    expect(readableSourceText('[{"id":"x","title":"Record"}]', "Stored title")).toBe("Stored title");
    expect(readableSourceText("[Home](https://a.example/)\nReal page text.", "Stored title")).toBe("Home\nReal page text.");
  });

  it("never returns text that starts like JSON", () => {
    expect(readableSourceText(exaRecord({ text: '{"api": "response"}' }), "API docs")).toBe("API docs");
  });
});

describe("sourceSnippet", () => {
  it("keeps short text whole", () => {
    expect(sourceSnippet("  Notion is a connected   workspace. ")).toBe("Notion is a connected workspace.");
  });

  it("cuts long text at a sentence boundary within the limit", () => {
    const sentence = "Notion raised money from Index Ventures in a round that valued the company highly.";
    const snippet = sourceSnippet(Array.from({ length: 20 }, () => sentence).join(" "));

    expect(snippet.length).toBeLessThanOrEqual(SOURCE_SNIPPET_MAX_LENGTH);
    expect(snippet.endsWith(".")).toBe(true);
    expect(snippet.length).toBeGreaterThan(SOURCE_SNIPPET_MAX_LENGTH - sentence.length - 2);
  });

  it("cuts one overlong sentence at a word boundary", () => {
    const snippet = sourceSnippet(Array.from({ length: 200 }, () => "word").join(" "));

    expect(snippet.length).toBeLessThanOrEqual(SOURCE_SNIPPET_MAX_LENGTH);
    expect(snippet.endsWith("word")).toBe(true);
  });
});

describe("citationSchema", () => {
  const citation = {
    id: "s1",
    url: "https://notion.com/",
    title: "Notion homepage",
    fetchedAt: "2026-09-01T00:00:00.000Z",
    sourceType: "company_site" as const,
  };

  it("reads an old JSON snippet as its page text", () => {
    const parsed = citationSchema.parse({ ...citation, snippet: exaRecord({ text: "Notion is a connected workspace." }) });

    expect(parsed.snippet).toBe("Notion is a connected workspace.");
  });

  it("drops a snippet with no readable text instead of keeping JSON", () => {
    const parsed = citationSchema.parse({ ...citation, snippet: exaRecord({}).slice(0, 80) });

    expect(parsed.snippet).toBeUndefined();
  });

  it("keeps a readable snippet as it is", () => {
    expect(citationSchema.parse({ ...citation, snippet: "Notion is a connected workspace." }).snippet).toBe(
      "Notion is a connected workspace."
    );
  });
});

describe("sourcePublishedAt", () => {
  it("reads the publish date a stored provider record carries", () => {
    expect(sourcePublishedAt(JSON.stringify({ id: "x", publishedDate: "2024-07-06T00:00:00.000Z" }))).toBe("2024-07-06T00:00:00.000Z");
  });

  it("returns null for plain text, a record without a date, or a value that is not a date", () => {
    expect(sourcePublishedAt("Plain page text.")).toBeNull();
    expect(sourcePublishedAt(JSON.stringify({ id: "x" }))).toBeNull();
    expect(sourcePublishedAt(JSON.stringify({ id: "x", publishedDate: "sometime" }))).toBeNull();
  });
});

describe("citation publish dates", () => {
  it("keeps a citation's publish date", () => {
    const parsed = citationSchema.parse({
      id: "s1",
      url: "https://notion.com/",
      title: "Notion",
      fetchedAt: "2026-09-01T00:00:00.000Z",
      sourceType: "company_site",
      publishedAt: "2024-07-06T00:00:00.000Z"
    });

    expect(parsed.publishedAt).toBe("2024-07-06T00:00:00.000Z");
  });
});
