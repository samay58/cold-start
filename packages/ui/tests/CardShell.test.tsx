import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { publicCard, type ColdStartCard } from "@cold-start/core";
import { CardShell } from "../src";

const card: ColdStartCard = {
  slug: "cartesia",
  domain: "cartesia.ai",
  generatedAt: "2026-05-06T12:00:00.000Z",
  generationCostUsd: 0.12,
  cacheStatus: "hit",
  identity: {
    name: { value: "Cartesia", status: "verified", confidence: "high", citationIds: ["c1"] },
    logoUrl: null,
    oneLiner: { value: "Real-time voice AI platform", status: "verified", confidence: "high", citationIds: ["c1"] },
    hq: { value: { city: "San Francisco", country: "US" }, status: "verified", confidence: "high", citationIds: ["c1"] },
    foundedYear: { value: 2023, status: "verified", confidence: "high", citationIds: ["c1"] },
    status: "private"
  },
  funding: {
    totalRaisedUsd: { value: 91000000, status: "verified", confidence: "high", citationIds: ["c2"] },
    lastRound: { value: null, status: "unknown", confidence: "low", citationIds: [] },
    investors: {
      value: [{ name: "Kleiner Perkins", domain: "kleinerperkins.com" }],
      status: "verified",
      confidence: "high",
      citationIds: ["c2"]
    }
  },
  team: {
    founders: { value: [], status: "unknown", confidence: "low", citationIds: [] },
    keyExecs: { value: [], status: "unknown", confidence: "low", citationIds: [] },
    headcount: { value: null, status: "unknown", confidence: "low", citationIds: [] }
  },
  signals: [
    {
      title: "Cartesia launches Sonic",
      url: "https://example.com/sonic",
      date: "2026-04-15",
      source: "Example News",
      category: "launch",
      citationIds: ["c2"]
    }
  ],
  comparables: [{ name: "ElevenLabs", domain: "elevenlabs.io", oneLiner: "Voice AI platform" }],
  citations: [
    { id: "c1", url: "https://cartesia.ai", title: "Cartesia", fetchedAt: "2026-05-06T12:00:00.000Z", sourceType: "company_site" },
    { id: "c2", url: "https://example.com/funding", title: "Funding", fetchedAt: "2026-05-06T12:00:00.000Z", sourceType: "news" }
  ],
  synthesis: {
    whyItMatters: {
      text: "Cartesia is relevant because real-time voice is a live infra wedge [c1].",
      citationIds: ["c1"]
    },
    bullCase: [{ text: "The company has a credible infra wedge [c1].", citationIds: ["c1"] }],
    bearCase: [{ text: "Competition is intense [c2].", citationIds: ["c2"] }],
    openQuestions: ["Which buyer owns the budget?"]
  }
};

describe("CardShell", () => {
  it("renders public facts and omits synthesis when the public card has no synthesis", () => {
    render(<CardShell card={publicCard(card)} surface="web" />);

    expect(screen.getByRole("heading", { name: "Cartesia" })).toBeTruthy();
    expect(screen.getByText("Real-time voice AI platform")).toBeTruthy();
    expect(screen.getAllByText("[c1]").length).toBeGreaterThan(0);
    expect(screen.getByText("Kleiner Perkins")).toBeTruthy();
    expect(screen.getAllByText("not publicly disclosed").length).toBeGreaterThan(0);
    expect(screen.queryByText("Bull case")).toBeNull();
  });

  it("renders gated synthesis for the extension surface", () => {
    render(<CardShell card={card} surface="extension" />);

    expect(screen.getByText("Bull case")).toBeTruthy();
    expect(screen.getByText("The company has a credible infra wedge [c1].")).toBeTruthy();
    expect(screen.getByText("Which buyer owns the budget?")).toBeTruthy();
  });
});
