// Fixture cards for the web screenshot gallery (tests/e2e/web-gallery.spec.ts) and its local
// seed script (scripts/seed-web-gallery.ts). Each is a full ColdStartCard with no synthesis, so
// they render on the public /c/{slug} route exactly like a real basics-tier profile. The three
// shapes intentionally sit at different points on the public-profile quality curve so the
// redesign has real states to screenshot against, not just one happy-path fixture:
//   - richConflictCard: every section populated, including a headcount fact two reporting
//     sources disagree on (status "mixed"), for the conflict panel.
//   - thinFileCard: sits right at the hasUsablePublicProfile threshold; also the one fixture
//     with no founded year on record, so the stat strip's Founded slot renders its honest
//     absence somewhere in the gallery (the other two cards carry a founded year with citations).
//   - emptySectionsCard: identity and headcount only, funding/comparables/signals all empty, for
//     the empty-state design of those sections.
import type { Citation, ColdStartCard, ResolvedFact } from "@cold-start/core";

function fact<T>(
  value: T | null,
  citationIds: string[] = [],
  overrides: { status?: ResolvedFact<T>["status"]; confidence?: ResolvedFact<T>["confidence"] } = {}
): ResolvedFact<T> {
  return {
    value,
    status: overrides.status ?? (value === null ? "unknown" : "verified"),
    confidence: overrides.confidence ?? (value === null ? "low" : "high"),
    citationIds
  };
}

// --- richConflictCard: Voxlathe -------------------------------------------------------------

const voxlatheCitations: Citation[] = [
  {
    id: "c1",
    url: "https://semianalysis.com/2026/02/18/voxlathe-inference-stack-teardown",
    title: "Voxlathe's inference stack, benchmarked",
    fetchedAt: "2026-02-20T09:00:00.000Z",
    sourceType: "news"
  },
  {
    id: "c2",
    url: "https://stratechery.com/2026/where-voxlathe-sits-in-inference",
    title: "Where Voxlathe sits in the inference market",
    fetchedAt: "2026-02-22T09:00:00.000Z",
    sourceType: "news"
  },
  {
    id: "c3",
    url: "https://techcrunch.com/2026/03/14/voxlathe-raises-42m-series-b",
    title: "Voxlathe raises $42M Series B led by Root Ventures",
    fetchedAt: "2026-03-14T14:00:00.000Z",
    sourceType: "news",
    snippet: "The 58-person startup landed $42M in a round led by Root Ventures."
  },
  {
    id: "c4",
    url: "https://forbes.com/sites/coldstart-fixtures/2026/05/02/voxlathe-headcount-hits-90",
    title: "Voxlathe headcount hits 90 as it scales sales",
    fetchedAt: "2026-05-02T12:00:00.000Z",
    sourceType: "news",
    snippet: "Voxlathe has grown to roughly 90 employees this year, up from under 60 at its Series B."
  },
  {
    id: "c5",
    url: "https://voxlathe.example/about",
    title: "Voxlathe — About",
    fetchedAt: "2026-05-10T10:00:00.000Z",
    sourceType: "company_site"
  },
  {
    id: "c6",
    url: "https://data.stableenrich.dev/records/voxlathe",
    title: "Voxlathe company enrichment record",
    fetchedAt: "2026-05-12T10:00:00.000Z",
    sourceType: "enrichment"
  }
];

