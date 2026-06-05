import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { publicCard, type ColdStartCard } from "@cold-start/core";
import { CardShell, formatMediumDate, formatShortDate, safeExternalHref, sourceDomId } from "../src";

afterEach(() => {
  cleanup();
});

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
    description: {
      value: {
        shortDescription: "Real-time voice AI infrastructure for developers building low-latency audio products.",
        concept: "Low-latency speech models exposed as developer infrastructure.",
        serves: "Developers building voice agents and audio applications.",
        mechanism: "APIs and models for real-time speech generation and understanding."
      },
      status: "verified",
      confidence: "high",
      citationIds: ["c1"]
    },
    hq: { value: { city: "San Francisco", country: "US" }, status: "verified", confidence: "high", citationIds: ["c1"] },
    foundedYear: { value: 2023, status: "verified", confidence: "high", citationIds: ["c1"] },
    status: "private"
  },
  funding: {
    totalRaisedUsd: { value: 91000000, status: "verified", confidence: "high", citationIds: ["c2"] },
    lastRound: {
      value: {
        name: "Series B",
        amountUsd: 63000000,
        announcedAt: "2024-04-23",
        leadInvestors: ["NEA", "IVP"]
      },
      status: "verified",
      confidence: "high",
      citationIds: ["c2"]
    },
    rounds: {
      value: [
        {
          name: "Series B",
          amountUsd: 63000000,
          announcedAt: "2024-04-23",
          leadInvestors: ["NEA", "IVP"]
        },
        {
          name: "Series A",
          amountUsd: 27000000,
          announcedAt: "2023-08-15",
          leadInvestors: ["Kleiner Perkins"]
        }
      ],
      status: "verified",
      confidence: "high",
      citationIds: ["c2"]
    },
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
    {
      id: "c2",
      url: "https://www.businesswire.com/news/home/cartesia-series-b",
      title: "Cartesia Announces Funding",
      fetchedAt: "2026-05-06T12:00:00.000Z",
      sourceType: "news"
    },
    {
      id: "c3",
      url: "https://example.substack.com/p/cartesia-technical-deep-dive",
      title: "Cartesia technical deep dive",
      fetchedAt: "2026-05-06T12:00:00.000Z",
      sourceType: "news"
    }
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

function sparseCard(): ColdStartCard {
  const { synthesis: _synthesis, ...base } = card;

  return {
    ...base,
    funding: {
      ...card.funding,
      totalRaisedUsd: { value: null, status: "unknown", confidence: "low", citationIds: [] },
      lastRound: { value: null, status: "unknown", confidence: "low", citationIds: [] },
      rounds: { value: [], status: "unknown", confidence: "low", citationIds: [] },
      investors: { value: [], status: "unknown", confidence: "low", citationIds: [] }
    },
    team: {
      founders: { value: [], status: "unknown", confidence: "low", citationIds: [] },
      keyExecs: { value: [], status: "unknown", confidence: "low", citationIds: [] },
      headcount: { value: null, status: "unknown", confidence: "low", citationIds: [] }
    },
    signals: [],
    comparables: []
  };
}

function expectRemovedLanguageAbsent() {
  expect(screen.queryByText(/Bear case/i)).toBeNull();
  expect(screen.queryByText(/Against/i)).toBeNull();
  expect(screen.queryByText(/Provenance/i)).toBeNull();
  expect(screen.queryByText(/Verifier/i)).toBeNull();
}

describe("CardShell", () => {
  it("renders public facts and omits synthesis when the public card has no synthesis", () => {
    render(<CardShell card={publicCard(card)} surface="web" />);

    expect(screen.getByRole("heading", { name: "Cartesia" })).toBeTruthy();
    expect(screen.getByText("Real-time voice AI infrastructure for developers building low-latency audio products.")).toBeTruthy();
    expect(screen.getByText(/Low-latency speech models exposed as developer infrastructure/)).toBeTruthy();
    expect(screen.getByText(/Developers building voice agents and audio applications/)).toBeTruthy();
    expect(screen.getAllByText("[c1]").length).toBeGreaterThan(0);
    expect(screen.getByText("$91M")).toBeTruthy();
    expect(screen.getAllByText("$63M").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Apr 2024/).length).toBeGreaterThan(0);
    expect(screen.getByText("NEA, IVP")).toBeTruthy();
    expect(screen.getByText("Priority sources")).toBeTruthy();
    expect(screen.getByText("Full source ledger")).toBeTruthy();
    expect(screen.getByText("Source mix")).toBeTruthy();
    expect(screen.getByText("1 independent")).toBeTruthy();
    expect(screen.getByText("2 company")).toBeTruthy();
    expect(screen.getByText("Cartesia launches Sonic")).toBeTruthy();
    expect(screen.getByText(/Example News · launch/)).toBeTruthy();
    expect(screen.getAllByText(/May 6 2026/).length).toBeGreaterThan(0);
    expect(screen.getByText("2023")).toBeTruthy();
    expect(screen.getAllByText("Kleiner Perkins").length).toBeGreaterThan(0);
    expect(screen.queryByLabelText("Investor lens")).toBeNull();
    expect(screen.queryByText(/Supported ·/i)).toBeNull();
    expectRemovedLanguageAbsent();
  });

  it("renders gated synthesis for the extension surface", () => {
    render(<CardShell card={card} surface="extension" />);

    expect(screen.getByLabelText("Investor lens")).toBeTruthy();
    expect(screen.getByText("Supported")).toBeTruthy();
    expect(screen.getByText("The company has a credible infra wedge [c1].")).toBeTruthy();
    expect(screen.getByText("Open questions")).toBeTruthy();
    expect(screen.getByText("Which buyer owns the budget?")).toBeTruthy();
    expect(screen.getByText("Sources")).toBeTruthy();
    expectRemovedLanguageAbsent();
  });

  it("shows empty synthesis states after unsupported claims are stripped", () => {
    render(
      <CardShell
        card={{
          ...card,
          synthesis: {
            ...card.synthesis!,
            bullCase: []
          }
        }}
        surface="extension"
      />
    );

    expect(screen.getByText("No cited support survived verification.")).toBeTruthy();
    expectRemovedLanguageAbsent();
  });

  it("orders sources by incentive quality", () => {
    render(<CardShell card={publicCard(card)} surface="web" />);

    const items = screen.getAllByRole("listitem").filter((node) => node.classList.contains("cs-source-item"));
    expect(items.length).toBeGreaterThan(1);
    expect(items[0]?.getAttribute("data-class")).toBe("independent");
  });

  it("renders unsafe signal and citation URLs as plain text", () => {
    const unsafeCard: ColdStartCard = {
      ...card,
      signals: [
        {
          ...card.signals[0]!,
          title: "Unsafe signal",
          url: "javascript:alert(1)"
        }
      ],
      citations: [
        {
          ...card.citations[0]!,
          title: "Unsafe citation",
          url: "data:text/html,owned"
        }
      ]
    };

    render(<CardShell card={unsafeCard} surface="web" />);

    expect(screen.getByText("Unsafe signal").closest("a")).toBeNull();
    for (const node of screen.getAllByText("Unsafe citation")) {
      expect(node.closest("a")).toBeNull();
    }
  });

  it("degrades sparse public cards without dead sections", () => {
    render(<CardShell card={publicCard(sparseCard())} surface="web" />);

    expect(screen.getByRole("heading", { name: "Cartesia" })).toBeTruthy();
    expect(screen.getAllByText("not found").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByRole("heading", { name: "Capitalisation." })).toBeNull();
    expect(screen.queryByRole("heading", { name: "In motion." })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Comps" })).toBeNull();
    expect(screen.queryByText(/No cited funding rounds/i)).toBeNull();
    expect(screen.queryByText(/No cited public signals/i)).toBeNull();
    expect(screen.queryByText(/No comparable companies/i)).toBeNull();
    expectRemovedLanguageAbsent();
  });

  it("keeps sparse extension cards compact", () => {
    render(<CardShell card={publicCard(sparseCard())} surface="extension" />);

    expect(screen.getByRole("heading", { name: "Cartesia" })).toBeTruthy();
    expect(screen.getAllByText("Not found").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByLabelText("Investor lens")).toBeNull();
    expect(screen.queryByText("Funding")).toBeNull();
    expect(screen.queryByText("Traction")).toBeNull();
    expect(screen.queryByText("Comparables")).toBeNull();
    expect(screen.queryByText("Team")).toBeNull();
    expect(screen.getByText("Sources")).toBeTruthy();
    expectRemovedLanguageAbsent();
  });

  it("keeps identity rows when sparse extension cards lack structured description", () => {
    const { synthesis: _synthesis, ...base } = card;
    const noDescription = publicCard({
      ...base,
      identity: {
        ...base.identity,
        description: undefined
      }
    });

    render(<CardShell card={noDescription} surface="extension" />);

    expect(screen.getByText("Company")).toBeTruthy();
    expect(screen.getByText("San Francisco, US")).toBeTruthy();
    expect(screen.getByText("2023")).toBeTruthy();
    expectRemovedLanguageAbsent();
  });
});

describe("sourceDomId", () => {
  it("encodes arbitrary citation IDs into stable DOM IDs", () => {
    expect(sourceDomId("source 1/2#frag%[x]")).toBe("source-source%201%2F2%23frag%25%5Bx%5D");
  });
});

describe("safeExternalHref", () => {
  it("keeps only http and https URLs", () => {
    expect(safeExternalHref("https://example.com/path")).toBe("https://example.com/path");
    expect(safeExternalHref("http://example.com/path")).toBe("http://example.com/path");
    expect(safeExternalHref("javascript:alert(1)")).toBeNull();
    expect(safeExternalHref("data:text/html,owned")).toBeNull();
    expect(safeExternalHref("not a url")).toBeNull();
  });
});

describe("date formatting", () => {
  it("preserves year-only dates instead of inventing a month", () => {
    expect(formatShortDate("2024")).toBe("2024");
    expect(formatMediumDate("2024")).toBe("2024");
  });
});
