import { describe, expect, it } from "vitest";
import { clusterSignals, signalClusterStats } from "../src/signal-clusters.mjs";
import type { ColdStartCard } from "../src/card";

type Signal = ColdStartCard["signals"][number];

// Verbatim production signals from the granola card (pulled read-only 2026-06-12): 8 of the 10
// cover the same March 2026 $125M raise, including a wrong-date member (technotrenz, 03-26) and
// a mislabeled launch member dated six weeks later (worktechjournal, 05-08).
const granolaSignals: Signal[] = [
  {
    url: "https://thenextweb.com/news/granola-series-c-meeting-ai-enterprise-context",
    date: "2026-03-25",
    title: "Granola raises $125M at $1.5B valuation to turn meetings into enterprise AI context",
    source: "TNW",
    category: "funding",
    citationIds: ["e1"]
  },
  {
    url: "https://techcrunch.com/2026/03/25/granola-raises-125m-hits-1-5b-valuation-as-it-expands-from-meeting-notetaker-to-enterprise-ai-app/",
    date: "2026-03-25",
    title: "Granola raises $125M, hits $1.5B valuation as it expands from meeting notetaker to enterprise AI app",
    source: "TechCrunch",
    category: "funding",
    citationIds: ["e2"]
  },
  {
    url: "https://tech.eu/2026/03/25/granola-raises-125m-at-1-5bn-valuation/",
    date: "2026-03-25",
    title: "Granola raises $125M at $1.5BN valuation",
    source: "Tech.eu",
    category: "funding",
    citationIds: ["e3"]
  },
  {
    url: "https://www.granola.ai/blog/series-c",
    date: "2026-03-25",
    title: "Granola raises $125M to put your company's context to work",
    source: "Granola (company blog)",
    category: "funding",
    citationIds: ["e13"]
  },
  {
    url: "https://venturebeat.com/business/granola-launches-ai-workspace-for-teams-and-raises-43m-series-b",
    date: "2025-05-14",
    title: "Granola Launches AI Workspace for Teams and Raises $43M Series B",
    source: "VentureBeat",
    category: "funding",
    citationIds: ["e4"]
  },
  {
    url: "https://pathfounders.com/p/after-hitting-a-1-5-billion-valuation-granolas-next-move",
    date: "2026-03-27",
    title: "After hitting a $1.5 Billion valuation, Granola's next move could be company-specific AI models",
    source: "Pathfounders",
    category: "news",
    citationIds: ["e6"]
  },
  {
    url: "https://www.reworked.co/digital-workplace/granola-raises-125m-launches-enterprise-context-tools/",
    date: "2026-03-25",
    title: "Granola Lands $125M to Turn Meetings Into AI Memory",
    source: "Reworked",
    category: "news",
    citationIds: ["e7"]
  },
  {
    url: "https://technotrenz.com/news/granola-raises-125m/",
    date: "2026-03-26",
    title: "Granola Raises $125M, Achieves $1.5B Valuation",
    source: "technotrenz.com",
    category: "funding",
    citationIds: ["p2"]
  },
  {
    url: "https://worktechjournal.com/granola-series-c-spaces-api-mcp-team-notes/",
    date: "2026-05-08",
    title: "Granola Raises $125M, Launches Spaces, API, and MCP for Team Note Sharing – WORKTECHJOURNAL",
    source: "worktechjournal.com",
    category: "launch",
    citationIds: ["p3"]
  },
  {
    url: "https://www.epicenter.to/p/building-a-wrapper-that-lasts",
    date: "2026-05-04",
    title: "Granola AI: How a Meeting Notes App Became a $1.5B Company",
    source: "epicenter.to",
    category: "news",
    citationIds: ["p4"]
  }
];

const granolaOptions = { companyDomain: "granola.ai", companyName: "Granola" };