export const richConflictCard: ColdStartCard = {
  slug: "voxlathe-example",
  domain: "voxlathe.example",
  generatedAt: "2026-05-15T12:00:00.000Z",
  generationCostUsd: 0.42,
  cacheStatus: "hit",
  identity: {
    name: fact("Voxlathe", ["c5"]),
    websiteUrl: fact("https://voxlathe.example", ["c5"]),
    logoUrl: null,
    oneLiner: fact(
      "Voxlathe turns raw inference telemetry into an autoscaling policy investors can actually audit.",
      ["c5"]
    ),
    description: fact(
      {
        shortDescription: "Voxlathe builds an inference cost-control layer for teams running large models in production.",
        expandedDescription: null,
        concept: "An always-on autoscaling policy engine for GPU inference fleets.",
        serves: "ML platform teams running latency-sensitive inference at scale.",
        mechanism: "Streams live utilization signals into a policy engine that resizes GPU pools before cost or latency drifts."
      },
      ["c5"]
    ),
    hq: fact({ city: "Austin", country: "US" }, ["c5"]),
    foundedYear: fact(2023, ["c5"]),
    status: "private"
  },
  funding: {
    totalRaisedUsd: fact(58_000_000, ["c3"]),
    lastRound: fact(
      { name: "Series B", amountUsd: 42_000_000, announcedAt: "2026-03-14", leadInvestors: ["Root Ventures"] },
      ["c3"]
    ),
    rounds: fact(
      [
        { name: "Seed", amountUsd: 6_000_000, announcedAt: "2024-01-10", leadInvestors: ["Basecamp Fund"] },
        { name: "Series A", amountUsd: 10_000_000, announcedAt: "2025-01-22", leadInvestors: ["Basecamp Fund"] },
        { name: "Series B", amountUsd: 42_000_000, announcedAt: "2026-03-14", leadInvestors: ["Root Ventures"] }
      ],
      ["c3"]
    ),
    investors: fact(
      [
        { name: "Root Ventures", domain: "root.vc" },
        { name: "Basecamp Fund", domain: null }
      ],
      ["c3"]
    )
  },
  team: {
    founders: fact(
      [
        { name: "Priya Raman", role: "Co-founder & CEO", sourceUrl: "https://voxlathe.example/about" },
        { name: "Mateo Cruz", role: "Co-founder & CTO", sourceUrl: "https://voxlathe.example/about" }
      ],
      ["c5"]
    ),
    keyExecs: fact(
      [{ name: "Elena Ford", role: "VP of Sales", sourceUrl: "https://forbes.com/sites/coldstart-fixtures/2026/05/02/voxlathe-headcount-hits-90" }],
      ["c4"]
    ),
    // Two reporting sources disagree on headcount (58 at the March raise vs. 90 in May
    // coverage): status "mixed" with both reporting citations is the conflict this fixture
    // exists to exercise.
    headcount: fact({ value: 90, asOf: "2026-05-02" }, ["c3", "c4"], { status: "mixed", confidence: "medium" })
  },
  signals: [
    {
      title: "Voxlathe raises $42M Series B led by Root Ventures",
      url: "https://techcrunch.com/2026/03/14/voxlathe-raises-42m-series-b",
      date: "2026-03-14",
      source: "TechCrunch",
      category: "funding",
      citationIds: ["c3"]
    },
    {
      title: "Voxlathe launches its autoscaling policy engine",
      url: "https://semianalysis.com/2026/02/18/voxlathe-inference-stack-teardown",
      date: "2026-02-18",
      source: "SemiAnalysis",
      category: "launch",
      citationIds: ["c1"]
    },
    // The only signal cited solely by the company-class citation, per the fixture brief.
    {
      title: "Voxlathe lands its first enterprise inference deployment",
      url: "https://voxlathe.example/about",
      date: "2026-04-02",
      source: "Voxlathe",
      category: "other",
      citationIds: ["c5"]
    },
    {
      title: "Voxlathe hires Elena Ford as VP of Sales",
      url: "https://forbes.com/sites/coldstart-fixtures/2026/05/02/voxlathe-headcount-hits-90",
      date: "2026-05-02",
      source: "Forbes",
      category: "hiring",
      citationIds: ["c4"]
    }
  ],
  comparables: [
    {
      name: "Katalyst Systems",
      domain: "katalyst.example",
      oneLiner: "Autoscaling for training clusters rather than inference fleets.",
      basis: "Same buyer, adjacent workload: training infra teams instead of inference.",
      confidence: "medium",
      citationIds: ["c2"]
    },
    {
      name: "Fenwick Compute",
      domain: "fenwickcompute.example",
      oneLiner: "GPU spot-market broker for inference workloads.",
      basis: "Competes on cost control for the same inference buyer, with a different mechanism.",
      confidence: "medium",
      citationIds: ["c1"]
    }
  ],
  citations: voxlatheCitations
};

// --- thinFileCard: Hollow Labs ---------------------------------------------------------------

const hollowLabsCitations: Citation[] = [
  {
    id: "c1",
    url: "https://hollowlabs.example/about",
    title: "Hollow Labs — About",
    fetchedAt: "2026-04-01T09:00:00.000Z",
    sourceType: "company_site"
  },
  {
    id: "c2",
    url: "https://techcrunch.com/2026/04/01/hollow-labs-launches-quiet-beta",
    title: "Hollow Labs launches a quiet beta for archival search",
    fetchedAt: "2026-04-01T15:00:00.000Z",
    sourceType: "news"
  }
];

