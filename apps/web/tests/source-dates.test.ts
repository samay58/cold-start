import { describe, expect, it } from "vitest";
import { buildSkeletonCard } from "@cold-start/pipeline";
import type { ColdStartDb, StoredSource } from "@cold-start/db";
import { providerSourcesFromStoredSources, recordSourcesForCard, sectionsWithSourceCitations } from "../src/inngest/source-fetching";

// Task 2B of the evidence remediation: a source's publish date survives storage, the round trip
// back to a provider source, and the citation built from it. A source with no date stays undated;
// the fetch time is never a publish date.

const stored = (overrides: Partial<StoredSource> = {}): StoredSource => ({
  id: "s-1",
  url: "https://news.example/notion",
  title: "Notion news",
  sourceType: "news",
  fetchedAt: "2026-09-01T00:00:00.000Z",
  rawText: "Notion shipped agents.",
  imageUrl: null,
  publishedAt: null,
  ...overrides
});

describe("source publish dates", () => {
  it("passes each source's publish date to storage", async () => {
    const inserted: Array<Record<string, unknown>> = [];
    const db = {
      insert: () => ({
        values: (values: Record<string, unknown>) => {
          inserted.push(values);
          return { onConflictDoNothing: async () => undefined, onConflictDoUpdate: async () => undefined };
        }
      })
    } as unknown as ColdStartDb;

    await recordSourcesForCard(db, "card-id", [
      { url: "https://a.example", title: "A", sourceType: "news", fetchedAt: "2026-09-01T00:00:00.000Z", rawText: "A.", publishedAt: "2026-05-01T00:00:00.000Z" },
      { url: "https://b.example", title: "B", sourceType: "news", fetchedAt: "2026-09-01T00:00:00.000Z", rawText: "B." }
    ]);

    expect(inserted.map((row) => row.publishedAt)).toEqual([new Date("2026-05-01T00:00:00.000Z"), null]);
  });

  it("reads the stored date back, falls back to the date inside an older stored record, and never uses the fetch time", () => {
    const sources = providerSourcesFromStoredSources([
      stored({ publishedAt: "2026-05-01T00:00:00.000Z" }),
      stored({ url: "https://old.example", rawText: JSON.stringify({ id: "x", publishedDate: "2024-07-06T00:00:00.000Z", text: "Old." }) }),
      stored({ url: "https://undated.example" })
    ]);

    expect(sources.map((source) => source.publishedAt ?? null)).toEqual(["2026-05-01T00:00:00.000Z", "2024-07-06T00:00:00.000Z", null]);
  });

  it("carries the date onto the citation built from the source", () => {
    const sections = sectionsWithSourceCitations(buildSkeletonCard("notion.so"), providerSourcesFromStoredSources([stored({ publishedAt: "2026-05-01T00:00:00.000Z" })]));

    expect(sections.citations[0]?.publishedAt).toBe("2026-05-01T00:00:00.000Z");
  });
});