// Verbatim production daloopa signals: five distinct events that must stay distinct, including a
// same-day raise plus product launch announced in one PR (separate angles, separate rows).
const daloopaSignals: Signal[] = [
  {
    url: "https://www.prnewswire.com/news-releases/daloopa-receives-13m",
    date: "2025-07-31",
    title: "Daloopa raises $13M strategic investment, launches MCP integrated with Anthropic Claude",
    source: "PR Newswire",
    category: "funding",
    citationIds: ["e14", "e12"]
  },
  {
    url: "https://daloopa.com/blog/press-release/mcp-pr",
    date: "2025-07-31",
    title: "Daloopa launches Model Context Protocol (MCP) connector with OpenAI ChatGPT, extending coverage",
    source: "Daloopa (company site)",
    category: "launch",
    citationIds: ["e12", "e14"]
  },
  {
    url: "https://vcnewsdaily.com/daloopa/venture-capital-funding/hfns",
    date: "2024-05-07",
    title: "Daloopa closes $18M Series B led by Touring Capital, with Morgan Stanley and Nexus participating",
    source: "VC News Daily",
    category: "funding",
    citationIds: ["e1", "e3"]
  },
  {
    url: "https://pulse2.com/daloopa-ai-based-historical-data-provider",
    date: "2024-05-12",
    title: "CEO Thomas Li discloses 'hundreds of the largest financial institutions' as customers",
    source: "Pulse 2.0",
    category: "news",
    citationIds: ["e3"]
  },
  {
    url: "https://www.integrity-research.com/daloopa-raises-20-million",
    date: "2021-07-27",
    title: "Daloopa closes $20M Series A led by Credit Suisse NEXT Investors; LinkedIn headcount grows",
    source: "Integrity Research",
    category: "funding",
    citationIds: ["e2"]
  }
];