// Sits exactly at the hasUsablePublicProfile threshold (4 structured facts, 2 visible facts):
// websiteUrl, hq, the one named founder, and the one signal carry it; funding, headcount, and
// comparables are all empty, and foundedYear is deliberately unknown (the Founded stat slot's
// absent state needs a real fixture to render against). This is the near-boundary fixture for
// the redesign's thin-profile treatment.
export const thinFileCard: ColdStartCard = {
  slug: "hollowlabs-example",
  domain: "hollowlabs.example",
  generatedAt: "2026-04-02T09:00:00.000Z",
  generationCostUsd: 0.08,
  cacheStatus: "hit",
  identity: {
    name: fact("Hollow Labs", ["c1"]),
    websiteUrl: fact("https://hollowlabs.example", ["c1"]),
    logoUrl: null,
    oneLiner: fact("Hollow Labs is building a search layer for archival documents nobody has indexed yet.", ["c1"]),
    description: fact(
      {
        shortDescription: "Hollow Labs indexes archival documents that have never been searchable before.",
        expandedDescription: null,
        concept: "A search index built specifically for un-digitized archival material.",
        serves: null,
        mechanism: null
      },
      ["c1"]
    ),
    hq: fact({ city: "Providence", country: "US" }, ["c2"]),
    foundedYear: fact(null),
    status: "private"
  },
  funding: {
    totalRaisedUsd: fact(null),
    lastRound: fact(null),
    investors: fact(null)
  },
  team: {
    founders: fact([{ name: "Sana Okafor", role: "Founder", sourceUrl: "https://hollowlabs.example/about" }], ["c1"]),
    keyExecs: fact(null),
    headcount: fact(null)
  },
  signals: [
    {
      title: "Hollow Labs launches a quiet beta for archival search",
      url: "https://techcrunch.com/2026/04/01/hollow-labs-launches-quiet-beta",
      date: "2026-04-01",
      source: "TechCrunch",
      category: "launch",
      citationIds: ["c2"]
    }
  ],
  comparables: [],
  citations: hollowLabsCitations
};

// --- emptySectionsCard: Plainfield -----------------------------------------------------------

const plainfieldCitations: Citation[] = [
  {
    id: "c1",
    url: "https://plainfield.example",
    title: "Plainfield — Home",
    fetchedAt: "2026-04-10T09:00:00.000Z",
    sourceType: "company_site"
  },
  {
    id: "c2",
    url: "https://businesswire.com/news/2026/plainfield-headcount-update",
    title: "Plainfield headcount update",
    fetchedAt: "2026-04-15T09:00:00.000Z",
    sourceType: "news"
  },
  {
    id: "c3",
    url: "https://sec.gov/cgi-bin/browse-edgar?action=getcompany&company=plainfield",
    title: "Plainfield SEC filing index",
    fetchedAt: "2026-04-16T09:00:00.000Z",
    sourceType: "filing"
  },
  {
    id: "c4",
    url: "https://data.stableenrich.dev/records/plainfield",
    title: "Plainfield company enrichment record",
    fetchedAt: "2026-04-17T09:00:00.000Z",
    sourceType: "enrichment"
  }
];

// Identity and headcount only: funding, comparables, and signals are all empty, so the card
// face's empty states for those sections render as designed rather than being skipped.
export const emptySectionsCard: ColdStartCard = {
  slug: "plainfield-example",
  domain: "plainfield.example",
  // Deliberately dynamic: the other two fixtures carry frozen months-old dates, so under the
  // real clock they capture the aged filed-date state (core's 14-day threshold). This one stays
  // two days old forever, keeping a not-aged contrast in every gallery run.
  generatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  generationCostUsd: 0.05,
  cacheStatus: "hit",
  identity: {
    name: fact("Plainfield", ["c1"]),
    websiteUrl: fact("https://plainfield.example", ["c1"]),
    logoUrl: null,
    oneLiner: fact("Plainfield keeps procurement paperwork in sync between finance teams and vendors.", ["c1"]),
    description: fact(
      {
        shortDescription: "Plainfield keeps procurement paperwork in sync between finance teams and vendors.",
        expandedDescription: null,
        concept: "A shared procurement record that vendors and finance teams both edit.",
        serves: "Mid-market finance teams and their vendors.",
        mechanism: "One shared record replaces the emailed spreadsheet both sides used to keep separately."
      },
      ["c1"]
    ),
    hq: fact({ city: "Columbus", country: "US" }, ["c3"]),
    foundedYear: fact(2021, ["c3"]),
    status: "private"
  },
  funding: {
    totalRaisedUsd: fact(null),
    lastRound: fact(null),
    investors: fact(null)
  },
  team: {
    founders: fact(null),
    keyExecs: fact(null),
    headcount: fact({ value: 34, asOf: "2026-04-15" }, ["c2"])
  },
  signals: [],
  comparables: [],
  citations: plainfieldCitations
};