describe("clusterSignals", () => {
  it("collapses the granola raise coverage into one corroborated event", () => {
    const clustered = clusterSignals(granolaSignals, granolaOptions);

    expect(clustered).toHaveLength(3);
    const raise = clustered.find((signal) => signal.citationIds.includes("e1"));
    expect(raise).toBeDefined();
    // All eight raise members merged: the wrong-date technotrenz row (p2) and the mislabeled
    // launch row from six weeks later (p3) both fold in.
    expect(raise?.citationIds).toHaveLength(8);
    expect(raise?.citationIds).toEqual(expect.arrayContaining(["e1", "e2", "e3", "e13", "e6", "e7", "p2", "p3"]));
    expect(raise?.date).toBe("2026-03-25");
    expect(raise?.category).toBe("funding");
  });

  it("prefers an independent outlet over the company blog as the kept title", () => {
    const clustered = clusterSignals(granolaSignals, granolaOptions);
    const raise = clustered.find((signal) => signal.citationIds.includes("e13"));
    expect(raise?.source).not.toContain("company blog");
    expect(raise?.url).not.toContain("granola.ai");
  });

  it("keeps genuinely distinct events apart and orders by date descending", () => {
    const clustered = clusterSignals(granolaSignals, granolaOptions);

    expect(clustered.map((signal) => signal.date)).toEqual(["2026-05-04", "2026-03-25", "2025-05-14"]);
    expect(clustered[1]?.citationIds).toHaveLength(8);
    // The $43M Series B and the later profile piece survive as their own events.
    expect(clustered[0]?.citationIds).toEqual(["p4"]);
    expect(clustered[2]?.citationIds).toEqual(["e4"]);
  });

  it("keeps daloopa's five distinct events distinct", () => {
    const clustered = clusterSignals(daloopaSignals, { companyDomain: "daloopa.com", companyName: "Daloopa" });
    expect(clustered).toHaveLength(5);
  });

  it("is idempotent", () => {
    const once = clusterSignals(granolaSignals, granolaOptions);
    const twice = clusterSignals(once, granolaOptions);
    expect(twice).toEqual(once);
  });

  it("converges when a merged representative matches a signal its members missed", () => {
    // The decagon prod shape: the company-blog member donates the modal date while the
    // independent member donates the title, and only the COMPOSED representative (valuation
    // amount + moved date) matches the third article. One greedy pass leaves two rows; the
    // fixed-point iteration must finish the merge.
    const signals: Signal[] = [
      {
        url: "https://decagon.ai/blog/series-c",
        date: "2026-01-28",
        title: "Decagon raises $250M Series C",
        source: "decagon.ai",
        category: "funding",
        citationIds: ["c1"]
      },
      {
        url: "https://siliconangle.com/decagon-raises-250m",
        date: "2026-01-20",
        title: "Decagon AI raises $250M at $4.5B valuation to scale AI concierge platform",
        source: "siliconangle.com",
        category: "funding",
        citationIds: ["c2"]
      },
      {
        url: "https://businesswire.com/decagon-valuation",
        date: "2026-01-28",
        title: "Decagon's Valuation Triples to $4.5 Billion as it Ushers in the Age of AI Concierge",
        source: "businesswire.com",
        category: "funding",
        citationIds: ["c3"]
      }
    ];

    const clustered = clusterSignals(signals, { companyDomain: "decagon.ai", companyName: "Decagon" });
    expect(clustered).toHaveLength(1);
    expect(clustered[0]?.citationIds).toEqual(expect.arrayContaining(["c1", "c2", "c3"]));
  });

  it("caps the final list at six events", () => {
    const many: Signal[] = Array.from({ length: 9 }, (_, index) => ({
      url: `https://example.com/event-${index}`,
      date: `2026-0${(index % 6) + 1}-0${index + 1}`,
      title: `Distinct event number ${index} about topic-${index} milestone-${index}`,
      source: `Outlet ${index}`,
      category: "news",
      citationIds: [`c${index}`]
    }));

    expect(clusterSignals(many)).toHaveLength(6);
  });

  it("does not merge distinct partnerships that share a boilerplate title suffix", () => {
    // Real prod false-merge candidate (doss): two different partner announcements whose titles
    // share the company-blog tagline after the pipe.
    const partnerships: Signal[] = [
      {
        url: "https://doss.com/blog/campfire",
        date: "2026-06-07",
        title: "DOSS + Campfire | AI-powered finance and operations",
        source: "doss.com",
        category: "news",
        citationIds: ["c1"]
      },
      {
        url: "https://doss.com/blog/rillet",
        date: "2026-06-07",
        title: "DOSS + Rillet | AI-powered finance and operations",
        source: "doss.com",
        category: "news",
        citationIds: ["c2"]
      }
    ];

    expect(clusterSignals(partnerships, { companyDomain: "doss.com", companyName: "Doss" })).toHaveLength(2);
  });

  it("does not merge different launches that share generic verbs", () => {
    const launches: Signal[] = [
      {
        url: "https://example.com/spaces",
        date: "2026-05-01",
        title: "Granola launches Spaces for shared team notes",
        source: "Outlet A",
        category: "launch",
        citationIds: ["c1"]
      },
      {
        url: "https://example.com/api",
        date: "2026-05-02",
        title: "Granola launches public API and MCP server",
        source: "Outlet B",
        category: "launch",
        citationIds: ["c2"]
      }
    ];

    expect(clusterSignals(launches, granolaOptions)).toHaveLength(2);
  });

  it("does not merge separate funding rounds just because the amounts match", () => {
    const rounds: Signal[] = [
      {
        url: "https://example.com/seed",
        date: "2023-02-01",
        title: "Acme raises $20M seed round for workflow automation",
        source: "Outlet A",
        category: "funding",
        citationIds: ["c1"]
      },
      {
        url: "https://example.com/series-a",
        date: "2026-02-01",
        title: "Acme raises $20M Series A to expand enterprise workflow automation",
        source: "Outlet B",
        category: "funding",
        citationIds: ["c2"]
      }
    ];

    expect(clusterSignals(rounds, { companyDomain: "acme.com", companyName: "Acme" })).toHaveLength(2);
  });

  it("tolerates unparseable dates without crashing", () => {
    const odd: Signal[] = [
      {
        url: "https://example.com/a",
        date: "current",
        title: "Acme raises $10M seed round",
        source: "Outlet A",
        category: "funding",
        citationIds: ["c1"]
      },
      {
        url: "https://example.com/b",
        date: "2026-05",
        title: "Acme lands $10M in seed funding",
        source: "Outlet B",
        category: "funding",
        citationIds: ["c2"]
      }
    ];

    const clustered = clusterSignals(odd);
    expect(clustered).toHaveLength(1);
    expect(clustered[0]?.citationIds).toEqual(expect.arrayContaining(["c1", "c2"]));
  });
});

describe("signalClusterStats", () => {
  it("scores granola's redundancy", () => {
    expect(signalClusterStats(granolaSignals, granolaOptions)).toEqual({
      signalCount: 10,
      eventCount: 3,
      distinctEventRatio: 0.3
    });
  });

  it("scores a fully distinct list as 1", () => {
    expect(signalClusterStats(daloopaSignals, { companyDomain: "daloopa.com" }).distinctEventRatio).toBe(1);
  });

  it("returns a null ratio for empty input", () => {
    expect(signalClusterStats([])).toEqual({ signalCount: 0, eventCount: 0, distinctEventRatio: null });
  });
});
